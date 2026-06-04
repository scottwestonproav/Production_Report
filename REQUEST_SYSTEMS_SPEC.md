# Build brief — multi-system requests (parent job + per-system rows)

## Goal
A request is one on-site visit (the "job") that can contain several systems, each with its own name, rack type, quantity, dates and notes. The job is stored in `requests`; each system is stored in a child table `request_systems`. Approve/reject and the availability calendar work at the **job** level (one slot per request); `tasks` later gets one row per system (handled outside the front end by Power Automate + Excel).

## Data model (already created in Supabase)
- `requests` (parent / job): `id`, `seqf`, `project_name`, `client_name`, `project_manager`, `site_location`, `site_contact`, `scope`, `urgent`, `notes`, `request_status` (Pending/Approved/Rejected/On Hold/Scheduled), `requested_start`, `requested_end` (these two are the **job span** = min start / max end across its systems), `review_notes`, `reviewed_by`, `reviewed_at`.
- `request_systems` (child): `id`, `request_id` (FK → requests.id), `system_room_name`, `rack_type`, `num_racks`, `requested_start`, `requested_end`, `notes`.

## Front-end changes

### `request.html` (public PM page)
1. Job section (filled once): project name, SEQF, client, project manager, site location, site contact, scope, urgent, notes.
2. A repeatable **Systems** section: an "Add system" button adds a line; each line captures `system_room_name`, `rack_type`, `num_racks`, `requested_start`, `requested_end`, `notes`. At least one system is required; allow removing lines.
3. A convenience **"Use these dates for all systems"** toggle/control: when set, copy the chosen start/end into every system line. Underneath, each system still stores its own dates (so they can differ).
4. On submit:
   - Insert the parent `requests` row first, requesting the new id back (Supabase: `Prefer: return=representation`, or `.select()` with supabase-js). Set `request_status = 'Pending'`.
   - Compute the job span from the systems: `requested_start` = MIN of all systems' starts, `requested_end` = MAX of all systems' ends. Save those onto the parent row (in the insert, or an immediate update).
   - Insert one `request_systems` row per system with `request_id` = the new parent id.
   - Validate required fields and block submission if any system's range includes an already-fully-booked day.

### Availability calendar (on both `request.html` and the Onsite view in `index.html`)
- Count **one slot per request**, not per system. Use the parent `requests.requested_start`/`requested_end` span to mark the days a request occupies.
- Day states unchanged: green = free, amber = a pending request occupies it, solid = an approved/confirmed booking. Capacity uses the existing `engineerCapacity`.
- Do not count `request_systems` individually toward capacity — the parent span is the single booking.

### `index.html` (internal, team)
- Approve/reject stays at the **request** level (one decision per job), gated by the existing team sign-in.
- The request detail panel should list the child systems (name, rack type, qty, dates) so the team can see what's in the job before approving.
- On Approve: set `request_status = 'Approved'` (+ reviewer/timestamp). Do **not** write to `tasks` — Power Automate reads `request_systems` and expands the approved job into one `tasks` row per system. On Reject: `Rejected` + notes; frees the slot.
- De-dup/completion unchanged: once the job is `Scheduled` (set by the Excel-import flow) or its systems appear in `tasks`, stop drawing the request block.

## Constraints
- Public page may insert into `requests` and `request_systems` and read both; never update/delete; never write `tasks`.
- Reuse existing Supabase client, date helpers, palette, realtime. Keep `request.html` standalone but visually consistent.
- The job-span min/max is computed in the form on submit (not a DB trigger).

## Acceptance criteria
- [ ] A PM can add multiple systems, each with its own name/type/qty/dates (or "same dates for all").
- [ ] Submit creates one `requests` row (status Pending, span = min/max of systems) plus one `request_systems` row per system.
- [ ] The calendar shows one slot per request across its span, in the correct colour state.
- [ ] The internal detail panel lists the systems; approve/reject acts once at request level.
- [ ] Nothing writes to `tasks` from the front end.

## Finish
Update `CLAUDE.md` to describe `request_systems` and the parent/child model, then commit and push.
