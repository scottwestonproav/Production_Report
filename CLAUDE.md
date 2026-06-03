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

## Future: `requests` table
A planned `requests` table will let PMs submit onsite install requests. A `Requested` status on a task will render as a dashed/tentative block in the Onsite view until the build team confirms it to `Onsite build`. Not yet built — do not add until asked.

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
