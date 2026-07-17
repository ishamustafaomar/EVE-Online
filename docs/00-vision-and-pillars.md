# STARWEFT — Vision & Design Pillars

> *The threads that bind the dark.*

STARWEFT is a single-shard, sandbox space MMO. Thousands of players share one persistent
universe — **the Reach** — where the economy, politics, territory, and history are produced
by player action, not by scripted content. It is inspired by the design principles of the
classic sandbox space MMO genre (player-driven economies, one shared world, consequence-heavy
PvP) while being an entirely original work: original universe, lore, factions, ship roster,
terminology, visual identity, UI, and code.

## 1. Product definition

| Attribute | Decision |
|---|---|
| Genre | Sandbox space MMO (economy / territory / combat simulation) |
| World model | Single shard, ~5,000 star systems, persistent |
| Session model | Client connects to authoritative simulation; nothing is client-trusted |
| Monetization (design target) | Subscription + optional cosmetic; **no pay-for-power** |
| Platform | PC first (custom client); information-dense UI |
| Camera/feel | Tactical, third-person ship view + map/overview-driven play |
| Time | Real-time simulation, 4 Hz authoritative tick per solar system |

## 2. Design pillars

Every feature must serve at least one pillar. A feature that violates a pillar is cut,
no matter how attractive.

### P1 — One world, one history
A single shard. No instanced "safe copies" of the universe. When a syndicate loses its
home station, everyone in the Reach can fly to the wreck. Player actions produce
irreversible, shared history.

### P2 — The economy is the game
Virtually every item in space — ships, modules, ammunition, stations — is built by players
from resources gathered by players, moved by players, and sold by players. Prices are
emergent from order books, never set by the server. Destruction (PvP/PvE losses) is the
economy's demand engine. NPCs participate in the economy at the margins; they never
dominate it.

### P3 — Risk is priced in
Reward scales with danger. Warded space is safe-ish and poor; the Open Weft is lawless
and rich. Insurance, killrights, bounties, and war declarations make risk legible and
tradable. Loss is real: destroyed ships are gone (partial loot drops), which makes
victory meaningful and industry perpetual.

### P4 — Depth over reflexes
Combat is won by preparation: fitting choices, positioning, target selection, energy
management, fleet composition. Time-to-kill is long enough for decisions to matter.
No twitch aiming; tracking, signature, range, and falloff mathematics decide hits.

### P5 — Emergence over content
We build systems, tools, and incentives; players build the stories. Espionage, market
manipulation, mercenary contracts, and betrayal are legitimate play, bounded by
server-enforceable rules (no RMT, no harassment, no exploits) rather than by design fiat.

### P6 — Respect the player's intelligence
Information-dense UI, full market data, public killboards (opt-in telemetry), a real
manual. We do not hide the math. Accessibility and keyboard-driven efficiency are
first-class.

## 3. Anti-goals

- **Not** a theme-park MMO: no quest-hub progression as the primary loop (agent missions
  exist as an on-ramp and a lumen faucet, nothing more).
- **Not** a twitch shooter: no client-side hit registration, ever.
- **Not** a replica: no copied names, lore, artwork, maps, or text from any existing game.
- **Not** pay-to-win: no purchasable ships/modules/skill advantages for real money.

## 4. The player fantasy matrix

| Archetype | Fantasy | Primary systems |
|---|---|---|
| Industrialist | "My factories arm a war." | Mining, refining, blueprints, manufacturing |
| Trader | "I move markets." | Regional order books, hauling, contracts, arbitrage |
| Explorer | "I find what no one has." | Scanning, rifts, relic/data sites, hidden sectors |
| Fleet commander | "I win wars with doctrine." | Fleet tools, territory (Claimweave), diplomacy |
| Pirate | "The fringe belongs to me." | Snares, gate camps, ransom, bounty system |
| Spy | "I ended a war with one document." | Syndicate roles/permissions, intel tools, open social design |
| Solo wanderer | "Self-sufficient in the dark." | Rift space, cloak-analog (veil), day-one viability |

## 5. Success criteria (design-level)

1. **Economic health:** ≥90% of hulls destroyed per month were player-manufactured.
2. **Emergence:** territory map changes hands measurably each month without dev events.
3. **On-ramp:** a new player can earn their first fitted cruiser inside 10 hours of play.
4. **Depth:** median veteran session includes ≥3 distinct systems (e.g., market + fleet + industry).
5. **Fairness:** zero known client-authority exploits; all economy mutations audit-logged.

## 6. Document map

| Doc | Contents |
|---|---|
| `01-universe-and-lore.md` | Original IP bible: history, factions, naming, glossary |
| `02-gameplay-loops-and-progression.md` | Core loops, Disciplines (skills), risk/reward |
| `03-universe-generation-spec.md` | Procedural galaxy: regions, systems, rifts |
| `04-ships-fitting-modules.md` | Ship roster, fitting engine, module catalog |
| `05-combat-spec.md` | Hit model, flux (energy), EW, fleet combat |
| `06-economy-industry-spec.md` | Markets, manufacturing, contracts, insurance, sinks/faucets |
| `07-social-territory-diplomacy.md` | Syndicates, Compacts, Claimweave (sovereignty), war |
| `08-exploration-and-ai.md` | Scanning, rifts, encounters; NPC behavior architecture |
| `09-backend-architecture.md` | Services, persistence, scaling, telemetry |
| `10-networking-protocol.md` | Protocol, replication, interest management |
| `11-ui-ux-architecture.md` | UI shell, overview, accessibility, shortcuts |
| `12-security-and-anticheat.md` | Server authority, validation, rate limits, economy audit |
| `13-performance-budgets.md` | Tick, bandwidth, memory, rendering budgets |
| `14-content-pipeline-and-testing.md` | Data-driven content, validation, test strategy |
| `15-roadmap-and-dependencies.md` | Dependency graph, milestones, what is built today |
