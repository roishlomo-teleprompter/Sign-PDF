# Google sign-in release setup

Status at implementation: Google provider is disabled on the project. The application code is ready for configuration; do not advertise sign-in as working until the provider and callback are tested.

## Configure the Google web client

Use an existing Google Cloud project owned by the app owner or create a dedicated one. Configure an External audience if the app is intended for any Google user. Request only OpenID, email and profile scopes for sign-in. No Gmail mailbox or sending scope is required.

Create a Web application OAuth client with:

- Authorized JavaScript origin: `https://roishlomo-teleprompter.github.io`
- Authorized redirect URI: `https://yybpppkxniizxbeettpp.supabase.co/auth/v1/callback`

Enter its Client ID and Client Secret directly in the Supabase Google provider settings. Never commit the secret or put it in a browser bundle. Enable Google sign-in, and keep nonce and email validation enabled.

## Configure Supabase Auth

Project: `yybpppkxniizxbeettpp` (Sign PDF)

- Site URL: `https://roishlomo-teleprompter.github.io/Sign-PDF/`
- Allowed redirect: `https://roishlomo-teleprompter.github.io/Sign-PDF/?auth=google`
- Enable manual identity linking so anonymous workspaces can become Google-backed accounts without changing their UUID.
- Retain anonymous sign-ins so the app can still open directly and signing recipients can use their links.

The public Google-provider setting must be true before release. The current connected tools do not expose provider-setting updates; use the project dashboard. The dashboard currently requires the owner's sign-in.

## Account behavior

- Owners with existing device data use `linkIdentity` to retain their owner ID, documents and private storage paths.
- Empty device workspaces use normal Google OAuth sign-in, allowing an existing Google user to return from another device.
- If workspace presence cannot be checked, sign-in is blocked rather than risk switching away from existing data.
- A Google identity that already belongs to another account is not silently merged. The original device account remains in use; a separately designed authenticated merge flow is needed for that case.
- Local sign-out leaves account data intact and returns the app to its direct-entry experience.
- Account controls are not shown on signing-recipient links.
- PKCE is handled by the Supabase SDK. Callback query parameters are cleaned after initialization; extra Google provider tokens are not stored by the app.
- Requests and dialogs from a removed owner dashboard must not paint data into a new account view.

## Validation before deployment

1. Run `npm test`.
2. Link a test anonymous workspace that has a group and a PDF. Verify the UUID and paths stay unchanged.
3. Sign out, then sign in to the same Google account on a clean browser. Verify the same workspace appears.
4. Cancel Google consent and confirm the guest workspace remains available.
5. Test an already-linked identity with guest data and confirm that no automatic account replacement occurs.
6. Verify sign-in does not ask for Gmail mailbox access or sending permissions.

Reference: https://supabase.com/docs/guides/auth/social-sign-in/auth-google
