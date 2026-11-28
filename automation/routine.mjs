// node routine.mjs --run-date 2026-11-29 --mode weekly [--week f] [--inquiries f] [--rules f] [--out dir]
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { DAYS, dayDate, shortDate, range, fingerprint, runChecks, classify, matchSessions } from "./lib.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => { const i = process.argv.indexOf("--" + k); return i > 0 ? process.argv[i + 1] : d; };
const runDate = arg("run-date", "2026-11-29");
const mode = arg("mode", "weekly");
const load = f => JSON.parse(readFileSync(f, "utf8"));
const week = load(arg("week", join(here, "inputs/week.json")));
const inquiries = load(arg("inquiries", join(here, "inputs/inquiries.json")));
const rules = load(arg("rules", join(here, "inputs/rules.json")));
const out = arg("out", join(here, "out", week.week_of));
mkdirSync(out, { recursive: true });

const { held, passed, gaps, guessed } = runChecks(week, rules, runDate);
const heldIds = new Set(held.map(h => h.id));
const guessedIds = new Set(guessed.map(s => s.id));
const printable = passed.filter(s => !guessedIds.has(s.id));
const wk = `${shortDate(dayDate(week.week_of, 0))}–${shortDate(dayDate(week.week_of, 6))}`;
const line = s => `${range(s.start, s.end)}  ${s.name} (${s.sport[0].toUpperCase() + s.sport.slice(1)}, ${s.court}) · ${s.who}`;
const drafts = [];
const add = d => { d.fingerprint = fingerprint(d); d.status = "awaiting approval"; drafts.push(d); };
const replyTime = "Sun Nov 29, 2:45pm";

if (mode === "weekly") {
  let body = `Hello from the racquets desk. Here is the week of ${wk}.\n`;
  for (let d = 0; d < 7; d++) {
    const today = printable.filter(s => s.day === d).sort((a, b) => a.start.localeCompare(b.start));
    if (!today.length) continue;
    body += `\n${DAYS[d].toUpperCase()} ${shortDate(dayDate(week.week_of, d))}\n` + today.map(line).join("\n") + "\n";
  }
  body += `\nCourts closed all week for construction: ${week.closed_courts.join(" and ")}.\n`;
  const pg = gaps.filter(g => g.sport === "pickleball").map(g => DAYS[g.day]);
  if (pg.length) body += `No pickleball is scheduled on ${pg.join(" or ")} this week.\n`;
  const pending = held.length + guessed.length;
  if (pending) body += `A few sessions are still being confirmed and are not listed yet (${pending}). The online calendar updates as soon as they are.\n`;
  body += `\nSee you on the courts,\nThe racquets desk`;
  add({ id: "D-01", kind: "Weekly member email", to: "All racquets members (club email list)",
    subject: `This week on the courts: ${wk}`, send_at: "Sun Nov 29, 5pm",
    why_time: "Sunday 5pm is the club's usual slot; only if approved by 4:30pm, otherwise Mon Nov 30, 7am.", body });
  add({ id: "D-02", kind: "Court closure notice", to: "pickleball list",
    subject: `${week.closed_courts.join(" and ")} closed this week`, send_at: "Sun Nov 29, 6:30pm",
    why_time: "The evening before the first affected session, outside quiet hours.",
    body: `Hello,\n\n${week.closed_courts.join(" and ")} are closed all week (${wk}) for construction. Pickleball sessions this week run on Pickleball 1 and 2 only. The full week is on the online calendar.\n\nThe racquets desk` });
}

const routed = [];
let n = mode === "weekly" ? 3 : 1;
for (const q of inquiries) {
  const id = `D-${String(n++).padStart(2, "0")}`;
  const c = classify(q, rules);
  if (c.route) {
    routed.push({ id, question: q.id, route_to: c.route.route_to, reason: c.route.reason, text: c.handoff_text ?? q.text,
      reply_by: "within 24 hours of receipt" });
    continue;
  }
  const hits = matchSessions(q.text, week.sessions);
  const waiting = hits.filter(s => heldIds.has(s.id) || guessedIds.has(s.id));
  let body;
  if (waiting.length) {
    body = `Hello,\n\n${waiting[0].name} is being confirmed right now, so I don't want to give you a time or court that might change. I'll write back as soon as it's settled, and before Mon Nov 30, 8:30am at the latest.\n\nThe racquets desk`;
  } else if (hits.length) {
    const ok = hits.filter(s => !heldIds.has(s.id));
    const intro = /what is platform/i.test(q.text)
      ? "Platform tennis is a winter racquet game played outdoors on a raised, heated court with screens around it, so the ball stays in play off the walls. It is easy to pick up if you have played tennis or pickleball.\n\n" : "";
    body = `Hello,\n\n${intro}Here is what is on the calendar this week:\n` +
      ok.map(s => `  ${DAYS[s.day]} ${shortDate(dayDate(week.week_of, s.day))}, ${range(s.start, s.end)}: ${s.name}, ${s.court} (${s.who})`).join("\n") +
      `\n\nThe racquets desk`;
  } else {
    body = `Hello,\n\nThanks for your note. I'm checking with the racquets team and will get back to you within 24 hours.\n\nThe racquets desk`;
  }
  add({ id, kind: "Inquiry reply", question: q.id, question_text: q.text, to: `The member who asked (${q.channel})`,
    subject: "Re: your question to the racquets desk", send_at: replyTime,
    why_time: "Replies go within 24 hours; the first slot after the run.", waits_on: waiting.map(s => s.id), body });
}

const result = { run_date: runDate, mode, week_of: week.week_of,
  summary: { sessions: week.sessions.length, passed: passed.length, held: held.length, drafts: drafts.length, routed: routed.length },
  held, gaps, guessed: guessed.map(s => s.id), drafts, routed };
writeFileSync(join(out, "drafts.json"), JSON.stringify(result, null, 2));

// drafts.md becomes the pull-request body on GitHub.
let md = `# Drafts for the Director: ${runDate} (${mode})\n\nNothing here has been sent.\n\n`;
md += `## Held (${held.length})\n` + held.map(h => `- ${h.id} — ${h.check}: ${h.why}`).join("\n") + "\n\n";
for (const d of drafts) md += `## ${d.id} · ${d.kind}\nTo: ${d.to}\nSend: ${d.send_at}\nFingerprint: ${d.fingerprint}\n` +
  (d.question_text ? `Question: "${d.question_text}"\n` : "") + (d.waits_on?.length ? `Waits on: ${d.waits_on.join(", ")}\n` : "") +
  "\n```\n" + d.body + "\n```\n\n";
for (const r of routed) md += `## ${r.id} · Routed to ${r.route_to}\nNot drafted (${r.reason}).\nQuestion: "${r.text}"\n\n`;
writeFileSync(join(out, "drafts.md"), md);
writeFileSync(join(out, "review.html"), `<!doctype html><meta charset=utf-8><title>Review</title><p><b>Nothing on this page has been sent.</b></p><pre>${md.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</pre>`);

console.log(`routine: week of ${week.week_of}: ${passed.length}/${week.sessions.length} passed, ${held.length} held, ${drafts.length} drafts, ${routed.length} routed`);
console.log(`routine: wrote ${out}/drafts.json, drafts.md, review.html. Nothing sent.`);
