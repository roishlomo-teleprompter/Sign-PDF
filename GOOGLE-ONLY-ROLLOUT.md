# Personal Google Drive replacement

Status: implementation prepared for a **separate deployment**, not activated in production.
The production `index.html` and existing installation are unchanged. Do not shut down
or delete the existing backend: data migration and live verification remain incomplete.

## Implemented

`google-drive.html` preserves the signing UI and uses only the new Google identity,
bridge and personal Drive adapter. It never imports the previous SDK or transport.
`google-drive-backend/` is a standalone Apps Script project, not an addition to the
existing project's files. Do not combine its global functions with the old project.

Each verified Google `sub` gets its own private `SignWay` root with Originals,
Signed, Shared and Data. Drive REST requests carry **that user's** access token,
not the deployment owner's identity. Contacts, groups, requests, answers and settings
live in immutable private JSON manifests. No Google Sheets file is needed for user
workspace storage. Deletion currently removes active references, retaining recoverable
history, as in the existing Drive engine.

Google OAuth uses the authorization-code flow and offline consent. The callback uses
single-use state/nonce and a separate one-time handoff secret bound to a browser proof.
The initiating browser stores its proof locally, the Google callback displays a
Continue link back to the app, and only that browser can redeem the handoff. A poll
with the initiating proof alone cannot retrieve a session. User sessions last seven
days; anonymous signer sessions last six hours. Signout revokes the current session.
Gmail is an additional optional consent and still sends only on explicit Send.

Refresh tokens are server-private Script Properties; access tokens are server cache
entries. They are never included in Drive manifests. Private routing records contain
capability hashes and account identifiers. Public signing verifies the current
manifest, link expiry/cancellation, signer claim and required answers. Shared PDFs
are composed by the server, preserving the existing overlap and retry checks.

## Google configuration required

1. In a Google Cloud project enable Drive API and Gmail API, configure OAuth consent,
   and create a **Web application** OAuth client owned by this app. For testing add
   the intended accounts. Production publishing and any required Gmail verification
   must be completed before offering this flow to the public. Google testing-mode
   refresh-token expiry can interrupt unattended signing.
2. Create a **new** Apps Script project with exactly the files in
   `google-drive-backend/`. Set Script Properties:
   - `GOOGLE_CLIENT_ID`: the new Web client ID.
   - `GOOGLE_CLIENT_SECRET`: its secret, server-side only.
   - `APP_ORIGIN`: `https://roishlomo-teleprompter.github.io`
   - `APP_URL`: `https://roishlomo-teleprompter.github.io/Sign-PDF/google-drive.html`
3. Deploy that project as a Web App, executing as the deployer, access Anyone.
   It uses only UrlFetchApp for private user storage, never DriveApp. Add the exact
   new `/exec` URL as an authorized redirect URI on the Web OAuth client.
4. Put the new `/exec` URL in `google-drive-config.js`. This public file must never
   contain client secrets, refresh tokens or sessions. It is deliberately blank
   until an actual deployment exists, so the new page fails closed.
5. Open the new entrypoint, connect two different Google accounts, and perform the
   live checks below. Deployments with copied project files but no OAuth setup are
   not operational releases.

## Existing data and links: required work before final cutover

Existing identities use different account IDs and signer sessions. Existing PDFs may
have been created by the old Apps Script application. The new `drive.file` scope does
not automatically grant access to old files simply because they belong to the same
person. Do not broaden to full-Drive scope to bypass this issue silently.

An explicit migration/import step must copy user-approved original/signed bytes and
records into the new app's Drive files, remap the owning identity, retain original
request IDs, link capability hashes and participant tokens, and deliberately migrate
or re-establish old recipient session bindings. The current new project does **not**
implement that import. Historical links still target the old entrypoint and old
backend, so a compatible link router and verified transfer must precede disabling it.

For every account, verify counts, byte hashes, groups, settings, drafts, responses,
old and new public links and signed-document preview/download before making the new
entrypoint the default. Freeze writes during the final transfer and reconcile
concurrent signatures. Retain the original data until verification succeeds. This
change does not delete any existing project, user, object, file or table.

## Live acceptance checks

- Two real accounts create folders in their respective Drives, with no cross-account
  access via altered IDs, paths, tokens or browser account changes.
- New standalone PDF upload, anonymous signing, saved signed preview/download, and
  self-sign persistence survive page reload and a second device.
- Two participants sign the same shared PDF; earlier stamps remain, retries do not
  duplicate, and overlap is rejected. The sender is signed out during signing.
- Contacts, drafts, publication, required answers, cancellation, expiry and language
  persist. Revoked Drive consent produces an error without alternate storage writes.
- Optional Gmail consent retains the same account; sending from that account and
  one-time UI confirmation work. No test invitation is sent without authorization.
- OAuth denial, browser-proof mismatch, callback replay, closed popup, session expiry,
  refresh-token revocation and popup blocking give recoverable user-facing errors.
- Inspect network requests to confirm no previous-service endpoints are used by the
  new entrypoint; only then replace the main entrypoint and its worker cache.

## Capacity boundary

This implementation reuses Apps Script rather than adding a new non-Google provider.
Script Properties hold accounts, sessions and link routing and have finite per-store
and per-value limits. Expired sessions are removed when used, but unattended abandoned
sessions/routes are not yet swept. This is a small deployment implementation, not
an unbounded public-service architecture. Before broad release, move these private
indexes and credential handling into a suitable Google-managed backend, add a
scheduled retention job and abuse controls, and load-test Apps Script/Drive quotas.
Private user document data can remain in each user's Drive.

## Local verification

`npm test` includes legacy regression tests plus the new Google-only tests. New tests
exercise per-account Drive REST authorization, offline-owner public signing, isolation,
fail-closed writes, proof/handoff replay resistance, shared indexes, client capability
scoping and the absence of legacy imports. These mocks are not cloud acceptance tests.
