// Racquets Calendar weekly routine: checks, drafting and timing.
// No network, no outside libraries. The routine drafts; it never sends or approves.
import { createHash } from "node:crypto";

export const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export const mins = t => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
export function dayDate(weekOf, day) {
  const d = new Date(weekOf + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + day); return d;
}
export const shortDate = d => `${MON[d.getUTCMonth()]} ${d.getUTCDate()}`;
export function clock(t) {
  let [h, m] = t.split(":").map(Number); const ap = h >= 12 ? "pm" : "am"; h = h % 12 || 12;
  return { txt: m ? `${h}:${String(m).padStart(2, "0")}` : `${h}`, ap };
}
export function range(a, b) {
  const x = clock(a), y = clock(b);
  return x.ap === y.ap ? `${x.txt}–${y.txt}${y.ap}` : `${x.txt}${x.ap}–${y.txt}${y.ap}`;
}
export const fingerprint = d =>
  createHash("sha256").update(JSON.stringify([d.to, d.subject, d.body, d.send_at])).digest("hex").slice(0, 16);

// ---------- the checks ----------
export function runChecks(week, rules, runDate) {
  const held = new Map();
  const hold = (s, check, why) => { if (!held.has(s.id)) held.set(s.id, { id: s.id, check, why }); };
  const S = week.sessions;

  // Check 1: court conflict — both sessions are held.
  for (let i = 0; i < S.length; i++) for (let j = i + 1; j < S.length; j++) {
    const a = S[i], b = S[j];
    if (a.day !== b.day || a.court !== b.court) continue;
    const ov = Math.min(mins(a.end), mins(b.end)) - Math.max(mins(a.start), mins(b.start));
    if (ov > 0) {
      hold(a, "Check 1", `overlaps ${b.name} on ${a.court} by ${ov} minutes`);
      hold(b, "Check 1", `overlaps ${a.name} on ${b.court} by ${ov} minutes`);
    }
  }
  // Check 2: court availability.
  for (const s of S) if (week.closed_courts.includes(s.court)) hold(s, "Check 2", `${s.court} is closed for construction this week`);
  // Check 3: freshness, measured from the run date.
  for (const s of S) {
    const age = Math.round((new Date(runDate) - new Date(s.last_confirmed_by_director)) / 864e5);
    if (age > rules.freshness_days) hold(s, "Check 3", `last confirmed by the Director ${age} days ago (limit ${rules.freshness_days})`);
  }
  // Check 5: anything added after the last approval.
  for (const s of S) if (s.added_at > week.last_approval) hold(s, "Check 5", `added ${s.added_at.slice(11)} after the last approval`);
  // Extra checks switched on by rules.json (Build 7 gates).
  if (rules.courts) for (const s of S) {
    const c = rules.courts[s.court];
    if (!c) hold(s, "Check 6", `${s.court} is not a court the club has`);
    else if (c !== s.sport) hold(s, "Check 6", `${s.court} is a ${c} court, not ${s.sport}`);
  }

  const passed = S.filter(s => !held.has(s.id));
  // Check 4: three-sport coverage, counted after the holds.
  const gaps = [];
  for (const [sport, days] of Object.entries(rules.promised_days))
    for (const d of days) if (!passed.some(s => s.sport === sport && s.day === d)) gaps.push({ sport, day: d });

  // Draft guard: an evening-type session reading earlier than 9am is a guessed time.
  const guessed = passed.filter(s => mins(s.start) < 9 * 60 &&
    rules.evening_words.some(w => s.name.toLowerCase().includes(w)));
  return { held: [...held.values()], passed, gaps, guessed };
}

// ---------- inquiries ----------
export function classify(q, rules) {
  const t = q.text.toLowerCase();
  for (const r of rules.never_draft) if (r.words.some(w => t.includes(w))) return { route: r };
  return { route: null };
}

const sportWords = { "pickleball": "pickleball", "platform": "platform tennis", "tennis": "tennis" };
export function matchSessions(text, sessions) {
  const t = text.toLowerCase();
  const byName = sessions.filter(s => t.includes(s.name.toLowerCase()));
  let hits = byName;
  if (!hits.length) {
    const sport = Object.keys(sportWords).find(k => t.includes(k));
    if (sport) hits = sessions.filter(s => s.sport === sportWords[sport]);
  }
  const day = DAYS.findIndex(d => t.includes(d.toLowerCase()));
  if (day >= 0) hits = hits.filter(s => s.day === day);
  if (/\bmorning\b/.test(t)) hits = hits.filter(s => mins(s.start) < 12 * 60);
  if (/\bevening\b/.test(t)) hits = hits.filter(s => mins(s.start) >= 17 * 60);
  return hits;
}
