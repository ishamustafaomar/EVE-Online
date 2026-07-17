/**
 * The Ledger: single code path for every lumen and item mutation (docs 06, 12).
 * Integer lumen amounts only; every mutation carries a cause code; conservation
 * is auditable at any moment (sum of balances == minted - burned).
 */

import type { ItemTypeId, LedgerAccountId, LocationId } from '../kernel/ids.js';

export type LedgerCause =
  | 'trade'
  | 'broker-fee'
  | 'sales-tax'
  | 'escrow'
  | 'escrow-release'
  | 'transfer'
  | 'job-fee'
  | 'mint-starter'
  | 'mint-bounty'
  | 'burn-admin';

export interface LedgerEntry {
  readonly seq: number;
  readonly cause: LedgerCause;
  readonly from: LedgerAccountId | null;
  readonly to: LedgerAccountId | null;
  readonly amount: number;
}

export class InsufficientFundsError extends Error {
  constructor(account: LedgerAccountId, requested: number, available: number) {
    super(`insufficient funds in ${account}: requested ${requested}, available ${available}`);
    this.name = 'InsufficientFundsError';
  }
}

function assertAmount(amount: number): void {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error(`ledger amounts must be positive integers, got ${amount}`);
  }
}

export class LumenLedger {
  private readonly balances = new Map<LedgerAccountId, number>();
  private minted = 0;
  private burned = 0;
  private seq = 0;
  private readonly listeners: Array<(entry: LedgerEntry) => void> = [];

  onEntry(listener: (entry: LedgerEntry) => void): void {
    this.listeners.push(listener);
  }

  private record(cause: LedgerCause, from: LedgerAccountId | null, to: LedgerAccountId | null, amount: number): void {
    const entry: LedgerEntry = { seq: this.seq++, cause, from, to, amount };
    for (const l of this.listeners) l(entry);
  }

  balance(account: LedgerAccountId): number {
    return this.balances.get(account) ?? 0;
  }

  /** Create lumens (faucets only — cause codes are audited). */
  mint(to: LedgerAccountId, amount: number, cause: LedgerCause): void {
    assertAmount(amount);
    this.balances.set(to, this.balance(to) + amount);
    this.minted += amount;
    this.record(cause, null, to, amount);
  }

  /** Destroy lumens (sinks). */
  burn(from: LedgerAccountId, amount: number, cause: LedgerCause): void {
    assertAmount(amount);
    const available = this.balance(from);
    if (available < amount) throw new InsufficientFundsError(from, amount, available);
    this.balances.set(from, available - amount);
    this.burned += amount;
    this.record(cause, from, null, amount);
  }

  transfer(from: LedgerAccountId, to: LedgerAccountId, amount: number, cause: LedgerCause): void {
    assertAmount(amount);
    if (from === to) return;
    const available = this.balance(from);
    if (available < amount) throw new InsufficientFundsError(from, amount, available);
    this.balances.set(from, available - amount);
    this.balances.set(to, this.balance(to) + amount);
    this.record(cause, from, to, amount);
  }

  /** Conservation audit: must hold at every moment (doc 12 §2). */
  audit(): { sumBalances: number; minted: number; burned: number; conserved: boolean } {
    let sum = 0;
    for (const v of this.balances.values()) sum += v;
    return { sumBalances: sum, minted: this.minted, burned: this.burned, conserved: sum === this.minted - this.burned };
  }
}

export type ItemCause = 'mining' | 'refine' | 'manufacture' | 'loot' | 'trade' | 'spawn-starter' | 'destroy';

export class InsufficientItemsError extends Error {
  constructor(location: LocationId, typeId: ItemTypeId, requested: number, available: number) {
    super(`insufficient ${typeId} at ${location}: requested ${requested}, available ${available}`);
    this.name = 'InsufficientItemsError';
  }
}

/**
 * ItemStore: every item stack lives at exactly one location. Moves conserve;
 * mint/burn are the only creation/destruction paths and are cause-tagged.
 */
export class ItemStore {
  private readonly locations = new Map<LocationId, Map<ItemTypeId, number>>();
  private readonly mintedByType = new Map<ItemTypeId, number>();
  private readonly burnedByType = new Map<ItemTypeId, number>();

  quantity(location: LocationId, typeId: ItemTypeId): number {
    return this.locations.get(location)?.get(typeId) ?? 0;
  }

  contents(location: LocationId): ReadonlyArray<{ typeId: ItemTypeId; qty: number }> {
    const loc = this.locations.get(location);
    if (!loc) return [];
    return [...loc.entries()]
      .filter(([, qty]) => qty > 0)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([typeId, qty]) => ({ typeId, qty }));
  }

  private adjust(location: LocationId, typeId: ItemTypeId, delta: number): void {
    let loc = this.locations.get(location);
    if (!loc) {
      loc = new Map();
      this.locations.set(location, loc);
    }
    const next = (loc.get(typeId) ?? 0) + delta;
    if (next < 0) throw new InsufficientItemsError(location, typeId, -delta, next - delta);
    if (next === 0) loc.delete(typeId);
    else loc.set(typeId, next);
  }

  mint(location: LocationId, typeId: ItemTypeId, qty: number, _cause: ItemCause): void {
    assertQty(qty);
    this.adjust(location, typeId, qty);
    this.mintedByType.set(typeId, (this.mintedByType.get(typeId) ?? 0) + qty);
  }

  burn(location: LocationId, typeId: ItemTypeId, qty: number, _cause: ItemCause): void {
    assertQty(qty);
    this.adjust(location, typeId, -qty);
    this.burnedByType.set(typeId, (this.burnedByType.get(typeId) ?? 0) + qty);
  }

  move(from: LocationId, to: LocationId, typeId: ItemTypeId, qty: number): void {
    assertQty(qty);
    if (from === to) return;
    this.adjust(from, typeId, -qty);
    this.adjust(to, typeId, qty);
  }

  /** Move everything at `from` to `to` (dock transfers, loot scoops). */
  moveAll(from: LocationId, to: LocationId): void {
    for (const { typeId, qty } of this.contents(from)) this.move(from, to, typeId, qty);
  }

  /** Conservation audit per type: held must equal minted - burned. */
  audit(): { conserved: boolean; issues: string[] } {
    const held = new Map<ItemTypeId, number>();
    for (const loc of this.locations.values()) {
      for (const [typeId, qty] of loc) held.set(typeId, (held.get(typeId) ?? 0) + qty);
    }
    const issues: string[] = [];
    const allTypes = new Set([...this.mintedByType.keys(), ...held.keys()]);
    for (const typeId of allTypes) {
      const expected = (this.mintedByType.get(typeId) ?? 0) - (this.burnedByType.get(typeId) ?? 0);
      const actual = held.get(typeId) ?? 0;
      if (expected !== actual) issues.push(`${typeId}: held ${actual}, expected ${expected}`);
    }
    return { conserved: issues.length === 0, issues };
  }
}

function assertQty(qty: number): void {
  if (!Number.isInteger(qty) || qty <= 0) {
    throw new Error(`item quantities must be positive integers, got ${qty}`);
  }
}
