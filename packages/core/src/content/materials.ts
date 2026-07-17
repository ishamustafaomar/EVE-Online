/** Ores, minerals, and munitions — STARWEFT original resource chain (doc 01 §5). */

import { itemTypeId } from '../kernel/ids.js';
import type { MineralDef, MunitionDef, OreDef } from './types.js';

const mineral = (id: string, name: string, volume: number, description: string): MineralDef => ({
  id: itemTypeId(`min.${id}`),
  name,
  description,
  volume,
  category: 'mineral',
});

export const MINERALS: readonly MineralDef[] = [
  mineral('ferrite', 'Ferrite', 0.01, 'Structural base metal. The skeleton of every hull in the Reach.'),
  mineral('vanidium', 'Vanidium', 0.01, 'Hard alloying metal for armor lattices and turret bores.'),
  mineral('cryon', 'Cryon', 0.02, 'Cryogenic conductor used in flux systems and shield emitters.'),
  mineral('aurum-filament', 'Aurum Filament', 0.005, 'Precious microwire for sensors and compute lattices.'),
  mineral('nebular-ash', 'Nebular Ash', 0.03, 'Exotic particulate binder for advanced composites.'),
  mineral('voidglass-shard', 'Voidglass Shard', 0.05, 'Metamaterial lens stock for beams, veils, and sounders.'),
  mineral('threadsteel', 'Threadsteel', 0.02, 'Weft-reactive alloy. Only source: Loomsilt from the Deep.'),
  mineral('emberglass', 'Emberglass', 0.04, 'Heat-fused silicate from Covenant space. Thermal weapon cores.'),
];

const ore = (
  id: string,
  name: string,
  volume: number,
  batchSize: number,
  grade: number,
  yields: ReadonlyArray<readonly [string, number]>,
  description: string,
): OreDef => ({
  id: itemTypeId(`ore.${id}`),
  name,
  description,
  volume,
  category: 'ore',
  batchSize,
  grade,
  yields: yields.map(([mineralId, qty]) => ({ mineralId: itemTypeId(`min.${mineralId}`), qty })),
});

export const ORES: readonly OreDef[] = [
  ore('regolite', 'Regolite', 0.1, 100, 1.0, [['ferrite', 300]],
    'Ubiquitous grey rubble. The bread of the Reach: cheap, everywhere, always needed.'),
  ore('vanadase', 'Vanadase', 0.15, 100, 1.4, [['ferrite', 120], ['vanidium', 90]],
    'Banded blue-black rock; the backbone of armor manufacture.'),
  ore('cryolith', 'Cryolith', 0.2, 100, 1.9, [['cryon', 110], ['ferrite', 60]],
    'Pale crystalline ice-rock, mined cold. Handles poorly, sells well.'),
  ore('auriphane', 'Auriphane', 0.12, 100, 2.6, [['aurum-filament', 70], ['vanidium', 40]],
    'Glittering veined ore prized by sensor foundries.'),
  ore('nebulite', 'Nebulite', 0.3, 100, 3.4, [['nebular-ash', 90], ['cryon', 45]],
    'Porous violet stone found where nebulae shade the Open Weft.'),
  ore('voidglass', 'Voidglass', 0.25, 100, 4.5, [['voidglass-shard', 60], ['aurum-filament', 25]],
    'Obsidian-smooth nodules that ring like bells when cut.'),
  ore('loomsilt', 'Loomsilt', 0.4, 100, 7.0, [['threadsteel', 55], ['nebular-ash', 40]],
    'Dust of dead threads, found only in the Deep Weft. Fortunes and funerals.'),
  ore('emberore', 'Emberore', 0.35, 100, 5.2, [['emberglass', 65], ['ferrite', 80]],
    'Slow-burning ore from Covenant anomalies; warm to the hull that carries it.'),
];

const munition = (
  id: string,
  name: string,
  family: MunitionDef['family'],
  damage: MunitionDef['damage'],
  volume: number,
  description: string,
  blastRadiusM?: number,
): MunitionDef => ({
  id: itemTypeId(`ammo.${id}`),
  name,
  description,
  volume,
  category: 'munition',
  family,
  damage,
  ...(blastRadiusM !== undefined ? { blastRadiusM } : {}),
});

export const MUNITIONS: readonly MunitionDef[] = [
  munition('ferro-slug', 'Ferro Slug', 'slug',
    { kinetic: 10, thermal: 0, ion: 0, breach: 2 }, 0.005,
    'Standard ferrite mass-driver round. Cheap, honest, everywhere.'),
  munition('vanidium-slug', 'Vanidium Slug', 'slug',
    { kinetic: 14, thermal: 0, ion: 0, breach: 3 }, 0.005,
    'Hardened penetrator round for mass drivers.'),
  munition('javelin-warhead', 'Javelin Warhead', 'javelin',
    { kinetic: 0, thermal: 0, ion: 0, breach: 55 }, 0.05,
    'Standard breach warhead for javelin racks.', 45),
  munition('torch-warhead', 'Torch Warhead', 'javelin',
    { kinetic: 0, thermal: 40, ion: 0, breach: 20 }, 0.05,
    'Incendiary warhead; burns what it cannot crack.', 55),
];
