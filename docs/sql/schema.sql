-- STARWEFT — PostgreSQL system-of-record schema (doc 09 §3).
-- Milestone A runs the same shapes behind in-memory repositories; this file
-- is the authoritative mapping for the Milestone B persistence cutover.

CREATE TABLE accounts (
  id            text PRIMARY KEY,             -- acct.*
  email         text UNIQUE NOT NULL,
  password_hash text NOT NULL,                -- argon2id
  totp_secret   text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  status        text NOT NULL DEFAULT 'active'  -- active | quarantined | banned
);

CREATE TABLE characters (
  id              text PRIMARY KEY,           -- char.*
  account_id      text NOT NULL REFERENCES accounts(id),
  name            text UNIQUE NOT NULL,
  system_id       text NOT NULL,              -- content-pack id (sys.*)
  docked_at       text,                       -- station id or NULL (in space)
  home_station_id text NOT NULL,
  loadout         jsonb NOT NULL,             -- FitLoadout
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE disciplines (
  character_id  text NOT NULL REFERENCES characters(id),
  discipline_id text NOT NULL,                -- disc.*
  level         smallint NOT NULL CHECK (level BETWEEN 0 AND 5),
  trained_sp    bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (character_id, discipline_id)
);

CREATE TABLE training_queue (
  character_id  text NOT NULL REFERENCES characters(id),
  position      smallint NOT NULL,
  discipline_id text NOT NULL,
  target_level  smallint NOT NULL,
  PRIMARY KEY (character_id, position)
);

-- One table, one truth: every item stack has exactly one location.
-- location follows the LocationId scheme (hangar/…, shipcargo/…, escrow/…).
CREATE TABLE items (
  location  text NOT NULL,
  type_id   text NOT NULL,                    -- content-pack item id
  quantity  bigint NOT NULL CHECK (quantity > 0),
  PRIMARY KEY (location, type_id)
);
CREATE INDEX items_by_type ON items (type_id);

CREATE TABLE wallets (
  account   text PRIMARY KEY,                 -- LedgerAccountId scheme
  balance   bigint NOT NULL CHECK (balance >= 0)
);

-- Append-only economic ledger; conservation audits re-sum this monthly
-- partitioned table against wallets/items (doc 12 §2).
CREATE TABLE ledger (
  seq         bigserial PRIMARY KEY,
  at          timestamptz NOT NULL DEFAULT now(),
  cause       text NOT NULL,                  -- trade | broker-fee | mining | …
  from_acct   text,                           -- NULL = mint (faucet)
  to_acct     text,                           -- NULL = burn (sink)
  amount      bigint NOT NULL CHECK (amount > 0),
  op_uuid     uuid UNIQUE NOT NULL            -- idempotency key
) PARTITION BY RANGE (at);

CREATE TABLE orders (
  id          text PRIMARY KEY,               -- order.*
  region_id   text NOT NULL,
  station_id  text NOT NULL,
  side        text NOT NULL CHECK (side IN ('buy','sell')),
  type_id     text NOT NULL,
  price       bigint NOT NULL CHECK (price > 0),
  remaining   bigint NOT NULL CHECK (remaining >= 0),
  owner_id    text NOT NULL REFERENCES characters(id),
  created_seq bigint NOT NULL,
  expires_at  timestamptz NOT NULL
);
CREATE INDEX orders_book ON orders (region_id, type_id, side, price, created_seq);

CREATE TABLE trades (
  id          bigserial PRIMARY KEY,
  at          timestamptz NOT NULL DEFAULT now(),
  region_id   text NOT NULL,
  type_id     text NOT NULL,
  price       bigint NOT NULL,
  quantity    bigint NOT NULL,
  buyer_id    text NOT NULL,
  seller_id   text NOT NULL,
  station_id  text NOT NULL                   -- delivery point
);
CREATE INDEX trades_candles ON trades (region_id, type_id, at);

CREATE TABLE industry_jobs (
  id           text PRIMARY KEY,              -- job.*
  owner_id     text NOT NULL REFERENCES characters(id),
  station_id   text NOT NULL,
  blueprint_id text NOT NULL,
  runs         int NOT NULL,
  inputs       jsonb NOT NULL,
  output_type  text NOT NULL,
  output_qty   bigint NOT NULL,
  ready_at     timestamptz NOT NULL,
  collected    boolean NOT NULL DEFAULT false
);

CREATE TABLE syndicates (
  id         text PRIMARY KEY,
  name       text UNIQUE NOT NULL,
  ticker     text UNIQUE NOT NULL,
  founder_id text NOT NULL REFERENCES characters(id),
  tax_rate   numeric(5,4) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE syndicate_members (
  syndicate_id text NOT NULL REFERENCES syndicates(id),
  character_id text NOT NULL REFERENCES characters(id),
  roles        bigint NOT NULL DEFAULT 0,     -- permission bitmask (doc 07)
  joined_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (syndicate_id, character_id)
);

-- Mutable per-system world state (asteroid depletion, rift instances).
-- Single-writer: only the owning cell process writes its system's rows.
CREATE TABLE world_state (
  system_id  text NOT NULL,
  key        text NOT NULL,                   -- e.g. ast.<belt>.<n> | rift.<id>
  value      jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (system_id, key)
);

CREATE TABLE killmails (
  id         bigserial PRIMARY KEY,
  at         timestamptz NOT NULL DEFAULT now(),
  system_id  text NOT NULL,
  victim_id  text NOT NULL,
  hull_id    text NOT NULL,
  attackers  jsonb NOT NULL,
  dropped    jsonb NOT NULL,
  destroyed  jsonb NOT NULL
);
