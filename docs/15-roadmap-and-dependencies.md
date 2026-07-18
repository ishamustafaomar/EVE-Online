# STARWEFT — Roadmap, Dependencies & Current Status

## 1. Dependency graph (what must exist before what)

```
                    ┌──────────────────────────┐
                    │  D0 Deterministic kernel │  PRNG, math, ids, tick model
                    └─────┬────────────────────┘
        ┌─────────────────┼──────────────────────┐
        ▼                 ▼                      ▼
 ┌──────────────┐  ┌──────────────┐      ┌──────────────┐
 │ D1 Content   │  │ D2 Universe  │      │ D3 Protocol  │
 │ (hulls/mods/ │  │  generation  │      │  + gateway   │
 │  ores/BPs)   │  └──────┬───────┘      └──────┬───────┘
 └──────┬───────┘         │                     │
        ▼                 ▼                     ▼
 ┌──────────────┐  ┌─────────────────────────────────┐
 │ D4 Fitting   │  │ D5 World sim cells (movement,   │
 │   engine     │─►│ grid, dock, mining) + persist   │
 └──────┬───────┘  └──────────────┬──────────────────┘
        ▼                         ▼
 ┌──────────────┐        ┌──────────────┐
 │ D6 Combat    │◄───────│ D7 Economy   │ (ledger, market, industry)
 │  resolution  │        │              │
 └──────┬───────┘        └──────┬───────┘
        └───────────┬───────────┘
                    ▼
   D8 Social (chat/syndicates/fleets) → D9 AI/NPCs → D10 Exploration/rifts
                    ▼
   D11 UI client → D12 Territory (Claimweave) / wars / contracts → D13 Capitals+
```

Key insight: **economy and combat both hang off the same kernel + content + sim
spine** — build the spine once, correctly (deterministic, typed, tested), and every
system above is an extension, not a rewrite.

## 2. Milestones

### Milestone A — "The Spine" ✅ (this repository, now)
Design doc set (00–15) + working foundation:
- `@starweft/core`: deterministic kernel (xoshiro128** streams, vec math, ids); universe
  generator (Stages A–G, 1,000+ systems, validation gates as tests); original content
  pack v1 (19 hulls, 45 modules, 8 ores + 8 minerals, munitions, blueprints); fitting
  engine (slots, budgets, interference falloff, derived stats); combat resolver
  (layers/resists, tracking model, flux, EW subset); ledger + regional market engine
  (escrow, fees, price-time matching); industry (refining, manufacturing, ME/TE).
- `@starweft/protocol`: v1 envelope + validators for the implemented verb set, plus a
  devMode-gated `DEV_LOGIN` (create-or-reconnect a character by name — no pre-issued
  token needed; real account/password auth is Milestone B's Identity service).
- `@starweft/server`: gateway (auth, rate limits, validation), 4 Hz system cells
  (movement/arc/thread/dock/lock/modules/mining), market+industry services over the
  ledger, snapshot persistence, system chat.
- `@starweft/client-sdk`: typed client used by integration tests.
- `@starweft/cli`: a real terminal client (`pnpm play`) — auto-hosts a local universe
  or joins one already running (so a second terminal is genuine multiplayer against
  the same world), with a readline REPL covering navigation, mining, fitting,
  industry, markets, combat, and chat. This is a stopgap for Milestone D's UI, not a
  replacement for it — but it means Milestone A is playable today, not just testable.
- Test suite: unit/property/golden/integration + bench + content validation.

### Milestone B — "A Living Market" 
Persistence on PostgreSQL (schema shipped in `docs/sql/`), identity hardening (argon2id,
TOTP), contracts (courier/exchange/auction), insurance, agent tasks (starter faucet),
NPC economic actors v1 (miners/haulers), sounding + anomalies + rifts v1, Discipline
training queue, telemetry pipeline + economy dashboard.

### Milestone C — "Consequences"
Syndicates full roles/hangars/wallets UI-grade APIs, killrights/war decs (Ledger of
Grievances), fleets v2 (hierarchy/broadcasts), NPC combat AI (utility stack), Deep Weft,
familiars, salvage, killmails, lawfulness, Warden response fleets.

### Milestone D — "The Client"
3D client + Threadglass UI shell (doc 11), sound identity, new-player experience,
load-test program (bot fleets), open alpha.

### Milestone E — "Empires"
Claimweave sovereignty, player structures, tick-stretching under load, cell migration,
capitals (Aviary/Foundry), invention/T2, treaties, formations.

## 3. Team-shape note (who owns what)

Creative director: docs 00–02 canon · Systems designer: 02–08 tuning · Gameplay eng:
core+sim · Network eng: protocol+gateway · Backend: services+persistence · Economy
designer: 06 + dashboards · AI eng: 08 · UI/UX: 11 · Security: 12 · DevOps: 09 §7 ·
Performance: 13 · QA: 14. Every doc lists its owner as first reviewer of PRs touching
its domain.

## 4. Status ledger (kept honest)

| System | Designed | Implemented | Tested |
|---|---|---|---|
| Universe generation | ✅ doc 03 | ✅ core/universe | ✅ determinism/connectivity/banding |
| Content pack v1 | ✅ docs 01/04 | ✅ core/content | ✅ validation gates |
| Fitting | ✅ doc 04 | ✅ core/fitting | ✅ unit+legality invariants |
| Combat math | ✅ doc 05 | ✅ core/combat | ✅ unit+determinism |
| Ledger/market | ✅ doc 06 | ✅ core/economy | ✅ conservation properties |
| Industry | ✅ doc 06 | ✅ core/industry | ✅ unit |
| Protocol v1 | ✅ doc 10 | ✅ protocol | ✅ fixture round-trips |
| Server spine | ✅ docs 09/10/12 | ✅ server | ✅ integration flows |
| Client SDK | ✅ docs 10/11 | ✅ client-sdk | ✅ used by integration |
| Terminal client (`pnpm play`) | — (stopgap, not doc 11's Threadglass UI) | ✅ cli | ✅ unit (parser/queue) + manual live playtest |
| Sounding/rifts/AI/UI/sov/contracts | ✅ specs | ⏳ per milestones B–E | — |
