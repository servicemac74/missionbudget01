# Building and deploying the budget bill tracker

Tool-agnostic steps for turning the latest reconciled Excel handoff into a
deployed `index.html` on GitHub Pages. Written so either Claude Code or
Codex (or anyone with Node) can run it without needing Python.

## Prerequisites (one-time)

```bash
cd build
npm install
```

Installs the `xlsx` package. No Python, no `openpyxl` - `build_budget_tracker.js`
is a full Node port of the original `Budget_Build_Script_Nov2026_v2.py`.

## Inputs you need

1. **The reconciled source workbook** - the latest `HANDOFF_COPY_2025_FINANCE_PROD_vNN.xlsx`
   from the `_budget_ingest_analysis` project (a separate pipeline - ask for
   its current path/version, don't assume it's unchanged).
2. **The raw template** - `budget_bill_tracker_template_v17.html` (currently
   lives in Downloads; consider committing it into `build/` so this step
   doesn't depend on a file outside the repo).
3. **A SESSION_KEY** for this build, e.g. `budget/bills/nov_2026_r3` -
   bump the `rN` suffix each time you build so Firebase sessions don't
   collide with a prior build's staged state.
4. **The prior build** (optional but recommended) - the repo's current
   `index.html`, used for ID stabilization (keeps bill IDs stable across
   builds so Firebase session state and tap history carry forward).

## Build

```bash
node build_budget_tracker.js <xlsx> <template.html> <out.html> <SESSION_KEY> [prior.html]
```

Example:
```bash
node build_budget_tracker.js \
  "/path/to/HANDOFF_COPY_2025_FINANCE_PROD_v25.xlsx" \
  "/path/to/budget_bill_tracker_template_v17.html" \
  "./build/test_output.html" \
  "budget/bills/nov_2026_r3" \
  "../index.html"
```

Writes `<out.html>` and prints a full validation report to stdout - read it
before trusting the output. The most important line is the last one:

```
T1 vs T2-paid: T1 exp X inc Y | T2 paid exp X inc Y
```

These two sides must match (or be explainably close). If they don't, something
in the source workbook or the reconciliation pipeline moved - stop and
investigate before deploying.

Other things worth checking in the printed report:
- `unknown names` - subs with no friendly display name yet (falls back to
  the raw internal sub string - not broken, just unpolished). Add new
  entries to the `NAMES` object in the script as new categories appear.
- `date anomalies` / `date-in-week violations` - rows where a date couldn't
  be parsed, or where a bill's week label and its own date disagree (this
  happens legitimately for a still-unpaid bill whose week got rolled
  forward by the reconciliation pipeline but whose underlying due-date
  field didn't change - not a bug, just worth knowing which rows).
- `STAB` - the ID-stabilization report: `matched` (carried an ID forward),
  `new` (first time seen), `removed` (was in the prior build, isn't now -
  check these are expected, e.g. a catalog split), `changed` (same bill,
  different value - expected when the reconciliation pipeline corrects an
  amount, flips something to paid, or syncs a week/date).

## Deploy

Only after reviewing the validation report and the output file:

```bash
cp build/<out.html> index.html
git add index.html
git commit -m "Rebuild bill tracker from HANDOFF v<NN>"
git push
```

GitHub Pages serves whatever is at `index.html` on `main` - no separate
deploy step. Push access is via Git Credential Manager (system-level
`credential.helper=manager`), already cached in Windows Credential Manager -
works the same for any tool that shells out to `git`, nothing tool-specific
to configure.

## Standing feature: home-screen PWA update-check banner

Added 2026-11-16, ported from `ignite-trip-app`'s `index.html` (built
2026-11-09 there). A phone that's "Added to Home Screen" keeps the page
suspended in memory and reuses it instead of refetching, so a `git push`
can go live for days without the phone ever noticing. The template carries
a self-contained fix - no service worker, no manifest change:

- A `HEAD` request to the page's own URL (`cache:'no-store'`) reads the
  `ETag`/`Last-Modified` response header on load, every 5 minutes, on
  `visibilitychange`, and on `pageshow`.
- If that value ever changes from what was first seen, a small banner
  appears ("A new version is available — tap to reload"); tapping it calls
  `hardReload()`, which reloads with a cache-busting `?v=` query string.

**This build script enforces that the template still has it** (checks for
the `UPDATE CHECK` comment block and `hardReload()` before building - see
the assertion right after the `<!-- template v17 -->` marker check) so a
future template edit can't silently drop it. If you ever intentionally
change or remove this feature, update the check in `build_budget_tracker.js`
in the same change - and update `ignite-trip-app`'s copy too if the fix
itself needs to change, since the two are meant to stay identical.

## Known data quirk: rolled-forward bills show a "date-in-week violation"

`util_phone` and `util_country-fi_homeinsurance` (and any other due-date bill
the reconciliation pipeline's week-rollover logic advances while still
unpaid) will show up in the build log's `date-in-week violations` list. This
is expected, not a bug: the reconciliation pipeline updates the bill's
*week* label to the current week once it's gone stale, but a still-unpaid
bill has no real payment to sync its underlying *date* field to, so that
field stays wherever the original due-date template left it - now
disagreeing with the rolled-forward week. Once a real payment matches the
bill, both week and date sync together and the violation clears on its own.
First seen building from v25.xlsx (2026-11-16); logged here and in the
`_budget_ingest_analysis` project's `PROJECT_STATUS.md` so it isn't
re-diagnosed from scratch next time it shows up.

## Known adaptations vs. the original Python script

The source workbook's `dropCOSTS` sheet now keeps **two** T2 blocks per month
(a frozen historical baseline, posted-date-stamped once, and a freshly
rebuilt current-state snapshot, re-stamped with today's date on every
reconciliation build) - a structure introduced by the `_budget_ingest_analysis`
project after the original Python script was last used. This script filters
T2 to the **latest posted-date stamp only** before doing anything else
(logged as the first line of its output) - without that filter, every
catalog row would be double-counted. If the reconciliation pipeline's
versioning model changes again, revisit this filter first.
