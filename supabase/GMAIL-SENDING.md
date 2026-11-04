# Gmail send-only delivery

The app sends a personal signing link using Gmail API users.messages.send, from the currently authenticated Google account. It does not use mailto or a shared sender. No scheduled emails, bulk sending or PDF attachment is included in this change.

## Google project configuration required

In Google Cloud project quick-sign-513720 (SignWay):
1. Enable Gmail API (gmail.googleapis.com).
2. In Google Auth Platform > Data Access, add https://www.googleapis.com/auth/gmail.send. Retain the existing OpenID/email/profile sign-in scopes.
3. For Testing audience, add actual testing account emails. Public use of the sensitive gmail.send scope requires Google's verification process where applicable. Complete branding/privacy-policy requirements before submission.

## User flow

The owner opens Email on a participant or a newly created single-document link. Review the connected sender, recipient, subject and plain text body. Authorize Gmail sending explicitly when needed. OAuth requests only the additional send scope, uses the existing allowed callback and hints the current email. A short-lived sessionStorage draft survives the redirect; it is bound to the original owner UUID and expires after 15 minutes. A mismatching account never restores/sends that draft. OAuth return only reopens the review window; it does not send.

Press Send to open a separate confirmation dialog showing the sender, recipient and subject. Only Confirm and send makes one Gmail API request. Cancel, Escape and closing the compose flow send nothing. Ordinary Google sign-in never requests gmail.send; that scope is requested only by the explicit Gmail authorization action in the compose flow. Success is displayed only after Gmail returns a message ID. Missing/expired tokens request reauthorization; no additional provider-token or refresh-token persistence is added by this module. A transport failure or malformed success response is ambiguous, disables repeat Send and instructs the user to check Gmail Sent before retrying. HTTP rejection is not displayed as success. No real emails were sent during automated testing.

## Validation

Tests cover UTF-8 MIME, sender ownership, recipient/header injection, explicit send action, no auto-send after OAuth, send-only consent, missing permission, disabled API, account change, network ambiguity and duplicate-submit prevention. Run npm test.

Live verification still requires enabling Gmail API, completing OAuth consent from the user's own account, sending a test message, and confirming delivery and sender in Gmail Sent and the recipient inbox.
