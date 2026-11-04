# Workspace ownership transfers

Apply stable-pdf-paths.sql after the original schema when provisioning a new project. It has already been applied to the live project via migration stable_pdf_namespaces_for_workspace_owner_transfer.

PDF storage namespaces must remain stable when a request owner changes. storage_owner_id records the original namespace while owner_id controls access. Owner storage SELECT/DELETE policies match the current request owner and exact original/signed paths. Never authorize access using the historical namespace alone. Clients have no direct INSERT/UPDATE grants on sign_requests; creation remains through the authenticated create_sign_request RPC.

A support-assisted transfer must verify the anonymous source from the failed OAuth flow and the verified destination account. Transfer sign_requests first, then groups/events and participants, in one transaction. Preserve request IDs, tokens, signer IDs, statuses and PDF paths, and verify combined counts. Never update auth identities or storage.objects metadata directly. Do not infer a source account by email alone.

Validation of the applied change: all PDF paths unchanged; target role sees combined records and PDF objects; unrelated authenticated role sees zero records/files; create_sign_request still generates the current caller's path (test rolled back). All 36 frontend regression tests pass. Existing security advisor warnings remain unchanged. Real Google consent must still be completed by the account owner.
