# STARWEFT — Networking & Protocol

## 1. Model

- **Transport:** WebSocket (TLS) MVP — simplifies ops/firewalls and suits a 4 Hz,
  intent-based game (this is not a twitch shooter; P4). Documented upgrade path:
  WebTransport/QUIC datagrams for position streams when profiling demands it.
- **Authority:** clients send **intents** (commands); the server simulates and streams
  **facts** (snapshots/events). The client never reports results — only requests.
- **Encoding:** JSON in protocol v1 (debuggable, schema-validated); envelope is
  encoding-agnostic (`enc` field) with a planned CBOR/binary v2 for position deltas —
  measured before adopted (doc 13 bandwidth budget).

## 2. Envelope & versioning

```
Client→Server: { v: 1, seq: number, t: MsgType, d: payload }
Server→Client: { v: 1, t: MsgType, d: payload, ack?: seq, tick?: number }
```

- `v` — protocol version; negotiated at HELLO; server refuses unknown majors with
  UPGRADE_REQUIRED.
- `seq` — client sequence for command acknowledgement/idempotency; server replies to
  request-like commands with `ack` carrying result or typed error.
- Every message type + payload has a runtime validator in `@starweft/protocol`
  (shared by client and server — one schema, no drift). Unknown fields rejected.

## 3. Message catalog (v1, implemented subset marked ✦)

| Direction | Type | Purpose |
|---|---|---|
| C→S | HELLO ✦ | protocol/version negotiation |
| C→S | LOGIN ✦ | session token presentation |
| C→S | ENTER_WORLD ✦ | spawn character's ship into its cell |
| C→S | MOVE_TO / ORBIT / HOLD ✦ | movement intents |
| C→S | ARC_TO ✦ | in-system arc-drive jump intent |
| C→S | THREAD ✦ | take weftline at terminus |
| C→S | DOCK / UNDOCK ✦ | station transitions |
| C→S | ACTIVATE_MODULE / DEACTIVATE ✦ | module cycling (target optional) |
| C→S | LOCK_TARGET / UNLOCK ✦ | targeting |
| C→S | MINE (via ACTIVATE on extractor) ✦ | mining cycles |
| C→S | FIT_SHIP ✦ | docked refitting |
| C→S | MARKET_PLACE / MARKET_CANCEL / MARKET_TAKE ✦ | order management |
| C→S | HANGAR_MOVE / REFINE / MANUFACTURE ✦ | industry & inventory |
| C→S | CHAT_SEND / CHAT_JOIN ✦ | chat |
| C→S | PING ✦ | RTT/keepalive |
| S→C | WELCOME / ERROR ✦ | session + typed errors |
| S→C | SNAPSHOT ✦ | full grid state on entry |
| S→C | DELTA ✦ | per-tick entity changes in interest set |
| S→C | EVENT ✦ | discrete facts: hits, kills, dock/undock, wrecks, cycles |
| S→C | WALLET / HANGAR / ORDERS ✦ | economic state updates |
| S→C | CHAT_MSG / PRESENCE ✦ | social |
| S→C | TICK_RATE | tick-stretch notification (overload fairness) |

## 4. Replication & interest management

- **Interest set = tactical grid** (entities within grid radius of the observer) plus
  system-level summaries (station list, belt beacons, weftline termini).
- On grid entry: SNAPSHOT (full entities). Per tick: DELTA with only changed fields of
  changed entities (position quantized to 0.1 m, velocities to 0.01 m/s); events
  separately as EVENT messages.
- **Bandwidth strategy (doc 13):** typical grid ≤ 50 entities → ≈ 2–6 KB/s per client
  at 4 Hz JSON; fleet-fight grids activate priority tiers: own ship + locked targets
  full-rate; others decimated to 1 Hz with client-side dead reckoning (cosmetic).
- No entity outside the interest set is ever sent (anti-wallhack; doc 12: veiled ships
  are simply absent from the stream — stealth cannot be client-probed).

## 5. Latency handling

- Intent-based movement (orbit/approach/arc) tolerates 100–300 ms RTT gracefully — the
  server executes maneuvers; client shows immediate "command pending" feedback and
  cosmetically interpolates 1 tick behind authority.
- Module activation requests resolve on the next tick boundary; UI shows spool state.
- Reconnect: session resumable for 120 s (ship stays in space — logoff aggression
  timers per doc 07 rules); SNAPSHOT rehydrates on resume.

## 6. Session & security (details in doc 12)

- LOGIN carries an HMAC-signed, expiring session token from Identity (gateway verifies
  offline — no DB hit per message).
- Gateway enforces: max message size, schema validation, per-type token-bucket rate
  limits, per-session command queue caps; violations get typed errors then disconnect
  with audit log.

## 7. Implemented today (Milestone A)

All ✦ rows above exist in `@starweft/protocol` with runtime validators and are served
by `@starweft/server`'s gateway + cells; `@starweft/client-sdk` wraps them in a typed
API. Integration tests drive login → undock → arc → mine → dock → refine → manufacture
→ trade → fight over real WebSockets.
