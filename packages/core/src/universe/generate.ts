/**
 * Universe generation pipeline (doc 03). Deterministic: same config ⇒
 * byte-identical UniversePack. Each stage draws from its own named RNG stream
 * so edits to one stage don't reshuffle the others.
 */

import { itemTypeId, planetId, regionId, stationId, systemId, terminusId, weftlineId, beltId } from '../kernel/ids.js';
import type { RegionId, SystemId, WeftlineId } from '../kernel/ids.js';
import { rngStream, type Rng } from '../kernel/rng.js';
import { add, dist, norm, scale, sub, vec, type Vec3 } from '../kernel/vec.js';
import type { FactionKey } from '../content/types.js';
import { NameForge, ROMAN } from './names.js';
import type {
  AsteroidNodeSpec,
  Belt,
  Planet,
  PlanetType,
  Region,
  SecurityBand,
  SolarSystem,
  StarClass,
  Station,
  Terminus,
  UniverseConfig,
  UniversePack,
  Weftline,
} from './types.js';

const FACTIONS: readonly FactionKey[] = ['accord', 'combine', 'covenant', 'freeholds'];

const STAR_TABLE: ReadonlyArray<readonly [StarClass, number]> = [
  ['M', 0.45], ['K', 0.2], ['G', 0.12], ['F', 0.08], ['A', 0.06], ['binary', 0.05], ['remnant', 0.04],
];

const PLANET_TABLE: ReadonlyArray<readonly [PlanetType, number]> = [
  ['barren', 0.3], ['ice', 0.2], ['gas', 0.2], ['lava', 0.12], ['ocean', 0.1], ['temperate', 0.08],
];

/** Ore spawn tables per security band (doc 03 stage E / doc 01 §5). */
const ORE_TABLES: Record<SecurityBand, ReadonlyArray<readonly [string, number]>> = {
  warded: [['ore.regolite', 0.6], ['ore.vanadase', 0.3], ['ore.cryolith', 0.1]],
  fringe: [
    ['ore.regolite', 0.35], ['ore.vanadase', 0.25], ['ore.cryolith', 0.2],
    ['ore.auriphane', 0.15], ['ore.emberore', 0.05],
  ],
  open: [
    ['ore.regolite', 0.2], ['ore.vanadase', 0.15], ['ore.cryolith', 0.15],
    ['ore.auriphane', 0.2], ['ore.nebulite', 0.15], ['ore.voidglass', 0.1],
    ['ore.emberore', 0.05],
  ],
  deep: [
    ['ore.nebulite', 0.25], ['ore.voidglass', 0.3], ['ore.loomsilt', 0.3],
    ['ore.auriphane', 0.15],
  ],
};

