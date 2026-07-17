/**
 * Blueprint set v1 — enough to close the loop mine → refine → manufacture for
 * munitions, mining/combat modules, and the frigate line. Coverage widens in
 * content v1.1 (doc 06 §4.2).
 */

import { itemTypeId } from '../kernel/ids.js';
import type { BlueprintDef } from './types.js';

const bp = (
  outId: string,
  outQty: number,
  inputs: ReadonlyArray<readonly [string, number]>,
  baseTimeSec: number,
  jobFeeLM: number,
): BlueprintDef => ({
  id: itemTypeId(`bp.${outId}`),
  name: `Blueprint: ${outId}`,
  description: 'Licensed manufacturing schema.',
  volume: 0.1,
  category: 'blueprint',
  output: { typeId: itemTypeId(outId), qty: outQty },
  inputs: inputs.map(([typeId, qty]) => ({ typeId: itemTypeId(typeId), qty })),
  baseTimeSec,
  jobFeeLM,
});

export const BLUEPRINTS: readonly BlueprintDef[] = [
  // Munitions (batch outputs)
  bp('ammo.ferro-slug', 100, [['min.ferrite', 120]], 600, 50),
  bp('ammo.vanidium-slug', 100, [['min.ferrite', 60], ['min.vanidium', 80]], 900, 80),
  bp('ammo.javelin-warhead', 50, [['min.ferrite', 150], ['min.vanidium', 60], ['min.cryon', 30]], 1200, 120),
  bp('ammo.torch-warhead', 50, [['min.ferrite', 120], ['min.emberglass', 45], ['min.cryon', 30]], 1200, 140),

  // Mining & utility modules
  bp('mod.burrower1', 1, [['min.ferrite', 260], ['min.vanidium', 90], ['min.cryon', 40]], 1800, 200),
  bp('mod.seamcutter1', 1, [['min.ferrite', 900], ['min.vanidium', 350], ['min.cryon', 160], ['min.voidglass-shard', 20]], 5400, 700),
  bp('mod.surveyor-lens1', 1, [['min.ferrite', 120], ['min.aurum-filament', 60]], 1500, 180),
  bp('mod.hold-optimizer1', 1, [['min.ferrite', 140], ['min.aurum-filament', 40]], 1500, 160),

  // Combat modules
  bp('mod.slugthrower1-l', 1, [['min.ferrite', 220], ['min.vanidium', 110]], 1800, 200),
  bp('mod.ember-lance1-l', 1, [['min.ferrite', 160], ['min.emberglass', 70], ['min.cryon', 50]], 1800, 220),
  bp('mod.arc-projector1-l', 1, [['min.ferrite', 160], ['min.cryon', 80], ['min.aurum-filament', 35]], 1800, 220),
  bp('mod.javelin-rack1-l', 1, [['min.ferrite', 200], ['min.vanidium', 80], ['min.aurum-filament', 25]], 1800, 210),
  bp('mod.aegis-pulser1', 1, [['min.ferrite', 130], ['min.cryon', 90]], 1600, 190),
  bp('mod.patchweld-mender1', 1, [['min.ferrite', 170], ['min.vanidium', 70]], 1600, 190),
  bp('mod.bulwark-extender1', 1, [['min.ferrite', 150], ['min.cryon', 60]], 1500, 170),
  bp('mod.ferrite-wrap1', 1, [['min.ferrite', 320]], 1400, 150),
  bp('mod.coilburner1', 1, [['min.ferrite', 140], ['min.cryon', 55]], 1600, 190),
  bp('mod.threadlock1', 1, [['min.ferrite', 130], ['min.aurum-filament', 45], ['min.cryon', 40]], 1800, 240),
  bp('mod.flux-battery1', 1, [['min.ferrite', 110], ['min.cryon', 75]], 1400, 160),

  // Frigate hulls
  bp('hull.verge', 1, [['min.ferrite', 14_000], ['min.vanidium', 3200], ['min.cryon', 1600], ['min.aurum-filament', 500]], 14_400, 2500),
  bp('hull.brand', 1, [['min.ferrite', 15_000], ['min.vanidium', 3600], ['min.emberglass', 900], ['min.aurum-filament', 420]], 14_400, 2500),
  bp('hull.harrier', 1, [['min.ferrite', 13_500], ['min.vanidium', 3000], ['min.cryon', 1500], ['min.aurum-filament', 480]], 14_400, 2500),
  bp('hull.plumb', 1, [['min.ferrite', 12_000], ['min.vanidium', 2400], ['min.cryon', 1800], ['min.aurum-filament', 700]], 14_400, 2600),
  bp('hull.mattock', 1, [['min.ferrite', 16_000], ['min.vanidium', 2800], ['min.cryon', 1200]], 14_400, 2400),
];
