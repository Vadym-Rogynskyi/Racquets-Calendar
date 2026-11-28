# Racquets Calendar — weekly draft routine

Drafts the week's member email, closure notice and desk replies; never sends, never approves.
The Director of Racquets approves each draft by name (`approve.mjs`); `release.mjs` moves only approved, unedited drafts to the outbox.

```
node routine.mjs --run-date 2026-11-29 --mode weekly
node release.mjs 2026-11-30
npm test            # 14 tests: 8 Build 6 behaviours + 6 Build 7 traps
```

## Build 7: hardening
`traps/` holds the planted failures and every run:
- `run1/` the routine as of Build 6: all four traps passed through, and the Director's approval sent three of them to the outbox
- `run2/` after the gates: all four caught
- `run3/` probes written after the fix: one still gets a machine draft (see Build 7 write-up)
- `tests-against-old-code.txt` the new tests run against the old code: 5 fail, as they should

Sample data only. No member names or contact details are stored; question text stays in the desk mail tool.
