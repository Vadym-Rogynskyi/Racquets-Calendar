// node approve.mjs <week_of> <draft-id> --by "<role>" --reason "<why>" [--at ISO]
// The human step: records who approved which exact draft (by fingerprint) and why.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const [week, id] = process.argv.slice(2);
const arg = k => { const i = process.argv.indexOf("--" + k); return i > 0 ? process.argv[i + 1] : undefined; };
const rules = JSON.parse(readFileSync(join(here, "inputs/rules.json"), "utf8"));
const by = arg("by"), reason = arg("reason"), at = arg("at") ?? new Date().toISOString().slice(0, 16);
if (by !== rules.approver_role) { console.error(`approve: only the ${rules.approver_role} can approve; got "${by}"`); process.exit(3); }
if (!reason) { console.error("approve: a written reason is required"); process.exit(3); }
const dir = arg("out") ?? join(here, "out", week);
const { drafts } = JSON.parse(readFileSync(join(dir, "drafts.json"), "utf8"));
const d = drafts.find(x => x.id === id);
if (!d) { console.error(`approve: ${id} is not a draft (routed items cannot be approved)`); process.exit(4); }
const f = join(dir, "approvals.json");
const list = existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : [];
list.push({ id, by, reason, at, fingerprint: d.fingerprint });
writeFileSync(f, JSON.stringify(list, null, 2));
console.log(`approve: ${id} approved by ${by} at ${at} (fingerprint ${d.fingerprint})`);
