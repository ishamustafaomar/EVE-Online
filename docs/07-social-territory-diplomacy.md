# STARWEFT — Social Structures, Territory & Diplomacy

## 1. Social hierarchy

```
Pilot → Syndicate (player corp) → Compact (alliance) → Coalition (informal, out-of-game)
```

### Syndicates
- Charter (name, ticker, description), founder, **roles & permission bitmask** per
  member: hangar tiers (4 shared hangar divisions), wallet tiers (2), market/industry
  on behalf of syndicate, diplomacy, recruitment, fleet command, structure control.
- Syndicate wallet + tax rate on member NPC faucet income.
- Offices rentable at stations (shared hangars live per-station).
- **Espionage is play:** permissions are the security system; the API never lies, but
  people do. Theft within granted permissions is legal-by-design (P5); exceeding
  authentication (account sharing, hacking) is cheating (doc 12).

### Compacts
- Syndicates under one banner: shared standings ladder, chat, Claimweave rights
  delegation, compact-level diplomacy contacts.

### Standings & diplomacy
- Contact lists with standings (−10…+10) at pilot/syndicate/compact levels drive
  overview coloring, station access on player structures, and Claimweave defense
  targeting. Formal treaties (post-MVP): non-aggression pacts and mutual-defense pacts
  with on-chain-style visible terms and expiry — diplomacy with teeth but breakable
  (betrayal must remain possible; P5).

## 2. Conflict legality (Crimewatch analog: "the Ledger of Grievances")

| Context | Mechanism |
|---|---|
| Warded space aggression | Aggressor flagged **outlaw** (15 min): Wardens respond (strength/time scale with warding), victim + Wardens free to engage. Repeat offenses drop lawfulness rating. |
| **Killrights** | Illegal kill grants victim a killright (30 days): activate to flag the killer attackable; killrights are sellable (bounty-hunter market). |
| **War declarations** | Syndicate pays weekly war fee to render another syndicate legally attackable Reach-wide. Defender can ally. Fee scales with target size; war ends by surrender terms (escrowed) or non-payment. |
| Duels | Mutual-consent flag, no Warden response. |
| Open Weft | No legality layer at all. |

## 3. Territory: the Claimweave (Open Weft sovereignty)

Original mechanic — sovereignty as *woven infrastructure*, designed to reward active use
over passive flag-planting:

- **Loomspike:** anchorable structure at a system's Loom nexus; establishes a claim and
  begins weaving **Weftcloth** (claim integrity, 0–100%).
- **Weftcloth grows with activity indices** (mining volume, NPC clears, industry jobs,
  player kills by claim-holder members in-system) and decays when idle — "use it or
  lose it" is structural, not moderation.
- **System upgrades** unlock at integrity thresholds: ore regeneration boosts, anomaly
  spawners, station rights (player stations, post-MVP), weftline toll rights.
- **Sieges:** attacker runs **Unweavers** (deployables) to contest; contest progress is
  activity-vs-activity (occupancy PvP), culminating in **timed reinforcement windows**
  (defender-chosen timezone window ±, to keep fights schedulable across timezones).
  Destroying a Loomspike drops salvage + opens a 48h anchoring lockout.
- **Upkeep:** weekly lumen upkeep per claimed system (sink), scaling superlinearly with
  empire size — soft cap on blob empires, food for content.

## 4. Shared infrastructure

- **Shared hangars/wallets** with per-role audit logs (theft is visible after the fact —
  drama with receipts).
- **Fleet system:** hierarchy, invites, free-move, broadcasts, fleet warp intent
  (server-mediated arc-drive sync), loot settings. MVP: flat fleet with leader +
  broadcasts; hierarchy in Milestone C.
- **Chat:** system-local (presence list — absent in Deep Weft), region, syndicate,
  compact, fleet, private, and player-created channels with moderator roles. Voice:
  positional metadata hooks + channel tokens exposed for third-party/partner voice
  (voice itself is out of scope; integration API is in scope).

## 5. Anti-toxicity guardrails (systemic, not punitive)

Scams and betrayal are in-bounds; harassment is not. Systemic mitigations: block/mute
that actually removes presence visibility, rate-limited channel creation, new-player
protection (can't be war-decced while in the starter syndicate), reporting pipeline with
transcript evidence (server keeps chat logs per retention policy).

## 6. Implemented today (Milestone A)

Identity, per-character wallets, per-station hangars, and ownership-checked station
services (market/refinery/industry access rules) are implemented server-side. Chat:
system-local channel with presence lists and private DMs run through the gateway.
Syndicate schema is specified in `docs/sql/schema.sql` (organizations, membership,
role bitmasks); the syndicate service, Claimweave, wars, and contracts land in
Milestones B–C per the roadmap (doc 15).
