/**
 * Regional order-book market (doc 06 §3).
 *
 * Semantics:
 * - Books are regional; orders live at a station in that region.
 * - Price-time priority; crossing trades execute at the RESTING order's price.
 * - Item delivery is always at the location of the items (the sell side's
 *   station) — buyers of remote goods must haul them. Hauling matters.
 * - Escrow up front: buy orders escrow limit price × qty; sell orders escrow
 *   items. Broker fee charged at placement (sink); sales tax on seller
 *   proceeds at execution (sink).
 */

import { LedgerAccounts, Locations } from '../kernel/ids.js';
import type {
  CharacterId,
  ItemTypeId,
  OrderId,
  RegionId,
  StationId,
} from '../kernel/ids.js';
import type { ItemStore, LumenLedger } from './ledger.js';

export type OrderSide = 'buy' | 'sell';

export interface MarketOrder {
  readonly id: OrderId;
  readonly side: OrderSide;
  readonly regionId: RegionId;
  readonly stationId: StationId;
  readonly typeId: ItemTypeId;
  /** Limit price in lumens per unit (positive integer). */
  readonly price: number;
  remaining: number;
  readonly owner: CharacterId;
  readonly createdSeq: number;
}

export interface Trade {
  readonly typeId: ItemTypeId;
  readonly price: number;
  readonly qty: number;
  readonly buyer: CharacterId;
  readonly seller: CharacterId;
  /** Station where the items were delivered (buyer's pickup point). */
  readonly deliveredAt: StationId;
  readonly restingOrderId: OrderId;
}

export interface MarketConfig {
  /** Fraction of order value charged at listing (sink). */
  readonly brokerFeeRate: number;
  /** Fraction of seller proceeds charged at execution (sink). */
  readonly salesTaxRate: number;
}

export interface PlaceOrderParams {
  readonly side: OrderSide;
  readonly typeId: ItemTypeId;
  readonly price: number;
  readonly qty: number;
  readonly stationId: StationId;
  readonly character: CharacterId;
}

export type PlaceOrderResult =
  | { readonly ok: true; readonly trades: readonly Trade[]; readonly restingOrder?: MarketOrder }
  | { readonly ok: false; readonly error: string };

export class RegionalMarket {
  private readonly booksByType = new Map<ItemTypeId, { buys: MarketOrder[]; sells: MarketOrder[] }>();
  private readonly ordersById = new Map<OrderId, MarketOrder>();
  private seq = 0;
  private readonly tradeListeners: Array<(trade: Trade) => void> = [];

  constructor(
    readonly regionId: RegionId,
    private readonly ledger: LumenLedger,
    private readonly items: ItemStore,
    private readonly config: MarketConfig,
    private readonly nextOrderId: () => OrderId,
  ) {}

  onTrade(listener: (trade: Trade) => void): void {
    this.tradeListeners.push(listener);
  }

  private book(typeId: ItemTypeId): { buys: MarketOrder[]; sells: MarketOrder[] } {
    let b = this.booksByType.get(typeId);
    if (!b) {
      b = { buys: [], sells: [] };
      this.booksByType.set(typeId, b);
    }
    return b;
  }

  order(id: OrderId): MarketOrder | undefined {
    return this.ordersById.get(id);
  }

  ordersFor(typeId: ItemTypeId): { buys: readonly MarketOrder[]; sells: readonly MarketOrder[] } {
    const b = this.book(typeId);
    return { buys: b.buys, sells: b.sells };
  }

  ordersByOwner(owner: CharacterId): readonly MarketOrder[] {
    return [...this.ordersById.values()].filter((o) => o.owner === owner);
  }

  placeOrder(params: PlaceOrderParams): PlaceOrderResult {
    const { side, typeId, price, qty, stationId, character } = params;
    if (!Number.isInteger(price) || price <= 0) return { ok: false, error: 'price must be a positive integer' };
    if (!Number.isInteger(qty) || qty <= 0) return { ok: false, error: 'quantity must be a positive integer' };

    const wallet = LedgerAccounts.character(character);
    const brokerFee = Math.ceil(price * qty * this.config.brokerFeeRate);
    const walletNeeded = brokerFee + (side === 'buy' ? price * qty : 0);
    if (this.ledger.balance(wallet) < walletNeeded) {
      return { ok: false, error: `insufficient lumens: need ${walletNeeded}` };
    }
    if (side === 'sell') {
      const hangar = Locations.hangar(character, stationId);
      if (this.items.quantity(hangar, typeId) < qty) {
        return { ok: false, error: 'insufficient items in station hangar' };
      }
    }

    // Charge broker fee (sink) and take escrow up front.
    const order: MarketOrder = {
      id: this.nextOrderId(),
      side,
      regionId: this.regionId,
      stationId,
      typeId,
      price,
      remaining: qty,
      owner: character,
      createdSeq: this.seq++,
    };
    if (brokerFee > 0) this.ledger.burn(wallet, brokerFee, 'broker-fee');
    const escrowAccount = LedgerAccounts.marketEscrow(order.id);
    if (side === 'buy') {
      this.ledger.transfer(wallet, escrowAccount, price * qty, 'escrow');
    } else {
      this.items.move(Locations.hangar(character, stationId), Locations.marketEscrow(order.id), typeId, qty);
    }

    const trades = this.match(order);

    if (order.remaining > 0) {
      // A partially filled buy may have paid below its limit; release the
      // surplus so escrow holds exactly price × remaining.
      if (side === 'buy') {
        const held = this.ledger.balance(escrowAccount);
        const surplus = held - price * order.remaining;
        if (surplus > 0) this.ledger.transfer(escrowAccount, wallet, surplus, 'escrow-release');
      }
      const book = this.book(typeId);
      const list = side === 'buy' ? book.buys : book.sells;
      list.push(order);
      this.sort(book);
      this.ordersById.set(order.id, order);
      return { ok: true, trades, restingOrder: order };
    }

    // Fully filled: release any escrow surplus (buy filled below limit).
    this.releaseEscrowSurplus(order, escrowAccount);
    return { ok: true, trades };
  }

