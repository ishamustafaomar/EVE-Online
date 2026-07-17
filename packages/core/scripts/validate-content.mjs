/**
 * Content validation gate (doc 14 §1.2): `pnpm validate:content`.
 * Runs against the built package; exits non-zero on any content or universe issue.
 */

import { buildContentV1, generateUniverse, validateUniverse, TEST_REACH_PRESET } from '../dist/index.js';

const registry = buildContentV1();
const contentIssues = registry.validate();

const pack = generateUniverse(TEST_REACH_PRESET);
const universeReport = validateUniverse(pack);

const issues = [...contentIssues, ...universeReport.issues];

console.log(`content pack: ${registry.version}`);
console.log(`  items: ${registry.allItems().length} (hulls ${registry.allHulls().length}, modules ${registry.allModules().length}, ores ${registry.allOres().length}, blueprints ${registry.allBlueprints().length})`);
console.log(`universe (${TEST_REACH_PRESET.seed}): ${universeReport.stats.systems} systems, ${universeReport.stats.weftlines} weftlines`);
console.log(`  bands: ${JSON.stringify(universeReport.stats.bandCounts)}`);

if (issues.length > 0) {
  console.error(`\n${issues.length} issue(s):`);
  for (const issue of issues) console.error(`  - ${issue}`);
  process.exit(1);
}
console.log('\nall validation gates passed');
