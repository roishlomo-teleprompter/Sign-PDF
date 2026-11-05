# Cumulative signatures - deployment and verification

## Release state

This change is a **draft** until the live Apps Script service has been updated and the cloud checks below pass. Local tests exercise real PDF-LIB rendering with simulated Drive, Sheets, ScriptLock and Cache services. They do not verify Apps Script's execution lifecycle or Google's actual locking and response serialization.

The existing production self-signing and individual-recipient flows are preserved. New shared PDFs, signer labels, signature images, revision records and the latest PDF are stored only in the configured private Google Drive installation. Supabase continues to provide the existing Google account identity and contact-group reads; no new shared-document data or PDFs are stored in Supabase.

The configured installation currently belongs to its existing Sheet owner. The server compares the authenticated account with that owner. Other owners need their own Drive installation/connection before creating shared documents. Recipients use personal links and do not need Google or Supabase sign-in.

## Data and authority

- `SignWay/Shared/<document UUID>/` holds the immutable original PDF, owner-assigned name-label PNGs, immutable signer PNGs, per-revision PDFs and JSON manifests.
- The private `SharedDocuments` Sheet has one row per document. A single row update publishes the metadata/PDF pointers, revision, status and signer count together.
- Every signer has a separate 256-bit-class random bearer token, scoped to one document and one assigned signer. Owner-only responses include share links. Recipient responses omit email addresses and other bearer tokens.
- Links expire after 30 days. The owner can cancel a request without deleting accepted signatures. Only the owner can download a cancelled document.
- PNG signatures are bounded to 128 KiB and 2 million pixels. Owner name labels are bounded to 64 KiB. Original PDFs are limited to 5 MiB; completed PDFs to 20 MiB; groups to 2-50 signers.
- Recipients submit PNG bytes, normalized position and an idempotency UUID. They cannot upload a replacement PDF or change a prior signer. The server reconstructs the canonical PDF from the original and all accepted deltas.
- ScriptLock serializes read/render/commit. A signature submitted against an older display is merged with the latest accepted state. Overlapping positions are rejected, and the UI refreshes the PDF while retaining the user's pending signature for repositioning.
- Accepted revisions are immutable. Repeating an identical submission returns the committed result without another signature. A differing second signature from the same token is rejected.
- Ambiguous ledger writes are reconciled by reading the committed manifest pointer. Files are retained on unknown commit outcomes rather than risking deletion of a published revision.
- Downloaded versions are snapshots. Personal links always read the current server version until cancellation/expiry.

## Existing Apps Script deployment

Target: the existing SignWay bound Apps Script project and its existing `/exec` deployment. Do not create another Sheet, publish folders or change file-sharing permissions.

1. Back up the current project source/version through the Apps Script editor.
2. Update `Code.gs` with the shared-action dispatcher and update `Bridge.html` with the bounded shared action allowlist. Add `Shared.gs`. Preserve existing `Admin.html`, `Signer.html`, Script Properties and the manifest.
3. Keep the existing `V8` runtime and already-authorized Drive/Sheets/external-request scopes. No new OAuth scopes are needed.
4. Save and update the existing Web App deployment to a new version, preserving execute-as-owner and existing public execution settings. File and folder ACLs remain private.
5. Call the owner-only `shared-version` action through the app. It runs a PDF runtime probe using the pinned vendored PDF-LIB hash. On a subsequent call, `runtimeReady` must be true. Creation fails closed until that probe succeeds.
6. Verify that `google.script.run` can start `shared-public-sign`, that its microtasks finish, and that `shared-public-result` returns `done`. The two-step job protocol intentionally avoids returning Promise objects through Apps Script serialization. This is a mandatory cloud release check.
7. Complete the cloud tests below using a synthetic, non-binding PDF and disposable test names. Do not send email or WhatsApp invitations automatically during testing.
8. Only then merge/release the frontend branch. Preserve the established public URL. Bump the service-worker version if any deployed source changes after testing.

PDF-LIB is loaded by the server from the existing app's vendored asset. Its SHA-256 must equal `0f9a5cad07941f0826586c94e089d89b918c46e5c17cf2d5a3c6f666e3bc694f` before execution. Parsing and saving use infinite work-batch limits to avoid browser-only timer APIs in Apps Script.

## Mandatory cloud release checks

1. Create one synthetic document for two signers. Verify exactly one Drive original, one Sheet row and two distinct personal links. Retry the same creation UUID and verify that no second document is created.
2. Open both personal links without signing in. Neither link may reveal another token or participants' email addresses. Names and accepted signatures are intentionally visible to the authorized participants, as stated in the creation dialog.
3. Open both signers against revision 0. Sign different areas concurrently. The resulting revision 2 PDF must visibly include both signatures, assigned name labels and timestamps. The original must be unchanged.
4. Retry the same submission after a simulated lost response. Verify no duplicate stamp, file publication or signer count increase.
5. Attempt the same token with a different signature. The accepted signature must remain unchanged.
6. Submit an overlapping position. Verify a clear error, refreshed PDF, retained pending ink and successful repositioning.
7. Verify multiple pages and page rotations 0/90/180/270, then reload both owner and recipient views to confirm persisted state.
8. Cancel a request as owner. Both personal links must reject further read/sign operations; the owner can still download the existing signed snapshot.
9. Reject malformed tokens, out-of-page placement, invalid/oversized PNGs, expired links and unauthorized owner accounts.

## Local checks

Run `npm test` from the repository root. Tests cover original flows, the trusted-origin bridge, owner group creation, public entry without authentication, signature-only submission, idempotent retries, accepted-PDF composition, simulated concurrency, overlap rejection, page validation, access control and ambiguous commit recovery.
