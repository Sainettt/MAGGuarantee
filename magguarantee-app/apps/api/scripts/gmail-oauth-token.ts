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
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

import { auth as googleAuth } from '@googleapis/gmail';

// Convenience: if the two secrets aren't in the shell environment, read them
// from a local `.env` in the current directory (apps/api/.env — same file the
// API uses). So you can EITHER `$env:GMAIL_OAUTH_CLIENT_ID="..."` in PowerShell
// OR just drop the values into apps/api/.env. Real shell env vars take priority.
function loadDotEnvFallback(file: string): void {
  let text: string;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return; // no .env — fine, rely on the shell environment
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // strip UTF-8 BOM
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (process.env[key] !== undefined) continue; // shell env wins
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}

// Look for .env both next to where the command was run (process.cwd()) AND
// next to this script's package (scripts/.. == apps/api), so it works even if
// npm sets a different cwd. Shell env vars still win over both.
const envCandidates = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(__dirname, '..', '.env'),
];
for (const candidate of envCandidates) loadDotEnvFallback(candidate);

const clientId = process.env.GMAIL_OAUTH_CLIENT_ID;
const clientSecret = process.env.GMAIL_OAUTH_CLIENT_SECRET;
if (!clientId || !clientSecret) {
  console.error('GMAIL_OAUTH_CLIENT_ID / GMAIL_OAUTH_CLIENT_SECRET not found.\n');
  console.error('Diagnostics:');
  console.error(`  cwd                       : ${process.cwd()}`);
  for (const candidate of envCandidates) {
    console.error(
      `  .env checked              : ${candidate}  (exists: ${fs.existsSync(candidate)})`,
    );
  }
  console.error(`  GMAIL_OAUTH_CLIENT_ID     : ${clientId ? 'found' : 'MISSING'}`);
  console.error(
    `  GMAIL_OAUTH_CLIENT_SECRET : ${clientSecret ? 'found' : 'MISSING'}`,
  );
  console.error(
    '\nFix: put BOTH lines (EXACT names, no quotes, no `export`) in apps/api/.env:\n' +
      '  GMAIL_OAUTH_CLIENT_ID=123-abc.apps.googleusercontent.com\n' +
      '  GMAIL_OAUTH_CLIENT_SECRET=GOCSPX-xxxx\n' +
      'or set them in the SAME PowerShell window with `$env:NAME="..."` (not `set`).',
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
