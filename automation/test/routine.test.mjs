// npm test — each test runs the routine into its own temp folder.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const A = join(dirname(fileURLToPath(import.meta.url)), "..");
function run(extra = []) {
  const out = mkdtempSync(join(tmpdir(), "rq-"));
  execFileSync("node", [join(A, "routine.mjs"), "--run-date", "2026-11-29", "--mode", "weekly", "--out", out, ...extra]);
  return { out, d: JSON.parse(readFileSync(join(out, "drafts.json"), "utf8")),
    md: readFileSync(join(out, "drafts.md"), "utf8"), html: readFileSync(join(out, "review.html"), "utf8") };
}
const traps = ["--week", join(A, "traps/week-trap.json"), "--inquiries", join(A, "traps/inquiries-trap.json")];
const routedFor = (d, q) => d.routed.find(r => r.question === q);

// ---------- Build 6 behaviour (regression) ----------
test("B6-1 the Nov 30 week: 23/28 pass, the same five held, pickleball gap named", () => {
  const { d } = run();
  assert.deepEqual(d.summary, { sessions: 28, passed: 23, held: 5, drafts: 6, routed: 2 });
  assert.deepEqual(d.held.map(h => h.id), ["S05", "S06", "S11", "S22", "S28"]);
  assert.deepEqual(d.gaps.map(g => `${g.sport}:${g.day}`), ["pickleball:1", "pickleball:2"]);
});
test("B6-2 held sessions and the guessed time never reach the member email", () => {
  const { d } = run(); const email = d.drafts.find(x => x.id === "D-01").body;
  for (const n of ["Glow-ball", "Cardio Tennis", "Mixed doubles social", "Junior clinic"]) assert.ok(!email.includes(n), n);
});
test("B6-3 the routine writes drafts only: no approvals, no outbox", () => {
  const { out } = run();
  assert.ok(!existsSync(join(out, "approvals.json")) && !existsSync(join(out, "outbox.json")));
});
test("B6-4 refunds and sign-ups are routed, never drafted", () => {
  const { d } = run();
  assert.equal(routedFor(d, "Q-104").route_to, "Club office");
  assert.equal(routedFor(d, "Q-106").route_to, "Pro shop");
});
test("B6-5 with no approval, release blocks every draft", () => {
  const { out } = run();
  execFileSync("node", [join(A, "release.mjs"), "x", "--out", out]);
  assert.equal(JSON.parse(readFileSync(join(out, "outbox.json"), "utf8")).length, 0);
});
test("B6-6 only the Director's role can approve", () => {
  const { out } = run();
  const r = spawnSync("node", [join(A, "approve.mjs"), "x", "D-05", "--by", "Staff pro", "--reason", "x", "--out", out]);
  assert.equal(r.status, 3);
});
test("B6-7 editing a draft after approval voids the approval", () => {
  const { out } = run();
  execFileSync("node", [join(A, "approve.mjs"), "x", "D-05", "--by", "Director of Racquets", "--reason", "ok", "--out", out]);
  const f = join(out, "drafts.json"); const d = JSON.parse(readFileSync(f, "utf8"));
  d.drafts.find(x => x.id === "D-05").body += " Edited."; writeFileSync(f, JSON.stringify(d));
  const log = execFileSync("node", [join(A, "release.mjs"), "x", "--out", out]).toString();
  assert.match(log, /D-05 BLOCKED: edited after approval/);
});
test("B6-8 no email address or phone number appears in any output", () => {
  const { md, html } = run([...traps]);
  for (const s of [md, html]) assert.ok(!/@|\(\d{3}\)|\d{3}-\d{4}/.test(s));
});

// ---------- Build 7 traps: each must be caught ----------
test("B7-1 a money question with none of the old keywords goes to the Club office", () => {
  const { d } = run(traps); assert.equal(routedFor(d, "T-1")?.route_to, "Club office");
});
test("B7-2 a child's name and health details are routed and appear in no artifact", () => {
  const { d, md, html } = run(traps);
  assert.equal(routedFor(d, "T-2")?.route_to, "Director of Racquets");
  for (const s of [md, html, JSON.stringify(d)]) for (const w of ["Emma", "Lopez", "asthma", "inhaler"]) assert.ok(!s.includes(w), w);
});
test("B7-3 a price claim the club never made is not answered by the machine", () => {
  const { d } = run(traps); assert.equal(routedFor(d, "T-3")?.route_to, "Club office");
});
test("B7-4 a session on a court the club does not have is held and kept out of the email", () => {
  const { d } = run(traps);
  assert.equal(d.held.find(h => h.id === "S29")?.check, "Check 6");
  assert.ok(!d.drafts.find(x => x.id === "D-01").body.includes("Pro exhibition"));
});
test("B7-5 regression found in Build 7: 'Cardio Tennis' is not a money word", () => {
  const { d } = run(); assert.ok(d.drafts.some(x => x.question === "Q-102"));
});
test("B7-6 no question text is copied into the pull request or review page", () => {
  const { md, html } = run(traps);
  for (const s of [md, html]) for (const w of ["paid twice", "free this week", "daughter"]) assert.ok(!s.includes(w), w);
});
