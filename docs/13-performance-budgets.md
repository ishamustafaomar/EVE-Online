# STARWEFT — Performance Budgets & Strategy

Budgets are contracts; CI perf tests fail builds that break them (doc 14).

## 1. Server simulation budgets

| Metric | Budget | Notes |
|---|---|---|
| Sim tick rate | 4 Hz per system cell | fairness-stretch to 2/1 Hz under overload (doc 09 §5) |
| Tick CPU (idle cell) | < 0.2 ms | thousands of quiet systems per host |
| Tick CPU (100-entity grid) | < 25 ms | typical fight |
| Tick CPU (500-entity grid) | < 180 ms @ 2 Hz stretched | big battle mode |
| Cells per 8-core host | ≥ 500 quiet / ≥ 20 active | with headroom for spikes |
| Snapshot flush | < 50 ms amortized, off-tick-thread | dirty-set only |
| Market match op | < 1 ms p99 per order | O(log n) book ops |

Techniques: fixed tick with command queues (no per-message wakeups); spatial work only
on active grids; distance checks via squared norms + coarse grid buckets (documented
octree upgrade if profiling demands); zero allocations in the tick hot path where
possible (object pools for deltas); economic NPCs simulated abstractly off-grid.

## 2. Bandwidth budgets (per client)

| Situation | Budget |
|---|---|
| Docked / quiet space | < 1 KB/s |
| Typical grid (≤50 entities) | 2–6 KB/s |
| Fleet fight (priority tiers + decimation, doc 10 §4) | < 20 KB/s |

Levers in order: delta-only fields → quantization → update decimation by priority →
binary encoding (v2) → interest radius tuning. Measured by protocol-level byte counters
(built into gateway metrics) before/after each lever.

## 3. Client budgets (Milestone D targets)

- 60 FPS at 1080p mid-tier GPU in 50-entity grids; 30 FPS floor in 500-entity fights
  (LOD ladder: impostors beyond 100 km, effect pooling, draw-call batching by hull).
- UI layer: 120 Hz-capable panel updates decoupled from 3D frame; store updates batched
  per protocol tick; virtualized tables (Overview handles 1,000 rows without jank).
- Memory: client < 4 GB working set; asset streaming by system locality.

## 4. Persistence & memory (server)

- Cell working set: ≤ 1 KB per quiet entity target; belts stored as compact typed
  arrays; content data interned/shared (immutable packs, one copy per process).
- Postgres: ledger append-only partitioned by month; hot tables (orders, items) index
  discipline reviewed per migration; snapshot writes batched dirty-set only.
- Redis: everything in it must be reconstructible (cache, not truth).

## 5. Profiling practice

- Every perf-relevant package has micro-benchmarks (`pnpm bench`) tracked over time.
- Load tests: headless bot fleets (client-sdk) scripted scenarios — mining fleet,
  market storm, 200v200 brawl — run pre-release on staging with dashboards on the
  budget metrics above.
- Flame-graph on tick thread is a standing dashboard in dev builds.

## 6. Implemented today (Milestone A)

The tick loop is allocation-conscious (delta compression per session: only changed
ships and dirty asteroids serialize) and the repo ships micro-benchmarks for the hot
domain paths (universe generation, fitting, combat resolution, market matching) via
`pnpm bench`, plus a budget assertion test that a 100-ship cell tick stays under 4× the
25 ms budget on CI hardware (measured ~0.2 ms on the reference container).
