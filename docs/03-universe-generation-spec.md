# STARWEFT — Universe Generation Spec

The Reach is generated **once**, offline, from a seed; the result is authored-curated and
then becomes the permanent, persistent world (P1). Procedural generation is a content
multiplier, not a runtime feature — only **rifts** and **anomalies** spawn procedurally at
runtime.

## 1. Requirements

- ~5,000 systems (MVP milestone generates 1,000+; engine supports 10k) in a connected
  weftline graph with meaningful topology: chokepoints, pockets, loops, dead-ends.
- Deterministic: same seed ⇒ identical universe, byte-for-byte (regression-testable).
- Distribution targets: ~25% Warded, ~30% Fringe, ~45% Open (by system count), plus
  off-graph Deep Weft systems reachable only via rifts.
- Every system fully specified: star, planets, moons, belts, stations, weftline termini.

## 2. Pipeline (deterministic stages)

Each stage consumes the output of the previous plus a namespaced PRNG stream
(`pcg32(seed, stageId, entityId)`), so edits to one stage don't reshuffle others.

### Stage A — Region layout
- Place 40–64 **regions** as points in a 2.5D disc (galactic plane with slight z-noise)
  via Poisson-disc sampling; assign 4 faction cores near disc quadrants' inner ring,
  pirate/frontier regions outward.
- Region adjacency via Delaunay triangulation; prune to keep 2–4 neighbors each.

### Stage B — System scatter
- Per region: 60–120 systems, Poisson-disc within the region volume.
- Star class rolled from weighted table (M 45%, K 20%, G 12%, F 8%, A 6%, binary 5%,
  exotic remnant 4% [neutron/`sheared star` lore variants]).

### Stage C — Weftline graph
- Per region: Euclidean minimum spanning tree over systems ⇒ guaranteed connectivity.
- Add extra edges (relative-neighborhood-graph candidates) with probability decaying by
  length ⇒ loops and redundancy; cap node degree at 5.
- Inter-region: 1–3 border links between adjacent regions, chosen to create **chokepoints**
  (edges whose removal splits many nodes — verified, not hoped for).
- Validate: single connected component; average degree 2.2–2.8; diameter 40–80 hops.

### Stage D — Warding assignment
- Warding = f(graph distance to nearest faction capital), smoothed along edges, with
  noise. Clamped bands per doc 01 §4. Faction capitals are 1.0; contiguity enforced
  (no 1.0 island inside 0.0 space): monotone decay along shortest paths.

### Stage E — System interiors
Per system, from its own PRNG stream:
- 2–11 planets (types: barren, lava, ice, gas, ocean, temperate; orbital radii via
  Titius-Bode-like progression with jitter), 0–4 moons each.
- 0–5 asteroid belts; ore table keyed by warding band + region flavor (doc 01 §5).
  Belt = 20–60 asteroid nodes with type/quantity; **respawn**: server regrows depleted
  nodes daily toward the belt's cap (economically tuned).
- Stations: probability rises with warding and region flavor; faction hubs authored.
  Station services flags: market, industry bays, refinery, clone bay [mindcast],
  syndicate offices, insurance desk.
- Weftline termini placed at system edge (2–5 AU-equivalents out); station/belt/planet
  positions in a deterministic orbital layout (positions advance on a slow epoch clock —
  cosmetic orbital motion, not simulated n-body).

### Stage F — Deep Weft
- +8–12% extra systems generated unattached to the graph (no weftlines, no NPC
  stations, richest ore/relic tables). Reachable only via runtime rifts.

### Stage G — Naming & flavor
- Region and system names from faction phoneme banks / survey codes (doc 01 §6);
  guaranteed unique. Station names templated. Region flavor text hand-authored for
  faction cores, generated-then-curated elsewhere.

## 3. Runtime procedural content

- **Rifts:** each real system rolls rift spawn chances on a scheduler (doc 08); a rift
  is an ephemeral two-ended weftline (mass + time budget) to a Deep Weft or distant
  system. Spawned server-side, discovered via sounding (scanning).
- **Anomalies/sites:** combat anomalies, relic caches, data vaults, ore hollows spawn
  from per-region tables with global caps; despawn/respawn maintains target densities.

## 4. Data model (authoritative shapes)

Generated universe compiles to immutable content packs (versioned, checksummed):

```
UniversePack v1
├─ regions[]        {id, name, factionId?, flavor, systems[]}
├─ systems[]        {id, regionId, name, pos, warding, starClass,
│                    planets[], belts[], stations[], termini[]}
├─ weftlines[]      {id, aSystemId, bSystemId, length}
└─ deepSystems[]    same shape as systems, graphless
```

Mutable state (asteroid quantities, station hangars, rift instances) lives in the world
database, keyed by content-pack IDs — content is never mutated at runtime.

## 5. Validation gates (run in CI on every content change)

1. Determinism: two generations from the same seed hash identical.
2. Connectivity: one component; every system reachable.
3. Distribution: warding-band and star-class proportions within tolerance.
4. Economy: total ore value per band within tuning envelope; no starving region.
5. Naming: uniqueness, profanity screen, no collisions with reserved terms.
6. Chokepoints: ≥ N articulation edges between region pairs (topology audit).

## 6. Implemented today (Milestone A)

`packages/core/src/universe/` implements Stages A–G for a 1,000+ system Reach with all
validation gates as unit tests (determinism, connectivity, banding, uniqueness). The
generator is seed-stable and ships with golden-hash regression tests.
