/** Universe pack shapes (doc 03 §4). Immutable content, generated offline. */

import type {
  BeltId,
  ItemTypeId,
  PlanetId,
  RegionId,
  StationId,
  SystemId,
  TerminusId,
  WeftlineId,
} from '../kernel/ids.js';
import type { Vec3 } from '../kernel/vec.js';
import type { FactionKey } from '../content/types.js';

export type SecurityBand = 'warded' | 'fringe' | 'open' | 'deep';

export type StarClass = 'M' | 'K' | 'G' | 'F' | 'A' | 'binary' | 'remnant';

export type PlanetType = 'barren' | 'lava' | 'ice' | 'gas' | 'ocean' | 'temperate';

export interface Region {
  readonly id: RegionId;
  readonly name: string;
  /** Set only for the four faction core regions. */
  readonly faction?: FactionKey;
  /** Galactic position, lattice units. */
  readonly center: Vec3;
}

export interface Planet {
  readonly id: PlanetId;
  readonly name: string;
  readonly type: PlanetType;
  /** Position in system space, meters. */
  readonly pos: Vec3;
}

export interface AsteroidNodeSpec {
  readonly index: number;
  readonly oreId: ItemTypeId;
  /** Ore units present at world genesis (mutable state lives server-side). */
  readonly units: number;
  /** Offset from belt center, meters. */
  readonly offset: Vec3;
}

export interface Belt {
  readonly id: BeltId;
  readonly name: string;
  readonly pos: Vec3;
  readonly nodes: readonly AsteroidNodeSpec[];
}

export interface StationServices {
  readonly market: boolean;
  readonly industry: boolean;
  readonly refinery: boolean;
  readonly cloneBay: boolean;
  readonly insurance: boolean;
}

export interface Station {
  readonly id: StationId;
  readonly name: string;
  readonly pos: Vec3;
  readonly services: StationServices;
  readonly faction: FactionKey;
}

export interface Terminus {
  readonly id: TerminusId;
  readonly weftlineId: WeftlineId;
  /** The system on the far side of this terminus. */
  readonly toSystemId: SystemId;
  readonly pos: Vec3;
}

export interface SolarSystem {
  readonly id: SystemId;
  readonly regionId: RegionId;
  readonly name: string;
  /** Galactic position, lattice units. */
  readonly pos: Vec3;
  /** 0.0–1.0 for charted space; -1 for the Deep Weft. */
  readonly warding: number;
  readonly band: SecurityBand;
  readonly starClass: StarClass;
  readonly isCapital: boolean;
  readonly planets: readonly Planet[];
  readonly belts: readonly Belt[];
  readonly stations: readonly Station[];
  readonly termini: readonly Terminus[];
}

export interface Weftline {
  readonly id: WeftlineId;
  readonly a: SystemId;
  readonly b: SystemId;
  readonly lengthLu: number;
}

export interface UniversePack {
  readonly version: string;
  readonly seed: string;
  readonly regions: readonly Region[];
  readonly systems: readonly SolarSystem[];
  readonly weftlines: readonly Weftline[];
}

export interface UniverseConfig {
  readonly seed: string;
  readonly regionCount: number;
  readonly systemsPerRegion: readonly [min: number, max: number];
  /** Fraction of extra rift-only Deep Weft systems. */
  readonly deepFraction: number;
}

/** Full-scale Reach (Milestone A target: 1,000+ systems). */
export const REACH_PRESET: UniverseConfig = {
  seed: 'the-severance-3021',
  regionCount: 16,
  systemsPerRegion: [60, 90],
  deepFraction: 0.1,
};

/** Small universe for fast integration tests (doc 14 §2.3). */
export const TEST_REACH_PRESET: UniverseConfig = {
  seed: 'test-reach',
  regionCount: 4,
  systemsPerRegion: [10, 14],
  deepFraction: 0.1,
};
