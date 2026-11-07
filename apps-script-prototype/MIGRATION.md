# Resumable Drive migration staging

This branch adds the missing copy/checkpoint stage on top of current main. It does **not** switch production storage or claim that an account is migrated. Existing standalone documents, groups, signature requests, participant responses and app preferences still use their current backend until a separately verified cutover.

## What is copied

The installed Sheet owner is verified with the fixed Auth endpoint for every call. Source reads use that same short-lived user token and existing row-level policies, filtered by the verified owner ID. The source origin, bucket and tables cannot be supplied by the browser.

A private `SignWay/Migration-<owner UUID>/` folder holds:

- A JSON checkpoint containing the complete owner-scoped `sign_requests`, `signature_groups` (including contacts), `signature_events` and `event_participants` rows. Request IDs, original capability hashes, participant tokens, answers and storage paths remain intact for future link-compatible routing. These private records are never returned to the browser.
- Original PDFs and completed signed PDFs, with a mapping from each original path to the verified Drive file ID, byte length and SHA-256. A pending request's generated signed path is a reservation, not an existing PDF, and is not downloaded.
- Application preferences currently implemented by the app: the account's one-time Gmail-send confirmation and the optional `he`/`en` UI language. The language must be supplied from the current browser because it was stored locally. Auth sessions, provider access/refresh tokens and arbitrary user metadata are never saved.

Calls are serialized with ScriptLock. A step copies at most three files and checkpoints each verified file. Content-addressed filenames allow reuse after a lost response or restart. Every step reauthorizes the owner; a source read or Drive verification failure stops the run without deleting either copy. Finalization re-reads all source metadata and verifies every destination PDF. If the source changed, a fresh start refreshes the snapshot and reuses identical PDFs. `staged` is a verified copy, **not** a transactionally consistent cutover: active signing can continue afterward.

## Deploy and run

1. In the existing bound Apps Script project, add `Migration.gs` and update `Code.gs` and `Bridge.html`. Preserve other files, Script Properties, the existing `/exec` deployment and private folder/Sheet permissions. No new scopes are required.
2. Update that existing Web App deployment only after reviewing and verifying the saved source.
3. Load `shared-drive.js` and `drive-migration.js` in an authenticated owner session. Run `DriveMigration.stage({db, language, onProgress})` from an explicit migration action. `DriveMigration.status({db})` returns counts only. The module is deliberately not loaded by production `index.html` yet.
4. Use a synthetic owner workspace first. Check resume after a lost response, owner rejection, source changes and SHA-256 equality. Then stage the real account and compare current counts. The earlier conversation reported 24 records / 30 PDFs; these are not hard-coded and must be recounted live.

## Remaining release requirements

- Reconnect the existing Google Apps Script editor; deploy and verify the new actions in the cloud. Local tests are not evidence of a deployed copy.
- Implement and cloud-test routing for standalone/self-signed PDFs, groups, settings, signature requests, participant responses and their public links. Reconcile the old draft PR #16 against current main instead of merging its outdated UI wholesale.
- Preserve legacy public tokens/IDs during routing, enforce the same expiry/cancellation/question rules, and use a fresh final snapshot plus source-write coordination before activating a migrated account. Do not silently fall back to source writes after activation.
- Keep Google account authentication and Gmail OAuth in the identity provider unless a separately designed authentication replacement is requested. This staging mechanism does not copy credentials.
- Verify existing links, upload/sign/download/cancel, cross-device settings, contacts and participant responses end to end before production activation. Do not delete source records or files as part of staging.
