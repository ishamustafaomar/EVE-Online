/**
 * Ship roster v1 — 19 original hulls (doc 04 §2).
 * All names, stats, and flavor are STARWEFT canon.
 */

import { disciplineId, itemTypeId } from '../kernel/ids.js';
import type { HullBonus, HullDef, ResistProfile } from './types.js';

const r = (kinetic: number, thermal: number, ion: number, breach: number): ResistProfile => ({
  kinetic,
  thermal,
  ion,
  breach,
});

const SPACEFRAMES = disciplineId('disc.spaceframes');

const bonus = (stat: HullBonus['stat'], mulPerLevel: number, note: string): HullBonus => ({
  disciplineId: SPACEFRAMES,
  stat,
  mulPerLevel,
  note,
});

interface HullSeed {
  id: string;
  name: string;
  faction: HullDef['faction'];
  shipClass: HullDef['shipClass'];
  role: string;
  description: string;
  volume: number;
  mass: number;
  cargo: number;
  oreHold?: number;
  power: number;
  compute: number;
  flux: [capacity: number, rechargeSec: number];
  shield: [hp: number, rechargeSec: number, resists: ResistProfile];
  armor: [hp: number, resists: ResistProfile];
  structure: [hp: number, resists: ResistProfile];
  maxVelocity: number;
  agility: number;
  lockRange: number;
  sensorStrength: number;
  maxLockedTargets: number;
  signature: number;
  slots: [h: number, a: number, c: number, w: number];
  bonuses: HullBonus[];
  spaceframesLevel: 1 | 2 | 3 | 4 | 5;
}

const STRUCT_R = r(0.33, 0.33, 0.33, 0.33);
// Baseline defense flavors (original scheme, doc 04): shields shrug off breach,
// leak ion; armor resists ion, leaks breach.
const SHIELD_R = r(0.25, 0.3, 0.05, 0.45);
const ARMOR_R = r(0.35, 0.2, 0.45, 0.15);
const shieldR = (dk = 0, dt = 0, di = 0, db = 0): ResistProfile =>
  r(SHIELD_R.kinetic + dk, SHIELD_R.thermal + dt, SHIELD_R.ion + di, SHIELD_R.breach + db);
const armorR = (dk = 0, dt = 0, di = 0, db = 0): ResistProfile =>
  r(ARMOR_R.kinetic + dk, ARMOR_R.thermal + dt, ARMOR_R.ion + di, ARMOR_R.breach + db);

function hull(seed: HullSeed): HullDef {
  return {
    id: itemTypeId(`hull.${seed.id}`),
    name: seed.name,
    description: seed.description,
    volume: seed.volume,
    category: 'hull',
    shipClass: seed.shipClass,
    faction: seed.faction,
    role: seed.role,
    mass: seed.mass,
    cargo: seed.cargo,
    ...(seed.oreHold !== undefined ? { oreHold: seed.oreHold } : {}),
    power: seed.power,
    compute: seed.compute,
    flux: { capacity: seed.flux[0], rechargeSec: seed.flux[1] },
    shield: { hp: seed.shield[0], rechargeSec: seed.shield[1], resists: seed.shield[2] },
    armor: { hp: seed.armor[0], resists: seed.armor[1] },
    structure: { hp: seed.structure[0], resists: seed.structure[1] },
    maxVelocity: seed.maxVelocity,
    agility: seed.agility,
    lockRange: seed.lockRange,
    sensorStrength: seed.sensorStrength,
    maxLockedTargets: seed.maxLockedTargets,
    signature: seed.signature,
    slots: {
      hardpoint: seed.slots[0],
      auxiliary: seed.slots[1],
      core: seed.slots[2],
      weave: seed.slots[3],
    },
    bonuses: seed.bonuses,
    disciplines: [{ id: SPACEFRAMES, level: seed.spaceframesLevel }],
  };
}

