# STARWEFT — Gameplay Loops & Progression

## 1. The macro loop (the engine of the game)

```
        gather (mine/explore/loot)
              │
              ▼
        refine ──► manufacture ──► trade/haul ──► fit & undock
              ▲                                        │
              │                                        ▼
        salvage/loot  ◄──────────  DESTRUCTION (PvP / PvE / war)
```

Destruction is the demand engine (Pillar P2/P3). Every loop below either feeds material
into the economy, moves it, or removes it. The design goal is that **no loop is closed**:
each profession's output is another profession's input.

## 2. Core loops by profession

### 2.1 Mining (minutes-scale loop)
1. Fit a mining hull (strip extractors, surveyor, cargo weaves).
2. Choose a belt: warded belts are safe/lean; Open belts rich/dangerous.
3. Lock asteroid nodes → run extractor cycles → fill ore hold.
4. Haul to refinery or sell raw. Repeat; belt depletion forces movement.
- **Risk dials:** belt location, escort or not, ore value density vs hold size.
- **Interlocks:** feeds refining; consumes ships/modules (losses to gankers feed combat).

### 2.2 Industry (hours-to-days loop)
1. Acquire blueprint (market seed, invention, or relic recovery).
2. Research it (time + lab slot) for material/time efficiency.
3. Source inputs (own mining, buy orders, contracts).
4. Queue manufacturing job at a station industry bay; pay job fees (lumen sink).
5. Sell output regionally or supply own syndicate's war effort.

### 2.3 Trading & hauling (minutes-to-days)
- Station trading: spread capture on the local book (broker fee + tax are the sinks).
- Arbitrage: regional price deltas, moved by hauler ships through chokepoints.
- Contracts: courier (collateralized), item exchange, auction (see doc 06).
- **Risk dials:** cargo value vs hull tank, route warding, snare chokepoints.

### 2.4 Exploration (minutes-to-hours)
1. Fit scanner probes ("lattice sounders") + analyzer tools.
2. Sound a system → resolve signals (relic caches, data vaults, rifts, hollows).
3. Run the site (hacking mini-loop, defenders, environmental hazards) or sell intel.
- Rift chains into the Deep Weft are the long-form, high-stakes variant.

### 2.5 Combat — PvE (minutes)
- Hunt NPC raiders in belts/anomalies for bounties (faucet, tuned small), salvage, and
  faction standing. Escalation sites lead small groups into harder content.

### 2.6 Combat — PvP (seconds of terror, hours of preparation)
- Solo/small-gang roams in Fringe/Open; snare-and-pounce piracy; ransoms.
- Structured wars: declared syndicate wars (Ward-legal), Claimweave sieges (Open).
- **The kill loop:** intel → interdict (snare) → apply damage under EW → loot/salvage →
  killmail feeds reputation systems.

### 2.7 Territory & politics (weeks-to-months)
- Syndicates take Claimweave anchors in the Open, harvest system bonuses, tax members,
  build station infrastructure, and defend timers against rivals (doc 07).

## 3. Progression: Disciplines

Character power grows by **training Disciplines in real time** (queue-based, offline),
deliberately decoupling power from grinding hours.

- **Structure:** ~14 Discipline trees (Gunnery, Warheads, Engineering, Navigation,
  Shields, Hulls & Armor, Command, Industry, Refining, Science, Trade, Sounding
  [exploration], Drones ["wards"? — canon: **Familiars**], Subterfuge).
- Each Discipline has skills with **Mastery I–V**; training time per level grows
  geometrically (×4–5 per level). Skill points accrue per-second from attributes.
- **Hull/module gating:** ships and modules require specific Masteries. A new player
  flies a fitted frigate on day one; a battleship needs weeks; mastery of everything
  takes years — but **power is capped, breadth is not** (a 5x-year veteran flies more
  things, not uncatchably better things: per-hull advantage of max skills is ≤ ~30–50%
  over minimums).
- **Catch-up/respec:** none needed by design (horizontal growth); losses never remove
  skill points. Death with an un-updated **mindcast backup** (clone analog) can cost a
  small percentage of recent training — a lumen sink and a "keep your backup fresh"
  ritual. (Post-MVP; MVP has no skill loss.)

### Why time-based training (decision record)
- Removes grind treadmill; keeps veterans and newbies in the same spaces (P1).
- Makes character identity persistent and tradable-in-blood (loss aversion → P3).
- Risk: "calendar gating" frustration → mitigated by flat power ceiling per hull class
  and strong day-one frigate viability.

## 4. Reputation systems

- **Faction standing** (per NPC power): unlocks agents, refining rates, Warden tolerance.
- **Warden status ("lawfulness")**: criminal acts in the Ward set temporary outlaw flags;
  chronic piracy lowers lawfulness until Warden space shoots on sight (the pirate's badge
  of honor and cost of doing business).
- **Killboard/renown** (opt-in public telemetry): social capital, mercenary résumés.

## 5. Risk/reward matrix (tuning targets)

| Activity | Location | LM/hour index | Loss exposure |
|---|---|---|---|
| Belt mining | Ward | 1.0 (baseline) | minimal |
| Belt mining | Open (sov) | 3–4× | fleet-wipe possible |
| Agent tasks | Ward | 1.2× | minimal |
| Anomaly ratting | Open | 3× | roamers |
| Relic running | Deep Weft | 6–10× (variance) | total |
| Hauling contracts | cross-Reach | scales w/ collateral | snare camps |
| Piracy/ransom | Fringe | victim-funded | ship + lawfulness |

## 6. Session design

- **15-minute session:** update market orders, start industry jobs, train queue, one belt
  clear. Everything queue-like must be manageable quickly (UI requirement, doc 11).
- **2-hour session:** roam, mining op, exploration chain, small siege.
- **Weekend op:** capital movement, Claimweave campaign, trade empire rebalance.

## 7. New player on-ramp (first 10 hours)

1. Guided undock: movement, arcing, threading, docking (20 min, skippable).
2. Career arcs (combat/industry/exploration/trade) — each ends with a fitted ship and a
   pointer to a player syndicate recruitment channel.
3. Starter systems are Warded 0.9–1.0 with tuned agent income; the **graduation moment**
   is designed to be joining a syndicate and moving to the Fringe.
- KPI: first player-made ship purchase < 3 hours; first syndicate < 20 hours.
