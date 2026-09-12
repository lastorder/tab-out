/**
 * scripts/publish.mjs — upload a package to the Chrome Web Store (API v2).
 *
 * This is the step that runs from `.github/workflows/release.yml`, but it is an
 * ordinary Node script so it can be run locally too. It **uploads a new draft
 * version and stops there** unless you pass `--publish`, which submits the draft
 * for review.
 *
 * Credentials come from the environment (see doc/publishing.md):
 *
 *   CWS_EXTENSION_ID         the item's ID in the store (required)
 *   CWS_PUBLISHER_ID         your publisher ID (required)
 *
 *   …plus ONE of these two ways to authenticate:
 *
 *   CWS_SERVICE_ACCOUNT_KEY  the full JSON key of a service account that has
 *                            been added to your publisher account (preferred)
 *   — or —
 *   CWS_CLIENT_ID            an OAuth client, with
 *   CWS_CLIENT_SECRET        its secret, and
 *   CWS_REFRESH_TOKEN        a refresh token for the chromewebstore scope
 *
 * Usage:
 *   node scripts/publish.mjs                       # upload release/tab-out-<version>.zip as a draft
 *   node scripts/publish.mjs --zip dist.zip        # upload a specific file
 *   node scripts/publish.mjs --publish             # …and submit it for review
 *   node scripts/publish.mjs --publish --staged    # …but stage it instead of auto-publishing on approval
 *
 * API reference: https://developer.chrome.com/docs/webstore/api
 */

import { createSign } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCOPE = 'https://www.googleapis.com/auth/chromewebstore';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API = 'https://chromewebstore.googleapis.com/v2';
const UPLOAD_API = 'https://chromewebstore.googleapis.com/upload/v2';
const DASHBOARD = 'https://chrome.google.com/webstore/devconsole';

