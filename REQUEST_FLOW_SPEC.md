# Build brief — Internal onsite request handling (approve / reject)

## Goal
On the internal dashboard (`index.html`), in the existing **Onsite Availability** section, show submitted requests and let **signed-in team members approve or reject** them. Approving does **not** write to `tasks` — the approved request is later pulled into the Excel master (by a Power Automate flow) and flows back through the normal sync, keeping Excel the single source of truth.

## Before you start
- Read `CLAUDE.md` and `index.html`; match existing patterns exactly (Supabase client/fetch, `tasks-rt` realtime, `toDay`, `dbToTask`, `taskToDb`, `fmtPerson`, `escH`, `render`, CSS palette where `--blue` is proAV green `#7ab800`).
- Reuse the existing Supabase client — do not add a second one or re-declare credentials.
- The `requests` table and its policies are already created in Supabase.

## Data — `requests` table
`id`, `created_at`, `seqf`, `project_name`, `client_name`, `project_manager`, `site_location`, `site_contact`, `num_racks`, `requested_start`, `requested_end`, `scope`, `urgent`, `notes`, `request_status`, `review_notes`, `reviewed_by`, `reviewed_at`, `linked_task_id`.
`request_status` values: `Pending` (default), `Approved`, `Rejected`, `On Hold`, `Scheduled`.
Subscribe to `requests` with the same realtime pattern used for `tasks` so the view updates live.

## Team sign-in (gates approve/reject)
- Add a lightweight **Supabase Auth** sign-in (email + password) to `index.html`. The Approve/Reject controls and any write to `requests` are only available when a user is signed in; for anonymous viewers the section is read-only.
- Use the existing Supabase JS client's auth methods. Show a small "Sign in" / signed-in-as indicator. Keep it minimal — no new pages.
- (Server-side, RLS only allows `authenticated` users to update `requests`; anonymous can read and insert only. Build the UI to match.)

## What to build
1. **Pending overlay** in the Onsite Availability calendar: render `Pending` requests as tentative blocks in a distinct **amber** shade (clearly different from confirmed `Onsite build` rows), spanning `requested_start` → `requested_end`. They count toward the existing per-week capacity logic (`onsiteSettings.engineerCapacity`) so concurrency/clash flags include them.
2. **Request list / detail** for the team: a panel listing `Pending` requests with their details (project, SEQF, PM, site, dates, num racks, scope, urgent, notes).
3. **Approve / reject** (signed-in only), with an optional notes field:
   - Reject → set `request_status = 'Rejected'`, `review_notes`, `reviewed_by` (signed-in user), `reviewed_at`. Remove it from the calendar (frees the slot) or grey it under a "rejected" toggle.
   - Approve → set `request_status = 'Approved'`, `reviewed_by`, `reviewed_at`. Render approved requests as confirmed-style blocks. **Do not insert into `tasks`.** Show a note that the approved build will be added to the production master automatically and appear once synced.
4. **De-duplication / completion:** when a request is `Scheduled` (set by the Excel-import flow once it's in the master), or once a matching `Onsite build` row appears in `tasks` (match on `seqf` + overlapping dates), stop drawing the request as its own block — the confirmed block now comes from `tasks`. This prevents double-counting.
5. **Filter** to show/hide by `request_status` (Pending / Approved / Rejected / Scheduled).

## Constraints
- `requests` is separate from `tasks`. Approving never writes to `tasks`.
- Reuse existing client, realtime, date helpers, palette, `render()`. Don't break the Gantt or current Onsite Availability behaviour — add alongside.
- Pending = amber/tentative, confirmed = solid; keep the distinction obvious and consistent with the public page.

## Acceptance criteria
- [ ] Pending requests show as amber tentative blocks and count toward weekly capacity.
- [ ] Approve/Reject only work when signed in; anonymous viewers see the section read-only.
- [ ] Approve sets `Approved` (no `tasks` write) with reviewer + timestamp; Reject sets `Rejected` with notes and frees the slot.
- [ ] Once `Scheduled` or present in `tasks`, the request stops drawing as its own block (no double-count).
- [ ] Realtime updates for both `tasks` and `requests`; Gantt unchanged.

## Finish
- Update `CLAUDE.md` to note the `requests` table exists and the approve/reject + sign-in behaviour.
- Commit (e.g. `Add team sign-in and onsite request approve/reject`) and push.
