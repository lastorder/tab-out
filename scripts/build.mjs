/**
 * scripts/build.mjs — Tab Out build pipeline
 *
 * Bundles the TypeScript entry points with esbuild and copies every static
 * asset into `dist/`. The result is a directory Chrome can load directly via
 * "Load unpacked" — nothing else is needed at install time.
 *
 * Usage:
 *   node scripts/build.mjs            # one-shot production build
 *   node scripts/build.mjs --watch    # rebuild on change
 *   node scripts/build.mjs --dev      # unminified + sourcemaps
 */

import { build, context } from 'esbuild';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');

const argv = process.argv.slice(2);
const WATCH = argv.includes('--watch');
const DEV = WATCH || argv.includes('--dev');

/** Script entry points → output file names inside dist/. */
const ENTRY_POINTS = {
  'newtab': path.join(SRC, 'newtab/main.ts'),
  'options': path.join(SRC, 'options/main.ts'),
  'background': path.join(SRC, 'background/main.ts'),
};

/** Static files copied verbatim: [source, destination-relative-to-dist]. */
const STATIC_ASSETS = [
  ['manifest.json', 'manifest.json'],
  ['newtab/index.html', 'index.html'],
  ['options/options.html', 'options.html'],
  ['styles/dashboard.css', 'styles/dashboard.css'],
  ['styles/options.css', 'styles/options.css'],
  ['icons', 'icons'],
];

const buildOptions = {
  entryPoints: ENTRY_POINTS,
  outdir: DIST,
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['chrome114'],
  minify: !DEV,
  sourcemap: DEV ? 'inline' : false,
  legalComments: 'none',
  logLevel: 'info',
  tsconfig: path.join(ROOT, 'tsconfig.json'),
  define: {
    'process.env.NODE_ENV': JSON.stringify(DEV ? 'development' : 'production'),
  },
};

/** Copy every static asset into dist/, creating parent directories as needed. */
async function copyStaticAssets() {
  for (const [from, to] of STATIC_ASSETS) {
    const src = path.join(SRC, from);
    const dest = path.join(DIST, to);
    if (!existsSync(src)) {
      console.warn(`[build] skipping missing asset: ${from}`);
      continue;
    }
    await mkdir(path.dirname(dest), { recursive: true });
    await cp(src, dest, { recursive: true });
  }
}

/**
 * Keeps manifest.json's version in lockstep with package.json so there is a
 * single source of truth for the release number.
 */
async function syncManifestVersion() {
  const pkg = JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8'));
  const manifestPath = path.join(DIST, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  manifest.version = pkg.version;
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

async function runStaticPipeline() {
  await copyStaticAssets();
  await syncManifestVersion();
}

async function main() {
  await rm(DIST, { recursive: true, force: true });
  await mkdir(DIST, { recursive: true });

  if (WATCH) {
    // Re-copy assets on every rebuild so HTML/CSS edits show up too.
    const assetPlugin = {
      name: 'tab-out-static-assets',
      setup(pluginBuild) {
        pluginBuild.onEnd(() => runStaticPipeline());
      },
    };
    const ctx = await context({ ...buildOptions, plugins: [assetPlugin] });
    await ctx.watch();
    console.log(`[build] watching… output: ${path.relative(ROOT, DIST)}/`);
    return;
  }

  await build(buildOptions);
  await runStaticPipeline();
  console.log(`[build] done → ${path.relative(ROOT, DIST)}/`);
}

main().catch((err) => {
  console.error('[build] failed:', err);
  process.exit(1);
});
