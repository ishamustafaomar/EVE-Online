import { describe, expect, it } from 'vitest';
import { chooseTravelMode, resolveCommand, CommandUsageError, type ViewRefs } from '../src/commands.js';

const V0 = { x: 0, y: 0, z: 0 };

const view: ViewRefs = {
  beacons: [
    { id: 'stn.1', kind: 'station', name: 'Ashlos Spindle I', pos: { x: 100, y: 0, z: 0 } },
    { id: 'belt.1', kind: 'belt', name: 'Ashlos Belt 1', pos: { x: 5000, y: 0, z: 0 } },
    { id: 'term.1', kind: 'terminus', name: 'Weftline · Kess-Varn', pos: { x: 2e6, y: 0, z: 0 }, toSystemName: 'Kess-Varn' },
  ],
  entities: [
    { id: 'ent.hostile', kind: 'ship', name: 'Rustflag Skiff', pos: { x: 900, y: 0, z: 0 }, vel: V0 },
    { id: 'ast.42', kind: 'asteroid', name: 'Ashlos Belt 1 node 3', pos: { x: 5010, y: 0, z: 0 }, vel: V0, oreId: 'ore.regolite', unitsRemaining: 400 },
    { id: 'wreck.7', kind: 'wreck', name: 'Wreck of Rustflag Skiff', pos: { x: 910, y: 0, z: 0 }, vel: V0 },
  ],
};

describe('resolveCommand: basic verbs', () => {
  it.each([
    ['look', { type: 'look' }],
    ['l', { type: 'look' }],
    ['status', { type: 'status' }],
    ['wallet', { type: 'wallet' }],
    ['cargo', { type: 'cargoView' }],
    ['hangar', { type: 'hangarView' }],
    ['who', { type: 'who' }],
    ['jobs', { type: 'jobsView' }],
    ['undock', { type: 'undock' }],
    ['help', { type: 'help' }],
    ['?', { type: 'help' }],
    ['quit', { type: 'quit' }],
    ['exit', { type: 'quit' }],
  ])('parses "%s"', (line, expected) => {
    expect(resolveCommand(line, view)).toEqual(expected);
  });

  it('is case-insensitive on the verb', () => {
    expect(resolveCommand('LOOK', view)).toEqual({ type: 'look' });
    expect(resolveCommand('Undock', view)).toEqual({ type: 'undock' });
  });

  it('rejects empty input', () => {
    expect(() => resolveCommand('   ', view)).toThrow(CommandUsageError);
  });

  it('rejects unknown verbs with a helpful message', () => {
    expect(() => resolveCommand('teleport b1', view)).toThrow(/unknown command "teleport"/);
  });
});

describe('resolveCommand: beacon/entity index resolution', () => {
  it('resolves "goto bN" to the beacon id', () => {
    expect(resolveCommand('goto b2', view)).toEqual({ type: 'goto', beaconId: 'belt.1' });
  });

  it('resolves "dock bN" and "thread bN"', () => {
    expect(resolveCommand('dock b1', view)).toEqual({ type: 'dock', stationId: 'stn.1' });
    expect(resolveCommand('thread b3', view)).toEqual({ type: 'thread', terminusId: 'term.1' });
  });

  it('accepts a literal id when it does not match the bN pattern', () => {
    expect(resolveCommand('dock some.raw.station.id', view)).toEqual({
      type: 'dock',
      stationId: 'some.raw.station.id',
    });
  });

  it('errors on an out-of-range beacon index', () => {
    expect(() => resolveCommand('goto b9', view)).toThrow(/no such beacon b9/);
  });

  it('resolves bare-number entity refs for lock/fire/mine/loot', () => {
    expect(resolveCommand('lock 1', view)).toEqual({ type: 'lock', targetId: 'ent.hostile' });
    expect(resolveCommand('fire 2 1', view)).toEqual({
      type: 'activate',
      slot: 'hardpoint',
      index: 1,
      targetId: 'ent.hostile',
    });
    expect(resolveCommand('mine 1 2', view)).toEqual({
      type: 'activate',
      slot: 'hardpoint',
      index: 0,
      targetId: 'ast.42',
    });
    expect(resolveCommand('loot 3', view)).toEqual({ type: 'loot', targetId: 'wreck.7' });
  });

  it('errors on an out-of-range entity index', () => {
    expect(() => resolveCommand('lock 9', view)).toThrow(/no such entity 9/);
  });
});

