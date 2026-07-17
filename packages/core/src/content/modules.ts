/**
 * Module catalog v1 (doc 04 §4). All names and stats are STARWEFT canon.
 * Sizes: Light (frigate/destroyer), unmarked (cruiser), Heavy (battleship);
 * "Grand" marks cruiser+ variants of utility modules.
 */

import { disciplineId, itemTypeId } from '../kernel/ids.js';
import type { DamageVector, ModuleDef, StatMod } from './types.js';

const D = {
  gunnery: disciplineId('disc.gunnery'),
  warheads: disciplineId('disc.warheads'),
  engineering: disciplineId('disc.engineering'),
  shields: disciplineId('disc.shields'),
  armaturics: disciplineId('disc.armaturics'),
  navigation: disciplineId('disc.navigation'),
  subterfuge: disciplineId('disc.subterfuge'),
  extraction: disciplineId('disc.extraction'),
  sounding: disciplineId('disc.sounding'),
} as const;

const dmg = (kinetic: number, thermal: number, ion: number, breach: number): DamageVector => ({
  kinetic,
  thermal,
  ion,
  breach,
});

type Level = 1 | 2 | 3 | 4 | 5;
interface ModSeed {
  id: string;
  name: string;
  description: string;
  slot: ModuleDef['slot'];
  meta?: 1 | 2;
  power: number;
  compute: number;
  group: string;
  maxPerFit?: number;
  passive?: StatMod[];
  active?: ModuleDef['active'];
  req?: ReadonlyArray<readonly [keyof typeof D, Level]>;
  volume?: number;
}

function mod(seed: ModSeed): ModuleDef {
  return {
    id: itemTypeId(`mod.${seed.id}`),
    name: seed.name,
    description: seed.description,
    volume: seed.volume ?? 5,
    category: 'module',
    slot: seed.slot,
    meta: seed.meta ?? 1,
    powerMW: seed.power,
    computeTF: seed.compute,
    groupKey: seed.group,
    ...(seed.maxPerFit !== undefined ? { maxPerFit: seed.maxPerFit } : {}),
    ...(seed.passive !== undefined ? { passiveMods: seed.passive } : {}),
    ...(seed.active !== undefined ? { active: seed.active } : {}),
    disciplines: (seed.req ?? []).map(([k, level]) => ({ id: D[k], level })),
  };
}

const turret = (
  s: Omit<ModSeed, 'slot' | 'group' | 'active'> & {
    damage: DamageVector;
    tracking: number;
    optimalM: number;
    attenuationM: number;
    caliberSig: number;
    cycleSec: number;
    flux: number;
    munitionFamily?: 'slug' | 'javelin';
  },
): ModuleDef =>
  mod({
    ...s,
    slot: 'hardpoint',
    group: 'turret',
    active: {
      cycleSec: s.cycleSec,
      fluxPerCycle: s.flux,
      rangeM: s.optimalM + s.attenuationM * 3,
      requiresTarget: true,
      effect: {
        kind: 'turret',
        damage: s.damage,
        tracking: s.tracking,
        optimalM: s.optimalM,
        attenuationM: s.attenuationM,
        caliberSig: s.caliberSig,
        ...(s.munitionFamily !== undefined ? { munitionFamily: s.munitionFamily } : {}),
      },
    },
  });