  /** Serializable order-book state for persistence snapshots. */
  snapshot(): { seq: number; orders: Array<Omit<MarketOrder, 'regionId'>> } {
    return {
      seq: this.seq,
      orders: [...this.ordersById.values()].map((o) => ({
        id: o.id, side: o.side, stationId: o.stationId, typeId: o.typeId,
        price: o.price, remaining: o.remaining, owner: o.owner, createdSeq: o.createdSeq,
      })),
    };
  }

  /** Restore books from a snapshot. Escrow state lives in the ledger/item store. */
  restore(data: { seq: number; orders: Array<Omit<MarketOrder, 'regionId'>> }): void {
    this.booksByType.clear();
    this.ordersById.clear();
    this.seq = data.seq;
    for (const o of data.orders) {
      const order: MarketOrder = { ...o, regionId: this.regionId };
      const book = this.book(order.typeId);
      (order.side === 'buy' ? book.buys : book.sells).push(order);
      this.ordersById.set(order.id, order);
    }
    for (const book of this.booksByType.values()) this.sort(book);
  }

  cancelOrder(id: OrderId, requester: CharacterId): { ok: boolean; error?: string } {
    const order = this.ordersById.get(id);
    if (!order) return { ok: false, error: 'unknown order' };
    if (order.owner !== requester) return { ok: false, error: 'not your order' };
    this.removeOrder(order);
    const escrowAccount = LedgerAccounts.marketEscrow(order.id);
    if (order.side === 'buy') {
      const held = this.ledger.balance(escrowAccount);
      if (held > 0) this.ledger.transfer(escrowAccount, LedgerAccounts.character(order.owner), held, 'escrow-release');
    } else {
      this.items.move(
        Locations.marketEscrow(order.id),
        Locations.hangar(order.owner, order.stationId),
        order.typeId,
        order.remaining,
      );
    }
    return { ok: true };
  }

  private sort(book: { buys: MarketOrder[]; sells: MarketOrder[] }): void {
    book.buys.sort((a, b) => b.price - a.price || a.createdSeq - b.createdSeq);
    book.sells.sort((a, b) => a.price - b.price || a.createdSeq - b.createdSeq);
  }

  private removeOrder(order: MarketOrder): void {
    const book = this.book(order.typeId);
    const list = order.side === 'buy' ? book.buys : book.sells;
    const idx = list.indexOf(order);
    if (idx >= 0) list.splice(idx, 1);
    this.ordersById.delete(order.id);
  }

  private releaseEscrowSurplus(order: MarketOrder, escrowAccount: ReturnType<typeof LedgerAccounts.marketEscrow>): void {
    if (order.side === 'buy') {
      const held = this.ledger.balance(escrowAccount);
      if (held > 0) this.ledger.transfer(escrowAccount, LedgerAccounts.character(order.owner), held, 'escrow-release');
    }
  }

  /** Match an incoming order against the resting book. Trades at resting price. */
  private match(incoming: MarketOrder): Trade[] {
    const book = this.book(incoming.typeId);
    const trades: Trade[] = [];
    const opposing = incoming.side === 'buy' ? book.sells : book.buys;

    while (incoming.remaining > 0 && opposing.length > 0) {
      const resting = opposing[0] as MarketOrder;
      const crosses =
        incoming.side === 'buy' ? resting.price <= incoming.price : resting.price >= incoming.price;
      if (!crosses) break;

      const qty = Math.min(incoming.remaining, resting.remaining);
      const price = resting.price;
      const buyOrder = incoming.side === 'buy' ? incoming : resting;
      const sellOrder = incoming.side === 'buy' ? resting : incoming;

      // Lumens: buyer escrow → seller wallet, minus sales tax (sink).
      const gross = price * qty;
      const buyEscrow = LedgerAccounts.marketEscrow(buyOrder.id);
      const sellerWallet = LedgerAccounts.character(sellOrder.owner);
      const tax = Math.floor(gross * this.config.salesTaxRate);
      this.ledger.transfer(buyEscrow, sellerWallet, gross, 'trade');
      if (tax > 0) this.ledger.burn(sellerWallet, tax, 'sales-tax');

      // Items: seller escrow → buyer hangar at the seller's station.
      const deliveredAt = sellOrder.stationId;
      this.items.move(
        Locations.marketEscrow(sellOrder.id),
        Locations.hangar(buyOrder.owner, deliveredAt),
        incoming.typeId,
        qty,
      );

      incoming.remaining -= qty;
      resting.remaining -= qty;
      const trade: Trade = {
        typeId: incoming.typeId,
        price,
        qty,
        buyer: buyOrder.owner,
        seller: sellOrder.owner,
        deliveredAt,
        restingOrderId: resting.id,
      };
      trades.push(trade);
      for (const l of this.tradeListeners) l(trade);

      if (resting.remaining === 0) {
        this.removeOrder(resting);
        this.releaseEscrowSurplus(resting, LedgerAccounts.marketEscrow(resting.id));
      }
    }

    return trades;
  }
}
