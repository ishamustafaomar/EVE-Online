# STARWEFT — Exploration & NPC AI

## 1. Exploration

### 1.1 Sounding (scanning)
- Every system carries **signals**: rifts, relic caches, data vaults, ore hollows,
  combat anomalies, and (rarely) **Loom fragments** (lore-bearing uniques).
- Combat anomalies are free-to-see (system menu); everything else must be **sounded**:
  launch sounder probes (H-slot *Sounder Array*), position 4+ probes, iterate
  triangulation. Signal strength vs probe strength ⇒ deviation radius shrinks per pass;
  resolve to 100% to get an arc-able beacon.
- Design intent: a skill-expressive minigame (probe placement efficiency), faster with
  Sounding Masteries and *Astrolabe*-line hulls, never pure RNG.
- **Directional sweep:** short-range instant scanner (cone/range) for hunting ships —
  the PvP intel tool; veiled ships don't appear.

### 1.2 Site types

| Site | Loop | Reward |
|---|---|---|
| Relic cache | hazard puzzle (grapple mini-loop) + Choir ambush chance | salvage materials, weave BPCs, Loom fragments |
| Data vault | lattice-breach minigame (node-graph hack; original ruleset: breach nodes with limited charge, firewalls regenerate) | blueprint copies, invention artifacts |
| Ore hollow | hidden rich belt | high-tier ores |
| Combat anomaly | staged NPC defenders, escalation chance | bounties, faction modules |
| Rift | ephemeral thread (mass+time budget shown on approach) | access: Deep Weft / cross-Reach shortcuts |

### 1.3 Rifts & the Deep Weft
- Rifts spawn/collapse on a server scheduler (doc 03 §3); attributes: endpoint class,
  total mass budget, per-ship mass cap, lifetime. Collapsing a rift behind you is a
  tactic (mass it out).
- Deep Weft systems: no weftlines, no presence lists in local chat, no NPC stations —
  the paranoia sandbox. Richest sites; Hollow Choir density highest. Player structures
  (post-MVP) make living there possible.

## 2. NPC AI architecture

### 2.1 Design goals
NPCs are **economic and ecological actors**, not spawned loot piñatas: they have
somewhere to be, something they want, and assets that persist for their (short) lives.
Sophistication comes from **utility-driven behavior selection over real game verbs**
(the same verbs players use), not from scripted encounters.

### 2.2 Behavior stack (per NPC entity or squad "cell")

1. **Role archetype** (content data): pirate skirmisher, pirate extortionist, hauler,
   miner, patrol commander, Choir ritualist, Unbound harvester…
2. **Utility layer:** periodic scoring of candidate goals (hunt, flee, mine, haul,
   extort, regroup, loot) from perception (grid contents, own HP/flux, fleet state,
   bounty of visible targets, cargo value carried).
3. **Tactic layer (behavior trees per goal):** e.g. *hunt* → pick target by threat
   matrix → dictate range band by fit archetype (brawler holds 2 km orbit; sniper holds
   attenuation edge) → manage flux (shut off tank below reserve threshold) → EW focus
   fire calls in squads.
4. **Verb layer:** the same server commands players issue (move orders, module
   activation, market/hangar ops for economic NPCs). This guarantees NPCs can't cheat
   physics and keeps one code path (doc 12).

### 2.3 Economic NPCs
- Faction miners mine real asteroids; haulers move real cargo along weftlines (killable,
  lootable — piracy against NPCs is a real income stream with lawfulness consequences in
  Warded space); traders maintain small, price-bounded market orders (≤10% book volume).
- Pirate factions (Rustflag) run **protection economics**: they demand tribute
  (ransom offer protocol — pay X lumens or fight) before committing, weighted by
  target's apparent value and their squad strength. Paying actually buys a temporary
  local truce flag from that cell. Emergent reputation: repeated payers get farmed;
  fighters get avoided.

### 2.4 Military & escalation
- Warden response fleets: warding-scaled strength/arrival time; they use the EW/logistics
  verbs properly (jam the biggest gun, mend the primary).
- **Dynamic pressure:** pirate activity concentrates where player traffic is thin and
  ore is rich (server-level director redistributes spawn budget weekly) — the frontier
  pushes back, quiet space rots into danger, and player policing has visible effect.

### 2.5 Performance envelope
NPC cells budgeted per system (doc 13): utility scoring at 1 Hz staggered, tactic ticks
at sim rate only when on-grid with players; off-grid economic NPCs simulate abstractly
(timetable simulation — position interpolation on routes, no physics).

## 3. Implemented today (Milestone A)

Runtime anomaly/rift scheduling, sounding, and the full utility stack are Milestone B–C
(doc 15). Milestone A ships the deterministic foundations they depend on: seeded PRNG
streams, entity/command model, belts with finite ore, and NPC-usable server verbs
(move/orbit/activate/dock/trade are all ordinary validated commands with no
player-only assumptions).
