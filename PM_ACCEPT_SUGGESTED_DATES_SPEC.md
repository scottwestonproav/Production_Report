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

## Pushing it into Excel — re-fire the sync (Q4, OPEN — confirm before building)
After the row update succeeds, the system is system_status=Approved but nothing
has re-triggered the Excel sync (processDecisions already ran for this request
earlier and is not involved here). The accept handler must explicitly re-fire
the same sync processDecisions uses for approved systems.

PLACEHOLDER — pending investigation of processDecisions' sync POST:
  - which flow URL it posts to (same as APPROVAL_EMAIL_FLOW_URL or a separate
    sync flow URL)
  - the exact payload shape
  - whether it's per-request or per-system, and whether it carries request_id +
    per-system id
  - whether a re-fire is idempotent (dedupe via RequestSystemID) or would
    duplicate already-synced rows
Reuse the existing endpoint and payload shape — do NOT invent a new URL. Fill
this section in once the investigation findings are confirmed.

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
