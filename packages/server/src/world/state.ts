/** Runtime world-state shapes owned by the simulation. */

import type {
  AccountId,
  CharacterId,
  DefenseState,
  EntityId,
  FitLoadout,
  FittedShip,
  FluxState,
  ItemTypeId,
  LocationId,
  ModuleDef,
  MovementOrder,
  SkillLevels,
  StationId,
  SystemId,
  Vec3,
} from '@starweft/core';
import { locationId } from '@starweft/core';

export interface CharacterState {
  readonly id: CharacterId;
  readonly accountId: AccountId;
  readonly name: string;
  systemId: SystemId;
  dockedAt: StationId | null;
  readonly homeStationId: StationId;
  loadout: FitLoadout;
  skills: SkillLevels;
  shipEntityId: EntityId | null;
}

/** Ship equipment/cargo live at character-keyed locations (ship ≙ pilot's active hull). */
export const ShipLocations = {
  hull: (char: CharacterId): LocationId => locationId(`shiphull/${char}`),
  modules: (char: CharacterId): LocationId => locationId(`shipmods/${char}`),
  cargo: (char: CharacterId): LocationId => locationId(`shipcargo/${char}`),
  oreHold: (char: CharacterId): LocationId => locationId(`shiporehold/${char}`),
} as const;

export type SlotRow = 'hardpoint' | 'auxiliary' | 'core';

export interface ModuleRuntime {
  readonly slot: SlotRow;
  readonly index: number;
  readonly def: ModuleDef;
  state: 'idle' | 'cycling';
  cycleEndTick: number;
  targetId: EntityId | null;
  /** Auto-repeat while legal (weapons, extractors, regens). */
  repeat: boolean;
}

export interface TimedEffect {
  readonly untilTick: number;
  readonly value: number;
}

export interface ShipEntity {
  readonly kind: 'ship';
  readonly id: EntityId;
  readonly owner: CharacterId;
  readonly name: string;
  fitted: FittedShip;
  defense: DefenseState;
  flux: FluxState;
  pos: Vec3;
  vel: Vec3;
  order: MovementOrder;
  readonly modules: ModuleRuntime[];
  readonly locks: Set<EntityId>;
  arc: { readonly destPos: Vec3; readonly endTick: number } | null;
  /** Hostile effects on this ship, keyed by source entity. */
  readonly snares: Map<EntityId, TimedEffect>;
  readonly stasis: Map<EntityId, TimedEffect>;
  readonly paints: Map<EntityId, TimedEffect>;
  /** Self-effect from a cycling propulsion module. */
  propulsion: { velocityMul: number; sigMul: number; untilTick: number } | null;
}

export interface AsteroidEntity {
  readonly kind: 'asteroid';
  readonly id: EntityId;
  readonly name: string;
  readonly pos: Vec3;
  readonly oreId: ItemTypeId;
  unitsRemaining: number;
  /** Set when unitsRemaining changed this tick (delta compression). */
  dirty: boolean;
}

export interface WreckEntity {
  readonly kind: 'wreck';
  readonly id: EntityId;
  readonly name: string;
  readonly pos: Vec3;
  readonly lootLocation: LocationId;
}

export type CellEntity = ShipEntity | AsteroidEntity | WreckEntity;

export interface Job {
  readonly id: string;
  readonly owner: CharacterId;
  readonly stationId: StationId;
  readonly blueprintId: ItemTypeId;
  readonly outputTypeId: ItemTypeId;
  readonly outputQty: number;
  readonly inputs: ReadonlyArray<{ readonly typeId: ItemTypeId; readonly qty: number }>;
  readonly readyAtTick: number;
  collected: boolean;
}
