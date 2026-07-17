/** @starweft/core — deterministic domain engine for STARWEFT. */

// Kernel
export * from './kernel/rng.js';
export * from './kernel/vec.js';
export * from './kernel/ids.js';

// Content
export * from './content/types.js';
export { ContentRegistry, buildContentV1 } from './content/registry.js';
export { HULLS } from './content/hulls.js';
export { MODULES } from './content/modules.js';
export { MINERALS, MUNITIONS, ORES } from './content/materials.js';
export { BLUEPRINTS } from './content/blueprints.js';
export { DISCIPLINES } from './content/disciplines.js';
export {
  ALL_REFERENCE_FITS,
  REFERENCE_FIT_BRAND,
  REFERENCE_FIT_PLUMB,
  STARTER_FIT_MATTOCK,
  STARTER_FIT_VERGE,
  STARTER_SKILLS,
} from './content/fits.js';

// Universe
export * from './universe/types.js';
export { generateUniverse } from './universe/generate.js';
export { validateUniverse, type UniverseReport } from './universe/validate.js';

// Fitting
export * from './fitting/types.js';
export { computeFit, validateFit, interferenceFalloff } from './fitting/engine.js';

// Combat & movement
export * from './combat/resolve.js';
export * from './sim/movement.js';

// Economy & industry
export * from './economy/ledger.js';
export * from './economy/market.js';
export * from './industry/index.js';