/** Best-candidate (Mitchell) sampling: deterministic blue-noise-ish spread. */
function bestCandidate(rng: Rng, existing: readonly Vec3[], make: () => Vec3, tries: number): Vec3 {
  let best: Vec3 = make();
  let bestScore = -1;
  for (let i = 0; i < tries; i++) {
    const candidate = i === 0 ? best : make();
    let nearest = Infinity;
    for (const p of existing) {
      const d = dist(candidate, p);
      if (d < nearest) nearest = d;
    }
    const score = existing.length === 0 ? rng.float() : nearest;
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return best;
}

interface Edge {
  a: number;
  b: number;
  length: number;
}

/** Prim's MST over point indices. */
function mst(points: readonly Vec3[]): Edge[] {
  const n = points.length;
  if (n <= 1) return [];
  const inTree = new Array<boolean>(n).fill(false);
  const bestDist = new Array<number>(n).fill(Infinity);
  const bestFrom = new Array<number>(n).fill(0);
  const edges: Edge[] = [];
  inTree[0] = true;
  for (let i = 1; i < n; i++) {
    bestDist[i] = dist(points[0] as Vec3, points[i] as Vec3);
    bestFrom[i] = 0;
  }
  for (let added = 1; added < n; added++) {
    let pick = -1;
    let pickDist = Infinity;
    for (let i = 0; i < n; i++) {
      if (!inTree[i] && (bestDist[i] as number) < pickDist) {
        pickDist = bestDist[i] as number;
        pick = i;
      }
    }
    if (pick < 0) break;
    inTree[pick] = true;
    edges.push({ a: bestFrom[pick] as number, b: pick, length: pickDist });
    for (let i = 0; i < n; i++) {
      if (!inTree[i]) {
        const d = dist(points[pick] as Vec3, points[i] as Vec3);
        if (d < (bestDist[i] as number)) {
          bestDist[i] = d;
          bestFrom[i] = pick;
        }
      }
    }
  }
  return edges;
}

export function generateUniverse(config: UniverseConfig): UniversePack {
  const { seed } = config;
  const forge = new NameForge();

  // ── Stage A: region layout ────────────────────────────────────────────
  const rngA = rngStream(seed, 'stageA');
  const regionCenters: Vec3[] = [];
  for (let i = 0; i < config.regionCount; i++) {
    const p = bestCandidate(
      rngA,
      regionCenters,
      () => {
        const angle = rngA.float() * Math.PI * 2;
        const radius = 30 + rngA.float() * 70;
        return vec(Math.cos(angle) * radius, Math.sin(angle) * radius, rngA.normal(0, 4));
      },
      12,
    );
    regionCenters.push(p);
  }

  // Faction cores: the region nearest each quadrant anchor at radius 45.
  const factionOfRegion = new Map<number, FactionKey>();
  FACTIONS.forEach((faction, qi) => {
    const angle = (Math.PI / 2) * qi + Math.PI / 4;
    const anchor = vec(Math.cos(angle) * 45, Math.sin(angle) * 45, 0);
    let best = -1;
    let bestD = Infinity;
    regionCenters.forEach((c, i) => {
      if (factionOfRegion.has(i)) return;
      const d = dist(c, anchor);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    if (best >= 0) factionOfRegion.set(best, faction);
  });

  const regions: Region[] = regionCenters.map((center, i) => {
    const faction = factionOfRegion.get(i);
    return {
      id: regionId(`reg.${String(i).padStart(3, '0')}`),
      name: forge.regionName(rngA),
      ...(faction !== undefined ? { faction } : {}),
      center,
    };
  });

  // Region adjacency (for stage C border links): MST + 2-nearest neighbors.
  const regionEdges = new Set<string>();
  for (const e of mst(regionCenters)) regionEdges.add(`${Math.min(e.a, e.b)}:${Math.max(e.a, e.b)}`);
  regionCenters.forEach((c, i) => {
    const byDist = regionCenters
      .map((other, j) => ({ j, d: dist(c, other) }))
      .filter(({ j }) => j !== i)
      .sort((x, y) => x.d - y.d)
      .slice(0, 2);
    for (const { j } of byDist) regionEdges.add(`${Math.min(i, j)}:${Math.max(i, j)}`);
  });

  // ── Stage B: system scatter ───────────────────────────────────────────
  const rngB = rngStream(seed, 'stageB');
  interface ProtoSystem {
    index: number;
    regionIndex: number;
    pos: Vec3;
    starClass: StarClass;
    deep: boolean;
  }
  const protos: ProtoSystem[] = [];
  regions.forEach((region, regionIndex) => {
    const count = rngB.int(config.systemsPerRegion[0], config.systemsPerRegion[1] + 1);
    const local: Vec3[] = [];
    for (let s = 0; s < count; s++) {
      const p = bestCandidate(
        rngB,
        local,
        () => add(region.center, vec(rngB.normal(0, 7), rngB.normal(0, 7), rngB.normal(0, 1.5))),
        8,
      );
      local.push(p);
      protos.push({
        index: protos.length,
        regionIndex,
        pos: p,
        starClass: rngB.weightedPick(STAR_TABLE),
        deep: false,
      });
    }
  });

  // ── Stage F (placement only): Deep Weft systems, graphless ────────────
  const rngF = rngStream(seed, 'stageF');
  const deepCount = Math.round(protos.length * config.deepFraction);
  for (let i = 0; i < deepCount; i++) {
    const near = protos[rngF.int(0, protos.length)] as ProtoSystem;
    protos.push({
      index: protos.length,
      regionIndex: near.regionIndex,
      pos: add(near.pos, vec(rngF.normal(0, 12), rngF.normal(0, 12), rngF.normal(0, 3))),
      starClass: rngF.weightedPick(STAR_TABLE),
      deep: true,
    });
  }

  const sysIdOf = (p: ProtoSystem): SystemId => systemId(`sys.${String(p.index).padStart(4, '0')}`);

  // ── Stage C: weftline graph ───────────────────────────────────────────
  const rngC = rngStream(seed, 'stageC');
  const adjacency = new Map<number, Set<number>>();
  const addEdge = (a: number, b: number): boolean => {
    if (a === b) return false;
    const sa = adjacency.get(a) ?? new Set<number>();
    const sb = adjacency.get(b) ?? new Set<number>();
    if (sa.has(b)) return false;
    if (sa.size >= 5 || sb.size >= 5) return false;
    sa.add(b);
    sb.add(a);
    adjacency.set(a, sa);
    adjacency.set(b, sb);
    return true;
  };

  regions.forEach((_, regionIndex) => {
    const members = protos.filter((p) => p.regionIndex === regionIndex && !p.deep);
    const localPoints = members.map((m) => m.pos);
    for (const e of mst(localPoints)) {
      addEdge((members[e.a] as ProtoSystem).index, (members[e.b] as ProtoSystem).index);
    }
    // Redundancy loops: each system considers its 3 nearest siblings.
    members.forEach((m, mi) => {
      const near = members
        .map((other, oi) => ({ oi, d: dist(m.pos, other.pos) }))
        .filter(({ oi }) => oi !== mi)
        .sort((x, y) => x.d - y.d)
        .slice(0, 3);
      for (const { oi } of near) {
        if (rngC.chance(0.22)) addEdge(m.index, (members[oi] as ProtoSystem).index);
      }
    });
  });

  // Inter-region border links (chokepoints): 1–3 closest cross pairs.
  for (const key of [...regionEdges].sort()) {
    const parts = key.split(':').map(Number);
    const ra = parts[0] as number;
    const rb = parts[1] as number;
    const membersA = protos.filter((p) => p.regionIndex === ra && !p.deep);
    const membersB = protos.filter((p) => p.regionIndex === rb && !p.deep);
    const pairs: Array<{ a: number; b: number; d: number }> = [];
    for (const a of membersA) {
      for (const b of membersB) {
        pairs.push({ a: a.index, b: b.index, d: dist(a.pos, b.pos) });
      }
    }
    pairs.sort((x, y) => x.d - y.d);
    const links = rngC.int(1, 4);
    for (let i = 0; i < Math.min(links, pairs.length); i++) {
      const pair = pairs[i] as { a: number; b: number; d: number };
      addEdge(pair.a, pair.b);
    }
  }

  // ── Stage D: warding assignment ───────────────────────────────────────
  const rngD = rngStream(seed, 'stageD');
  // Capitals: system nearest each faction core region's center.
  const capitals = new Map<number, FactionKey>();
  for (const [regionIndex, faction] of [...factionOfRegion.entries()].sort((a, b) => a[0] - b[0])) {
    const members = protos.filter((p) => p.regionIndex === regionIndex && !p.deep);
    const center = (regions[regionIndex] as Region).center;
    let best: ProtoSystem | undefined;
    let bestD = Infinity;
    for (const m of members) {
      const d = dist(m.pos, center);
      if (d < bestD) {
        bestD = d;
        best = m;
      }
    }
    if (best) capitals.set(best.index, faction);
  }

  // BFS hop distance from any capital.
  const hopDist = new Map<number, number>();
  const queue: number[] = [...capitals.keys()].sort((a, b) => a - b);
  for (const c of queue) hopDist.set(c, 0);
  let head = 0;
  while (head < queue.length) {
    const cur = queue[head++] as number;
    const curD = hopDist.get(cur) as number;
    for (const nxt of [...(adjacency.get(cur) ?? [])].sort((a, b) => a - b)) {
      if (!hopDist.has(nxt)) {
        hopDist.set(nxt, curD + 1);
        queue.push(nxt);
      }
    }
  }

  const wardingOf = (p: ProtoSystem): number => {
    if (p.deep) return -1;
    if (capitals.has(p.index)) return 1.0;
    const hops = hopDist.get(p.index);
    if (hops === undefined) return 0; // unreached pocket: lawless by definition
    const raw = 1.02 - 0.11 * hops + rngD.normal(0, 0.02);
    return Math.round(Math.max(-0.3, Math.min(1, raw)) * 10) / 10;
  };

  const bandOf = (warding: number, deep: boolean): SecurityBand => {
    if (deep) return 'deep';
    if (warding >= 0.5) return 'warded';
    if (warding >= 0.1) return 'fringe';
    return 'open';
  };

  // Nearest faction (by galactic distance to core region) flavors naming.
  const flavorOf = (p: ProtoSystem): FactionKey => {
    let best: FactionKey = 'none';
    let bestD = Infinity;
    for (const [regionIndex, faction] of factionOfRegion) {
      const d = dist(p.pos, (regions[regionIndex] as Region).center);
      if (d < bestD) {
        bestD = d;
        best = faction;
      }
    }
    return bestD < 45 ? best : 'none';
  };

  // ── Weftline records (needed before interiors for termini) ────────────
  const weftlines: Weftline[] = [];
  const linesBySystem = new Map<number, Array<{ id: WeftlineId; other: number }>>();
  const sortedPairs: Array<[number, number]> = [];
  for (const [a, neighbors] of [...adjacency.entries()].sort((x, y) => x[0] - y[0])) {
    for (const b of [...neighbors].sort((x, y) => x - y)) {
      if (a < b) sortedPairs.push([a, b]);
    }
  }
  for (const [a, b] of sortedPairs) {
    const pa = protos[a] as ProtoSystem;
    const pb = protos[b] as ProtoSystem;
    const id = weftlineId(`weft.${String(a).padStart(4, '0')}-${String(b).padStart(4, '0')}`);
    weftlines.push({ id, a: sysIdOf(pa), b: sysIdOf(pb), lengthLu: dist(pa.pos, pb.pos) });
    const la = linesBySystem.get(a) ?? [];
    la.push({ id, other: b });
    linesBySystem.set(a, la);
    const lb = linesBySystem.get(b) ?? [];
    lb.push({ id, other: a });
    linesBySystem.set(b, lb);
  }

  // ── Stages E + G: system interiors and naming ─────────────────────────
  const systems: SolarSystem[] = protos.map((p) => {
    const sid = sysIdOf(p);
    const rng = rngStream(seed, 'sysE', p.index);
    const warding = wardingOf(p);
    const band = bandOf(warding, p.deep);
    const flavor = flavorOf(p);
    const isCapital = capitals.has(p.index);
    const capitalFaction = capitals.get(p.index);

    const name = forge.systemName(
      rng,
      flavor,
      band === 'deep' ? 'deep' : band === 'open' ? 'open' : 'named',
    );

    // Planets on a jittered Titius-Bode-like progression.
    const planetCount = rng.int(2, 12);
    const planets: Planet[] = [];
    let orbit = 6e8 * (1 + rng.float());
    for (let i = 0; i < planetCount; i++) {
      orbit *= 1.45 + rng.float() * 0.5;
      const angle = rng.float() * Math.PI * 2;
      planets.push({
        id: planetId(`${sid}.planet.${i + 1}`),
        name: `${name} ${ROMAN[Math.min(i, ROMAN.length - 1)]}`,
        type: rng.weightedPick(PLANET_TABLE),
        pos: vec(Math.cos(angle) * orbit, Math.sin(angle) * orbit, rng.normal(0, orbit * 0.02)),
      });
    }

    // Belts: count and richness scale with danger.
    const beltCountByBand: Record<SecurityBand, readonly [number, number]> = {
      warded: [0, 3], fringe: [1, 4], open: [1, 5], deep: [2, 6],
    };
    const beltRange = beltCountByBand[band];
    const beltCount = rng.int(beltRange[0], beltRange[1]);
    const belts: Belt[] = [];
    for (let bIdx = 0; bIdx < beltCount; bIdx++) {
      const anchor = rng.pick(planets);
      const beltPos = add(anchor.pos, scale(norm(vec(rng.normal(0, 1), rng.normal(0, 1), 0)), 2.5e7));
      const nodeCount = rng.int(20, 61);
      const nodes: AsteroidNodeSpec[] = [];
      for (let n = 0; n < nodeCount; n++) {
        nodes.push({
          index: n,
          oreId: itemTypeId(rng.weightedPick(ORE_TABLES[band])),
          units: rng.int(4000, 20_001),
          offset: vec(rng.normal(0, 15_000), rng.normal(0, 15_000), rng.normal(0, 4000)),
        });
      }
      belts.push({
        id: beltId(`${sid}.belt.${bIdx + 1}`),
        name: `${anchor.name} Belt ${bIdx + 1}`,
        pos: beltPos,
        nodes,
      });
    }

    // Stations.
    const stations: Station[] = [];
    const stationFaction: FactionKey = capitalFaction ?? flavor;
    const fullServices = { market: true, industry: true, refinery: true, cloneBay: true, insurance: true };
    if (isCapital && capitalFaction) {
      const anchor = planets[planets.length - 1] as Planet;
      stations.push({
        id: stationId(`${sid}.station.1`),
        name: forge.capitalStationName(capitalFaction),
        pos: add(anchor.pos, vec(150_000, 80_000, 0)),
        services: fullServices,
        faction: capitalFaction,
      });
    }
    const extraStations = band === 'warded' ? 1 + (rng.chance(0.5) ? 1 : 0)
      : band === 'fringe' ? (rng.chance(0.7) ? 1 : 0)
      : band === 'open' ? (rng.chance(0.25) ? 1 : 0)
      : 0;
    for (let s = 0; s < extraStations; s++) {
      const anchor = rng.pick(planets);
      stations.push({
        id: stationId(`${sid}.station.${stations.length + 1}`),
        name: forge.stationName(rng, name),
        pos: add(anchor.pos, vec(rng.normal(0, 60_000), rng.normal(0, 60_000), 20_000)),
        services: band === 'warded'
          ? fullServices
          : {
              market: true,
              industry: band === 'fringe' && rng.chance(0.5),
              refinery: true,
              cloneBay: true,
              insurance: band === 'fringe',
            },
        faction: band === 'open' ? 'none' : stationFaction,
      });
    }

    // Termini: one per incident weftline, at the system edge toward the neighbor.
    const outermost = planets.length > 0 ? orbit : 1e10;
    const edgeRadius = Math.max(outermost * 1.35, 1.2e10);
    const termini: Terminus[] = (linesBySystem.get(p.index) ?? []).map((line) => {
      const other = protos[line.other] as ProtoSystem;
      const dir = norm(sub(other.pos, p.pos));
      const flatDir = dir.x === 0 && dir.y === 0 ? vec(1, 0, 0) : norm(vec(dir.x, dir.y, 0));
      return {
        id: terminusId(`term.${line.id}.${sid}`),
        weftlineId: line.id,
        toSystemId: sysIdOf(other),
        pos: scale(flatDir, edgeRadius),
      };
    });

    return {
      id: sid,
      regionId: (regions[p.regionIndex] as Region).id,
      name,
      pos: p.pos,
      warding,
      band,
      starClass: p.starClass,
      isCapital,
      planets,
      belts,
      stations,
      termini,
    };
  });

  return {
    version: 'universe-v1',
    seed,
    regions,
    systems,
    weftlines,
  };
}
