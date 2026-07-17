# STARWEFT — Backend Architecture

## 1. Principles

1. **Single authoritative simulation** per solar system ("system cell"); clients are
   untrusted renderers of server state (doc 12).
2. **Shard by space, not by players:** the natural partition key is the solar system.
   One process hosts many cells; hot systems get dedicated processes/hardware.
3. **Boring, inspectable persistence:** relational core (PostgreSQL) with an append-only
   ledger for every economic mutation; caches are disposable.
4. **Deterministic domain logic** lives in a shared library (`@starweft/core`) — pure,
   testable, identical in tools/tests/server.
5. **Everything speaks the versioned protocol** (doc 10); services are replaceable.

## 2. Service topology (target production layout)

```
                      ┌────────────┐
   client ── wss ───► │  Gateway   │  auth, rate-limit, session, routing
                      └────┬───────┘
        ┌──────────────────┼───────────────────────────────┐
        ▼                  ▼                               ▼
  ┌───────────┐      ┌───────────┐                  ┌────────────┐
  │ World Sim │      │  Market   │                  │   Social   │
  │ (N procs, │      │ (order    │                  │ (chat,     │
  │  cells)   │      │  books)   │                  │ syndicates,│
  └────┬──────┘      └────┬──────┘                  │  fleets)   │
       │                  │                         └────┬───────┘
       ▼                  ▼                              ▼
  ┌─────────────────────────────────────────────────────────────┐
  │ Persistence: PostgreSQL (world, ledger, chars) + Redis cache│
  │ + object store (content packs) + telemetry pipeline         │
  └─────────────────────────────────────────────────────────────┘
  Supporting: Identity/Auth ─ Industry jobs ─ Universe/content ─ Admin/GM ─ Telemetry
```

### Service responsibilities

| Service | Owns | Scale model |
|---|---|---|
| **Gateway** | wss termination, session tokens, per-conn rate limits, protocol validation, routing to cells/services | stateless, horizontal |
| **World Sim** | system cells: entities, movement, combat, mining, grid interest | partitioned by systemId; cell migration for load (hot-system isolation) |
| **Market** | regional order books, matching, escrow (with ledger) | partitioned by regionId; single-writer per book ⇒ no lock contention |
| **Industry** | refining/manufacture/research job queues (time-based) | job scheduler over DB, horizontal workers |
| **Social** | chat, syndicates, fleets, standings, mail | partitioned by channel/org id |
| **Identity** | accounts, characters, Discipline training queue | stateless over DB |
| **Universe** | immutable content packs, rift/anomaly scheduler | read-mostly, cached |
| **Telemetry** | events firehose → warehouse; economy dashboards | append-only |

### Why "cells + services", not "one process" or "microservices everywhere"
- A solar system is a natural consistency boundary: all combat/movement interactions are
  local to it. Cross-cell interactions (threading a weftline, docking transfers) are
  **asynchronous handoffs** — perfect seams for partitioning.
- Market/industry/social have different consistency needs (transactional, not 4 Hz), so
  they are separate services over the same ledger DB rather than living in sim ticks.
- We deliberately avoid fine-grained microservices: few, coarse services with owned data.

## 3. Persistence model

- **PostgreSQL** (system of record):
  - `accounts, characters, disciplines, training_queue`
  - `items` (every stack has owner, location, quantity — one table, one truth),
    `hangars`, `wallets`
  - `ledger` (append-only: every lumen/item mutation with cause + counterparty;
    conservation constraints checked by triggers + async auditors)
  - `orders, trades` (market), `industry_jobs`, `insurance_policies`
  - `syndicates, memberships, roles, standings`
  - `world_state` (per-system mutable: asteroid quantities, wrecks, rift instances) —
    written via periodic cell snapshots + critical-write-through for item-bearing events
- **Redis:** session cache, presence, rate-limit buckets, market ticker cache.
- **Object store:** universe content packs (versioned, checksummed), client patches.
- **Snapshot discipline:** cells snapshot dirty state every 30–60 s + on shutdown;
  *item-bearing* transitions (loot, mining into cargo, trades, docking) write through
  synchronously — positions may rewind seconds on crash; **inventory may never**.

## 4. Consistency rules

- All inventory/wallet mutations go through the **Ledger API** (one code path):
  `transfer(cause, from, to, assets[])` with atomic multi-row transactions.
- Cross-service flows (e.g., loot spawned by sim, claimed to hangar) use
  transactional outbox + idempotent consumers (every mutation carries a UUID;
  replays are no-ops).
- Cell state is authoritative in memory between snapshots; only the owning cell may
  write its `world_state` rows (single-writer everywhere: cells per system, market per
  region — locks become unnecessary by construction).

## 5. Scaling path

| Load | Response |
|---|---|
| Many quiet systems | many cells per process (cheap idle ticks; hibernate empty cells to DB after grace period) |
| One hot battle system | migrate cell to dedicated process/host; **time dilation** analog — *tick stretching*: cell announces reduced sim rate (4→2→1 Hz), keeping fairness under overload (everyone slows equally) |
| Market storms | books are per-region single-writer; queue depth metrics trigger vertical bump; matching is O(log n) per order |
| Login floods | gateway queue + token bucket; login sessions stateless/resumable |

## 6. Telemetry, monitoring, logging

- **Structured logs** (JSON) with correlation IDs: session → command → tick → ledger.
- **Metrics:** tick duration per cell, entities per cell, cmd queue depth, ws backpressure,
  match latency, ledger conservation audits, faucet/sink daily aggregates.
- **Econ warehouse:** trades/production/destruction events streamed for the economy
  dashboard (doc 06 §2) and public API aggregates.
- **Alerting targets:** cell tick p99 > 200 ms, conservation audit failure (page
  immediately — potential dupe exploit), faucet spike anomaly detection.

## 7. Deployment/DevOps

- Containerized services; infrastructure-as-code; blue/green for stateless services;
  cells drain via handoff (system lock → snapshot → new owner) for rolling deploys.
- **Daily downtime is NOT a design assumption** — cell hibernation + rolling deploys
  target continuous operation; a short weekly maintenance window is acceptable ops
  budget, not an architectural crutch.
- Environments: dev (single-process), staging (full topology, small), prod.
- Load testing: headless bot fleets driving the real protocol (client-sdk) — 1k bots
  per test host target; chaos drills: kill a cell host mid-battle, verify inventory
  invariants and reconnect flow.

## 8. Implemented today (Milestone A)

`packages/server` implements the single-process development topology with the
production seams in place: Gateway (ws, auth, rate limit, validation) → World Sim
(system cells on a 4 Hz scheduler) → Market service (regional books) → repositories
behind interfaces (in-memory + JSON snapshot implementations; `docs/sql/schema.sql`
maps them to PostgreSQL). The Ledger API with conservation checks is real and is the
only mutation path used by trade/mining/refit flows. Integration tests boot this
topology end-to-end.
