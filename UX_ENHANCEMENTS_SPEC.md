# Build brief — UX additions
Urgent visibility, per-system rejection feedback, longer calendar window, minimum lead time.

Prerequisite: three nullable columns have been added to `request_systems`: `review_notes` (text), `suggested_start` (date), `suggested_end` (date).

## 1. Urgent visibility
The `requests` table has an `urgent` boolean set on submit. Make it visible without changing any flow logic.

- **request.html (public):** if any pending request overlaps a calendar day, and any of those overlapping requests are urgent, mark that day's amber state with a small red dot or "!" marker. Add a legend entry.
- **index.html (team):** on the pending-approvals queue, show an "URGENT" badge on urgent requests, give the request card a red accent border, and sort urgent requests to the top of the pending list (preserve date order within urgent and within non-urgent).
- On each request detail panel, show an "Urgent: Yes" line prominently when true; omit when false.

No notifications or auto-routing — visual surfacing only.

## 2. Per-system rejection notes + suggested alternative dates
Each `request_systems` row now has `review_notes`, `suggested_start`, `suggested_end`. Use them.

**index.html — rejection UI:**
- When the team clicks Reject on a specific system, open a small inline panel or modal with:
  - a Notes textarea — required when rejecting (minimum a short reason).
  - two optional date inputs labelled "Suggest alternative dates" (start + end). Validation: if one is filled the other must be too, and end ≥ start.
- On confirm, write `review_notes`, `suggested_start`, `suggested_end` alongside the existing rejection fields (`system_status = 'Rejected'`, `reviewed_by`, `reviewed_at`) in a single update.

**PM-facing detail view (wherever the PM reads the status of their request):**
- For each system with `system_status = 'Rejected'`, show the rejection notes clearly.
- If `suggested_start` and `suggested_end` are present, show them prominently — e.g. "Team suggested alternative: 21–28 Aug" — and style so the PM clearly sees both the rejection reason and the suggestion.

(A future "Resubmit with these dates" one-click is not required now — informational display is enough.)

## 3. Calendar view — rolling 6-month window
On `request.html` (and any other instance of the availability calendar):
- Replace the fixed 3-month window with a scrollable view showing **the next 6 months from today** (today through today + 6 months) — a rolling window that's the same length regardless of where we are in the year.
- Use vertical or horizontal scrolling, whichever fits the existing layout best.
- Keep all existing day states (free / pending / approved-or-scheduled / urgent marker from §1). Days within the first 30 days of this window are also marked as locked per §4.

## 4. Minimum lead time — 30 days from today
A PM must not be able to request a start date earlier than 30 days from today (preparation buffer).

- In the request form's date pickers, disable any date earlier than `today + 30 days`.
- On the availability calendar, visually distinguish days within the 30-day window as **locked** (e.g. greyed/hatched, distinct from "free"), and make them unselectable. Tooltip: "Available from [date]".
- On submit, validate: if any system's `requested_start` is earlier than `today + 30 days`, block submission and show a clear error message naming the affected system.
- Add a helper note near the dates section of the form: "Please allow at least 30 days from today for preparation."

## Acceptance criteria
- [ ] Urgent requests are visibly marked on the public calendar and stand out + sort to top in the internal queue.
- [ ] Rejecting a system requires a reason; team can optionally add suggested alternative dates; PM sees both on the rejected system.
- [ ] The availability calendar shows a rolling 6-month window from today and is scrollable.
- [ ] Dates within 30 days of today cannot be selected on the form or calendar, and form submission is blocked with a clear message if attempted.
- [ ] All existing behaviour (per-system approval, parent rollup, Excel sync, calendar release on Completed/Removed) continues to work.

## Finish
Update CLAUDE.md to reflect the new schema fields, urgent-visibility rule, rolling 6-month calendar window, and 30-day lead-time. Commit and push.
