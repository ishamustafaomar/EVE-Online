/**
 * Pure command parsing/resolution. No I/O, no socket — takes a line of input
 * plus a snapshot of what `look` last showed (so short indices like `b2` or
 * `3` resolve to real IDs), and returns a typed Action for main.ts to
 * execute. Fully unit-testable in isolation from the network.
 */

import { ARC_MIN_DISTANCE_M, dist, type Vec3 } from '@starweft/core';
import type { BeaconView, EntityView } from '@starweft/protocol';

export class CommandUsageError extends Error {}

/** Below arc-drive minimum range, a "goto" burns sublight instead of arcing. */
export function chooseTravelMode(selfPos: Vec3, destPos: Vec3): 'arc' | 'move' {
  return dist(selfPos, destPos) >= ARC_MIN_DISTANCE_M ? 'arc' : 'move';
}

export interface ViewRefs {
  readonly beacons: readonly BeaconView[];
  readonly entities: readonly EntityView[];
}

export type SlotRow = 'hardpoint' | 'auxiliary' | 'core';

export type Action =
  | { type: 'help' }
  | { type: 'quit' }
  | { type: 'look' }
  | { type: 'status' }
  | { type: 'wallet' }
  | { type: 'cargoView' }
  | { type: 'hangarView' }
  | { type: 'who' }
  | { type: 'jobsView' }
  | { type: 'goto'; beaconId: string }
  | { type: 'moveHold' }
  | { type: 'moveApproach'; targetId: string }
  | { type: 'moveOrbit'; targetId: string; rangeM: number }
  | { type: 'undock' }
  | { type: 'dock'; stationId: string }
  | { type: 'thread'; terminusId: string }
  | { type: 'lock'; targetId: string }
  | { type: 'unlock'; targetId: string }
  | { type: 'activate'; slot: SlotRow; index: number; targetId?: string }
  | { type: 'deactivate'; slot: SlotRow; index: number }
  | { type: 'fitPreset'; preset: 'combat' | 'mining' }
  | { type: 'refine'; oreId: string; units: number }
  | { type: 'build'; blueprintId: string; runs: number }
  | { type: 'collect'; jobId: string }
  | { type: 'market'; typeId: string }
  | { type: 'buy'; typeId: string; price: number; qty: number }
  | { type: 'sell'; typeId: string; price: number; qty: number }
  | { type: 'cancel'; orderId: string }
  | { type: 'loot'; targetId: string }
  | { type: 'unload'; typeId: string; qty: number }
  | { type: 'load'; typeId: string; qty: number }
  | { type: 'say'; text: string }
  | { type: 'tell'; name: string; text: string };

function resolveBeaconRef(ref: string, view: ViewRefs): string {
  const m = /^b(\d+)$/i.exec(ref);
  if (!m) return ref; // literal ID
  const index = Number(m[1]);
  const beacon = view.beacons[index - 1];
  if (!beacon) throw new CommandUsageError(`no such beacon b${index} — run "look" first`);
  return beacon.id;
}

function resolveEntityRef(ref: string, view: ViewRefs): string {
  if (!/^\d+$/.test(ref)) return ref; // literal ID
  const index = Number(ref);
  const entity = view.entities[index - 1];
  if (!entity) throw new CommandUsageError(`no such entity ${index} — run "look" first`);
  return entity.id;
}

function parseSlot(tok: string): SlotRow {
  const lower = tok.toLowerCase();
  if (lower === 'h' || lower === 'hardpoint') return 'hardpoint';
  if (lower === 'a' || lower === 'aux' || lower === 'auxiliary') return 'auxiliary';
  if (lower === 'c' || lower === 'core') return 'core';
  throw new CommandUsageError(`unknown slot "${tok}" — use hardpoint/h, auxiliary/a, or core/c`);
}

function parseInt10(tok: string | undefined, label: string): number {
  if (tok === undefined) throw new CommandUsageError(`missing ${label}`);
  const n = Number(tok);
  if (!Number.isInteger(n)) throw new CommandUsageError(`${label} must be a whole number, got "${tok}"`);
  return n;
}

function requireArg(tok: string | undefined, label: string): string {
  if (tok === undefined || tok.length === 0) throw new CommandUsageError(`missing ${label}`);
  return tok;
}