export const HULLS: readonly HullDef[] = [
  // ── Frigates ────────────────────────────────────────────────────────────
  hull({
    id: 'verge', name: 'Verge', faction: 'accord', shipClass: 'frigate',
    role: 'Ion skirmish frigate',
    description: 'Accord doctrine in miniature: clean lines, cold math, charged air.',
    volume: 2500, mass: 1080, cargo: 140, power: 46, compute: 140,
    flux: [340, 90], shield: [400, 95, shieldR(0, 0.1)], armor: [340, armorR()],
    structure: [320, STRUCT_R], maxVelocity: 330, agility: 3.1,
    lockRange: 26_000, sensorStrength: 12, maxLockedTargets: 4, signature: 36,
    slots: [3, 3, 2, 2],
    bonuses: [
      bonus('turretDamage', 0.05, '+5% turret damage per Spaceframes level'),
      bonus('shieldHp', 0.04, '+4% shield capacity per Spaceframes level'),
    ],
    spaceframesLevel: 1,
  }),
  hull({
    id: 'brand', name: 'Brand', faction: 'covenant', shipClass: 'frigate',
    role: 'Thermal brawler frigate',
    description: 'A reliquary with engines. Gets close, stays close, burns.',
    volume: 2500, mass: 1190, cargo: 130, power: 52, compute: 125,
    flux: [330, 92], shield: [270, 100, shieldR()], armor: [540, armorR(0, 0.1)],
    structure: [340, STRUCT_R], maxVelocity: 305, agility: 3.4,
    lockRange: 22_000, sensorStrength: 11, maxLockedTargets: 4, signature: 38,
    slots: [3, 2, 3, 2],
    bonuses: [
      bonus('turretDamage', 0.05, '+5% turret damage per Spaceframes level'),
      bonus('armorHp', 0.04, '+4% armor per Spaceframes level'),
    ],
    spaceframesLevel: 1,
  }),
  hull({
    id: 'harrier', name: 'Harrier', faction: 'freeholds', shipClass: 'frigate',
    role: 'Kinetic hit-and-run frigate',
    description: 'Freehold patchwork perfected: fast in, loud, gone.',
    volume: 2500, mass: 1020, cargo: 145, power: 36, compute: 130,
    flux: [310, 88], shield: [380, 90, shieldR(0.1)], armor: [330, armorR()],
    structure: [300, STRUCT_R], maxVelocity: 355, agility: 2.9,
    lockRange: 24_000, sensorStrength: 12, maxLockedTargets: 4, signature: 35,
    slots: [3, 3, 2, 2],
    bonuses: [
      bonus('turretDamage', 0.03, '+3% turret damage per Spaceframes level'),
      bonus('maxVelocity', 0.03, '+3% max velocity per Spaceframes level'),
    ],
    spaceframesLevel: 1,
  }),
  hull({
    id: 'plumb', name: 'Plumb', faction: 'accord', shipClass: 'frigate',
    role: 'Fast scout / tackle frigate',
    description: 'Drops true. Accord survey corps fly it; pirates fear its snare.',
    volume: 2500, mass: 940, cargo: 160, power: 38, compute: 138,
    flux: [300, 85], shield: [310, 88, shieldR()], armor: [270, armorR()],
    structure: [270, STRUCT_R], maxVelocity: 390, agility: 2.6,
    lockRange: 30_000, sensorStrength: 13, maxLockedTargets: 5, signature: 33,
    slots: [2, 4, 2, 2],
    bonuses: [
      bonus('maxVelocity', 0.05, '+5% max velocity per Spaceframes level'),
      bonus('lockRange', 0.04, '+4% lock range per Spaceframes level'),
    ],
    spaceframesLevel: 1,
  }),
  hull({
    id: 'zephyr', name: 'Zephyr', faction: 'freeholds', shipClass: 'frigate',
    role: 'Interceptor-line scout frigate',
    description: 'Named for the wind because nothing else in the Fringe catches it.',
    volume: 2500, mass: 900, cargo: 150, power: 31, compute: 132,
    flux: [290, 84], shield: [300, 86, shieldR(0.1)], armor: [260, armorR()],
    structure: [260, STRUCT_R], maxVelocity: 415, agility: 2.4,
    lockRange: 27_000, sensorStrength: 12, maxLockedTargets: 5, signature: 31,
    slots: [2, 4, 2, 2],
    bonuses: [
      bonus('maxVelocity', 0.05, '+5% max velocity per Spaceframes level'),
      bonus('agility', -0.05, '-5% inertia per Spaceframes level'),
    ],
    spaceframesLevel: 1,
  }),
  hull({
    id: 'mattock', name: 'Mattock', faction: 'combine', shipClass: 'frigate',
    role: 'Entry mining frigate',
    description: 'The Combine’s first handshake: a hold, two extractors, a future.',
    volume: 2500, mass: 1240, cargo: 160, oreHold: 3800, power: 34, compute: 128,
    flux: [330, 90], shield: [340, 96, shieldR()], armor: [330, armorR(0.1)],
    structure: [340, STRUCT_R], maxVelocity: 290, agility: 3.6,
    lockRange: 20_000, sensorStrength: 11, maxLockedTargets: 4, signature: 40,
    slots: [2, 2, 2, 2],
    bonuses: [bonus('miningYield', 0.05, '+5% extractor yield per Spaceframes level')],
    spaceframesLevel: 1,
  }),
  hull({
    id: 'astrolabe', name: 'Astrolabe', faction: 'accord', shipClass: 'frigate',
    role: 'Exploration frigate',
    description: 'Half instrument, half ship. The Deep gives up its secrets politely.',
    volume: 2500, mass: 1050, cargo: 260, power: 33, compute: 150,
    flux: [320, 86], shield: [320, 92, shieldR()], armor: [290, armorR()],
    structure: [280, STRUCT_R], maxVelocity: 340, agility: 3.0,
    lockRange: 32_000, sensorStrength: 15, maxLockedTargets: 5, signature: 34,
    slots: [2, 4, 3, 2],
    bonuses: [
      bonus('sensorStrength', 0.05, '+5% sensor strength per Spaceframes level'),
      bonus('maxVelocity', 0.02, '+2% max velocity per Spaceframes level'),
    ],
    spaceframesLevel: 1,
  }),

  // ── Destroyers ──────────────────────────────────────────────────────────
  hull({
    id: 'palisade', name: 'Palisade', faction: 'accord', shipClass: 'destroyer',
    role: 'Anti-frigate gunline destroyer',
    description: 'A wall the Accord parks where it pleases. Frigates learn respect.',
    volume: 5000, mass: 2280, cargo: 240, power: 62, compute: 175,
    flux: [500, 110], shield: [720, 115, shieldR(0, 0.1)], armor: [660, armorR()],
    structure: [620, STRUCT_R], maxVelocity: 255, agility: 4.2,
    lockRange: 38_000, sensorStrength: 13, maxLockedTargets: 6, signature: 70,
    slots: [5, 3, 2, 2],
    bonuses: [
      bonus('turretTracking', 0.05, '+5% turret tracking per Spaceframes level'),
      bonus('turretOptimal', 0.05, '+5% turret optimal per Spaceframes level'),
    ],
    spaceframesLevel: 2,
  }),
  hull({
    id: 'pyre', name: 'Pyre', faction: 'covenant', shipClass: 'destroyer',
    role: 'Salvo alpha destroyer',
    description: 'The Covenant’s answer to most questions: a brief, total brightness.',
    volume: 5000, mass: 2410, cargo: 220, power: 66, compute: 168,
    flux: [480, 112], shield: [620, 118, shieldR()], armor: [780, armorR(0, 0.1)],
    structure: [660, STRUCT_R], maxVelocity: 240, agility: 4.5,
    lockRange: 36_000, sensorStrength: 12, maxLockedTargets: 6, signature: 74,
    slots: [5, 2, 3, 2],
    bonuses: [bonus('launcherDamage', 0.05, '+5% warhead damage per Spaceframes level')],
    spaceframesLevel: 2,
  }),

  // ── Cruisers ────────────────────────────────────────────────────────────
  hull({
    id: 'meridian', name: 'Meridian', faction: 'accord', shipClass: 'cruiser',
    role: 'Shield-line ion cruiser',
    description: 'The line by which the Accord measures everything else.',
    volume: 12_500, mass: 11_600, cargo: 460, power: 165, compute: 340,
    flux: [1350, 160], shield: [3100, 210, shieldR(0, 0.1)], armor: [2300, armorR()],
    structure: [2100, STRUCT_R], maxVelocity: 215, agility: 6.8,
    lockRange: 58_000, sensorStrength: 17, maxLockedTargets: 7, signature: 126,
    slots: [5, 4, 3, 3],
    bonuses: [
      bonus('turretDamage', 0.05, '+5% turret damage per Spaceframes level'),
      bonus('shieldHp', 0.05, '+5% shield capacity per Spaceframes level'),
    ],
    spaceframesLevel: 3,
  }),
  hull({
    id: 'assay', name: 'Assay', faction: 'combine', shipClass: 'cruiser',
    role: 'Armored line cruiser',
    description: 'Built like a refinery gantry; argues like one too.',
    volume: 12_500, mass: 12_400, cargo: 480, power: 172, compute: 320,
    flux: [1300, 165], shield: [2400, 220, shieldR()], armor: [3050, armorR(0.1)],
    structure: [2250, STRUCT_R], maxVelocity: 205, agility: 7.2,
    lockRange: 54_000, sensorStrength: 16, maxLockedTargets: 7, signature: 132,
    slots: [4, 3, 5, 3],
    bonuses: [
      bonus('turretDamage', 0.04, '+4% turret damage per Spaceframes level'),
      bonus('armorHp', 0.05, '+5% armor per Spaceframes level'),
    ],
    spaceframesLevel: 3,
  }),
  hull({
    id: 'litany', name: 'Litany', faction: 'covenant', shipClass: 'cruiser',
    role: 'Thermal assault cruiser',
    description: 'Recites its purpose in beam-light, verse after verse.',
    volume: 12_500, mass: 12_100, cargo: 450, power: 175, compute: 325,
    flux: [1400, 158], shield: [2300, 225, shieldR()], armor: [2850, armorR(0, 0.1)],
    structure: [2200, STRUCT_R], maxVelocity: 210, agility: 7.0,
    lockRange: 55_000, sensorStrength: 16, maxLockedTargets: 7, signature: 130,
    slots: [5, 3, 4, 3],
    bonuses: [
      bonus('turretDamage', 0.05, '+5% turret damage per Spaceframes level'),
      bonus('fluxCapacity', 0.04, '+4% flux capacity per Spaceframes level'),
    ],
    spaceframesLevel: 3,
  }),
  hull({
    id: 'gale', name: 'Gale', faction: 'freeholds', shipClass: 'cruiser',
    role: 'Kinetic skirmish cruiser',
    description: 'A storm-front with a market value. Freehold moots swear by it.',
    volume: 12_500, mass: 10_900, cargo: 440, power: 158, compute: 330,
    flux: [1250, 162], shield: [2750, 205, shieldR(0.1)], armor: [2250, armorR()],
    structure: [2000, STRUCT_R], maxVelocity: 245, agility: 6.2,
    lockRange: 56_000, sensorStrength: 17, maxLockedTargets: 7, signature: 118,
    slots: [5, 4, 3, 3],
    bonuses: [
      bonus('turretDamage', 0.03, '+3% turret damage per Spaceframes level'),
      bonus('maxVelocity', 0.02, '+2% max velocity per Spaceframes level'),
    ],
    spaceframesLevel: 3,
  }),
  hull({
    id: 'alms', name: 'Alms', faction: 'covenant', shipClass: 'cruiser',
    role: 'Logistics cruiser (remote armor)',
    description: 'Charity, the Covenant says, is armor delivered at range.',
    volume: 12_500, mass: 11_300, cargo: 420, power: 168, compute: 345,
    flux: [1500, 150], shield: [2350, 215, shieldR()], armor: [2700, armorR(0, 0.1)],
    structure: [2100, STRUCT_R], maxVelocity: 208, agility: 6.9,
    lockRange: 62_000, sensorStrength: 18, maxLockedTargets: 8, signature: 124,
    slots: [4, 4, 4, 3],
    bonuses: [
      bonus('fluxCapacity', 0.05, '+5% flux capacity per Spaceframes level'),
      bonus('lockRange', 0.04, '+4% lock range per Spaceframes level'),
    ],
    spaceframesLevel: 3,
  }),

  // ── Industrials ─────────────────────────────────────────────────────────
  hull({
    id: 'seam', name: 'Seam', faction: 'combine', shipClass: 'barge',
    role: 'Mining barge',
    description: 'Where the Seam goes, belts become invoices.',
    volume: 20_000, mass: 16_500, cargo: 350, oreHold: 16_000, power: 48, compute: 230,
    flux: [420, 140], shield: [1500, 240, shieldR()], armor: [1400, armorR(0.1)],
    structure: [2600, STRUCT_R], maxVelocity: 105, agility: 9.5,
    lockRange: 24_000, sensorStrength: 13, maxLockedTargets: 5, signature: 210,
    slots: [2, 3, 2, 3],
    bonuses: [
      bonus('miningYield', 0.08, '+8% extractor yield per Spaceframes level'),
      bonus('oreHold', 0.05, '+5% ore hold per Spaceframes level'),
    ],
    spaceframesLevel: 3,
  }),
  hull({
    id: 'sumpter', name: 'Sumpter', faction: 'combine', shipClass: 'hauler',
    role: 'Industrial hauler',
    description: 'The Reach runs on Sumpters the way bodies run on blood.',
    volume: 22_000, mass: 13_800, cargo: 4400, power: 72, compute: 245,
    flux: [620, 168], shield: [1900, 260, shieldR()], armor: [1800, armorR(0.1)],
    structure: [3200, STRUCT_R], maxVelocity: 130, agility: 8.8,
    lockRange: 26_000, sensorStrength: 13, maxLockedTargets: 5, signature: 250,
    slots: [1, 3, 5, 3],
    bonuses: [bonus('cargo', 0.05, '+5% cargo per Spaceframes level')],
    spaceframesLevel: 2,
  }),

  // ── Battleships ─────────────────────────────────────────────────────────
  hull({
    id: 'quadrant', name: 'Quadrant', faction: 'accord', shipClass: 'battleship',
    role: 'Fleet anchor battleship',
    description: 'Four fleets have broken on it. The Accord numbered them.',
    volume: 50_000, mass: 99_500, cargo: 820, power: 720, compute: 570,
    flux: [5400, 280], shield: [9800, 420, shieldR(0, 0.1)], armor: [7800, armorR()],
    structure: [7200, STRUCT_R], maxVelocity: 125, agility: 12.5,
    lockRange: 82_000, sensorStrength: 22, maxLockedTargets: 8, signature: 365,
    slots: [7, 5, 4, 3],
    bonuses: [
      bonus('turretDamage', 0.04, '+4% turret damage per Spaceframes level'),
      bonus('turretOptimal', 0.05, '+5% turret optimal per Spaceframes level'),
    ],
    spaceframesLevel: 4,
  }),
  hull({
    id: 'underwriter', name: 'Underwriter', faction: 'combine', shipClass: 'battleship',
    role: 'Armor bulwark battleship',
    description: 'The Combine insures its interests. This is the premium.',
    volume: 50_000, mass: 104_000, cargo: 860, power: 740, compute: 545,
    flux: [5200, 290], shield: [8200, 440, shieldR()], armor: [10_600, armorR(0.1)],
    structure: [7600, STRUCT_R], maxVelocity: 118, agility: 13.2,
    lockRange: 78_000, sensorStrength: 21, maxLockedTargets: 8, signature: 385,
    slots: [6, 4, 6, 3],
    bonuses: [
      bonus('armorHp', 0.05, '+5% armor per Spaceframes level'),
      bonus('turretDamage', 0.03, '+3% turret damage per Spaceframes level'),
    ],
    spaceframesLevel: 4,
  }),
  hull({
    id: 'sermon', name: 'Sermon', faction: 'covenant', shipClass: 'battleship',
    role: 'Siege thermal battleship',
    description: 'When the Covenant preaches at range, stations listen.',
    volume: 50_000, mass: 101_500, cargo: 800, power: 760, compute: 550,
    flux: [5800, 265], shield: [8400, 430, shieldR()], armor: [9600, armorR(0, 0.1)],
    structure: [7400, STRUCT_R], maxVelocity: 120, agility: 12.9,
    lockRange: 85_000, sensorStrength: 21, maxLockedTargets: 8, signature: 375,
    slots: [7, 4, 5, 3],
    bonuses: [
      bonus('turretDamage', 0.05, '+5% turret damage per Spaceframes level'),
      bonus('turretAttenuation', 0.05, '+5% turret attenuation per Spaceframes level'),
    ],
    spaceframesLevel: 4,
  }),
];
