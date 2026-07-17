import { describe, expect, it } from 'vitest';
import {
  characterId,
  ItemStore,
  itemTypeId,
  LedgerAccounts,
  Locations,
  LumenLedger,
  orderId,
  regionId,
  RegionalMarket,
  rngStream,
  stationId,
} from '../src/index.js';

const REGION = regionId('reg.000');
const STATION_A = stationId('sys.0001.station.1');
const STATION_B = stationId('sys.0002.station.1');
const ORE = itemTypeId('ore.regolite');
const ALICE = characterId('char.alice');
const BOB = characterId('char.bob');

const CONFIG = { brokerFeeRate: 0.01, salesTaxRate: 0.02 };

function setup() {
  const ledger = new LumenLedger();
  const items = new ItemStore();
  let seq = 0;
  const market = new RegionalMarket(REGION, ledger, items, CONFIG, () => orderId(`order.${seq++}`));
  ledger.mint(LedgerAccounts.character(ALICE), 1_000_000, 'mint-starter');
  ledger.mint(LedgerAccounts.character(BOB), 1_000_000, 'mint-starter');
  items.mint(Locations.hangar(ALICE, STATION_A), ORE, 10_000, 'spawn-starter');
  return { ledger, items, market };
}

describe('regional market', () => {
  it('rests a sell order, escrowing items and charging broker fee', () => {
    const { ledger, items, market } = setup();
    const result = market.placeOrder({ side: 'sell', typeId: ORE, price: 10, qty: 100, stationId: STATION_A, character: ALICE });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.restingOrder?.remaining).toBe(100);
    expect(items.quantity(Locations.hangar(ALICE, STATION_A), ORE)).toBe(9900);
    // Broker fee: ceil(10 × 100 × 1%) = 10 lumens burned.
    expect(ledger.balance(LedgerAccounts.character(ALICE))).toBe(1_000_000 - 10);
  });

  it('crossing buy executes at the resting sell price with tax and delivery', () => {
    const { ledger, items, market } = setup();
    market.placeOrder({ side: 'sell', typeId: ORE, price: 10, qty: 100, stationId: STATION_A, character: ALICE });
    const result = market.placeOrder({ side: 'buy', typeId: ORE, price: 12, qty: 100, stationId: STATION_B, character: BOB });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.trades).toHaveLength(1);
    expect(result.trades[0]?.price).toBe(10); // maker price, not 12
    // Items delivered to Bob at the SELLER's station (hauling matters).
    expect(items.quantity(Locations.hangar(BOB, STATION_A), ORE)).toBe(100);
    expect(items.quantity(Locations.hangar(BOB, STATION_B), ORE)).toBe(0);
    // Alice: -10 broker fee, +1000 gross, -20 sales tax.
    expect(ledger.balance(LedgerAccounts.character(ALICE))).toBe(1_000_000 - 10 + 1000 - 20);
    // Bob: -12 broker fee (on his limit value 1200), paid 1000, surplus refunded.
    expect(ledger.balance(LedgerAccounts.character(BOB))).toBe(1_000_000 - 12 - 1000);
  });

  it('respects price-time priority', () => {
    const { market } = setup();
    market.placeOrder({ side: 'sell', typeId: ORE, price: 11, qty: 50, stationId: STATION_A, character: ALICE });
    market.placeOrder({ side: 'sell', typeId: ORE, price: 10, qty: 50, stationId: STATION_A, character: ALICE });
    const result = market.placeOrder({ side: 'buy', typeId: ORE, price: 12, qty: 60, stationId: STATION_B, character: BOB });
    expect(result.ok && result.trades[0]?.price).toBe(10); // best price first
    expect(result.ok && result.trades[1]?.price).toBe(11);
    expect(result.ok && result.trades[0]?.qty).toBe(50);
    expect(result.ok && result.trades[1]?.qty).toBe(10);
  });

  it('supports partial fills with correct escrow accounting', () => {
    const { ledger, market } = setup();
    market.placeOrder({ side: 'sell', typeId: ORE, price: 10, qty: 30, stationId: STATION_A, character: ALICE });
    const result = market.placeOrder({ side: 'buy', typeId: ORE, price: 10, qty: 100, stationId: STATION_B, character: BOB });
    expect(result.ok && result.restingOrder?.remaining).toBe(70);
    // Escrow holds exactly price × remaining.
    if (result.ok && result.restingOrder) {
      expect(ledger.balance(LedgerAccounts.marketEscrow(result.restingOrder.id))).toBe(700);
    }
  });

  it('cancellation refunds escrow but not the broker fee', () => {
    const { ledger, items, market } = setup();
    const placed = market.placeOrder({ side: 'sell', typeId: ORE, price: 10, qty: 100, stationId: STATION_A, character: ALICE });
    if (!(placed.ok && placed.restingOrder)) throw new Error('expected resting order');
    const cancel = market.cancelOrder(placed.restingOrder.id, ALICE);
    expect(cancel.ok).toBe(true);
    expect(items.quantity(Locations.hangar(ALICE, STATION_A), ORE)).toBe(10_000);
    expect(ledger.balance(LedgerAccounts.character(ALICE))).toBe(1_000_000 - 10);
  });

  it('rejects orders the wallet or hangar cannot cover', () => {
    const { market } = setup();
    expect(
      market.placeOrder({ side: 'sell', typeId: ORE, price: 10, qty: 999_999, stationId: STATION_A, character: ALICE }).ok,
    ).toBe(false);
    expect(
      market.placeOrder({ side: 'buy', typeId: ORE, price: 1_000_000, qty: 100, stationId: STATION_A, character: BOB }).ok,
    ).toBe(false);
  });

  it('only the owner can cancel', () => {
    const { market } = setup();
    const placed = market.placeOrder({ side: 'sell', typeId: ORE, price: 10, qty: 10, stationId: STATION_A, character: ALICE });
    if (!(placed.ok && placed.restingOrder)) throw new Error('expected resting order');
    expect(market.cancelOrder(placed.restingOrder.id, BOB).ok).toBe(false);
  });
});

