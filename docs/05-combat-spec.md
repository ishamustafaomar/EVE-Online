# STARWEFT — Combat Specification

Tactical, server-authoritative, real-time combat resolved on the 4 Hz system-cell tick.
No client hit registration; the client renders outcomes and predicts cosmetically.

## 1. Defense model

Three layers, each with HP and a 4-channel resistance profile (Kinetic/Thermal/Ion/Breach):

```
incoming damage → shield → armor → hull → destruction
```

- Damage applies to the outermost non-empty layer; overflow cascades within the same hit.
- Effective damage per layer = raw × (1 − resist[type]) (resists capped at 85%).
- **Shields** self-recharge (rate = capacity / rechargeTime, applied per tick; peak-curve
  variant is a post-MVP tuning option). **Armor/hull** only repair via modules/familiars.
- EHP (shown by fitting tool) = Σ layer HP / (1 − weighted resist).

## 2. Turret hit model (tracking vs signature)

For each turret volley (deterministic PRNG stream per firing entity):

```
angularFactor = clamp01( turretTracking / (targetAngularVelocity_mrad + ε) )
rangeFactor   = 1                                if d ≤ optimal
              = exp( −((d − optimal)/attenuation)² )  if d > optimal   ("attenuation band")
sizeFactor    = clamp01( targetSignature / weaponCaliberSig )
hitQuality    = angularFactor × rangeFactor × sizeFactor
```

- Roll `r ∈ [0,1)`: miss if `r > hitQuality`; else damage = base × (0.5 + hitQuality/2)
  with a 2% chance of a **rake** (crit ×1.5) when hitQuality > 0.9.
- Consequences (by design): big guns can't track frigates orbiting close & fast; range
  control is a skill; signature-reducing fits blunt alpha strikes.

## 3. Warheads (launchers)

Warheads are projectiles with travel time (server-simulated, `speed`, `maxFlight`):
damage on arrival scaled by `min(1, targetSig / blastRadius) × velocityFactor` —
fast/small ships mitigate; painted (Beacon Lace) targets take full damage. Ammunition is
a consumable item (economy demand).

## 4. Flux (energy) model

- Pool `flux ∈ [0, capacity]`; regen per tick = capacity / rechargeTime (linear MVP;
  documented option to move to peak-curve).
- Every active module declares `fluxPerCycle` and `cycleTime`. Activation reserves the
  cost at cycle start; insufficient flux ⇒ module fails to cycle (deterministic, no
  partial cycles).
- **Ion weapons and EW attack flux/locks**, creating an energy-warfare layer: *Arc
  Projector* deals Ion damage + drains target flux fraction; flux-starved ships lose
  active defenses. Balance rule: flux warfare strong vs active tanks, weak vs passive.

## 5. Electronic warfare (all original systems)

| Module | Effect (server-enforced) | Counter |
|---|---|---|
| **Threadlock** (snare) | Blocks arc-drive spool + weftline threading within field | range control, *Anchorburn* stabilizer weave |
| **Drag Anchor** (stasis) | −50%+ max velocity, stacked with falloff | speed fits, kill the tackler |
| **Static Ghost** (jammer) | Chance/cycle = jammerStr/sensorStr to break all locks | sensor backup arrays, ECCM lens |
| **Beacon Lace** (painter) | +signature (helps big guns & warheads) | dispersion weave |
| **Duskveil** (veil) | Untargetable + invisible on grid; breaks on any aggression, lock, or proximity < 2 km; −spool penalty after decloak | proximity sweeps, sounder-assisted decloak, patience |

EW resolution is deterministic per tick from seeded streams (replayable; anti-cheat
auditable, doc 12).

## 6. Familiars (drone analog)

Semi-autonomous small craft launched from a familiar bay, limited by bandwidth (Mb).
Types: *Wisp* (light attack), *Talon* (medium), *Mule* (mining), *Salve* (remote repair).
Server simulates them as entities with simple orders (attack/return/guard). They are
items (manufactured, lootable) — losing familiars costs lumens.

## 7. Movement & tactical space

- Newtonian-lite: acceleration toward commanded vector, capped speed, agility as inertia;
  orbit / keep-at-range / approach are server-side movement orders (client sends intent).
- **Arc drive** (in-system FTL): choose destination beacon/celestial ≥ 150 km away,
  spool (align + mass-based delay), then non-interactable transit; blocked by Threadlock.
- Grid model: entities within ~250 km share a tactical grid (interest set; doc 10).

## 8. Fleet combat

- Fleet object: hierarchy (fleet → wings → squads), leader roles, broadcast targets,
  watchlists (UI, doc 11).
- **Formations (post-MVP):** squad-level station-keeping presets (screen, ball, line)
  that trade signature/tracking profiles — bonuses only while keeping station.
- Command hulls project **Doctrine Auras** (fleet-wide % modifiers, one aura class per
  fleet) — original take on command bursts, no stacking.
- Target cap per ship (locked targets), server-enforced; alpha-strike coordination is a
  player skill, not an aim skill.

## 9. Death, loot, and consequence

- Destruction emits: wreck container (≈50% of fitted modules/cargo by per-item roll),
  killmail record (opt-in public), insurance payout (doc 06), lawfulness/killright
  consequences in Warded space (doc 07 §war/crimewatch).
- Pod analog: the **mindcast shuttle** auto-ejects; killing it is possible (Open/Fringe)
  and forces respawn at home station clone bay. MVP: instant respawn at home station,
  no skill loss.

## 10. Implemented today (Milestone A)

`packages/core/src/combat/`: layered damage with resists & cascade, turret hit model,
warhead travel & signature mitigation, flux pool & module cycling, and
snare/stasis/painter/jam effects — deterministic seeded resolution under unit test
(replays are bit-identical). The server integration suite exercises the full loop
live: two fitted frigates fight over WebSockets until wreck, loot, and respawn.
