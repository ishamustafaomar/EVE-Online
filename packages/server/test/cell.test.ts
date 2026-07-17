/**
 * Cell-level mechanics driven through the World directly (no sockets):
 * electronic warfare, launchers, snare-vs-arc, and destruction/loot flow.
 */

import { describe, expect, it } from 'vitest';
import {
  computeFit,
  itemTypeId,
  STARTER_SKILLS,
  type FitLoadout,
} from '@starweft/core';
import { DEFAULT_CONFIG } from '../src/config.js';
import { ShipLocations } from '../src/world/state.js';
import { World } from '../src/world/world.js';

const t = itemTypeId;

const SKILLS = { ...STARTER_SKILLS, 'disc.gunnery': 3, 'disc.warheads': 2, 'disc.subterfuge': 2 };

function makeWorld(): World {
  return new World({ ...DEFAULT_CONFIG, port: 0 });
}

/** Directly spawn a fitted ship for a fresh character (test harness). */
function spawnFitted(world: World, name: string, loadout: FitLoadout, pos: { x: number; y: number; z: number }) {
  const character = world.createCharacter(name);
  character.skills = SKILLS;
  character.loadout = loadout;
  const fitted = computeFit(world.registry, loadout, character.skills);
  const cell = world.cell(character.systemId);
  const ship = cell.spawnShip(character.id, name, fitted, pos);
  character.dockedAt = null;
  character.shipEntityId = ship.id;
  return { character, ship, cell };
}

const TACKLER: FitLoadout = {
  hullId: t('hull.plumb'),
  hardpoints: [t('mod.slugthrower1-l'), t('mod.slugthrower1-l')],
  auxiliary: [t('mod.threadlock1'), t('mod.drag-anchor1'), t('mod.beacon-lace1'), t('mod.static-ghost1')],
  core: [t('mod.flux-battery1')],
  weaves: [],
};

const BOMBER: FitLoadout = {
  hullId: t('hull.verge'),
  hardpoints: [t('mod.javelin-rack1-l')],
  auxiliary: [],
  core: [t('mod.flux-battery1')],
  weaves: [],
};

const VICTIM: FitLoadout = {
  hullId: t('hull.verge'),
  hardpoints: [],
  auxiliary: [],
  core: [],
  weaves: [],
};

describe('electronic warfare in the cell', () => {
  it('snare blocks arc-drive spool and cancels one in progress', () => {
    const world = makeWorld();
    const a = spawnFitted(world, 'tackler', TACKLER, { x: 0, y: 0, z: 0 });
    const b = spawnFitted(world, 'runner', VICTIM, { x: 3000, y: 0, z: 0 });

    // Runner starts spooling; tackler locks and snares.
    expect(a.cell.requestArc(b.ship, { x: 1e9, y: 0, z: 0 }, world.tickNumber).ok).toBe(true);
    expect(a.cell.lockTarget(a.ship, b.ship.id).ok).toBe(true);
    expect(a.cell.activateModule(a.ship, 'auxiliary', 0, b.ship.id, world.tickNumber).ok).toBe(true);

    // Advance to the snare's first cycle completion.
    for (let i = 0; i < 20; i++) world.tick(0.25);
    expect(b.ship.arc).toBeNull(); // spool cancelled
    expect(a.cell.requestArc(b.ship, { x: 1e9, y: 0, z: 0 }, world.tickNumber).ok).toBe(false);
  });

  it('stasis slows and painter inflates signature', () => {
    const world = makeWorld();
    const a = spawnFitted(world, 'tackler', TACKLER, { x: 0, y: 0, z: 0 });
    const b = spawnFitted(world, 'target', VICTIM, { x: 3000, y: 0, z: 0 });
    a.cell.lockTarget(a.ship, b.ship.id);
    a.cell.activateModule(a.ship, 'auxiliary', 1, b.ship.id, world.tickNumber); // drag anchor
    a.cell.activateModule(a.ship, 'auxiliary', 2, b.ship.id, world.tickNumber); // beacon lace
    b.cell.setMovementOrder(b.ship, { kind: 'moveTo', dest: { x: 1e7, y: 0, z: 0 } });

    for (let i = 0; i < 120; i++) world.tick(0.25);
    const speed = Math.hypot(b.ship.vel.x, b.ship.vel.y, b.ship.vel.z);
    // Verge base 330 × starter bonuses; stasis halves it.
    expect(speed).toBeLessThan(0.55 * b.ship.fitted.stats.maxVelocity);
    expect(b.ship.paints.size).toBe(1);
    expect(b.ship.stasis.size).toBe(1);
  });

  it('jamming breaks the target’s locks', () => {
    const world = makeWorld();
    const a = spawnFitted(world, 'jammer', TACKLER, { x: 0, y: 0, z: 0 });
    const b = spawnFitted(world, 'hunter', TACKLER, { x: 3000, y: 0, z: 0 });
    b.cell.lockTarget(b.ship, a.ship.id);
    expect(b.ship.locks.size).toBe(1);
    a.cell.lockTarget(a.ship, b.ship.id);
    a.cell.activateModule(a.ship, 'auxiliary', 3, b.ship.id, world.tickNumber); // static ghost

    // Jam strength 6 vs sensor 13 ⇒ ~46% per 12 s cycle; run several cycles.
    for (let i = 0; i < 800 && b.ship.locks.size > 0; i++) world.tick(0.25);
    expect(b.ship.locks.size).toBe(0);
  });
});

