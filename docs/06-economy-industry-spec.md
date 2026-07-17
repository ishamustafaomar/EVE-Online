# STARWEFT — Economy & Industry Specification

The economy is the game (Pillar P2). This document specifies markets, production,
sinks/faucets, and the audit discipline that keeps them healthy.

## 1. First principles

1. **Player-made everything.** Ships, modules, munitions, structures come from player
   manufacturing. NPC-seeded goods are limited to: starter items, blueprints (originals),
   and Discipline manuals — each a deliberate lumen sink.
2. **Prices are emergent.** The server never sets prices; it hosts order books.
3. **Friction creates professions.** No global market, no teleporting goods. Regional
   books + hauling risk ⇒ trading, logistics, and piracy are all real jobs.
4. **Destruction is demand.** Combat losses recycle the entire chain.
5. **Full-loop auditability.** Every lumen and item mutation goes through one ledger
   API with conservation checks (doc 12).

## 2. Money supply

### Faucets (lumen creation)
- NPC bounties (pirate kills), agent task rewards, Warden insurance subsidy share,
  buyback of a few NPC-demanded goods (tuned small).

### Sinks (lumen destruction)
- Market **broker fee** (listing, ~1–2%) and **transaction tax** (execution, ~2–4%).
- Industry job fees, blueprint originals from NPC libraries, Discipline manuals,
  clone/mindcast services, station service fees, Claimweave upkeep, insurance premiums.

**Health metric:** faucet/sink ratio tracked per day in telemetry; target long-run net
inflation ≈ 0 ± 2%/month. Every faucet and sink is a tagged ledger transaction type, so
the money supply dashboard is a query, not a guess.

## 3. Markets (implemented in Milestone A)

- **Scope:** order books are **regional**; orders are placed *at a station* (delivery
  location) and visible region-wide. Item pickup is at the order's station — hauling
  matters.
- **Order types:** limit buy / limit sell (duration up to 90 days), plus immediate
  fill-or-kill "take" orders against the book. Modify = cancel + relist (new broker fee
  on the delta; anti-spam).
- **Matching:** price-time priority. Crossing orders execute at the **resting order's
  price** (maker price). Partial fills supported; remainder stays listed.
- **Escrow:** buy orders escrow full lumen cost + fees at listing; sell orders escrow
  the items. Cancellation refunds escrow minus broker fee. No naked shorts, no negative
  balances — enforced by the ledger.
- **Fees:** broker fee at listing (sink), transaction tax on the seller at execution
  (sink). Both rates are content-data, modifiable by station owner (player structures,
  post-MVP) within caps.
- **Data feeds:** per-item regional stats (5-min candles: volume, high/low/median) are
  public via API — third-party tooling is embraced (P6), rate-limited (doc 12).

## 4. Industry chain

```
ore ──refine──► minerals ──manufacture(blueprint)──► modules/ships/munitions
        ▲                                                    │
     salvage ◄──────────── wrecks ◄──────────────────────────┘ (destruction)
```

### 4.1 Refining
`yield = baseYield(station) × (1 + refiningMastery×0.02) × oreGrade`, base 70–80%.
Refining consumes station service slot time; waste is deleted (material sink).
Each ore has a mineral vector (doc 01 §5); refining is the only ore→mineral path.

### 4.2 Blueprints & research
- **Originals (BPO):** infinite-run licenses bought from NPC libraries (sink) or, for
  advanced tiers, discovered via exploration/invention.
- **Research:** time-based jobs improving **material efficiency** (ME 0–10, −1%
  inputs/level) and **time efficiency** (TE 0–10, −2% job time/level).
- **Copies (BPC):** limited-run copies for sale/invention — the IP market.
- **Invention (post-MVP):** consume BPC + relic-site artifacts + science Disciplines for
  a probabilistic tier-2 BPC.

### 4.3 Manufacturing
Job = blueprint + inputs × (1 − ME%) + job fee + bay slot time × (1 − TE%).
Output delivered to station hangar. Jobs are station-bound (logistics matters).
Parallel job count gated by Industry Masteries.

## 5. Contracts (spec; Milestone B)

- **Courier:** payer sets cargo, route, reward, **collateral** (hauler posts it; keeps
  reward on delivery, forfeits collateral on failure) — trust made mechanical.
- **Item exchange:** escrowed trade of arbitrary baskets (the OTC market).
- **Auction:** timed, escrowed.
- All contracts route through the same ledger/escrow engine as market orders.

## 6. NPC economic participation (doc 08)

NPC miners/haulers/traders operate *within* player markets (place real orders, move
real goods, get really killed and really drop cargo). They are liquidity dampeners and
world-texture, capped so players out-compete them: NPC volume per book ≤ ~10%.

## 7. Insurance

Premium (lumen sink) buys a policy on a hull: payout = 40% (free tier) to 85% (paid) of
the hull's **mineral-basis value** (rolling regional mineral index — endogenous, not
market-manipulable single-book price). Payout is a faucet; premiums+deductibles net it
near zero. No payout for self-destruct or same-account kills (fraud rules, doc 12).

## 8. Taxes as politics

Syndicate tax (cut of member faucet income), station service fees (player structures),
and Claimweave upkeep make **territory a business**: sovereignty must pay rent, so
empires need industry, which needs miners, which need defense — the social loop closes.

## 9. Tuning levers (all content-data, hot-reloadable)

Ore respawn rates & regional tables · NPC bounty values · fee/tax percentages ·
insurance rates · blueprint costs · job fee formulas · agent reward curves.

## 10. Implemented today (Milestone A)

`packages/core/src/economy/`: regional order books with price-time matching, partial
fills, maker-price execution, escrowed lumens/items, broker fee + transaction tax into
a conservation-checked ledger; property-style tests assert lumen/item conservation
across random order streams. `packages/core/src/industry/`: refining math and
manufacturing jobs with ME/TE, driven by blueprint content data, under test.
The server exposes buy/sell/cancel + hangar/wallet flows end-to-end (integration test:
mine → refine → manufacture → list → cross-trade between two players).
