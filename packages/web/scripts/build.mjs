#!/usr/bin/env node
/**
 * Bundles the solo sandbox for the browser and writes the output straight
 * into the repo's public/play/ — the same static directory Vercel deploys.
 * Run after `tsc -b` (typechecks); esbuild here only transpiles/bundles.
 */

import { build } from 'esbuild';
import { copyFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(here, '..');
const outDir = join(pkgRoot, '..', '..', 'public', 'play');

mkdirSync(outDir, { recursive: true });

await build({
  entryPoints: [join(pkgRoot, 'src', 'main.ts')],
  bundle: true,
  minify: true,
  sourcemap: true,
  format: 'esm',
  target: ['es2022'],
  platform: 'browser',
  outfile: join(outDir, 'app.js'),
  logLevel: 'info',
});

copyFileSync(join(pkgRoot, 'src', 'style.css'), join(outDir, 'style.css'));

console.log(`Bundled to ${outDir}`);
