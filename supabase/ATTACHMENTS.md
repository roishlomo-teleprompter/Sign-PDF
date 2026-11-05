# Optional recipient PDF attachments

The workspace design uses the existing `signature_events`, `signature_groups`, `event_participants` and `sign_requests` records. It preserves Google sign-in/account linking, Gmail review-and-send, and the existing provider-backed PDF upload helper.

`attachments.sql` is a separate, additive migration for the attachment control shown in the reference screens. It has not been applied to production.

## Access model

- One optional PDF attachment per existing signing request, up to the private bucket's existing 25MB limit.
- Attachment paths are derived from the request's immutable `original_path`, so transferring an authorized workspace does not move or break the file.
- Only the currently claimed signer can upload or replace an attachment, while the request is pending and unexpired.
- Upload completes before metadata is registered with the request token. A failed upload does not claim success.
- Owners read/download/delete attachments through the existing current ownership relationship. Unauthenticated visitors cannot access the table or registration function.
- The original and signed PDFs keep their existing paths and policies. Completed-request attachments cannot be replaced by a signer.
- Attachment metadata is removed with its signing request; the normal owner deletion flow removes the deterministic attachment storage path as well.

## Approval and deployment

Automatic approval review previously rejected a larger event schema change. That replacement schema is not part of this implementation. The final branch instead uses the existing event backend and only prepares this narrowly scoped attachment migration.

Before merging, obtain explicit approval to add the attachment table, token-checked RPC and scoped storage policies. Then apply `attachments.sql` once and verify upload, replacement before completion, denial after completion, wrong-signer denial, current-owner access after workspace transfer, and storage/metadata cleanup using disposable test requests. No production schema changes or real messages have been made by this design branch.

## Validation

The existing application suite plus new design/attachment tests covers account behavior, Gmail review and sending, PDF upload retries, event/group dialogs, sequential signing, cache refresh, history/status filtering, safe CSV export, stable attachment paths, metadata batching, and upload-before-registration failures. JavaScript checks and top-level PostgreSQL syntax parsing pass. Live RLS and storage authorization tests for the new migration remain pending approval.
