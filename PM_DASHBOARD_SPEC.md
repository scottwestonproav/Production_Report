# Build brief — PM availability & request page (`request.html`)

## Goal
A separate, public-facing page in the same repo for project managers. It shows an **availability calendar** for on-site rack builds and lets a PM **submit a request** for free days. It does not show the Gantt, does not edit anything, and has no approve/reject. The internal `index.html` keeps all of that.

## Before you start
- Read `CLAUDE.md` and `index.html`. Create a **new file `request.html`** (served at `/Production_Report/request.html` on GitHub Pages). It is a standalone page, but must reuse the same visual style, CSS variable palette, date helpers (`toDay`, `daysBetween`, `addDays`, `fmtShort`, `fmtLong`), `fmtPerson` and `escH` patterns as `index.html` so it feels native.
- Use the **same public anon Supabase key** already used in `index.html` (it is the public key — fine to use here). **Never** put the service_role key in this page.

## Data it reads
- `tasks` where `status = 'Onsite build'` with both `rack_build_start` and `rack_build_end` → these are **confirmed** on-site builds.
- `requests` where `request_status` in (`Pending`, `Approved`, `Scheduled`) with `requested_start` / `requested_end`.
- Capacity per day = the onsite engineer capacity (reuse the existing `onsiteSettings.engineerCapacity`, persisted under `localStorage` key `onsite_cap_v1`; default 1).

## Availability calendar
Render a day/week grid from today forward (e.g. next 3 months). For each day, count overlapping on-site load and colour it:
- **Confirmed count** = `Onsite build` tasks + `Approved`/`Scheduled` requests overlapping that day.
- **Pending count** = `Pending` requests overlapping that day.
- Day state:
  - `confirmed >= capacity` → **Booked** (solid / `--red`), not selectable.
  - else if `confirmed + pending >= capacity` → **Pending** (`--amber`), not selectable, with a hint like "request pending" so the PM knows someone has already asked for that slot.
  - else → **Available** (`--green` or proAV green `--blue`), selectable.
- A small legend showing the three states.

## Request form
- Fields: project name, SEQF, client, project manager, site location, site contact, number of racks, requested start date, requested end date, scope, urgent (yes/no), notes.
- The requested start/end can be set by selecting available days on the calendar and/or via date pickers.
- On submit: insert one row into `requests` with `request_status = 'Pending'`, `requested_start` / `requested_end` from the selection. Validate required fields, and block submission if the chosen range includes an already-Booked day. Show a clear success confirmation; handle errors with the existing connection/error styling.
- After a successful submit, the new pending block should appear on the calendar (it will arrive via the data reload / realtime).

## Constraints
- Public page: it may only **read** `tasks` and `requests` and **insert** into `requests`. Never update/delete anything; never write to `tasks`.
- Standalone `request.html`; do not modify `index.html` beyond (optionally) adding a link to it.
- Match the palette and components; responsive; dependency-light; no service_role key.

## Acceptance criteria
- [ ] Calendar shows the next ~3 months with the three day states correctly coloured from `tasks` + `requests`.
- [ ] Pending days are visibly distinct (amber) from confirmed booked days (solid) and free days (green).
- [ ] A PM can submit a request for free days; it lands in `requests` as `Pending` and the day turns amber.
- [ ] Page never writes to `tasks` and never updates/deletes.

## Finish
Commit (e.g. `Add public PM availability and request page`) and push to GitHub.
