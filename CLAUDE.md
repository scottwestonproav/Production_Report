# Production Report — proAV

Single-page production dashboard (`index.html`) for tracking rack builds through the build, test, and onsite-installation pipeline. Deployed to GitHub Pages; every commit to `main` goes live automatically — no build step.

## Architecture

- **Single file**: the entire app is `index.html`. No bundler, no framework, no separate JS/CSS files.
- **Backend**: Supabase (hosted Postgres). The app talks to it directly via `fetch` against the REST API and uses the Supabase JS client (loaded from CDN) for realtime subscriptions.
- **Deploy**: `git commit + git push` → live on GitHub Pages. That's it.
- **Supabase credentials** live at the top of the `<script type="module">` block (`SUPABASE_URL` / `SUPABASE_KEY`). Never commit the key to a public repo; the existing key is an anon/public key with RLS.

## Supabase table: `tasks`

All columns read and written by the app:

| Column | Type | Notes |
|---|---|---|
| `id` | uuid / serial | primary key |
| `name` | text | project name |
| `seqf` | text | SEQF reference number |
| `room` | text | room / system description |
| `rack_pa` | text | PA number |
| `rack_type` | text | rack type (used by onsite duration settings) |
| `qty` | integer | number of racks in this row |
| `status` | text | see status values below |
| `wireman` | text | assigned rack builder; also used as "attending engineer" for onsite builds |
| `test_engineer` | text | offsite commissioner (stored as email, displayed as first.last) |
| `project_manager` | text | PM (stored as email) |
| `coordinator` | text | project coordinator |
| `dsp_owner` | text | DSP engineer |
| `cables_by` | text | cables responsible |
| `priority` | text | build priority |
| `rack_build_start` | date (ISO) | onsite build window start — used by Gantt bars and Onsite Availability view |
| `rack_build_end` | date (ISO) | onsite build window end |
| `test_start` | date (ISO) | offsite commissioning window start |
| `test_end` | date (ISO) | offsite commissioning window end |
| `fat_date` | date (ISO) | FAT date (point marker on Gantt) |
| `site_date` | date (ISO) | rack-to-site date (point marker on Gantt) |
| `comments` | text | free-text notes |

Dates are stored as ISO strings (`YYYY-MM-DD`). The app parses them with `toDay(d)` which appends `T00:00:00` to avoid timezone shifts.

Data is fetched with:
```
/rest/v1/tasks?select=*&order=rack_build_start.asc.nullslast
```

Realtime updates use `supabase.channel('tasks-rt')` subscribing to `postgres_changes` on the `tasks` table; every INSERT / UPDATE / DELETE re-renders the active view without a full reload.

### Status values (exact strings)

```
Dates Required
In Build
Built and waiting testing
Test Department Working On Rack
Ready To Send
Onsite build          ← used to filter the Onsite Availability view
Resubmit Dates Required
Canceled
DSP Only System
Loose Kit Systems
Ireland Office Build
Parked (work stopped on it - build/test)
On Hold
```

## Views

### Gantt (default)
Table with Gantt bars per task. Bars: rack build (yellow), test window (purple), FAT (green), rack-to-site (pink). Capacity conflict logic compares concurrent rack-builder / offsite-commissioner demand against sliders. Leave data comes from a BambooHR Edge Function.

### Onsite Availability
Filtered to `status = 'Onsite build'` rows that have both `rack_build_start` and `rack_build_end`. Shows a week-by-week calendar. Per-week capacity pills (green/amber/red) driven by `onsiteSettings.engineerCapacity` (default 1). Duration estimates (`qty × days-per-rack-type`) are configurable via the ⚙ settings panel and persisted to `localStorage` under key `onsite_cap_v1`. Amber "tight" flag when scheduled window < estimate; red "clash" flag when concurrent count exceeds capacity or an engineer is double-booked.

## `requests` + `request_systems` — PM onsite build request flow

A parent/child model. The **job** lives in `requests`; each system within that job is a row in `request_systems`.

### `requests` (parent / job)
Columns: `id`, `created_at`, `seqf`, `project_name`, `client_name`, `project_manager`, `site_location`, `site_contact`, `scope`, `urgent` (bool), `notes`, `request_status`, `requested_start` (date — MIN of systems' starts), `requested_end` (date — MAX of systems' ends), `review_notes`, `reviewed_by`, `reviewed_at`, `linked_task_id`.

