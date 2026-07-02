/**
 * One-off helper: obtain a Gmail `gmail.send` OAuth 2.0 refresh token for the
 * production MailProvider (`MAIL_PROVIDER=gmail`, see gmail-api.provider.ts).
 *
 * Run locally, ONCE, by the OWNER of the sending mailbox:
 *
 *   # bash
 *   GMAIL_OAUTH_CLIENT_ID=... GMAIL_OAUTH_CLIENT_SECRET=... npm run gmail:token
 *
 *   # PowerShell
 *   $env:GMAIL_OAUTH_CLIENT_ID="..."; $env:GMAIL_OAUTH_CLIENT_SECRET="..."; npm run gmail:token
 *
 * It prints a URL — open it, log in AS the sending mailbox, click "Allow", and
 * the script prints `GMAIL_OAUTH_REFRESH_TOKEN=...`. Paste that into the server
 * `.env`. The redirect URI below must be registered on the OAuth client in
 * Google Cloud Console (type: Web application).
 *
 * See docs/16-jobs-and-integrations.md §"Email через Gmail API".
 */
import http from 'node:http';

import { auth as googleAuth } from '@googleapis/gmail';

const clientId = process.env.GMAIL_OAUTH_CLIENT_ID;
const clientSecret = process.env.GMAIL_OAUTH_CLIENT_SECRET;
if (!clientId || !clientSecret) {
  console.error(
    'Set GMAIL_OAUTH_CLIENT_ID and GMAIL_OAUTH_CLIENT_SECRET before running.',
  );
  process.exit(1);
}

const PORT = 53682;
const REDIRECT_URI = `http://localhost:${PORT}/oauth2callback`;
const SCOPE = 'https://www.googleapis.com/auth/gmail.send';

const oauth2 = new googleAuth.OAuth2(clientId, clientSecret, REDIRECT_URI);

const authUrl = oauth2.generateAuthUrl({
  access_type: 'offline', // ask Google for a refresh token
  prompt: 'consent', // force a fresh refresh token on every run
  scope: [SCOPE],
});

console.log(
  '\n1) Open this URL, log in AS the sending mailbox, click "Allow":\n\n' +
    `${authUrl}\n\n` +
    `2) Waiting for the redirect on ${REDIRECT_URI} ...\n`,
);

const server = http.createServer((req, res) => {
  void (async () => {
    const url = new URL(req.url ?? '/', REDIRECT_URI);
    if (url.pathname !== '/oauth2callback') {
      res.statusCode = 404;
      res.end('not found');
      return;
    }

    const code = url.searchParams.get('code');
    const error = url.searchParams.get('error');
    if (error || !code) {
      res.statusCode = 400;
      res.end(`OAuth error: ${error ?? 'no code'}`);
      console.error(`\nOAuth failed: ${error ?? 'no code returned'}`);
      server.close();
      process.exit(1);
    }

    try {
      const { tokens } = await oauth2.getToken(code);
      if (!tokens.refresh_token) {
        res.statusCode = 500;
        res.end('No refresh token returned.');
        console.error(
          '\nNo refresh_token returned. Revoke the app under the account ' +
            '(myaccount.google.com → security → third-party access), then ' +
            'rerun — prompt=consent forces a new one.',
        );
        server.close();
        process.exit(1);
      }
      res.end('OK — refresh token captured. You can close this tab.');
      console.log(
        '\n=== paste into the server .env ===\n' +
          `GMAIL_OAUTH_REFRESH_TOKEN=${tokens.refresh_token}\n` +
          '==================================\n',
      );
      server.close();
      process.exit(0);
    } catch (e) {
      res.statusCode = 500;
      res.end('token exchange failed');
      console.error('\nToken exchange failed:', e);
      server.close();
      process.exit(1);
    }
  })();
});

server.listen(PORT);
