# STARWEFT — Universe & Lore Bible

All names, history, and terminology in this document are original to STARWEFT.

## 1. Cosmology: the Weft

Faster-than-light travel in STARWEFT is not free flight. Millennia ago, an engineering
culture remembered only as the **Loomwrights** seeded self-replicating machines — the
**Looms** — that spin stable spacetime filaments between stars. These filaments are
**weftlines**: permanent, mapped threads a ship can ride between adjacent systems
("**threading**" a weftline). The network of weftlines is called **the Weft**; the
inhabited lattice of ~5,000 systems is **the Reach**.

Within a solar system, ships travel using the **arc drive** ("arcing"): a short-lived
micro-thread a ship spins for itself between two points in the same gravity well. Arcing
requires spool-up, can be blocked by **snare** fields, and is the heart of tactical play.

Unstable, short-lived threads occur naturally: **rifts**. Rifts open and collapse on
their own, connect arbitrary systems, and are the only way into the **Deep Weft** —
uncharted systems with no permanent weftlines, rich and lethal.

### The Severance

Human civilization entered the Reach through a single colossal thread from their origin
space. Roughly 3,000 years ago that thread — and most of the original network — collapsed
in an event called the **Severance**. Records burned with it. The survivors rebuilt from
station fragments and half-understood Loom technology. Nobody knows whether the
Severance was an accident, an attack, or a harvest. Finding out is the deepest vein of
exploration content.

## 2. The four powers

### The Meridian Accord ("the Accord")
- **Society:** technocratic republic governed by the Chart — an elected council of
  navigator-scholars. Custodians of the **Great Loom Archive**, the largest surviving
  body of pre-Severance knowledge.
- **Identity:** order, measurement, stewardship. Polished, pale-hulled ships with long
  clean lines. They charter the **Wardens**, the police force of high-security space.
- **Ship naming theme:** instruments of navigation and measure — *Astrolabe, Sextant,
  Plumb, Meridian, Verge, Quadrant*.
- **Doctrine:** disciplined shield/ion fleets, superior sensors and logistics.

### The Veyra Combine ("the Combine")
- **Society:** corporate megastate: thousands of chartered guilds beneath the Board of
  Assay. Everything is a contract; citizenship is a share.
- **Identity:** extraction, industry, commerce. Massive gantry-hulled ships in ochre and
  bronze. They run the Reach's largest markets and shipyards.
- **Ship naming theme:** mining, metallurgy, and commerce — *Assay, Seam, Ingot,
  Bullion, Underwriter, Ledger*.
- **Doctrine:** armored brawlers, drone swarms, industrial superiority.

### The Ashfall Covenant ("the Covenant")
- **Society:** militant faith born on Cindral, a colony world burned to glass in the
  chaos after the Severance. Salvation through salvage: they believe the Weft is a
  wounded, holy thing that must be re-woven by fire and labor.
- **Identity:** ash-grey and ember-orange hulls, cathedral silhouettes, reclaimed
  materials. Zealous, honorable, dangerous.
- **Ship naming theme:** fire and liturgy — *Cinder, Pyre, Brand, Litany, Sermon, Vigil*.
- **Doctrine:** thermal weapons, tough armor, sacrificial tactics, superb salvage.

### The Kessari Freeholds ("the Freeholds")
- **Society:** confederation of frontier stations, clan fleets, and homesteads on the
  Fringe. No capital, no standing government — a web of oaths, moots, and feuds.
- **Identity:** freedom, mobility, self-reliance. Patchwork fast hulls, wind-carved
  iconography.
- **Ship naming theme:** winds and raptors — *Zephyr, Harrier, Gale, Squall, Aviary,
  Sirocco*.
- **Doctrine:** speed, kinetic skirmishing, hit-and-run, superior scouts.

## 3. Outlaw and non-human actors

- **Rustflag Cartel** — pirate confederacy of the Fringe. Protection rackets, snare
  camps, smuggling. Rational, bribable, economically motivated NPCs.
- **The Hollow Choir** — cultists who worship the collapsed threads. Haunt rifts and
  the Deep Weft. Use stolen Loom tech; unpredictable, EW-heavy.
- **The Unbound** — feral self-replicating machine swarms descended from damaged Loom
  tenders. They mine, build, and defend like an economy of their own; they treat ships
  as raw material. The closest thing to an environmental "force of nature."

