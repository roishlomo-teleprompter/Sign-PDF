# Personal Google Drive replacement

Status: the Google-only service is deployed and configured. The installation owner's
55 source files were copied and byte-verified, and the existing source was frozen
before the new manifest became active. Original source data remains retained.
This change replaces the default entrypoint and worker cache with the Google-only
shell. It must not load the previous identity SDK or contact its services.

The last observed Google Audience status was **In production**. Search Console
ownership was verified; branding/data-access verification still needed follow-up.
These Google review steps do not reintroduce the former identity or storage provider.
Live acceptance with a second real Google account remains pending. Do not delete
the previous backend or original files while that rollout remains incomplete.

## Production artifact and remaining historical-data check

`npm run build` creates a public allowlist in `dist/`. The single Pages workflow
publishes only this output, not the repository root. No former SDK, identity adapter,
backend source or old migration UI is included. The retired preview/migration URLs
redirect to the Google-only home, preserving their query and fragment. Earlier
source and SQL remain in Git as history, not as production entrypoints.

On 2026-11-14 the former project was still listed as active. Read-only table inventory
and aggregate record-count queries both failed with database authentication errors
through the connected service. Consequently, this audit cannot assert that all
other accounts' old data was exported or that the previous project may be deleted.
The verified owner transfer remains the 55-file migration described above. The old
project is not used by the new application's runtime, but shutdown/billing cleanup
and any unverified histories require access to that project's existing data first.


## Implemented

`google-drive.html` preserves the signing UI and uses only the new Google identity,
bridge and personal Drive adapter. It never imports the previous SDK or transport.
`google-drive-backend/` is a standalone Apps Script project, not an addition to the
existing project's files. Do not combine its global functions with the old project.

Each verified Google `sub` gets its own private `Sign Away` root with Originals,
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

## Multi-account browser sign-in: site-owned callback

The Apps Script browser account router can fail for a non-default Google account.
The prepared alternative returns OAuth to the existing app origin at
`https://roishlomo-teleprompter.github.io/Sign-PDF/oauth-callback.html`.
The callback has no external assets, removes its query immediately, and transfers
its one-time code to the app via a fragment. The credentialless RPC bridge then
exchanges it server-side. Browser proof, state, nonce, issuer, audience, expiry,
verified email, Drive scope and Gmail same-account checks still apply.
Client secrets and refresh tokens remain private to Apps Script.

Activation order (do not set the property before all preceding steps):
1. Publish the frontend, including `oauth-callback.html`.
2. Update the live combined Apps Script Google.gs section and Bridge.html,
   then deploy a new version to the existing endpoint with unchanged permissions.
3. With explicit approval for the OAuth configuration change, add the callback
   URI above to the existing Web OAuth client's authorized redirect URIs in
   Google Cloud. Keep the previous /exec URI for existing flows and rollback.
4. Set Script Property `OAUTH_REDIRECT_URI` to that exact callback URI.
5. Test fresh sign-in with each of two accounts simultaneously present in a
   regular browser, account isolation, missing consent, cancellation and Gmail.

Until step 4, the existing /exec callback remains active. Each newly started
flow stores its redirect URI so activation does not change its token exchange.
Rollback: remove `OAUTH_REDIRECT_URI` and start a new sign-in. Do not remove
any account data or tokens to roll back the callback path.