export const MODULES: readonly ModuleDef[] = [
  // ── Mass drivers (kinetic turrets, consume slugs) ───────────────────────
  turret({
    id: 'slugthrower1-l', name: 'Light Slugthrower I',
    description: 'Frigate-bore kinetic mass driver. The Fringe’s favorite argument.',
    power: 4, compute: 8, damage: dmg(8, 0, 0, 1), tracking: 0.42,
    optimalM: 4500, attenuationM: 3000, caliberSig: 40, cycleSec: 3, flux: 4,
    munitionFamily: 'slug', req: [['gunnery', 1]],
  }),
  turret({
    id: 'slugthrower1-m', name: 'Slugthrower I',
    description: 'Cruiser-bore mass driver.',
    power: 22, compute: 16, damage: dmg(30, 0, 0, 5), tracking: 0.11,
    optimalM: 9000, attenuationM: 7500, caliberSig: 130, cycleSec: 4, flux: 12,
    munitionFamily: 'slug', req: [['gunnery', 2]],
  }),
  turret({
    id: 'slugthrower1-h', name: 'Heavy Slugthrower I',
    description: 'Battleship-bore mass driver. Stations flinch.',
    power: 88, compute: 30, damage: dmg(100, 0, 0, 18), tracking: 0.024,
    optimalM: 18_000, attenuationM: 15_000, caliberSig: 400, cycleSec: 5.5, flux: 35,
    munitionFamily: 'slug', req: [['gunnery', 4]],
  }),
  turret({
    id: 'railspike1-l', name: 'Light Railspike I', meta: 2,
    description: 'Tuned long-bore driver; premium range, premium price.',
    power: 6, compute: 12, damage: dmg(9, 0, 0, 1), tracking: 0.3,
    optimalM: 7000, attenuationM: 3500, caliberSig: 40, cycleSec: 3.2, flux: 6,
    munitionFamily: 'slug', req: [['gunnery', 3]],
  }),

  // ── Beam lances (thermal turrets, flux-hungry, no ammo) ─────────────────
  turret({
    id: 'ember-lance1-l', name: 'Light Ember Lance I',
    description: 'Covenant-pattern thermal lance. Short scripture, long burn.',
    power: 7, compute: 6, damage: dmg(0, 12, 0, 0), tracking: 0.38,
    optimalM: 6500, attenuationM: 2200, caliberSig: 40, cycleSec: 3.5, flux: 9,
    req: [['gunnery', 1]],
  }),
  turret({
    id: 'ember-lance1-m', name: 'Ember Lance I',
    description: 'Cruiser thermal lance.',
    power: 30, compute: 12, damage: dmg(0, 46, 0, 0), tracking: 0.1,
    optimalM: 14_000, attenuationM: 5000, caliberSig: 130, cycleSec: 4.5, flux: 30,
    req: [['gunnery', 2]],
  }),
  turret({
    id: 'ember-lance1-h', name: 'Heavy Ember Lance I',
    description: 'Battleship siege lance; the Sermon’s preferred voice.',
    power: 98, compute: 22, damage: dmg(0, 150, 0, 0), tracking: 0.02,
    optimalM: 28_000, attenuationM: 9000, caliberSig: 400, cycleSec: 6, flux: 95,
    req: [['gunnery', 4]],
  }),
  turret({
    id: 'focus-lance1-l', name: 'Light Focus Lance I', meta: 2,
    description: 'Voidglass optics push the burn point further out.',
    power: 9, compute: 9, damage: dmg(0, 13, 0, 0), tracking: 0.3,
    optimalM: 9000, attenuationM: 2600, caliberSig: 40, cycleSec: 3.6, flux: 11,
    req: [['gunnery', 3]],
  }),

  // ── Ion projectors (ion turrets, charge disruption) ─────────────────────
  turret({
    id: 'arc-projector1-l', name: 'Light Arc Projector I',
    description: 'Accord ion weapon; hurts the ship and starves its systems.',
    power: 6, compute: 10, damage: dmg(0, 0, 11, 0), tracking: 0.36,
    optimalM: 5500, attenuationM: 2500, caliberSig: 40, cycleSec: 3.5, flux: 10,
    req: [['gunnery', 1]],
  }),
  turret({
    id: 'arc-projector1-m', name: 'Arc Projector I',
    description: 'Cruiser ion projector.',
    power: 26, compute: 18, damage: dmg(0, 0, 42, 0), tracking: 0.1,
    optimalM: 12_000, attenuationM: 5500, caliberSig: 130, cycleSec: 4.5, flux: 28,
    req: [['gunnery', 2]],
  }),

  // ── Warhead racks (launchers, consume javelin-family warheads) ──────────
  mod({
    id: 'javelin-rack1-l', name: 'Light Javelin Rack I',
    description: 'Standard warhead rack. Distance is a suggestion.',
    slot: 'hardpoint', power: 3, compute: 12, group: 'launcher',
    active: {
      cycleSec: 5, fluxPerCycle: 2, rangeM: 30_000, requiresTarget: true,
      effect: { kind: 'launcher', munitionFamily: 'javelin', flightSpeed: 2500, maxFlightSec: 12 },
    },
    req: [['warheads', 1]],
  }),
  mod({
    id: 'javelin-rack1-m', name: 'Javelin Rack I',
    description: 'Cruiser warhead battery.',
    slot: 'hardpoint', power: 14, compute: 24, group: 'launcher',
    active: {
      cycleSec: 7, fluxPerCycle: 4, rangeM: 33_000, requiresTarget: true,
      effect: { kind: 'launcher', munitionFamily: 'javelin', flightSpeed: 2200, maxFlightSec: 15 },
    },
    req: [['warheads', 2]],
  }),

  // ── Mining ──────────────────────────────────────────────────────────────
  mod({
    id: 'burrower1', name: 'Burrower I',
    description: 'Entry strip extractor. Chews rock, spits invoices.',
    slot: 'hardpoint', power: 6, compute: 22, group: 'extractor',
    active: {
      cycleSec: 60, fluxPerCycle: 40, rangeM: 12_000, requiresTarget: true,
      effect: { kind: 'extractor', yieldM3: 120 },
    },
    req: [['extraction', 1]],
  }),
  mod({
    id: 'seamcutter1', name: 'Seamcutter I',
    description: 'Barge-grade strip extractor.',
    slot: 'hardpoint', power: 14, compute: 60, group: 'extractor',
    active: {
      cycleSec: 90, fluxPerCycle: 90, rangeM: 18_000, requiresTarget: true,
      effect: { kind: 'extractor', yieldM3: 450 },
    },
    req: [['extraction', 3]],
  }),
  mod({
    id: 'seamcutter2', name: 'Seamcutter II', meta: 2,
    description: 'Refit seamcutter with voidglass cutting heads.',
    slot: 'hardpoint', power: 16, compute: 70, group: 'extractor',
    active: {
      cycleSec: 90, fluxPerCycle: 110, rangeM: 19_000, requiresTarget: true,
      effect: { kind: 'extractor', yieldM3: 560 },
    },
    req: [['extraction', 5]],
  }),
  mod({
    id: 'surveyor-lens1', name: 'Surveyor Lens I',
    description: 'Ore-body imaging optics; every cut lands where it pays.',
    slot: 'core', power: 2, compute: 16, group: 'mining-upgrade', maxPerFit: 2,
    passive: [{ stat: 'miningYield', op: 'mul', value: 1.15 }],
    req: [['extraction', 2]],
  }),

  // ── Sounding ────────────────────────────────────────────────────────────
  mod({
    id: 'sounder-array1', name: 'Sounder Array I',
    description: 'Launches lattice sounder probes. The Deep answers those who ask properly.',
    slot: 'hardpoint', power: 3, compute: 25, group: 'sounder', maxPerFit: 1,
    active: {
      cycleSec: 10, fluxPerCycle: 15, requiresTarget: false,
      effect: { kind: 'sound', strength: 40 },
    },
    req: [['sounding', 1]],
  }),

  // ── Shield systems ──────────────────────────────────────────────────────
  mod({
    id: 'aegis-pulser1', name: 'Aegis Pulser I',
    description: 'Active shield regenerator.',
    slot: 'auxiliary', power: 6, compute: 18, group: 'shield-boost',
    active: {
      cycleSec: 4, fluxPerCycle: 20, requiresTarget: false,
      effect: { kind: 'shieldBoost', hp: 45 },
    },
    req: [['shields', 1]],
  }),
  mod({
    id: 'aegis-pulser1-g', name: 'Grand Aegis Pulser I',
    description: 'Cruiser-grade shield regenerator.',
    slot: 'auxiliary', power: 24, compute: 45, group: 'shield-boost',
    active: {
      cycleSec: 4.5, fluxPerCycle: 60, requiresTarget: false,
      effect: { kind: 'shieldBoost', hp: 160 },
    },
    req: [['shields', 3]],
  }),
  mod({
    id: 'bulwark-extender1', name: 'Bulwark Extender I',
    description: 'Passive shield capacity extension.',
    slot: 'auxiliary', power: 5, compute: 12, group: 'shield-extend',
    passive: [{ stat: 'shieldHp', op: 'add', value: 250 }],
    req: [['shields', 1]],
  }),
  mod({
    id: 'bulwark-extender1-g', name: 'Grand Bulwark Extender I',
    description: 'Cruiser-grade shield extension.',
    slot: 'auxiliary', power: 20, compute: 28, group: 'shield-extend',
    passive: [{ stat: 'shieldHp', op: 'add', value: 900 }],
    req: [['shields', 3]],
  }),
  mod({
    id: 'ion-ward-screen1', name: 'Ion Ward Screen I',
    description: 'Hardens shields against charge disruption.',
    slot: 'auxiliary', power: 3, compute: 14, group: 'shield-harden',
    passive: [{ stat: 'shieldResist.ion', op: 'resist', value: 0.3 }],
    req: [['shields', 2]],
  }),

  // ── Armor systems ───────────────────────────────────────────────────────
  mod({
    id: 'patchweld-mender1', name: 'Patchweld Mender I',
    description: 'Active armor repair. Covenant welders swear by it; everyone else just swears.',
    slot: 'core', power: 6, compute: 8, group: 'armor-mend',
    active: {
      cycleSec: 5, fluxPerCycle: 25, requiresTarget: false,
      effect: { kind: 'armorMend', hp: 60 },
    },
    req: [['armaturics', 1]],
  }),
  mod({
    id: 'patchweld-mender1-g', name: 'Grand Patchweld Mender I',
    description: 'Cruiser-grade armor mender.',
    slot: 'core', power: 24, compute: 20, group: 'armor-mend',
    active: {
      cycleSec: 6, fluxPerCycle: 70, requiresTarget: false,
      effect: { kind: 'armorMend', hp: 220 },
    },
    req: [['armaturics', 3]],
  }),
  mod({
    id: 'ferrite-wrap1', name: 'Plating: Ferrite Wrap I',
    description: 'Bolt-on armor mass.',
    slot: 'core', power: 8, compute: 2, group: 'armor-plate',
    passive: [{ stat: 'armorHp', op: 'add', value: 300 }],
    req: [['armaturics', 1]],
  }),
  mod({
    id: 'ferrite-wrap1-g', name: 'Plating: Grand Ferrite Wrap I',
    description: 'Cruiser-grade armor plating.',
    slot: 'core', power: 30, compute: 6, group: 'armor-plate',
    passive: [{ stat: 'armorHp', op: 'add', value: 1100 }],
    req: [['armaturics', 3]],
  }),
  mod({
    id: 'breach-ward-plating1', name: 'Breach Ward Plating I',
    description: 'Spall liners against warhead damage.',
    slot: 'core', power: 4, compute: 4, group: 'armor-harden',
    passive: [{ stat: 'armorResist.breach', op: 'resist', value: 0.3 }],
    req: [['armaturics', 2]],
  }),

  // ── Propulsion ──────────────────────────────────────────────────────────
  mod({
    id: 'coilburner1', name: 'Coilburner I',
    description: 'Afterburner coil stack. Quiet, steady, unprofiled.',
    slot: 'auxiliary', power: 4, compute: 2, group: 'propulsion', maxPerFit: 1,
    active: {
      cycleSec: 6, fluxPerCycle: 12, requiresTarget: false,
      effect: { kind: 'propulsion', velocityMul: 1.9, sigMul: 1.0 },
    },
    req: [['navigation', 1]],
  }),
  mod({
    id: 'coilburner1-g', name: 'Grand Coilburner I',
    description: 'Cruiser-grade afterburner.',
    slot: 'auxiliary', power: 18, compute: 5, group: 'propulsion', maxPerFit: 1,
    active: {
      cycleSec: 6, fluxPerCycle: 30, requiresTarget: false,
      effect: { kind: 'propulsion', velocityMul: 1.75, sigMul: 1.0 },
    },
    req: [['navigation', 2]],
  }),
  mod({
    id: 'afterplume1', name: 'Afterplume I',
    description: 'Plasma overdrive. Very fast, very visible.',
    slot: 'auxiliary', power: 8, compute: 10, group: 'propulsion', maxPerFit: 1,
    active: {
      cycleSec: 8, fluxPerCycle: 45, requiresTarget: false,
      effect: { kind: 'propulsion', velocityMul: 4.2, sigMul: 4.5 },
    },
    req: [['navigation', 2]],
  }),
  mod({
    id: 'afterplume1-g', name: 'Grand Afterplume I',
    description: 'Cruiser-grade plasma overdrive.',
    slot: 'auxiliary', power: 35, compute: 22, group: 'propulsion', maxPerFit: 1,
    active: {
      cycleSec: 8, fluxPerCycle: 110, requiresTarget: false,
      effect: { kind: 'propulsion', velocityMul: 3.8, sigMul: 4.5 },
    },
    req: [['navigation', 3]],
  }),

  // ── Electronic warfare ──────────────────────────────────────────────────
  mod({
    id: 'threadlock1', name: 'Threadlock I',
    description: 'Arc-drive inhibitor field. The word "no", weaponized.',
    slot: 'auxiliary', power: 4, compute: 20, group: 'snare',
    active: {
      cycleSec: 4, fluxPerCycle: 6, rangeM: 16_000, requiresTarget: true,
      effect: { kind: 'snare' },
    },
    req: [['subterfuge', 1]],
  }),
  mod({
    id: 'drag-anchor1', name: 'Drag Anchor I',
    description: 'Stasis web projector; turns speed into paperwork.',
    slot: 'auxiliary', power: 5, compute: 18, group: 'stasis',
    active: {
      cycleSec: 4, fluxPerCycle: 8, rangeM: 10_000, requiresTarget: true,
      effect: { kind: 'stasis', velocityMul: 0.5 },
    },
    req: [['subterfuge', 1]],
  }),
  mod({
    id: 'static-ghost1', name: 'Static Ghost I',
    description: 'Sensor jammer. Somewhere in the noise, a ship stops existing.',
    slot: 'auxiliary', power: 4, compute: 38, group: 'jam',
    active: {
      cycleSec: 12, fluxPerCycle: 30, rangeM: 45_000, requiresTarget: true,
      effect: { kind: 'jam', strength: 6 },
    },
    req: [['subterfuge', 2]],
  }),
  mod({
    id: 'beacon-lace1', name: 'Beacon Lace I',
    description: 'Target painter; stitches a bright thread to the hull.',
    slot: 'auxiliary', power: 3, compute: 22, group: 'paint',
    active: {
      cycleSec: 4, fluxPerCycle: 6, rangeM: 35_000, requiresTarget: true,
      effect: { kind: 'paint', sigMul: 1.35 },
    },
    req: [['subterfuge', 1]],
  }),
  mod({
    id: 'duskveil1', name: 'Duskveil I',
    description: 'Photonic dispersion veil. Not invisibility — permission to be forgotten.',
    slot: 'auxiliary', power: 6, compute: 45, group: 'veil', maxPerFit: 1,
    active: {
      cycleSec: 5, fluxPerCycle: 10, requiresTarget: false,
      effect: { kind: 'veil' },
    },
    req: [['subterfuge', 3]],
  }),

  // ── Flux systems ────────────────────────────────────────────────────────
  mod({
    id: 'flux-relay1', name: 'Flux Relay I',
    description: 'Recharge circuit tuning.',
    slot: 'core', power: 3, compute: 10, group: 'flux-relay',
    passive: [{ stat: 'fluxRechargeSec', op: 'mul', value: 0.85 }],
    req: [['engineering', 1]],
  }),
  mod({
    id: 'flux-battery1', name: 'Flux Battery I',
    description: 'Auxiliary flux reservoir.',
    slot: 'core', power: 5, compute: 4, group: 'flux-battery',
    passive: [{ stat: 'fluxCapacity', op: 'add', value: 250 }],
    req: [['engineering', 1]],
  }),
  mod({
    id: 'flux-battery1-g', name: 'Grand Flux Battery I',
    description: 'Cruiser-grade flux reservoir.',
    slot: 'core', power: 16, compute: 10, group: 'flux-battery',
    passive: [{ stat: 'fluxCapacity', op: 'add', value: 900 }],
    req: [['engineering', 2]],
  }),

  // ── Cargo & utility ─────────────────────────────────────────────────────
  mod({
    id: 'hold-optimizer1', name: 'Hold Optimizer I',
    description: 'Smart racking; the hold learns to breathe in.',
    slot: 'core', power: 2, compute: 12, group: 'cargo',
    passive: [{ stat: 'cargo', op: 'mul', value: 1.2 }],
  }),

  // ── Weaves (permanent hull mods) ────────────────────────────────────────
  mod({
    id: 'weave-kinetic-lattice', name: 'Kinetic Lattice Weave',
    description: 'Threadsteel lattice woven into armor voids. Permanent.',
    slot: 'weave', power: 0, compute: 0, group: 'weave-resist',
    passive: [{ stat: 'armorResist.kinetic', op: 'resist', value: 0.2 }],
    req: [['engineering', 2]],
  }),
  mod({
    id: 'weave-range', name: 'Range Weave',
    description: 'Barrel harmonics rewoven for reach. Permanent.',
    slot: 'weave', power: 0, compute: 0, group: 'weave-turret',
    passive: [{ stat: 'turretOptimal', op: 'mul', value: 1.15 }],
    req: [['engineering', 2]],
  }),
  mod({
    id: 'weave-extraction', name: 'Extraction Weave',
    description: 'Extractor feeds rethreaded for throughput. Permanent.',
    slot: 'weave', power: 0, compute: 0, group: 'weave-mining',
    passive: [{ stat: 'miningYield', op: 'mul', value: 1.1 }],
    req: [['engineering', 2]],
  }),
  mod({
    id: 'weave-bulk', name: 'Bulk Weave',
    description: 'Structural members rewoven around a larger hold. Permanent.',
    slot: 'weave', power: 0, compute: 0, group: 'weave-cargo',
    passive: [{ stat: 'cargo', op: 'mul', value: 1.25 }],
    req: [['engineering', 2]],
  }),
  mod({
    id: 'weave-slipstream', name: 'Slipstream Weave',
    description: 'Drive plume rewoven laminar. Permanent.',
    slot: 'weave', power: 0, compute: 0, group: 'weave-nav',
    passive: [{ stat: 'maxVelocity', op: 'mul', value: 1.08 }],
    req: [['engineering', 2]],
  }),
];
