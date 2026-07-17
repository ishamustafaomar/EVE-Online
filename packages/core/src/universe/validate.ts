/** Universe validation gates (doc 03 §5), shared by tests and CI tooling. */

import type { SystemId } from '../kernel/ids.js';
import type { UniversePack } from './types.js';

export interface UniverseReport {
  readonly issues: readonly string[];
  readonly stats: {
    readonly systems: number;
    readonly deepSystems: number;
    readonly weftlines: number;
    readonly bandCounts: Record<string, number>;
    readonly averageDegree: number;
  };
}

export function validateUniverse(pack: UniversePack): UniverseReport {
  const issues: string[] = [];
  const systemById = new Map(pack.systems.map((s) => [s.id, s]));

  // Weftline endpoints resolve and never touch the Deep Weft.
  for (const line of pack.weftlines) {
    for (const end of [line.a, line.b]) {
      const sys = systemById.get(end);
      if (!sys) issues.push(`${line.id}: endpoint ${end} unknown`);
      else if (sys.band === 'deep') issues.push(`${line.id}: endpoint ${end} is in the Deep Weft`);
    }
  }

  // Termini match weftlines exactly (each line has a terminus at both ends).
  const terminusKey = new Set<string>();
  for (const sys of pack.systems) {
    for (const t of sys.termini) {
      terminusKey.add(`${t.weftlineId}@${sys.id}`);
      if (!systemById.has(t.toSystemId)) issues.push(`${t.id}: dangling toSystemId`);
    }
  }
  for (const line of pack.weftlines) {
    if (!terminusKey.has(`${line.id}@${line.a}`)) issues.push(`${line.id}: missing terminus in ${line.a}`);
    if (!terminusKey.has(`${line.id}@${line.b}`)) issues.push(`${line.id}: missing terminus in ${line.b}`);
  }

  // Connectivity: all charted (non-deep) systems form one component.
  const adjacency = new Map<SystemId, SystemId[]>();
  for (const line of pack.weftlines) {
    adjacency.set(line.a, [...(adjacency.get(line.a) ?? []), line.b]);
    adjacency.set(line.b, [...(adjacency.get(line.b) ?? []), line.a]);
  }
  const charted = pack.systems.filter((s) => s.band !== 'deep');
  const first = charted[0];
  if (first) {
    const seen = new Set<SystemId>([first.id]);
    const queue = [first.id];
    let head = 0;
    while (head < queue.length) {
      const cur = queue[head++] as SystemId;
      for (const nxt of adjacency.get(cur) ?? []) {
        if (!seen.has(nxt)) {
          seen.add(nxt);
          queue.push(nxt);
        }
      }
    }
    const unreachable = charted.filter((s) => !seen.has(s.id));
    if (unreachable.length > 0) {
      issues.push(`connectivity: ${unreachable.length} charted systems unreachable (e.g. ${unreachable[0]?.id})`);
    }
  }

  // Deep systems must be graphless and stationless.
  for (const sys of pack.systems) {
    if (sys.band === 'deep') {
      if (sys.termini.length > 0) issues.push(`${sys.id}: deep system has termini`);
      if (sys.stations.length > 0) issues.push(`${sys.id}: deep system has NPC stations`);
    }
  }

  // Name uniqueness.
  const names = new Set<string>();
  for (const sys of pack.systems) {
    if (names.has(sys.name)) issues.push(`duplicate system name: ${sys.name}`);
    names.add(sys.name);
  }

  // Capitals are warding 1.0 with a full-service station.
  for (const sys of pack.systems) {
    if (sys.isCapital) {
      if (sys.warding !== 1) issues.push(`${sys.id}: capital warding ${sys.warding} != 1.0`);
      if (!sys.stations.some((st) => st.services.market && st.services.industry)) {
        issues.push(`${sys.id}: capital lacks a full-service station`);
      }
    }
  }

  const bandCounts: Record<string, number> = {};
  for (const sys of pack.systems) bandCounts[sys.band] = (bandCounts[sys.band] ?? 0) + 1;

  const degreeSum = [...adjacency.values()].reduce((acc, list) => acc + list.length, 0);

  return {
    issues,
    stats: {
      systems: pack.systems.length,
      deepSystems: bandCounts['deep'] ?? 0,
      weftlines: pack.weftlines.length,
      bandCounts,
      averageDegree: charted.length > 0 ? degreeSum / charted.length : 0,
    },
  };
}