describe('launchers', () => {
  it('warheads travel, then land signature-scaled damage', () => {
    const world = makeWorld();
    const a = spawnFitted(world, 'bomber', BOMBER, { x: 0, y: 0, z: 0 });
    const b = spawnFitted(world, 'victim', VICTIM, { x: 20_000, y: 0, z: 0 });
    world.items.mint(ShipLocations.cargo(a.character.id), t('ammo.javelin-warhead'), 50, 'spawn-starter');

    a.cell.lockTarget(a.ship, b.ship.id);
    expect(a.cell.activateModule(a.ship, 'hardpoint', 0, b.ship.id, world.tickNumber).ok).toBe(true);

    const before = b.ship.defense.shield;
    // Flight: 20 km at 2500 m/s ⇒ 8 s ⇒ damage should NOT land instantly.
    world.tick(0.25);
    expect(b.ship.defense.shield).toBe(before);
    for (let i = 0; i < 60; i++) world.tick(0.25);
    expect(b.ship.defense.shield).toBeLessThan(before);
    // Ammo was consumed from cargo.
    expect(world.items.quantity(ShipLocations.cargo(a.character.id), t('ammo.javelin-warhead'))).toBeLessThan(50);
  });

  it('refuses to fire without munitions', () => {
    const world = makeWorld();
    const a = spawnFitted(world, 'bomber', BOMBER, { x: 0, y: 0, z: 0 });
    const b = spawnFitted(world, 'victim', VICTIM, { x: 20_000, y: 0, z: 0 });
    a.cell.lockTarget(a.ship, b.ship.id);
    const result = a.cell.activateModule(a.ship, 'hardpoint', 0, b.ship.id, world.tickNumber);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/flux or munitions/);
  });
});

describe('destruction and loot', () => {
  it('kills produce wrecks with ~50% loot and burn the rest; items conserve', () => {
    const world = makeWorld();
    const a = spawnFitted(world, 'hunter', TACKLER, { x: 0, y: 0, z: 0 });
    const b = spawnFitted(world, 'prey', VICTIM, { x: 2_000, y: 0, z: 0 });
    world.items.mint(ShipLocations.cargo(a.character.id), t('ammo.ferro-slug'), 1000, 'spawn-starter');
    world.items.mint(ShipLocations.cargo(b.character.id), t('ammo.ferro-slug'), 200, 'spawn-starter');

    a.cell.lockTarget(a.ship, b.ship.id);
    expect(a.cell.activateModule(a.ship, 'hardpoint', 0, b.ship.id, world.tickNumber).ok).toBe(true);
    expect(a.cell.activateModule(a.ship, 'hardpoint', 1, b.ship.id, world.tickNumber).ok).toBe(true);

    let guard = 0;
    while (world.cell(a.character.systemId).ships.has(b.ship.id) && guard++ < 20_000) {
      world.tick(0.25);
    }
    expect(guard).toBeLessThan(20_000);

    const cell = world.cell(a.character.systemId);
    expect(cell.wrecks.size).toBe(1);
    const wreck = [...cell.wrecks.values()][0];
    const loot = world.items.contents(wreck?.lootLocation as never);
    // Victim carried 600 slugs (400 starter + 200 minted) rolled at 50%.
    const slugs = loot.find((s) => (s.typeId as string) === 'ammo.ferro-slug');
    expect(slugs).toBeDefined();
    expect(slugs?.qty ?? 0).toBeGreaterThan(220);
    expect(slugs?.qty ?? 0).toBeLessThan(380);

    // Victim respawned docked at home with a fresh starter hull.
    expect(b.character.dockedAt).toBe(b.character.homeStationId);
    expect(b.character.shipEntityId).toBeNull();

    // Conservation held through mint/burn/loot.
    expect(world.items.audit().conserved).toBe(true);
    expect(world.ledger.audit().conserved).toBe(true);
  });
});