/** Parse one line of input into an Action, resolving short indices against `view`. */
export function resolveCommand(line: string, view: ViewRefs): Action {
  const trimmed = line.trim();
  if (trimmed.length === 0) throw new CommandUsageError('empty command');
  const tokens = trimmed.split(/\s+/);
  const verb = (tokens[0] ?? '').toLowerCase();
  const rest = tokens.slice(1);

  switch (verb) {
    case 'help':
    case '?':
      return { type: 'help' };
    case 'quit':
    case 'exit':
      return { type: 'quit' };
    case 'look':
    case 'l':
      return { type: 'look' };
    case 'status':
    case 'st':
      return { type: 'status' };
    case 'wallet':
      return { type: 'wallet' };
    case 'cargo':
      return { type: 'cargoView' };
    case 'hangar':
      return { type: 'hangarView' };
    case 'who':
      return { type: 'who' };
    case 'jobs':
      return { type: 'jobsView' };

    case 'goto':
      return { type: 'goto', beaconId: resolveBeaconRef(requireArg(rest[0], 'beacon (e.g. b1)'), view) };

    case 'move': {
      const sub = (rest[0] ?? '').toLowerCase();
      if (sub === 'hold') return { type: 'moveHold' };
      if (sub === 'approach') {
        return { type: 'moveApproach', targetId: resolveEntityRef(requireArg(rest[1], 'target'), view) };
      }
      if (sub === 'orbit') {
        return {
          type: 'moveOrbit',
          targetId: resolveEntityRef(requireArg(rest[1], 'target'), view),
          rangeM: parseInt10(rest[2], 'range in meters'),
        };
      }
      throw new CommandUsageError('usage: move hold | move approach <N> | move orbit <N> <rangeM>');
    }

    case 'undock':
      return { type: 'undock' };
    case 'dock':
      return { type: 'dock', stationId: resolveBeaconRef(requireArg(rest[0], 'station (e.g. b1)'), view) };
    case 'thread':
      return { type: 'thread', terminusId: resolveBeaconRef(requireArg(rest[0], 'weftline (e.g. b1)'), view) };

    case 'lock':
      return { type: 'lock', targetId: resolveEntityRef(requireArg(rest[0], 'target'), view) };
    case 'unlock':
      return { type: 'unlock', targetId: resolveEntityRef(requireArg(rest[0], 'target'), view) };

    case 'activate':
      return {
        type: 'activate',
        slot: parseSlot(requireArg(rest[0], 'slot')),
        index: parseInt10(rest[1], 'module number') - 1,
        ...(rest[2] !== undefined ? { targetId: resolveEntityRef(rest[2], view) } : {}),
      };
    case 'deactivate':
      return {
        type: 'deactivate',
        slot: parseSlot(requireArg(rest[0], 'slot')),
        index: parseInt10(rest[1], 'module number') - 1,
      };
    case 'fire':
      return {
        type: 'activate',
        slot: 'hardpoint',
        index: parseInt10(rest[0], 'hardpoint number') - 1,
        targetId: resolveEntityRef(requireArg(rest[1], 'target'), view),
      };
    case 'mine':
      return {
        type: 'activate',
        slot: 'hardpoint',
        index: parseInt10(rest[0], 'hardpoint number') - 1,
        targetId: resolveEntityRef(requireArg(rest[1], 'asteroid'), view),
      };
    case 'stop':
      return {
        type: 'deactivate',
        slot: parseSlot(requireArg(rest[0], 'slot')),
        index: parseInt10(rest[1], 'module number') - 1,
      };

    case 'fit': {
      const preset = (rest[0] ?? '').toLowerCase();
      if (preset === 'combat' || preset === 'mining') return { type: 'fitPreset', preset };
      throw new CommandUsageError('usage: fit combat | fit mining');
    }

    case 'refine':
      return {
        type: 'refine',
        oreId: requireArg(rest[0], 'ore type id (see "hangar")'),
        units: parseInt10(rest[1], 'units'),
      };
    case 'build':
      return {
        type: 'build',
        blueprintId: requireArg(rest[0], 'blueprint id'),
        runs: parseInt10(rest[1], 'runs'),
      };
    case 'collect':
      return { type: 'collect', jobId: requireArg(rest[0], 'job id (see "jobs")') };

    case 'market':
      return { type: 'market', typeId: requireArg(rest[0], 'item type id') };
    case 'buy':
      return {
        type: 'buy',
        typeId: requireArg(rest[0], 'item type id'),
        price: parseInt10(rest[1], 'price'),
        qty: parseInt10(rest[2], 'quantity'),
      };
    case 'sell':
      return {
        type: 'sell',
        typeId: requireArg(rest[0], 'item type id'),
        price: parseInt10(rest[1], 'price'),
        qty: parseInt10(rest[2], 'quantity'),
      };
    case 'cancel':
      return { type: 'cancel', orderId: requireArg(rest[0], 'order id') };

    case 'loot':
      return { type: 'loot', targetId: resolveEntityRef(requireArg(rest[0], 'wreck'), view) };

    case 'unload':
      return {
        type: 'unload',
        typeId: requireArg(rest[0], 'item type id'),
        qty: parseInt10(rest[1], 'quantity'),
      };
    case 'load':
      return {
        type: 'load',
        typeId: requireArg(rest[0], 'item type id'),
        qty: parseInt10(rest[1], 'quantity'),
      };

    case 'say':
      return { type: 'say', text: requireArg(rest.join(' '), 'message') };
    case 'tell': {
      const name = requireArg(rest[0], 'pilot name');
      const text = requireArg(rest.slice(1).join(' '), 'message');
      return { type: 'tell', name, text };
    }

    default:
      throw new CommandUsageError(`unknown command "${verb}" — type "help" for the command list`);
  }
}
