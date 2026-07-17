# STARWEFT — Content Pipeline & Testing Strategy

## 1. Content pipeline

### 1.1 Everything is data
Hulls, modules, ores, blueprints, NPC archetypes, site tables, fee rates, and tuning
levers live in **typed content definitions** (`packages/core/src/content/`), compiled
into versioned, checksummed **content packs**. Code implements rules; data declares
the universe. Balance changes are data PRs, reviewable line-by-line.

### 1.2 Authoring flow
```
designer edits content source (typed TS/JSON)
   → `validate:content` (schema, references, balance envelopes, name reservations)
   → golden-file diffs (what changed, in human units: DPS/EHP/yield deltas)
   → review → merge → pack build (id-stable, checksummed) → staging soak → prod
```
- **Validation gates:** every reference resolves (no orphan blueprint inputs); every
  hull within class balance envelope (doc 04 §6); every ore reachable in generation
  tables; naming uniqueness + reserved-word screen (original-IP hygiene: a denylist of
  protected third-party terms fails CI).
- **ID discipline:** content IDs are stable strings (`hull.verge`, `mod.threadlock1`,
  `ore.regolite`); packs are additive-by-default; removals require a migration note.

### 1.3 Universe pipeline
Galaxy generation (doc 03) is a build step: seed → pack → validation gates →
curation overrides (hand-authored faction capitals, starter systems) → final pack.
Runtime never regenerates the world.

### 1.4 Art/audio pipeline (Milestone D)
Asset conventions (naming, LOD chain, budgets per class) + automated import checks;
all assets original or licensed-with-proof; provenance manifest kept in-repo.

## 2. Testing strategy

### 2.1 The pyramid

| Layer | Scope | Gate |
|---|---|---|
| Unit (fast, thousands) | `@starweft/core` math, matching, fitting, combat, generation | every PR |
| Property/invariant | conservation (lumens/items), determinism (same seed ⇒ same bytes), fitting legality (no illegal fit accepted), matching (no negative spread trades) | every PR |
| Golden/regression | universe pack hash for reference seed; balance envelope reports; protocol fixture round-trips | every PR |
| Integration | real server boot + client-sdk driving full flows over WebSocket (login→mine→refine→build→trade→fight) | every PR |
| Perf/bench | micro-benchmarks + cell tick budget assertions | every PR (budget), nightly (trend) |
| Load/chaos | bot fleets on staging; kill-a-cell drills; reconnect storms | pre-release |
| Playtest | structured scenario scripts + telemetry review | per milestone |

### 2.2 Determinism as a testing superpower
All domain logic is deterministic (seeded PRNG streams, fixed tick, no wall-clock in
rules). Consequences: combat/e2e tests are exactly reproducible; desync bugs are
bisectable; a recorded protocol stream replays the UI store (doc 11 §3). Guarded by
lint rule: no `Date.now`/`Math.random` inside `packages/core` rule code (PRNG injection
only).

### 2.3 Test data policy
Tests use the real content packs (not mocks) — balance data *is* logic here. A tiny
`test-reach` universe seed (12 systems) keeps integration tests fast; the full-size
seed runs in the nightly suite.

### 2.4 Quality bars (Definition of Done, every feature)
1. Spec section in docs (design + technical).
2. Implementation with strict types (no `any` leaks; `tsc --strict` clean).
3. Unit + invariant tests; integration test if it touches the protocol.
4. Perf: within budgets (doc 13) or budget PR with justification.
5. Telemetry events + audit cause-codes for new mutations.
6. Docs updated (this set + reference docs).
No partial systems on main: feature branches merge complete verticals only.

## 3. Implemented today (Milestone A)

The pyramid's first five layers exist and run in `pnpm test`: 115+ tests — unit,
property (conservation, determinism), golden (universe hash), integration (real
gateway + client SDK driving mine→refine→build→trade→fight→loot flows), and a perf
budget assertion. `pnpm validate:content` runs the content gates; `pnpm bench` runs
micro-benchmarks; determinism enforced by `tools/check-determinism.mjs`.
