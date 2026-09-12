/**
 * scripts/package.mjs — build the zip that gets uploaded to the Chrome Web Store.
 *
 * The Chrome Web Store requires `manifest.json` to sit at the *root* of the
 * archive, so this zips the **contents** of `dist/` rather than the `dist/`
 * directory itself. Run `npm run build` first (`npm run check` does it too).
 *
 * The release number has one source of truth: `package.json#version`.
 * `scripts/build.mjs` copies it into `dist/manifest.json`, and this script
 * refuses to package a `dist/` that is out of date or a version that does not
 * match the git tag being released.
 *
 * Usage:
 *   node scripts/package.mjs                           # → release/tab-out-<version>.zip
 *   node scripts/package.mjs --expect-version v2.8.0    # fail unless it matches package.json
 *   node scripts/package.mjs --out /tmp/tab-out.zip     # write somewhere else
 */

import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const RELEASE_DIR = path.join(ROOT, 'release');

/** Never ship these, however they got into dist/. */
const EXCLUDES = ['*.DS_Store', '*.map'];

/** Files that must be present for Chrome to accept the package. */
const REQUIRED = ['manifest.json', 'index.html', 'background.js'];

function parseArgs(argv) {
  const args = { expectVersion: null, out: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--expect-version') {
      args.expectVersion = argv[++i] ?? null;
    } else if (arg === '--out') {
      args.out = argv[++i] ?? null;
    } else if (arg === '--help' || arg === '-h') {
      console.log('usage: node scripts/package.mjs [--expect-version vX.Y.Z] [--out FILE]');
      process.exit(0);
    } else {
      fail(`unknown argument: ${arg}`);
    }
  }
  return args;
}

function fail(message) {
  console.error(`\n[package] error: ${message}\n`);
  process.exit(1);
}

const args = parseArgs(process.argv.slice(2));

const pkg = JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8'));
const version = pkg.version;
if (typeof version !== 'string' || !/^\d+(\.\d+){0,3}$/.test(version)) {
  fail(
    `package.json#version is "${version}", which is not a Chrome Web Store version.\n` +
      '  It must be 1–4 dot-separated integers (each 0–65535), e.g. 2.8.0',
  );
}

// A release tag may be `v2.8.0` or `2.8.0`; compare the numbers only.
if (args.expectVersion !== null) {
  const expected = args.expectVersion.replace(/^v/, '');
  if (expected !== version) {
    fail(
      `version mismatch: the tag says ${args.expectVersion} but package.json says ${version}.\n` +
        `  Bump package.json to ${expected}, commit, then re-tag — or retag v${version}.`,
    );
  }
}

const manifestPath = path.join(DIST, 'manifest.json');
try {
  await stat(manifestPath);
} catch {
  fail('dist/manifest.json is missing — run `npm run build` (or `npm run check`) first.');
}

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
if (manifest.version !== version) {
  fail(
    `dist/ is stale: dist/manifest.json says ${manifest.version}, package.json says ${version}.\n` +
      '  Re-run `npm run build` to sync it.',
  );
}

// Zip the *contents* so manifest.json lands at the archive root.
const entries = (await readdir(DIST)).filter((name) => name !== '.DS_Store').sort();
for (const required of REQUIRED) {
  if (!entries.includes(required)) {
    fail(`dist/${required} is missing — the build did not finish correctly.`);
  }
}

// A custom --out is left alone; the default drops older zips so that
// `release/*.zip` is never ambiguous for CI.
const outPath = args.out
  ? path.resolve(args.out)
  : path.join(RELEASE_DIR, `tab-out-${version}.zip`);
if (!args.out) {
  await rm(RELEASE_DIR, { recursive: true, force: true });
}
await mkdir(path.dirname(outPath), { recursive: true });

try {
  execFileSync('zip', ['-r', '-X', '-q', outPath, ...entries, '-x', ...EXCLUDES], {
    cwd: DIST,
    stdio: ['ignore', 'ignore', 'pipe'],
  });
} catch (error) {
  if (error.code === 'ENOENT') {
    fail('the `zip` command was not found. Install it (macOS/Linux ship it) and try again.');
  }
  fail(`zip failed: ${error.stderr?.toString().trim() || error.message}`);
}

// Confirm the archive really is shaped the way the store expects.
try {
  const listing = execFileSync('unzip', ['-Z1', outPath], { encoding: 'utf8' })
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (!listing.includes('manifest.json')) {
    fail('the zip does not have manifest.json at its root — the store will reject it.');
  }
  const escaped = listing.filter((name) => name.startsWith('/') || name.includes('..'));
  if (escaped.length > 0) {
    fail(`the zip contains unsafe paths: ${escaped.join(', ')}`);
  }
  console.log(`[package] ${listing.length} files, manifest at root ✓`);
} catch (error) {
  if (error.code === 'ENOENT') {
    console.warn('[package] `unzip` not found — skipped the archive layout check.');
  } else {
    fail(`could not read back the zip: ${error.message}`);
  }
}

const { size } = await stat(outPath);
const kb = (size / 1024).toFixed(0);
console.log(`[package] v${version} → ${path.relative(ROOT, outPath)} (${kb} KB)`);
