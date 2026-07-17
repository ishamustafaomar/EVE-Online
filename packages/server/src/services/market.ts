/**
 * Market service: one RegionalMarket per region (single-writer by
 * construction, doc 09 §2), plus NPC vendor seeding — blueprint originals are
 * sold by faction registries at capital/starter stations (lumen sink, doc 06).
 */

import {
  LedgerAccounts,
  Locations,
  orderId as mkOrderId,
  RegionalMarket,
  type CharacterId,
  type ItemStore,
  type LumenLedger,
  type OrderId,
  type RegionId,
  type StationId,
} from '@starweft/core';
import { characterId } from '@starweft/core';
import { RULES } from '../config.js';
import type { World } from '../world/world.js';

export const NPC_VENDOR: CharacterId = characterId('npc.vendor.registry');

export class MarketService {
  private readonly markets = new Map<RegionId, RegionalMarket>();
  private orderCounter = 0;

  constructor(
    private readonly world: World,
    private readonly ledger: LumenLedger,
    private readonly items: ItemStore,
  ) {}

  marketForRegion(regionId: RegionId): RegionalMarket {
    let market = this.markets.get(regionId);
    if (!market) {
      market = new RegionalMarket(regionId, this.ledger, this.items, RULES.marketConfig, () =>
        mkOrderId(`order.${this.orderCounter++}`),
      );
      this.markets.set(regionId, market);
    }
    return market;
  }

  marketForStation(stationId: StationId): RegionalMarket | undefined {
    const info = this.world.stationInfo(stationId);
    if (!info?.station.services.market) return undefined;
    return this.marketForRegion(info.system.regionId);
  }

  allMarkets(): ReadonlyMap<RegionId, RegionalMarket> {
    return this.markets;
  }

  findOrderRegion(orderId: OrderId): RegionalMarket | undefined {
    for (const market of this.markets.values()) {
      if (market.order(orderId)) return market;
    }
    return undefined;
  }

  /**
   * Seed the starter station with NPC blueprint sell orders. The vendor's
   * proceeds never re-enter circulation — an effective sink until NPC
   * economic actors arrive in Milestone B.
   */
  seedNpcVendor(): void {
    const station = this.world.starterStation;
    const hangar = Locations.hangar(NPC_VENDOR, station.id);
    // The vendor needs listing capital for broker fees.
    this.ledger.mint(LedgerAccounts.character(NPC_VENDOR), 100_000_000, 'mint-starter');
    const market = this.marketForStation(station.id);
    if (!market) throw new Error('starter station has no market');
    for (const bp of this.world.registry.allBlueprints()) {
      // Price: proportional to output value proxy (job fee), always affordable
      // relative to starter capital for ammo/module blueprints.
      const price = Math.max(500, bp.jobFeeLM * 25);
      this.items.mint(hangar, bp.id, 50, 'spawn-starter');
      const placed = market.placeOrder({
        side: 'sell',
        typeId: bp.id,
        price,
        qty: 50,
        stationId: station.id,
        character: NPC_VENDOR,
      });
      if (!placed.ok) throw new Error(`vendor seeding failed for ${bp.id}: ${placed.error}`);
    }
  }
}
