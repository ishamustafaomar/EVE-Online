/** Refining and manufacturing math (doc 06 §4). Pure; server services apply it. */

import type { ContentRegistry } from '../content/registry.js';
import type { ItemTypeId } from '../kernel/ids.js';

export interface RefineResult {
  readonly batches: number;
  readonly consumedUnits: number;
  readonly outputs: ReadonlyArray<{ readonly typeId: ItemTypeId; readonly qty: number }>;
  readonly effectiveYield: number;
}

/**
 * Refining: whole batches only; yield = stationYield × (1 + 0.02 × mastery),
 * capped at 100%. Waste is deleted (material sink).
 */
export function refine(
  registry: ContentRegistry,
  oreId: ItemTypeId,
  units: number,
  stationYield: number,
  refiningMastery: number,
): RefineResult {
  const ore = registry.ore(oreId);
  const batches = Math.floor(units / ore.batchSize);
  const effectiveYield = Math.min(1, stationYield * (1 + 0.02 * refiningMastery));
  if (batches <= 0) {
    return { batches: 0, consumedUnits: 0, outputs: [], effectiveYield };
  }
  const outputs = ore.yields
    .map((y) => ({ typeId: y.mineralId, qty: Math.floor(y.qty * batches * effectiveYield) }))
    .filter((o) => o.qty > 0);
  return { batches, consumedUnits: batches * ore.batchSize, outputs, effectiveYield };
}

export interface ManufactureQuote {
  readonly blueprintId: ItemTypeId;
  readonly inputs: ReadonlyArray<{ readonly typeId: ItemTypeId; readonly qty: number }>;
  readonly output: { readonly typeId: ItemTypeId; readonly qty: number };
  readonly timeSec: number;
  readonly jobFeeLM: number;
}

/**
 * Manufacturing quote: inputs scaled by material efficiency (−1%/level),
 * time by time efficiency (−2%/level); ME/TE range 0–10 (doc 06 §4.2).
 */
export function quoteManufactureJob(
  registry: ContentRegistry,
  blueprintId: ItemTypeId,
  materialEfficiency: number,
  timeEfficiency: number,
  runs: number,
): ManufactureQuote {
  if (!Number.isInteger(runs) || runs <= 0) throw new Error('runs must be a positive integer');
  const me = clampLevel(materialEfficiency);
  const te = clampLevel(timeEfficiency);
  const bp = registry.blueprint(blueprintId);
  const inputs = bp.inputs.map((input) => ({
    typeId: input.typeId,
    qty: Math.max(1, Math.ceil(input.qty * runs * (1 - 0.01 * me))),
  }));
  return {
    blueprintId,
    inputs,
    output: { typeId: bp.output.typeId, qty: bp.output.qty * runs },
    timeSec: bp.baseTimeSec * runs * (1 - 0.02 * te),
    jobFeeLM: bp.jobFeeLM * runs,
  };
}

function clampLevel(level: number): number {
  if (!Number.isInteger(level) || level < 0) return 0;
  return Math.min(10, level);
}
