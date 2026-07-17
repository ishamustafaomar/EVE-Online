/**
 * Branded ID types. IDs are strings at runtime but distinct types to the
 * compiler, so a StationId can never be passed where a SystemId is expected.
 */

declare const brandSym: unique symbol;
export type Brand<T, B extends string> = T & { readonly [brandSym]: B };

export type RegionId = Brand<string, 'RegionId'>;
export type SystemId = Brand<string, 'SystemId'>;
export type WeftlineId = Brand<string, 'WeftlineId'>;
export type StationId = Brand<string, 'StationId'>;
export type BeltId = Brand<string, 'BeltId'>;
export type PlanetId = Brand<string, 'PlanetId'>;
export type TerminusId = Brand<string, 'TerminusId'>;

export type AccountId = Brand<string, 'AccountId'>;
export type CharacterId = Brand<string, 'CharacterId'>;
export type SyndicateId = Brand<string, 'SyndicateId'>;

export type ItemTypeId = Brand<string, 'ItemTypeId'>;
export type DisciplineId = Brand<string, 'DisciplineId'>;

export type EntityId = Brand<string, 'EntityId'>;
export type OrderId = Brand<string, 'OrderId'>;
export type JobId = Brand<string, 'JobId'>;
export type ChannelId = Brand<string, 'ChannelId'>;
export type LocationId = Brand<string, 'LocationId'>;
export type LedgerAccountId = Brand<string, 'LedgerAccountId'>;

export const regionId = (s: string): RegionId => s as RegionId;
export const systemId = (s: string): SystemId => s as SystemId;
export const weftlineId = (s: string): WeftlineId => s as WeftlineId;
export const stationId = (s: string): StationId => s as StationId;
export const beltId = (s: string): BeltId => s as BeltId;
export const planetId = (s: string): PlanetId => s as PlanetId;
export const terminusId = (s: string): TerminusId => s as TerminusId;
export const accountId = (s: string): AccountId => s as AccountId;
export const characterId = (s: string): CharacterId => s as CharacterId;
export const syndicateId = (s: string): SyndicateId => s as SyndicateId;
export const itemTypeId = (s: string): ItemTypeId => s as ItemTypeId;
export const disciplineId = (s: string): DisciplineId => s as DisciplineId;
export const entityId = (s: string): EntityId => s as EntityId;
export const orderId = (s: string): OrderId => s as OrderId;
export const jobId = (s: string): JobId => s as JobId;
export const channelId = (s: string): ChannelId => s as ChannelId;
export const locationId = (s: string): LocationId => s as LocationId;
export const ledgerAccountId = (s: string): LedgerAccountId => s as LedgerAccountId;

/** Standard location naming scheme (one convention, used everywhere). */
export const Locations = {
  hangar: (char: CharacterId, station: StationId): LocationId =>
    locationId(`hangar/${char}/${station}`),
  cargo: (entity: EntityId): LocationId => locationId(`cargo/${entity}`),
  oreHold: (entity: EntityId): LocationId => locationId(`orehold/${entity}`),
  marketEscrow: (order: OrderId): LocationId => locationId(`escrow/market/${order}`),
  jobInput: (job: JobId): LocationId => locationId(`escrow/job/${job}`),
  wreck: (entity: EntityId): LocationId => locationId(`wreck/${entity}`),
} as const;

/** Standard ledger account naming scheme. */
export const LedgerAccounts = {
  character: (char: CharacterId): LedgerAccountId => ledgerAccountId(`wallet/char/${char}`),
  marketEscrow: (order: OrderId): LedgerAccountId => ledgerAccountId(`escrow/market/${order}`),
  feeSink: ledgerAccountId('sink/fees'),
  industrySink: ledgerAccountId('sink/industry'),
  faucetBounties: ledgerAccountId('faucet/bounties'),
  faucetStarter: ledgerAccountId('faucet/starter'),
} as const;