`request_status` values: `Pending` · `Approved` · `Rejected` · `On Hold` · `Scheduled`.

### `request_systems` (child, one row per system / rack)
Columns: `id`, `request_id` (FK → requests.id), `system_room_name`, `rack_type`, `requested_start` (date), `requested_end` (date), `notes`, `system_status` (text: `Pending` / `Approved` / `Rejected` / `Completed` / `Removed`), `reviewed_by` (text), `reviewed_at` (timestamptz).

**Calendar occupancy** is computed from `request_systems`, not the parent `requests` span. A system is **active** if its `system_status` is `Pending`, `Approved`, or `Scheduled` (null treated as `Pending` for legacy rows). Active statuses count toward capacity; `Completed`, `Removed`, and `Rejected` do not. The calendar slot for a request spans `MIN(active systems' start)` to `MAX(active systems' end)`. If a request has no active systems it is excluded from the calendar entirely. Legacy requests with no `request_systems` rows fall back to the parent `requested_start`/`requested_end`. Both `index.html` (Onsite Availability view) and `request.html` follow this logic.

**How it works:**
- PMs submit via `request.html` (public page). One parent `requests` row is inserted with `request_status = 'Pending'`; `requested_start`/`requested_end` are the min/max across all systems. Then one `request_systems` row per system is inserted with `request_id` = parent id.
- Calendar counts **one slot per request** (parent span). Pending = amber tentative; Approved/Scheduled = confirmed. Capacity uses `onsiteSettings.engineerCapacity`.
- In `index.html`, clicking a request block opens the review modal. The team (must be signed in) reviews each system individually: each `request_systems` row has its own **Approve** / **Reject** button that sets `system_status`, `reviewed_by`, and `reviewed_at` on that row.
- Once every system has a decision, **Process decisions** becomes enabled. Clicking it sets the parent `request_status` to `Approved` if any system was approved, or `Rejected` if all were rejected — `tasks` is never written from the front end.
- **Reject whole request** at the bottom of the modal immediately sets `request_status = 'Rejected'` without requiring per-system decisions (covers the case where the team wants to decline the entire job at once).
- On Approved: Power Automate reads the `request_systems` rows where `system_status = 'Approved'` and expands them into `tasks` rows once the job enters the Excel master.
- When an Approved request's `seqf` + date range matches a `tasks` row with `status = 'Onsite build'`, the request auto-flips to `Scheduled` and stops drawing on the calendar (de-dup).
- Realtime channels `requests-rt` and `requests-rt` (in `request.html`) keep both calendars live.

## Key code patterns

- **`dbToTask(r)`** — maps a raw Supabase row to the task object the UI uses. JS field names differ from DB column names (e.g. `projStart` ← `rack_build_start`).
- **`taskToDb(t)`** — reverse mapper used for upserts.
- **`excelDateToISO(v)`** — handles the various date formats Excel/XLSX can produce (serial numbers, DD/MM/YYYY, named months, ISO).
- **`fmtPerson(e)`** — converts `first.last@proav.com` → `First Last`.
- **`escH(s)`** — HTML-escapes strings before inserting into innerHTML.
- **`render()`** — single re-render function called after every data change. Rebuilds metrics, filters, Gantt rows, conflict panels, mobile cards, and (if active) the Onsite view.

## Editing guidelines

- The entire app is one file. Keep it that way — no new files unless asked.
- Do not add a second Supabase client or re-declare `SUPABASE_URL` / `SUPABASE_KEY`.
- Reuse existing date helpers (`toDay`, `daysBetween`, `addDays`, `fmtShort`, `fmtLong`, `excelDateToISO`).
- Match the existing CSS variable palette (`--bg`, `--bg2`, `--bg3`, `--border`, `--border2`, `--text`, `--text2`, `--text3`, `--blue` [proAV green `#7ab800`], `--green`, `--red`, `--amber`, `--purple`).
- After every code change: `git add index.html && git commit -m "..." && git push` so it goes live on GitHub Pages.
- Do not modify slider quantities (`teamSlider`, `testSlider`) unless explicitly asked.
