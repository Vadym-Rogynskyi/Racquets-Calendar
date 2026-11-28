// node release.mjs <week_of>: moves approved, unchanged drafts to the outbox; blocks the rest.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { fingerprint } from "./lib.mjs";
const here = dirname(fileURLToPath(import.meta.url));
const week = process.argv[2];
const i = process.argv.indexOf("--out"); const dir = i > 0 ? process.argv[i + 1] : join(here, "out", week);
const { drafts } = JSON.parse(readFileSync(join(dir, "drafts.json"), "utf8"));
const f = join(dir, "approvals.json");
const approvals = existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : [];
const outbox = [];
for (const d of drafts) {
  const a = approvals.filter(x => x.id === d.id).pop();
  if (!a) { console.log(`release: ${d.id} BLOCKED: no approval recorded`); continue; }
  if (a.fingerprint !== fingerprint(d)) { console.log(`release: ${d.id} BLOCKED: edited after approval`); continue; }
  if (d.waits_on?.length) { console.log(`release: ${d.id} BLOCKED: waits on held ${d.waits_on.join(", ")}`); continue; }
  outbox.push({ id: d.id, to: d.to, send_at: d.send_at, approved_by: a.by, reason: a.reason });
  console.log(`release: ${d.id} -> outbox for ${d.send_at} (approved by ${a.by})`);
}
writeFileSync(join(dir, "outbox.json"), JSON.stringify(outbox, null, 2));
