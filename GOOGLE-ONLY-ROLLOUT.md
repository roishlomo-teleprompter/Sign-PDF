# Personal Google Drive replacement

Status: the Google-only service is deployed and configured. The installation owner's
55 source files were copied and byte-verified, and the existing source was frozen
before the new manifest became active. Original source data remains retained.
This change replaces the default entrypoint and worker cache with the Google-only
shell. It must not load the previous identity SDK or contact its services.

The existing Google OAuth client is still Testing. Complete Branding and Audience
publication before offering sign-in to users beyond the configured test accounts.
Live acceptance with a second real Google account remains pending. Do not delete
the previous backend or original files while that rollout remains incomplete.

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
   contain client secrets, refresh tokens or sessions. It is configured for the deployed service. Invalid or missing configuration
   makes the new page fail closed.
5. Open the new entrypoint, connect two different Google accounts, and perform the
   live checks below. Deployments with copied project files but no OAuth setup are
   not operational releases.

## Existing data and links: required work before final cutover

Existing identities use different account IDs and signer sessions. Existing PDFs may
have been created by the old Apps Script application. The new `drive.file` scope does
not automatically grant access to old files simply because they belong to the same
person. Do not broaden to full-Drive scope to bypass this issue silently.

The optional owner-account transfer is implemented in `GoogleExport.gs` on the
existing installation and `Import.gs` on the new installation. The new service
passes its own short-lived Google access token to the fixed source installation;
the source verifies the Google email against its private Sheet owner. No previous
identity-provider endpoint, credential or session is used for this export.

The source snapshots its active tables, settings, individual pilot requests and
shared-document metadata. Every original/signed PDF and referenced signature PNG
is hashed. The new service copies and verifies files in resumable private stages,
then verifies destination bytes in bounded batches. Final activation requires an
unchanged source snapshot and freezes source writes under the existing source
lock. Original records and files are retained. A manifest marker reconciles a
lost final response. Writes refresh the latest account pointer after taking the
lock so an earlier request cannot overwrite the imported workspace.

Owner IDs are mapped to the Google subject; request IDs, capability hashes,
participant tokens, original storage paths and shared personal links survive.
Retired recipient session claims are cleared and must be claimed through the new
Google-only guest-session service using the same private link. The legacy pilot
landing page offers its existing personal token through the new main entrypoint.

The transfer deliberately requires an empty destination and refuses cross-account
sources, link collisions, missing file mappings, corrupted bytes and changed source
data. It currently covers the configured installation owner. Other accounts start
with personal Drive storage; their previous-provider history, if any, requires a
separately authorized export. Never claim those histories were copied by this tool.

The default entrypoint and worker cache now use the Google-only shell. Continue
cloud acceptance of old/new public links, signed preview/download and contacts. The source freeze must stay enabled after new Drive writes. A rollback
requires reconciling those new writes first; do not simply remove the freeze flag.

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
