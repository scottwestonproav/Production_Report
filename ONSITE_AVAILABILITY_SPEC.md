# Build brief — Onsite Rack Build availability view

## Goal
Add an **Onsite availability** view to the existing production-report dashboard (`index.html` in this repo). It reuses the data we already have — no new Supabase tables, no new files. It reads the same `tasks` table through the Supabase connection already configured in `index.html`, filters to the on-site build rows, and shows them as a capacity-aware calendar so clashes and free capacity are visible at a glance.

## Before you start
Read `index.html` and identify, so you match the existing patterns exactly:
- The Supabase client and the existing data-load function (do **not** add a second client or re-declare the URL/key — reuse what's there).
- The mapping from DB rows to task objects (the `dbToTask`-style function) and the exact field name that holds the **status**.
- The existing date-parsing helper(s) used for the Gantt (reuse them — they already guard against corrupt/out-of-range dates).
- The CSS variables / colour scheme and the markup pattern the current Gantt view uses, so the new view looks native.
- The realtime subscription, so the new view re-renders on data changes like the Gantt does.

## Data
- Table: `tasks` (existing).
- On-site build rows: `status` value for on-site builds — verify the exact string present in the data; it is expected to be `"Onsite Build"`. Match whatever the dashboard already uses.
- On-site window: **`rack_build_start` → `rack_build_end`** (these hold the days engineers are on site for these rows). Ignore rows where both are empty.
- Useful fields to display per row: project name, SEQF, attending engineer (if a field exists for it), and the two dates above.

## What to build
1. A way to switch between the existing Gantt view and a new **Onsite availability** view (a toggle/tab in the existing header area — match current controls). The Gantt must keep working unchanged.
2. In the new view, lay out a **calendar by week** across a sensible date range (e.g. current month back 1 / forward 3, or driven by the data range). Each on-site build appears as a block spanning the weeks between `rack_build_start` and `rack_build_end`, labelled with project name + SEQF, colour-coded by attending engineer where available.
3. **Concurrency + capacity:** add a single configurable constant near the top of the script, e.g. `const CONCURRENT_ONSITE_CAPACITY = 3;`. For each week, compute how many on-site builds overlap it and show a small "used / capacity" indicator: green when under capacity, amber when at capacity, red when over.
4. **Clash detection:** visually flag (red outline/badge) any week where overlaps exceed capacity, and — if an attending-engineer field exists — any two builds with overlapping dates assigned to the same engineer.
5. Clicking a build block reveals its detail (project, SEQF, dates, engineer).

## Constraints
- No new Supabase tables and no new files — the whole feature lives inside `index.html`.
- Reuse the existing Supabase client, realtime subscription, date helpers and styling. Do not touch the Gantt logic except to add the view toggle.
- Keep it responsive and consistent with the current dashboard look (proAV green accent, existing CSS variables).
- Capacity is a constant in code for now (not a table). Make it easy to change in one place.

## Acceptance criteria
- [ ] Existing Gantt view still loads and behaves exactly as before.
- [ ] New Onsite availability view lists only on-site build rows, placed correctly on the weeks spanned by `rack_build_start`/`rack_build_end`.
- [ ] Each week shows used-vs-capacity with green/amber/red states driven by `CONCURRENT_ONSITE_CAPACITY`.
- [ ] Overlapping builds beyond capacity (and same-engineer double-bookings, if engineer data exists) are clearly flagged.
- [ ] View updates live via the existing realtime subscription.
- [ ] No new tables/files; reuses the existing Supabase connection.

## Finish
Commit with a clear message (e.g. `Add onsite rack build availability view`) and push to GitHub so it goes live on GitHub Pages.

## Optional next step (do not build unless asked)
Introduce a `"Requested"` status so a pending on-site request shows as a tentative block (e.g. dashed/striped) until the build team confirms it to `"Onsite Build"`. This lets the same table double as the request log.