## 4. Law and space classification

| Band | Warding | Name | Rules |
|---|---|---|---|
| 0.5 – 1.0 | Warded space | "the Ward" | Wardens respond to aggression (response time scales with warding). Non-consensual PvP is punished, not prevented. |
| 0.1 – 0.4 | Fringe space | "the Fringe" | No Warden response; gate/station sentries only. Snares, piracy, smuggling. |
| ≤ 0.0 | Open Weft | "the Open" | No law. Player sovereignty (**Claimweave**) lives here. |
| — | Deep Weft | "the Deep" | Rift-only systems. No local chat presence lists, no stations except player-built. |

**Warding** is the 0.0–1.0 security rating of a system, computed at galaxy generation
from distance to faction capitals (see doc 03).

## 5. Currency, materials, and technology terms

| Term | Meaning |
|---|---|
| **lumen (LM)** | The universal currency, backed by Warden-certified energy credit. |
| **flux** | A ship's spendable energy reservoir (capacitor analog). Regenerates. |
| **Power (MW)** / **Compute (TF)** | The two fitting budgets every hull provides and every module consumes. |
| **weave slots** | Permanent hull modifications (rig analog); destroyed on removal. |
| **veil** | Photonic dispersion field — cloaking-inspired stealth (see doc 05). |
| **snare** | Arc-drive inhibition field — tackle (see doc 05). |
| **Disciplines** | Time-trained skills (see doc 02). |
| **Syndicate / Compact** | Player corporation / alliance of syndicates (see doc 07). |
| **Claimweave** | Territorial sovereignty system in the Open Weft (see doc 07). |

### Raw ores → refined minerals

Original resource chain (names are STARWEFT canon; full data in `packages/core/content`):

| Ore (asteroid) | Found in | Primary yield |
|---|---|---|
| Regolite | everywhere | Ferrite |
| Vanadase | Ward + Fringe | Vanidium |
| Cryolith | Fringe | Cryon |
| Auriphane | Fringe + Open | Aurum filament |
| Nebulite | Open | Nebular ash |
| Voidglass | Open + Deep | Voidglass shard |
| Loomsilt | Deep (rift space) | Threadsteel |
| Emberore | Covenant space anomalies | Emberglass |

Refined minerals feed manufacturing chains (doc 06): **Ferrite, Vanidium, Cryon, Aurum
filament, Nebular ash, Voidglass shard, Threadsteel, Emberglass**.

### Damage types

Four canonical damage channels used by all weapons/resists:
**Kinetic** (mass drivers), **Thermal** (beam/plasma), **Ion** (charge disruption),
**Breach** (warhead/spall). Every defense layer has a resistance profile against each.

## 6. Naming conventions (for generated content)

- **Regions:** evocative two-word or single names: *Lantern Shallows, The Anvil,
  Cindral Reach, Vellum Deep, The Long Quiet.*
- **Systems:** generator combines faction-flavored phoneme banks with catalog codes:
  Accord systems like *Meridia-IV*, Freehold systems like *Kess-Varn*, unclaimed Open
  systems get survey codes like *OW-771-K*.
- **Stations:** `<System> <Type> <Ordinal>` plus flavored names for faction hubs
  (*"Assay Prime", "The First Loom", "Pilgrim's Rest"*).
- **NPC ships:** faction prefix + hull (*RFC Rusthawk*, *HC Psalm of Static*).

## 7. Tone & art direction (brief)

- **Palette:** deep-space blacks and blues; each faction owns an accent (Accord
  white/cyan, Combine ochre/bronze, Covenant ash/ember, Freeholds teal/bone).
- **Shape language:** Accord = precision instruments; Combine = industrial gantries;
  Covenant = reliquary cathedrals; Freeholds = patched, winged, fast.
- **Sound:** the Weft "sings" — threading has a signature harmonic; rifts detune it.
- **UI brand:** thin luminous threads, woven-lattice motifs, high information density
  (see doc 11).

## 8. Lore delivery

Lore is ambient and discoverable, never gating: station librarians (NPC dialogue),
relic-site fragments (collectible "Loom fragments" that assemble archive entries),
region descriptions, and item flavor text. The mystery of the Severance is drip-fed
through exploration content and never fully resolved — it is the horizon, not a quest.