function fail(message) {
  console.error(`\n[publish] error: ${message}\n`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = { zip: null, publish: false, staged: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--zip') args.zip = argv[++i] ?? null;
    else if (arg === '--publish') args.publish = true;
    else if (arg === '--staged') args.staged = true;
    else if (arg === '--help' || arg === '-h') {
      console.log(
        'usage: node scripts/publish.mjs [--zip FILE] [--publish] [--staged]\n' +
          '  env: CWS_EXTENSION_ID, CWS_PUBLISHER_ID,\n' +
          '       CWS_SERVICE_ACCOUNT_KEY  (or CWS_CLIENT_ID / CWS_CLIENT_SECRET / CWS_REFRESH_TOKEN)',
      );
      process.exit(0);
    } else fail(`unknown argument: ${arg}`);
  }
  return args;
}

// ---------------------------------------------------------------- credentials

const args = parseArgs(process.argv.slice(2));

const extensionId = process.env.CWS_EXTENSION_ID?.trim();
const publisherId = process.env.CWS_PUBLISHER_ID?.trim();

if (!extensionId) fail('CWS_EXTENSION_ID is not set (the item ID from the developer dashboard).');
if (!publisherId) fail('CWS_PUBLISHER_ID is not set (Publisher → Settings in the dashboard).');
if (args.staged && !args.publish) {
  console.warn('[publish] --staged only matters together with --publish; ignoring it.');
  args.staged = false;
}

const itemPath = `publishers/${publisherId}/items/${extensionId}`;

/** Exchange a service-account JSON key for an access token (RS256 JWT bearer flow). */
async function tokenFromServiceAccount(rawKey) {
  let key;
  try {
    key = JSON.parse(rawKey);
  } catch {
    fail('CWS_SERVICE_ACCOUNT_KEY is not valid JSON — paste the whole key file contents.');
  }
  if (!key.client_email || !key.private_key) {
    fail('CWS_SERVICE_ACCOUNT_KEY is missing client_email or private_key.');
  }

  const now = Math.floor(Date.now() / 1000);
  const b64 = (input) => Buffer.from(input).toString('base64url');
  const signingInput = `${b64(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64(
    JSON.stringify({
      iss: key.client_email,
      scope: SCOPE,
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600,
    }),
  )}`;
  // Secrets are often pasted with literal \n escapes rather than real newlines.
  const privateKey = String(key.private_key).replace(/\\n/g, '\n');
  const signature = createSign('RSA-SHA256').update(signingInput).sign(privateKey, 'base64url');

  return requestToken(
    new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${signingInput}.${signature}`,
    }),
    `service account ${key.client_email}`,
  );
}

/** Exchange a long-lived refresh token for an access token. */
async function tokenFromRefreshToken() {
  const clientId = process.env.CWS_CLIENT_ID?.trim();
  const clientSecret = process.env.CWS_CLIENT_SECRET?.trim();
  const refreshToken = process.env.CWS_REFRESH_TOKEN?.trim();

  const missing = [
    ['CWS_CLIENT_ID', clientId],
    ['CWS_CLIENT_SECRET', clientSecret],
    ['CWS_REFRESH_TOKEN', refreshToken],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length > 0) {
    fail(
      `no usable credentials. Set CWS_SERVICE_ACCOUNT_KEY, or the OAuth trio ` +
        `(missing: ${missing.join(', ')}).`,
    );
  }

  return requestToken(
    new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
    'the refresh token',
  );
}

async function requestToken(body, label) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const text = await res.text();
  let json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    /* fall through to the generic error below */
  }
  if (!res.ok || !json.access_token) {
    const detail = json.error_description || json.error || text.slice(0, 300) || res.statusText;
    fail(
      `Google refused to mint an access token for ${label} (HTTP ${res.status}): ${detail}\n` +
        '  Check that the Chrome Web Store API is enabled in the Cloud project, that the\n' +
        '  credentials have not been revoked, and that the clock on this machine is right.',
    );
  }
  console.log(`[publish] authenticated via ${label}`);
  return json.access_token;
}

async function getAccessToken() {
  const serviceAccountKey = process.env.CWS_SERVICE_ACCOUNT_KEY?.trim();
  if (serviceAccountKey) return tokenFromServiceAccount(serviceAccountKey);
  return tokenFromRefreshToken();
}

// --------------------------------------------------------------------- http

/** Turn an API error into something a human can act on. */
function explain(status, payload, fallbackText) {
  const message = payload?.error?.message || fallbackText?.slice(0, 400) || '';
  const hints = {
    400: 'The store rejected the package. The usual cause is a version that is not higher\n' +
      '  than the published one — bump package.json#version and re-tag.',
    401: 'The access token was rejected. Re-check the credentials, and that the OAuth client\n' +
      '  or service account still exists.',
    403: 'Authenticated, but not allowed. Confirm the Chrome Web Store API is enabled and\n' +
      '  that the service account email (or OAuth user) was added to your publisher account.',
    404: 'No such item. CWS_PUBLISHER_ID or CWS_EXTENSION_ID is wrong, or the account that\n' +
      '  authorized this request does not own the item.',
  }[status];
  return hints ? `HTTP ${status}: ${message}\n  ${hints}` : `HTTP ${status}: ${message}`;
}

async function callApi(url, token, init = {}) {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
  });
  const text = await res.text();
  let json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    /* keep {} and let the caller use the raw text */
  }
  return { res, json, text };
}

/** UploadState is an enum whose exact spelling we don't want to hard-code. */
function classifyUploadState(state) {
  const value = String(state ?? '').toUpperCase();
  if (!value) return 'unknown';
  if (value.includes('IN_PROGRESS')) return 'pending';
  if (value.includes('FAIL') || value.includes('REJECT') || value.includes('ERROR')) return 'failed';
  if (value.includes('SUCCESS') || value.includes('SUCCEEDED')) return 'success';
  return 'unknown';
}

async function pollUploadState(token) {
  // Async uploads are rare (large packages) but the API tells us to poll for them.
  for (let attempt = 1; attempt <= 20; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    const { res, json, text } = await callApi(`${API}/${itemPath}:fetchStatus`, token);
    if (!res.ok) fail(explain(res.status, json, text));
    const state = json.lastAsyncUploadState;
    console.log(`[publish] upload state: ${state ?? '(none yet)'}`);
    const verdict = classifyUploadState(state);
    if (verdict === 'success' || verdict === 'failed') return { verdict, state };
  }
  return { verdict: 'unknown', state: 'timed out' };
}

// --------------------------------------------------------------------- main

const zipPath = args.zip
  ? path.resolve(args.zip)
  : path.join(ROOT, 'release', `tab-out-${JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8')).version}.zip`);

try {
  await stat(zipPath);
} catch {
  fail(`${path.relative(ROOT, zipPath)} does not exist — run \`npm run package\` first.`);
}

const zipBytes = await readFile(zipPath);
console.log(
  `[publish] ${path.relative(ROOT, zipPath)} (${(zipBytes.length / 1024).toFixed(0)} KB) → ${extensionId}`,
);

const token = await getAccessToken();

const upload = await callApi(`${UPLOAD_API}/${itemPath}:upload`, token, {
  method: 'POST',
  headers: { 'Content-Type': 'application/zip' },
  body: zipBytes,
});

if (!upload.res.ok) fail(explain(upload.res.status, upload.json, upload.text));

const uploadState = upload.json.uploadState;
console.log(`[publish] uploaded, uploadState=${uploadState ?? 'unknown'}`);

if (classifyUploadState(uploadState) === 'pending') {
  const result = await pollUploadState(token);
  if (result.verdict === 'failed') fail(`the store failed to process the package (${result.state}).`);
  if (result.verdict !== 'success') {
    fail(`the upload never finished processing (last state: ${result.state}). Re-run to check again.`);
  }
}

const crxVersion = upload.json.crxVersion;
console.log(
  `[publish] ✓ v${crxVersion ?? '?'} is in the store as a ${args.publish ? 'submission' : 'draft'}`,
);

if (!args.publish) {
  console.log(
    '[publish] nothing was submitted for review (upload-only, as configured).\n' +
      `[publish] review and submit it here: ${DASHBOARD}`,
  );
  process.exit(0);
}

const publish = await callApi(`${API}/${itemPath}:publish`, token, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(args.staged ? { publishType: 'STAGED_PUBLISH' } : {}),
});

if (!publish.res.ok) fail(explain(publish.res.status, publish.json, publish.text));

const warnings = publish.json.warningInfo?.warnings ?? [];
for (const warning of warnings) {
  console.warn(`[publish] warning: ${warning.reason} — ${warning.description}`);
}
console.log(`[publish] ✓ submitted for review, state=${publish.json.state ?? 'unknown'}`);
if (args.staged) {
  console.log('[publish] staged: publish it from the dashboard (or the API) once it passes review.');
}