describe('resolveCommand: move', () => {
  it('parses hold/approach/orbit', () => {
    expect(resolveCommand('move hold', view)).toEqual({ type: 'moveHold' });
    expect(resolveCommand('move approach 1', view)).toEqual({ type: 'moveApproach', targetId: 'ent.hostile' });
    expect(resolveCommand('move orbit 1 5000', view)).toEqual({
      type: 'moveOrbit',
      targetId: 'ent.hostile',
      rangeM: 5000,
    });
  });

  it('rejects a malformed move subcommand', () => {
    expect(() => resolveCommand('move sideways', view)).toThrow(/usage: move/);
  });
});

describe('resolveCommand: slots and modules', () => {
  it('accepts short and long slot names, 1-based module numbers become 0-based', () => {
    expect(resolveCommand('activate h 1', view)).toEqual({ type: 'activate', slot: 'hardpoint', index: 0 });
    expect(resolveCommand('activate auxiliary 2', view)).toEqual({ type: 'activate', slot: 'auxiliary', index: 1 });
    expect(resolveCommand('stop c 3', view)).toEqual({ type: 'deactivate', slot: 'core', index: 2 });
  });

  it('rejects unknown slot names', () => {
    expect(() => resolveCommand('activate weave 1', view)).toThrow(/unknown slot/);
  });

  it('rejects non-numeric module indices', () => {
    expect(() => resolveCommand('activate h two', view)).toThrow(/whole number/);
  });
});

describe('resolveCommand: industry, market, social', () => {
  it('parses refine/build/collect', () => {
    expect(resolveCommand('refine ore.regolite 500', view)).toEqual({
      type: 'refine',
      oreId: 'ore.regolite',
      units: 500,
    });
    expect(resolveCommand('build bp.ammo.ferro-slug 2', view)).toEqual({
      type: 'build',
      blueprintId: 'bp.ammo.ferro-slug',
      runs: 2,
    });
    expect(resolveCommand('collect job.0', view)).toEqual({ type: 'collect', jobId: 'job.0' });
  });

  it('parses market/buy/sell/cancel', () => {
    expect(resolveCommand('market ammo.ferro-slug', view)).toEqual({ type: 'market', typeId: 'ammo.ferro-slug' });
    expect(resolveCommand('buy ammo.ferro-slug 20 100', view)).toEqual({
      type: 'buy',
      typeId: 'ammo.ferro-slug',
      price: 20,
      qty: 100,
    });
    expect(resolveCommand('sell ammo.ferro-slug 25 50', view)).toEqual({
      type: 'sell',
      typeId: 'ammo.ferro-slug',
      price: 25,
      qty: 50,
    });
    expect(resolveCommand('cancel order.3', view)).toEqual({ type: 'cancel', orderId: 'order.3' });
  });

  it('parses say/tell, joining trailing words into the message', () => {
    expect(resolveCommand('say fly dangerous o7', view)).toEqual({ type: 'say', text: 'fly dangerous o7' });
    expect(resolveCommand('tell Alice the Deep pays double', view)).toEqual({
      type: 'tell',
      name: 'Alice',
      text: 'the Deep pays double',
    });
  });

  it('parses load/unload', () => {
    expect(resolveCommand('unload ore.regolite 300', view)).toEqual({
      type: 'unload',
      typeId: 'ore.regolite',
      qty: 300,
    });
    expect(resolveCommand('load ammo.ferro-slug 400', view)).toEqual({
      type: 'load',
      typeId: 'ammo.ferro-slug',
      qty: 400,
    });
  });

  it('parses fit presets and rejects unknown ones', () => {
    expect(resolveCommand('fit combat', view)).toEqual({ type: 'fitPreset', preset: 'combat' });
    expect(resolveCommand('fit mining', view)).toEqual({ type: 'fitPreset', preset: 'mining' });
    expect(() => resolveCommand('fit battleship', view)).toThrow(/usage: fit/);
  });
});

describe('chooseTravelMode', () => {
  it('arcs beyond the 150 km minimum, burns sublight under it', () => {
    expect(chooseTravelMode(V0, { x: 200_000, y: 0, z: 0 })).toBe('arc');
    expect(chooseTravelMode(V0, { x: 5_000, y: 0, z: 0 })).toBe('move');
    expect(chooseTravelMode(V0, { x: 150_000, y: 0, z: 0 })).toBe('arc');
  });
});