describe('conservation property: random order storms', () => {
  it('conserves lumens and items exactly across 2,000 random operations', () => {
    const ledger = new LumenLedger();
    const items = new ItemStore();
    let seq = 0;
    const market = new RegionalMarket(REGION, ledger, items, CONFIG, () => orderId(`order.${seq++}`));

    const chars = [ALICE, BOB, characterId('char.cato'), characterId('char.dana')];
    for (const c of chars) {
      ledger.mint(LedgerAccounts.character(c), 5_000_000, 'mint-starter');
      items.mint(Locations.hangar(c, STATION_A), ORE, 50_000, 'spawn-starter');
      items.mint(Locations.hangar(c, STATION_B), ORE, 50_000, 'spawn-starter');
    }

    const rng = rngStream('market-storm');
    const placedIds: string[] = [];
    for (let i = 0; i < 2000; i++) {
      const c = rng.pick(chars);
      const action = rng.float();
      if (action < 0.45) {
        market.placeOrder({
          side: 'sell', typeId: ORE,
          price: rng.int(5, 30), qty: rng.int(1, 500),
          stationId: rng.chance(0.5) ? STATION_A : STATION_B, character: c,
        });
      } else if (action < 0.9) {
        const result = market.placeOrder({
          side: 'buy', typeId: ORE,
          price: rng.int(5, 30), qty: rng.int(1, 500),
          stationId: rng.chance(0.5) ? STATION_A : STATION_B, character: c,
        });
        if (result.ok && result.restingOrder) placedIds.push(result.restingOrder.id as string);
      } else if (placedIds.length > 0) {
        const id = rng.pick(placedIds);
        const order = market.order(id as never);
        if (order) market.cancelOrder(order.id, order.owner);
      }

      if (i % 200 === 0) {
        expect(ledger.audit().conserved).toBe(true);
        expect(items.audit().conserved).toBe(true);
      }
    }

    // Final audit: nothing created or destroyed outside tagged causes.
    expect(ledger.audit().conserved).toBe(true);
    expect(items.audit().conserved).toBe(true);
  });
});
