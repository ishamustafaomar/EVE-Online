/** Serialization of sim state into protocol views (interest-filtered, doc 10 §4). */

import { dist, type SolarSystem, type Vec3 } from '@starweft/core';
import type { BeaconView, EntityDeltaView, EntityView } from '@starweft/protocol';
import type { CellEntity, ShipEntity } from '../world/state.js';
import type { SystemCell } from '../world/cell.js';
import type { World } from '../world/world.js';

export function entityView(e: CellEntity): EntityView {
  switch (e.kind) {
    case 'ship':
      return {
        id: e.id as string,
        kind: 'ship',
        name: e.name,
        pos: e.pos,
        vel: e.vel,
        hullId: e.fitted.hull.id as string,
        owner: e.owner as string,
        shieldFrac: frac(e.defense.shield, e.fitted.stats.shieldHp),
        armorFrac: frac(e.defense.armor, e.fitted.stats.armorHp),
        hullFrac: frac(e.defense.hull, e.fitted.stats.hullHp),
        signature: e.fitted.stats.signature,
      };
    case 'asteroid':
      return {
        id: e.id as string,
        kind: 'asteroid',
        name: e.name,
        pos: e.pos,
        vel: { x: 0, y: 0, z: 0 },
        oreId: e.oreId as string,
        unitsRemaining: e.unitsRemaining,
      };
    case 'wreck':
      return {
        id: e.id as string,
        kind: 'wreck',
        name: e.name,
        pos: e.pos,
        vel: { x: 0, y: 0, z: 0 },
      };
  }
}

export function shipDelta(e: ShipEntity): EntityDeltaView {
  return {
    id: e.id as string,
    pos: e.pos,
    vel: e.vel,
    shieldFrac: frac(e.defense.shield, e.fitted.stats.shieldHp),
    armorFrac: frac(e.defense.armor, e.fitted.stats.armorHp),
    hullFrac: frac(e.defense.hull, e.fitted.stats.hullHp),
  };
}

function frac(value: number, max: number): number {
  if (max <= 0) return 0;
  return Math.round(Math.max(0, Math.min(1, value / max)) * 1000) / 1000;
}

/** Entities inside the observer's grid (interest set). Nothing else is ever serialized. */
export function gridEntities(cell: SystemCell, center: Vec3, radiusM: number): CellEntity[] {
  const out: CellEntity[] = [];
  for (const collection of [cell.ships, cell.asteroids, cell.wrecks]) {
    for (const entity of collection.values()) {
      if (dist(entity.pos, center) <= radiusM) out.push(entity);
    }
  }
  return out;
}

export function systemBeacons(world: World, system: SolarSystem): BeaconView[] {
  const beacons: BeaconView[] = [];
  for (const planet of system.planets) {
    beacons.push({ id: planet.id as string, kind: 'planet', name: planet.name, pos: planet.pos });
  }
  for (const station of system.stations) {
    beacons.push({ id: station.id as string, kind: 'station', name: station.name, pos: station.pos });
  }
  for (const belt of system.belts) {
    beacons.push({ id: belt.id as string, kind: 'belt', name: belt.name, pos: belt.pos });
  }
  for (const terminus of system.termini) {
    const dest = world.system(terminus.toSystemId);
    beacons.push({
      id: terminus.id as string,
      kind: 'terminus',
      name: `Weftline · ${dest?.name ?? 'unknown'}`,
      pos: terminus.pos,
      toSystemName: dest?.name ?? 'unknown',
    });
  }
  return beacons;
}
