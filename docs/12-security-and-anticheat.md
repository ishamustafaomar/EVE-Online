# STARWEFT — Security & Anti-Cheat

Threat model first: in a sandbox MMO the crown jewels are **the economy** (dupes,
negative-balance tricks) and **information** (wallhacks on cloaked/off-grid entities).
Aimbots are irrelevant by design (no client aim). Botting and RMT are economic attacks.

## 1. Server authority (the foundation)

- Clients send intents; the server validates **every** precondition on its own state:
  range checks (mining, docking, loot), slot/branch legality (fitting), ownership
  (inventory), flux/cycle legality (modules), spool/mass rules (arc/thread), wallet
  sufficiency (market). A malicious client can request anything; it cannot *cause*
  anything illegal.
- The deterministic domain library (`@starweft/core`) is the single implementation of
  rules; client uses it only for previews. Divergence is impossible-by-construction on
  the server side (client previews can be wrong; authority cannot).
- **No hidden state is ever transmitted** (doc 10 §4): interest filtering server-side;
  veiled/off-grid ships absent from the wire. Memory-scraping a client reveals nothing
  the player couldn't see.

## 2. Economy integrity

- **Single ledger API** for all lumen/item mutations; atomic transactions; append-only
  audit rows with cause codes (trade, loot, mining, insurance, fee…).
- **Conservation auditors:** async jobs re-sum wallets/items vs ledger deltas
  (per-account and global). Any mismatch pages a human and freezes the affected
  accounts' economic verbs pending review (fail-closed on dupes).
- **Idempotency everywhere:** client `seq` + server-side operation UUIDs; retries and
  crash-replays are no-ops (dupe-by-retry is the most common MMO dupe class).
- **Escrow, not promises:** market/contract flows lock assets up front (doc 06 §3);
  there is no code path that "owes" items later.
- Insurance/bounty fraud rules: no payout on self-destruct/same-account/system-flagged
  collusion patterns (heuristics + review queue, never silent auto-ban).

## 3. Gateway hardening

- TLS everywhere; HMAC-signed expiring session tokens (Identity signs; gateway verifies
  statelessly; revocation list in Redis).
- Strict schema validation (`@starweft/protocol`) — unknown type/field ⇒ reject;
  max message size; max in-flight commands per session.
- **Token-bucket rate limits per message class** (movement vs market vs chat have
  different budgets); soft-fail (typed error) → hard-fail (disconnect) → tempban
  escalation, all audit-logged.
- Login: credential auth (argon2id), device/session anomaly heuristics, optional TOTP.

## 4. Bots & RMT

- Design first: time-based Disciplines (no XP grind) and diminishing belt yields lower
  bot value; the biggest RMT lever is making legitimate play efficient.
- Detection: behavioral telemetry (command entropy, session cadence, ledger flow graphs
  — RMT money must move); graph analysis on transfers.
- Response ladder: silent flag → economic quarantine → ban waves (never real-time — keep
  detection features unlearnable).

## 5. Exploit process

- Public responsible-disclosure program with in-game rewards.
- "Exploit notification" policy: using a bug after it is declared exploitative =
  actionable; ledger + command audit trail makes retroactive cleanup feasible
  (rollback by cause-code is a rehearsed runbook, not a fire drill).

## 6. Privacy & abuse

- Chat retention with disclosure policy; report → transcript evidence pipeline.
- GM tooling is itself audited (GM actions are ledger cause-codes; no invisible spawns).

## 7. Implemented today (Milestone A)

Gateway: HMAC session tokens, schema validation on every message, per-class token
buckets, size caps, typed errors. Sim: full server-side precondition validation for
every implemented verb (movement/arc/dock/fit/mine/market/refine/manufacture).
Economy: ledger API with escrowed orders and a conservation test-suite (property-style
random order storms must conserve lumens/items exactly; the integration suite re-audits
after every end-to-end flow). Interest filtering: only grid-visible entities serialize
to the wire (cross-system invisibility asserted by integration test).
