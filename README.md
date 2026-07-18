# STARWEFT

> *The threads that bind the dark.*

STARWEFT is an original, production-track **sandbox space MMO**: one persistent
universe of a thousand-plus star systems where the economy, territory, and history are
made by players — mining, manufacturing, trading, exploring, and fighting over a
player-driven market. It is inspired by the *design principles* of the classic
sandbox space MMO genre while being an entirely original work: original lore, factions,
ships, modules, terminology, mechanics, and code.

## What exists right now (Milestone A — "The Spine")

**A complete design & technical plan** in [`docs/`](docs/00-vision-and-pillars.md)
(16 documents: vision, lore bible, gameplay loops, procedural universe, ships/fitting,
combat, economy/industry, social/territory, exploration/AI, backend, networking, UI,
security, performance, content pipeline, testing, roadmap), plus **a working,
tested foundation**:

- **`@starweft/core`** — deterministic domain engine: seeded RNG streams, procedural
  universe generator (1,000+ systems, weftline graph, warding bands, Deep Weft),
  original content pack (19 hulls, 45 modules, 8 ores → 8 minerals, munitions,
  blueprints, 14 disciplines), fitting engine (power/compute budgets, interference
  falloff), combat resolution (tracking, resists, flux, EW), a conservation-audited
  ledger + regional order-book market, refining and manufacturing.
- **`@starweft/protocol`** — versioned message catalog with strict runtime validation.
- **`@starweft/server`** — authoritative server: WebSocket gateway (HMAC sessions,
  token-bucket rate limits, full command validation), 4 Hz per-system simulation
  cells (movement, arc drive, weftline travel, mining, combat, wrecks/loot),
  market/industry services, interest-managed replication, snapshot persistence
  (PostgreSQL mapping in `docs/sql/schema.sql`).
- **`@starweft/client-sdk`** — typed client used by the integration tests, load bots,
  and the future game UI.
- **`@starweft/cli`** — a terminal client you can actually play with today: `pnpm play`.

The integration suite drives the real loop over real sockets: **login → refit →
undock → arc to a belt → mine → dock → refine → manufacture munitions → trade on the
market (player↔player and NPC blueprint vendor) → fight → wreck → loot → respawn →
thread to a neighboring system** — with lumen/item conservation audited at the end.

## Play it now

```bash
pnpm install
pnpm play                          # hosts a local universe (or joins one already running) and drops you into a REPL
pnpm play -- --name "Your Name"    # pick a pilot name; reconnecting under the same name resumes that character
```

The first `pnpm play` on a machine hosts a fresh universe right there (state is saved to
`.starweft-data/` and resumes automatically next time). Run `pnpm play` again from a
**second terminal** with a different `--name` to join the same universe as another
pilot — fly to the same belt, trade with each other, or fight. The terminal hosting the
server prints a note when it's the host; closing that one ends the session for everyone
until the next `pnpm play` re-hosts from the saved state.

Once connected, type `help` for the full command list. A first session looks like:

```
> look                 # see beacons and nearby entities
> fit mining           # swap into the starter mining hull (Mattock)
> undock
> goto b11              # arc or burn toward a beacon — picked automatically by range
> mine 1 3              # extractor in hardpoint 1, targeting entity #3
> goto b9
> dock b9
> unload ore.regolite 1000
> refine ore.regolite 1000
> build bp.ammo.ferro-slug 1
```

Beacons are referenced as `b1`, `b2`, … from the last `look`; ships/asteroids/wrecks are
bare numbers. `market <typeId>`, `buy`/`sell`/`cancel`, `who`/`say`/`tell`, and combat
(`lock`/`fire`/`activate`) all work the same way — see `help` in-session for the rest.

## Quickstart (development)

```bash
pnpm install
pnpm test               # build + full test suite (unit, property, golden, integration, perf)
pnpm validate:content   # content pack + universe validation gates
pnpm check:determinism  # no ambient time/randomness in rule code
pnpm bench              # hot-path micro-benchmarks

# run a standalone dev server (test universe, ws://localhost:8777)
node packages/server/dist/main.js
```

## Repository layout

```
docs/                 design & technical plan (start at 00-vision-and-pillars.md)
docs/sql/schema.sql   PostgreSQL system-of-record mapping
packages/core         deterministic domain engine (rules, content, universe)
packages/protocol     wire protocol v1 + validators
packages/server       authoritative server (gateway, cells, services, persistence)
packages/client-sdk   typed client (tests, bots, future UI)
packages/cli          terminal client — `pnpm play`
tools/                determinism gate
```

## Design pillars (the short version)

1. **One world, one history** — a single shard; actions are irreversible and shared.
2. **The economy is the game** — players build ~everything; prices emerge from books.
3. **Risk is priced in** — reward scales with danger; loss is real; insurance exists.
4. **Depth over reflexes** — fitting, positioning, and energy management win fights.
5. **Emergence over content** — we ship systems and incentives; players write the stories.
6. **Respect the player's intelligence** — dense UI, open data, visible math.

See [`docs/15-roadmap-and-dependencies.md`](docs/15-roadmap-and-dependencies.md) for
the dependency graph, milestone plan (B: living market · C: consequences · D: client ·
E: empires), and the honest status ledger of what is designed vs implemented vs tested.

## Originality

STARWEFT is genre-inspired but original-everything: no copied names, lore, artwork,
maps, text, or code from any existing game. CI enforces a reserved-term screen on all
content names (`packages/core/src/content/registry.ts`).
