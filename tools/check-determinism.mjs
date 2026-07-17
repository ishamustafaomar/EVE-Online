#!/usr/bin/env node
/**
 * Determinism gate (doc 14 §2.2): rule code in @starweft/core must not use
 * wall-clock time or ambient randomness. All randomness flows through
 * injected Rng streams; all time through explicit tick parameters.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const TARGET = join(ROOT, 'packages/core/src');
const BANNED = [/\bMath\.random\b/, /\bDate\.now\b/, /\bnew Date\(/, /\bperformance\.now\b/];

const violations = [];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (name.endsWith('.ts')) {
      const source = readFileSync(path, 'utf8');
      source.split('\n').forEach((line, i) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('*') || trimmed.startsWith('//') || trimmed.startsWith('/*')) return;
        if (BANNED.some((pattern) => pattern.test(line))) {
          violations.push(`${path}:${i + 1}: ${trimmed}`);
        }
      });
    }
  }
}

walk(TARGET);

if (violations.length > 0) {
  console.error('determinism violations in @starweft/core rule code:');
  for (const v of violations) console.error(`  ${v}`);
  process.exit(1);
}
console.log('determinism gate passed: no ambient time/randomness in core rule code');
