# Events and group approvals

This branch adds an event dashboard, reusable contact groups, drafts, status and group filters, participant links, required questions, sequential PDF signatures, decline reasons, and a completion screen. Existing PDF requests remain supported.

## Release order

1. Review and explicitly approve `events.sql` for the live Sign PDF project.
2. Apply `events.sql` once. It adds three owner-scoped tables, RLS policies, a private capability function, a public invoker wrapper and validation triggers. It does not modify existing documents.
3. Run the security advisors. Anonymous authenticated device sessions are intentional. The private capability function intentionally validates a random participant token before returning only that participant's forms.
4. Merge and deploy the frontend after the schema is available. Do not release the event frontend first.
5. Verify one event with two forms on a different browser/device, including signed PDF downloads by the organizer.

## Validation

- `npm ci && npm test`: 15 tests, including startup failures, group editing, persisted draft fields and participants, required questions and sequential signing.
- The schema and integration checks were executed in a rollback transaction against PostgreSQL. They verified the bundle, required answers, owner isolation, cross-device capability access, decline and link closure. No test users or documents were retained.
- Browser visual QA was attempted but the available Chromium download failed. Responsive rules are implemented but a rendered browser review is still required before release.

## Current limits

- Email delivery and scheduled reminders are not configured. Email/reminder buttons open the user's mail application; WhatsApp opens a share composer. Nothing is reported as sent automatically.
- Event links expire after 30 days. An event supports 30 participants, 5 PDF forms and 10 required questions. Each file is limited to 25MB.
- Drafts save event details, questions and participants. Files must be selected again at publication.
- Every attached PDF is a signature step. Informational PDFs without a signature and extra participant-uploaded attachments are not implemented.
- Owner workspaces remain tied to the browser/device session, as in the approved direct-entry version.
