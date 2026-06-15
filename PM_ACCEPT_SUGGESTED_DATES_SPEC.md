# PM Accept Suggested Dates — build spec

## Goal
Let a PM accept the reviewer's suggested alternative dates for a single
REJECTED system, directly from the onsite request view (the page they land on
from the "Review & resubmit dates" email link). Accepting flips that one system
to Approved with the suggested dates as its agreed dates, and pushes it into
Excel exactly like a normally-approved system. Accept-only — no counter-propose
in this version.

## Scope
- Single file: index.html.
- Affects ONLY the onsite request view / review modal rendering and a new
  accept handler. Do not touch the reviewer approve/reject paths,
  processDecisions, or the Power Automate flows themselves.

## Trigger condition for showing the button
In the rejected-system rendering (around line 2720, the rejInfo block), when:
  - the system's system_status === 'Rejected', AND
  - both suggested_start and suggested_end are set,
render an "Accept suggested dates" button inside (or directly below) the
existing amber "Suggested alternative" box.

IMPORTANT: this button must NOT be gated behind canReview (line 2699). By the
time a system is Rejected the parent request is no longer Pending, so canReview
is false and the modal is read-only. The button's visibility depends ONLY on
the system being Rejected with both suggested dates set — never on currentUser.

## Sign-in (resolved)
The accept button does NOT require sign-in. PMs click the email link and are
not signed in. Visibility never depends on currentUser.

## reviewed_by (resolved)
Stamp reviewed_by with the request's PM email (the same value used as the email
`to` / the request's PM email field). If that value isn't readily available
client-side at accept time, stamp the literal 'PM (email link)' — and note in a
code comment which was used.

## What "Accept" does (the write)
Model the write on the existing approveSystem() at line 2927, but extended.
On click, update the single request_systems row (by its id) with:
  - system_status   = 'Approved'
  - requested_start = (its current suggested_start)
  - requested_end   = (its current suggested_end)
  - reviewed_by     = PM email (per above)
  - reviewed_at     = now()
  - suggested_start = null   (clear, so it can't be re-accepted / shown again)
  - suggested_end   = null
  - review_notes    = leave as-is (preserves the rejection-reason history)

Writing suggested dates into requested_start/requested_end means the agreed
dates become the system's real dates, so everything downstream (calendar spans,
the approval-flow GET, the Excel sync) treats them as the dates with no special
handling.

## Q3 (OPEN — confirm before building)
Confirm requested_start/requested_end reuse is correct, vs adding dedicated
agreed_start/agreed_end columns. requested_* reuse is preferred for v1 (no
schema or downstream changes). PLACEHOLDER — to be confirmed.

## Q4 (RESOLVED): How the accepted system reaches Excel

The Supabase->Excel sync is the `request_approved_to_excel` flow, fired by a
Supabase webhook on UPDATE to the requests (parent) table. It has a TRANSITION
GUARD: it only runs when request_status crosses INTO 'Approved'
(record.request_status == 'Approved' AND old_record.request_status != 'Approved'),
then immediately PATCHes the request to 'Scheduled'. It GETs ALL approved systems
for the request and appends them to Excel via the Append_Approved_Requests Office
Script, then triggers the tasks-sync.

Therefore the accept handler must:
1. Update the child request_systems row (status Approved, suggested->requested
   dates, reviewed_by = PM email, reviewed_at = now, clear suggested_*).
2. Update the parent requests row to request_status = 'Approved'. This trips the
   transition guard and fires the sync. (The flow flips it back to 'Scheduled'
   itself; do not manage that.) Note the parent is normally sitting at 'Scheduled'
   after the original approval, so Scheduled->Approved correctly trips the guard.
3. POST the confirmation email to APPROVAL_EMAIL_FLOW_URL (final_status Approved,
   single-system systems array, to = current `to`/PM email).

PREREQUISITE (now satisfied): Append_Approved_Requests must dedupe on
RequestSystemID so the re-fire's GET (which returns ALL approved systems, not
just the new one) does not duplicate already-synced rows. The script has been
updated to skip any system whose RequestSystemID is already in the
ProductionReport table. Without this, a PM-accept on a mixed request would
duplicate the originally-approved systems in Excel and in tasks.

This makes the accept handler safe for both cases:
- All-rejected request -> accept one: parent Rejected->Approved, guard fires,
  GET returns the one system, appended once.
- Mixed request -> accept a previously-rejected system: parent Scheduled->
  Approved, guard fires, GET returns all approved, dedupe skips the already-synced
  ones, only the newly-accepted system is appended.

## After accept — UI feedback
- Replace the button with a confirmation state ("Dates accepted — scheduled")
  so it's clear it worked and can't be double-clicked.
- Re-render or refresh the modal/row so the system shows as Approved with the
  agreed dates.
- Disable the button on click to guard against double-submission.

## &system=<id> deep link (optional, low priority)
Currently ?system=<id> is ignored. If easy, read it on load and scroll/highlight
the specific child system within the modal (mirror the request-level deep-link
at line 2356). Skip if it adds meaningful complexity — not required for v1.

## Out of scope (do not build)
- Counter-proposing alternative dates.
- Changing the reviewer's approve/reject UI.
- Parent request rollup status recomputation (unless the re-fire requires it —
  flag if so, don't silently change it).
