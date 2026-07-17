# STARWEFT — Ships, Fitting & Modules

All hulls, modules, and stats are original STARWEFT content, defined as data
(`packages/core/src/content/`) and consumed by the fitting engine
(`packages/core/src/fitting/`).

## 1. Hull attribute model

Every hull defines:

| Attribute | Unit | Notes |
|---|---|---|
| mass | t | inertia, arc spool time, rift mass budgets |
| volume / cargo | m³ | hold size; ore hold on mining hulls |
| power | MW | fitting budget 1 |
| compute | TF | fitting budget 2 |
| flux capacity / recharge | GJ / s | energy pool (doc 05) |
| shield / armor / hull HP | HP | three defense layers |
| base resistances | % ×4 dmg types | per layer |
| max velocity / agility | m/s / rad-s | sublight movement |
| lock range / sensor strength | km / pt | targeting & EW interaction |
| signature profile | m | incoming tracking/warhead math |
| slots | H/A/C + W | Hardpoints / Auxiliary / Core + Weave |
| familiar bay / bandwidth | m³ / Mb | drone-analog capacity |
| discipline requirements | — | gating (doc 02) |

**Slot taxonomy (canon):**
- **Hardpoints (H):** weapons, extractors, sounders — the "what you project" row.
- **Auxiliary (A):** active defense & tactics — shield ops, EW, snares, propulsion.
- **Core (C):** passive/engineering — armor plates, damage rigs' active cousins,
  flux relays, cargo optimizers.
- **Weave (W):** permanent hull mods (destroyed on removal); specialization.

## 2. Ship roster (MVP: 19 hulls, all original)

| Class | Accord | Combine | Covenant | Freeholds |
|---|---|---|---|---|
| Frigate (combat) | **Verge** — ion skirmisher | — | **Brand** — thermal brawler | **Harrier** — kinetic hit&run |
| Frigate (scout) | **Plumb** — fast sounder/tackle | — | — | **Zephyr** — interceptor-leaning |
| Frigate (mining) | — | **Mattock** — entry extractor | — | — |
| Frigate (exploration) | **Astrolabe** — sounding bonus, veil-capable | — | — | — |
| Destroyer | **Palisade** — anti-frigate gunline | — | **Pyre** — salvo alpha | — |
| Cruiser (combat) | **Meridian** — shield/ion line | **Assay** — armor/familiar | **Litany** — armor/thermal | **Gale** — kinetic skirmish |
| Cruiser (logistics) | — | — | **Alms** — remote armor mender | — |
| Barge (mining) | — | **Seam** — strip extractor platform | — | — |
| Hauler | — | **Sumpter** — bulk industrial | — | — |
| Battleship | **Quadrant** — fleet anchor | **Underwriter** — armor bulwark | **Sermon** — siege thermal | — |
| Carrier (post-MVP) | — | — | — | **Aviary** — familiar carrier |

Canonical stats live in `content/hulls.ts`; the table shows the roster's faction spread.

Roster rules:
- Every profession has a day-one frigate (P6, on-ramp).
- Each faction's line expresses its doctrine (doc 01 §2) via bonuses, e.g. *Verge:*
  +5% ion turret damage and +7.5% shield resist amount per Frigate Mastery level.
- Post-MVP waves add: interdictors, veilships (covert), command ships, capitals
  (carrier **Aviary**, industrial capital **Foundry**), T2 specializations via invention.

## 3. Fitting engine (implemented)

Deterministic pipeline producing **derived stats** from hull + modules + disciplines:

1. **Legality pass:** slot counts, weave capacity, one-per-group limits, discipline
   requirements, power/compute budget sums. Hard errors block undock (server-enforced).
2. **Modifier pass:** modules contribute typed modifiers
   (`add`, `mul`, `post-mul`) to named stats. **Interference falloff** (stacking
   penalty analog): same-stat `mul` modifiers beyond the first are damped by
   `exp(-(i/2.22)²)` ordering strongest-first — prevents degenerate single-stat stacking
   while keeping 2–3 module fits attractive.
3. **Output:** immutable `FittedShip` snapshot: EHP by damage type, DPS by weapon group,
   flux stability %, speed/agility, lock parameters, cargo, mining yield/cycle.

The same code runs in client (preview) and server (authority) — one implementation in
`@starweft/core`, no drift.

## 4. Module catalog (MVP groups; all original names)

| Group | Slot | Examples (tiers I/II by meta) |
|---|---|---|
| Mass drivers (kinetic turret) | H | *Slugthrower I*, *Railspike I* |
| Beam lances (thermal turret) | H | *Ember Lance I*, *Focus Lance I* |
| Ion projectors (ion turret) | H | *Arc Projector I* |
| Warhead racks (breach launcher) | H | *Javelin Rack I*, *Torch Rack I* |
| Strip extractors (mining) | H | *Burrower I*, *Seamcutter I* |
| Lattice sounders (probes) | H | *Sounder Array I* |
| Shield ops | A | *Aegis Pulser I* (active regen), *Bulwark Extender I* |
| Armor ops | C(active in A) | *Patchweld Mender I*, *Plating: Ferrite Wrap I* |
| Propulsion | A | *Afterplume I* (MWD-analog), *Coilburner I* (AB-analog) |
| EW | A | *Static Ghost I* (sensor jam), *Beacon Lace I* (painter), *Drag Anchor I* (stasis), **Snare** *Threadlock I* (arc inhibitor) |
| Veil | A | *Duskveil I* (stealth field; breaks on aggression, spool penalty) |
| Flux systems | C | *Flux Relay I*, *Flux Battery I* |
| Cargo/industry | C | *Hold Optimizer I*, *Surveyor Lens I* |
| Familiars (drones) | bay | *Wisp* (light), *Talon* (medium), *Mule* (mining), *Salve* (repair) |
| Weaves | W | *Kinetic Lattice Weave*, *Extraction Weave*, *Range Weave* |

Ammunition: mass drivers and warhead racks consume manufactured munitions (economy
demand); beams/ion consume flux only (higher flux pressure instead).

## 5. Ship lifecycle

Assembled ship = hull item + fitted modules + cargo, existing either **docked**
(hangar, repackageable) or **in space** (entity in a system cell). Destruction rolls
per-item drop (50% survive as loot in a wreck container; hull never survives), feeding
the salvage loop. Insurance (doc 06 §7) pays mineral-basis value. Everything is
server-side inventory transactions (doc 12).

## 6. Balance framework

- Spreadsheet-free: balance harness in `tools/` runs fitting engine over all hulls ×
  reference fits and emits DPS/EHP/speed envelopes per class; CI fails if a hull exits
  its class envelope (e.g., frigate EHP band 1.2k–4k, cruiser 8k–25k).
- Rock-paper-scissors targets: tracking vs signature makes big guns miss small ships;
  speed beats alpha; EW beats logistics chains; snares beat speed. Every dominant
  strategy must have a fielded counter at equal cost tier.
