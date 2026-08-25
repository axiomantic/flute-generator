#!/usr/bin/env node
// Builds the studio bundle and, with --docs, the published copy under docs/.
//
//   node scripts/build.mjs            -> dist/
//   node scripts/build.mjs --docs     -> dist/ and docs/
//   node scripts/build.mjs --watch    -> dist/, rebuilt on change
//
// Two entry points, because the audio processor runs in AudioWorkletGlobalScope and must be a
// separate module file that audioWorklet.addModule() can load.
import { build, context } from 'esbuild';
import { mkdir, copyFile, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { copyVendorTo } from './vendor.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const DOCS = path.join(ROOT, 'docs');
const WATCH = process.argv.includes('--watch');
const DO_DOCS = process.argv.includes('--docs');

/** openscad.js resolves openscad.wasm against its own URL, so the two always travel together. */
const RUNTIME_ASSETS = ['openscad.js', 'openscad.wasm'];

const options = {
  entryPoints: [
    { in: path.join(ROOT, 'src/web/main.ts'), out: 'flute' },
    { in: path.join(ROOT, 'src/web/audio/worklet-entry.ts'), out: 'flute-worklet' }
  ],
  outdir: DIST,
  bundle: true,
  format: 'esm',
  target: 'es2020',
  sourcemap: true,
  logLevel: 'info',
  // Loaded at runtime from a sibling of dist/, not baked into the bundle.
  external: ['../openscad.js']
};

async function buildDocs() {
  await rm(path.join(DOCS, 'dist'), { recursive: true, force: true });
  await mkdir(path.join(DOCS, 'dist'), { recursive: true });
  await build({ ...options, outdir: path.join(DOCS, 'dist'), sourcemap: false, minify: true });

  // index.html is copied verbatim: it references ./dist/flute.js, ./openscad.js and
  // ./vendor/*.js, all of which resolve the same way from the repo root and from docs/.
  const html = await readFile(path.join(ROOT, 'index.html'), 'utf8');
  await writeFile(path.join(DOCS, 'index.html'), html);
  for (const asset of RUNTIME_ASSETS) {
    await copyFile(path.join(ROOT, asset), path.join(DOCS, asset));
  }
  const vendored = await copyVendorTo(DOCS);
  console.log(
    'docs/ written: index.html, dist/, ' +
      RUNTIME_ASSETS.join(', ') +
      ', vendor/{' + vendored.join(', ') + '}'
  );
}

/**
 * dist/ only. The example generator imports this from a headless page to render the gallery's
 * audio through the studio's own worklet; the published site has no use for it.
 */
const offlineOptions = {
  entryPoints: [{ in: path.join(ROOT, 'src/web/audio/offline-entry.ts'), out: 'flute-offline' }],
  outdir: DIST,
  bundle: true,
  format: 'esm',
  target: 'es2020',
  sourcemap: true,
  logLevel: 'info'
};

if (WATCH) {
  const ctx = await context(options);
  await ctx.watch();
  console.log('watching src/web');
} else {
  const t0 = Date.now();
  await build(options);
  await build(offlineOptions);
  if (DO_DOCS) await buildDocs();
  console.log(`build finished in ${Date.now() - t0} ms`);
}
