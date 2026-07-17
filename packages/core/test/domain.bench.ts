import { bench, describe } from 'vitest';
import {
  applyDamage,
  buildContentV1,
  characterId,
  computeFit,
  generateUniverse,
  ItemStore,
  itemTypeId,
  LedgerAccounts,
  Locations,
  LumenLedger,
  orderId,
  regionId,
  RegionalMarket,
  resolveTurretVolley,
  rngStream,
  STARTER_FIT_VERGE,
  STARTER_SKILLS,
  stationId,
  TEST_REACH_PRESET,
} from '../src/index.js';

const registry = buildContentV1();

describe('hot-path benchmarks (doc 13)', () => {
  bench('universe: generate test Reach (~50 systems)', () => {
    generateUniverse(TEST_REACH_PRESET);
  });

  bench('fitting: computeFit starter Verge', () => {
    computeFit(registry, STARTER_FIT_VERGE, STARTER_SKILLS);
  });

  const rng = rngStream('bench-combat');
  const turret = { tracking: 0.1, optimalM: 10_000, attenuationM: 5000, caliberSig: 130 };
  const profile = {
    shieldMax: 3000, shieldRechargeSec: 200, armorMax: 2500, hullMax: 2000,
    shieldResists: { kinetic: 0.3, thermal: 0.3, ion: 0.1, breach: 0.5 },
    armorResists: { kinetic: 0.4, thermal: 0.2, ion: 0.4, breach: 0.2 },
    structureResists: { kinetic: 0.33, thermal: 0.33, ion: 0.33, breach: 0.33 },
  };

  bench('combat: 100 volleys resolve + apply', () => {
    const state = { shield: 3000, armor: 2500, hull: 2000 };
    for (let i = 0; i < 100; i++) {
      const hit = resolveTurretVolley(rng, turret, 9000, 0.05, 130);
      if (hit.hit) {
        applyDamage(state, profile, {
          kinetic: 30 * hit.damageScale, thermal: 0, ion: 0, breach: 5 * hit.damageScale,
        });
      }
    }
  });

  bench('market: 200-order storm with matching', () => {
    const ledger = new LumenLedger();
    const items = new ItemStore();
    let seq = 0;
    const market = new RegionalMarket(
      regionId('reg.bench'), ledger, items,
      { brokerFeeRate: 0.01, salesTaxRate: 0.02 },
      () => orderId(`o.${seq++}`),
    );
    const station = stationId('sys.b.station.1');
    const a = characterId('char.a');
    const b = characterId('char.b');
    ledger.mint(LedgerAccounts.character(a), 10_000_000, 'mint-starter');
    ledger.mint(LedgerAccounts.character(b), 10_000_000, 'mint-starter');
    items.mint(Locations.hangar(a, station), itemTypeId('ore.regolite'), 1_000_000, 'spawn-starter');
    const r = rngStream('bench-market');
    for (let i = 0; i < 200; i++) {
      if (r.chance(0.5)) {
        market.placeOrder({ side: 'sell', typeId: itemTypeId('ore.regolite'), price: r.int(8, 15), qty: r.int(10, 200), stationId: station, character: a });
      } else {
        market.placeOrder({ side: 'buy', typeId: itemTypeId('ore.regolite'), price: r.int(8, 15), qty: r.int(10, 200), stationId: station, character: b });
      }
    }
  });
});
