# Live Drive workspace cutover

All four existing workspace tables and their PDF paths are served from immutable
private Drive JSON manifests after activation. The current manifest pointer is
published through one Script Property under ScriptLock. Existing Auth remains
responsible for Google sign-in and recipient anonymous sessions; Gmail OAuth
credentials are never copied to Drive. One configured installation serves its
verified Sheet owner, preserving other accounts' existing backend.

## Operations

- The compatibility adapter routes existing document/group/request UI operations,
  original and signed PDFs, language and one-time Gmail UI confirmation to Drive.
- Self-signed PDFs now persist their original and signed copies when prepared.
- Existing request UUIDs, capability hashes, paths and recipient claims survive.
  Public operations validate the actual Auth session plus the personal token;
  the first claimant remains bound to that document. Recipients cannot query
  owner tables, fetch signed snapshots or access another request's original.
- Expiry, cancellation, event publication, required answers, decline rules and
  token-to-form ownership are enforced server-side. Original/accepted signed
  bytes cannot be replaced. Same-byte retry reconciles interrupted uploads.
- Current deletion removes live references while immutable manifest/file history
  remains recoverable. It does not permanently delete the copied source data.
- Active accounts fail closed on Drive errors, without source-write fallback.

## Required release order

1. Run local backend/adapter/integration checks. Inspect the live source schema.
2. Apply `supabase/drive-cutover.sql`. It creates an empty private freeze registry,
   guards the four source tables and their Storage objects, and exposes an
   authenticated own-account boolean status. Existing accounts are unaffected
   until a freeze row is explicitly inserted. Preserve all existing RLS policies.
3. Deploy Workspace.gs and the small Code.gs/Bridge.html dispatcher additions in
   the existing Apps Script installation, preserving its URL and permissions.
4. Publish the frontend adapter and shell version. Before activation it uses the
   existing source backend. Verify sign-in and legacy documents still work.
5. Freeze only the installation owner using a transaction that first obtains
   `pg_advisory_xact_lock(hashtextextended(owner_id::text,57491))`, then inserts that
   verified owner into `signing_private.drive_workspace_freezes`. This serializes
   with source write guards. Keep the transaction short.
6. Refresh/re-stage the source snapshot while frozen. No source records/files are
   removed. If data changed since preparation, activation refuses it.
7. In the authenticated migration screen activate the owner workspace. The
   server verifies both the own-account freeze and the staged source digest
   before publishing the Drive manifest. Reload the application.
8. Verify old/new originals and signed previews/downloads, new links, anonymous
   signing, new/edited groups, draft/published signature requests, language across
   a fresh page, Gmail preference persistence without actually sending messages,
   and synthetic self-sign save. Recount frozen source rows/files to prove that
   test writes reached Drive only. Preserve synthetic QA items until explicit
   recoverable cleanup; never sign real user documents during validation.

## Rollback

Before any Drive writes, an administrator may remove the current Drive pointer
and unfreeze the owner. After Drive writes, reconcile those writes back before
unfreezing source; simply removing a flag would lose the latest data. Never
unfreeze source while the Drive workspace is active. Source-write guards may
remain installed for other accounts because an empty registry permits writes.

Do not call a deployment complete before the live checks pass. Local mocks do
not establish cloud availability or anonymous recipient interoperability.
