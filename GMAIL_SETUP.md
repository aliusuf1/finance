# Gmail bank alert import

Hisab connects directly to Gmail using Google's read-only OAuth scope. The ChatGPT Gmail connection is separate and does not configure this app's Google client.

## One-time setup

1. In [Google Cloud Console](https://console.cloud.google.com/apis/library/gmail.googleapis.com), choose your project and enable the Gmail API.
2. Configure the Google Auth consent screen. For personal development, keep the app in Testing and add the Gmail address receiving your bank alerts as a test user.
3. Create an OAuth client of type **Web application**. Add this exact authorized redirect URI for the running local app:

   `http://127.0.0.1:5173/api/email/callback`

   If you use another host or port, register that exact callback too. Production requires the HTTPS callback on your deployed domain.
4. Add these values to the project's ignored `.env.local` file. Do not put the secret in frontend code, commit it, or paste it into chat:

   ```dotenv
   GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=your-client-secret
   ```

5. Restart the development server. Open **Bank alerts from Gmail → Connect Gmail**, choose the account receiving the alerts, and grant read-only access.
6. Click **Fetch this month**, review the debit transactions, and click **Import**. If there are more than 50 alerts, use **Load more alerts from this month** to check subsequent pages.

The Google consent flow must be completed by the account owner. Gmail read access can require Google verification for a publicly distributed app; a testing connection may expire sooner than the browser cookie. Reconnect when prompted. See [Google's web-server OAuth guide](https://developers.google.com/identity/protocols/oauth2/web-server).

## Import rules

- Exact senders: `no-reply@meezanbank.com` and `digital.banking@hbl.com`.
- Both the email receipt timestamp and the transaction date must be in the current calendar month in Asia/Karachi. Gmail queries use Unix timestamps to avoid Google's default PST date interpretation.
- Only explicit debits are accepted. Credits, refunds, reversals, failed transactions, OTPs, ambiguous amounts, and missing/conflicting transaction dates are skipped.
- The parser was checked against current Meezan fund-transfer, ATM, Raast, and HBL outgoing-transfer email formats. Regression tests use redacted examples. A new or unsupported bank alert format may be skipped until a redacted example can be used to extend parsing.
- Plain-text and HTML email bodies are supported. Attachments are not fetched. Full email bodies and OAuth tokens are never stored in transaction rows.
- Imports are checked again on the server. Deterministic transaction IDs and `ON CONFLICT DO NOTHING` prevent repeated imports from overwriting saved edits/notes. No database migration is needed.
- Deleting an imported receipt allows it to be imported again from its email.
- Import runs when requested in the app; there is no background polling or closed-browser scheduled synchronization.

## Connection handling

Tokens are encrypted with AES-GCM in an HttpOnly, SameSite=Lax cookie scoped to `/api/email`, marked Secure on HTTPS. The encryption key is derived from the server's Clerk secret with a Gmail-specific purpose; rotating that secret invalidates saved connections. The cookie is bound to the verified Clerk user, lasts up to 30 days, and is only useful in this browser. PKCE and a short-lived encrypted state cookie protect the OAuth callback. Disconnect revokes the Google token and removes the browser connection, preserving imported receipts.

The app requests the `gmail.readonly` permission, which allows reading the mailbox; the application itself narrows reads to the configured bank senders and current month. It does not request send, modify, or delete-mail permissions.

Reference: [Gmail search and date filtering](https://developers.google.com/workspace/gmail/api/guides/filtering).

## Checks

```powershell
& ./.sites-runtime/node/node_modules/node/bin/node.exe --test scripts/bank-email-parser.test.mjs scripts/gmail-import.test.mjs scripts/gmail-session.test.mjs scripts/receipts-api.test.mjs
& ./.sites-runtime/node/node_modules/node/bin/node.exe node_modules/typescript/bin/tsc --noEmit
```
