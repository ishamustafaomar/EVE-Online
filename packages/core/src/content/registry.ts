/**
 * Content registry: typed lookups over the content pack plus the validation
 * gates run in CI (doc 14 §1.2).
 */

import type { DisciplineId, ItemTypeId } from '../kernel/ids.js';
import { BLUEPRINTS } from './blueprints.js';
import { DISCIPLINES } from './disciplines.js';
import { HULLS } from './hulls.js';
import { MINERALS, MUNITIONS, ORES } from './materials.js';
import { MODULES } from './modules.js';
import type {
  AnyItemDef,
  BlueprintDef,
  DisciplineDef,
  HullDef,
  ModuleDef,
  MunitionDef,
  OreDef,
} from './types.js';

export class ContentRegistry {
  readonly version: string;
  private readonly items = new Map<ItemTypeId, AnyItemDef>();
  private readonly disciplines = new Map<DisciplineId, DisciplineDef>();

  constructor(version: string, items: readonly AnyItemDef[], disciplines: readonly DisciplineDef[]) {
    this.version = version;
    for (const item of items) {
      if (this.items.has(item.id)) throw new Error(`Duplicate content id: ${item.id}`);
      this.items.set(item.id, item);
    }
    for (const d of disciplines) {
      if (this.disciplines.has(d.id)) throw new Error(`Duplicate discipline id: ${d.id}`);
      this.disciplines.set(d.id, d);
    }
  }

  item(id: ItemTypeId): AnyItemDef {
    const item = this.items.get(id);
    if (!item) throw new Error(`Unknown item type: ${id}`);
    return item;
  }

  tryItem(id: ItemTypeId): AnyItemDef | undefined {
    return this.items.get(id);
  }

  hull(id: ItemTypeId): HullDef {
    const item = this.item(id);
    if (item.category !== 'hull') throw new Error(`${id} is not a hull`);
    return item;
  }

  module(id: ItemTypeId): ModuleDef {
    const item = this.item(id);
    if (item.category !== 'module') throw new Error(`${id} is not a module`);
    return item;
  }

  ore(id: ItemTypeId): OreDef {
    const item = this.item(id);
    if (item.category !== 'ore') throw new Error(`${id} is not an ore`);
    return item;
  }

  munition(id: ItemTypeId): MunitionDef {
    const item = this.item(id);
    if (item.category !== 'munition') throw new Error(`${id} is not a munition`);
    return item;
  }

  blueprint(id: ItemTypeId): BlueprintDef {
    const item = this.item(id);
    if (item.category !== 'blueprint') throw new Error(`${id} is not a blueprint`);
    return item;
  }

  discipline(id: DisciplineId): DisciplineDef {
    const d = this.disciplines.get(id);
    if (!d) throw new Error(`Unknown discipline: ${id}`);
    return d;
  }

  hasDiscipline(id: DisciplineId): boolean {
    return this.disciplines.has(id);
  }

  allItems(): readonly AnyItemDef[] {
    return [...this.items.values()];
  }

  allHulls(): readonly HullDef[] {
    return this.allItems().filter((i): i is HullDef => i.category === 'hull');
  }

  allModules(): readonly ModuleDef[] {
    return this.allItems().filter((i): i is ModuleDef => i.category === 'module');
  }

  allOres(): readonly OreDef[] {
    return this.allItems().filter((i): i is OreDef => i.category === 'ore');
  }

  allMunitions(): readonly MunitionDef[] {
    return this.allItems().filter((i): i is MunitionDef => i.category === 'munition');
  }

  allBlueprints(): readonly BlueprintDef[] {
    return this.allItems().filter((i): i is BlueprintDef => i.category === 'blueprint');
  }

  /**
   * Validation gates (doc 14). Returns a list of human-readable issues;
   * empty list = pack is valid.
   */
  validate(): string[] {
    const issues: string[] = [];
    const names = new Map<string, ItemTypeId>();

    // Original-IP hygiene: reserved third-party terms must never appear in
    // content names (doc 14 §1.2).
    const reserved = /\b(eve|isk|plex|amarr|caldari|gallente|minmatar|jita|rifter|kestrel|venture|raven|drake|tengu)\b/i;

    for (const item of this.allItems()) {
      if (item.volume < 0) issues.push(`${item.id}: negative volume`);
      if (item.name.trim().length === 0) issues.push(`${item.id}: empty name`);
      if (reserved.test(item.name)) issues.push(`${item.id}: reserved term in name "${item.name}"`);
      const clash = names.get(item.name.toLowerCase());
      if (clash && item.category !== 'blueprint') {
        issues.push(`${item.id}: name collides with ${clash}`);
      }
      if (item.category !== 'blueprint') names.set(item.name.toLowerCase(), item.id);
    }

    for (const ore of this.allOres()) {
      for (const y of ore.yields) {
        const m = this.tryItem(y.mineralId);
        if (!m) issues.push(`${ore.id}: yield references unknown mineral ${y.mineralId}`);
        else if (m.category !== 'mineral') issues.push(`${ore.id}: yield ${y.mineralId} is not a mineral`);
        if (y.qty <= 0) issues.push(`${ore.id}: non-positive yield qty`);
      }
      if (ore.batchSize <= 0) issues.push(`${ore.id}: non-positive batch size`);
    }

    for (const bpDef of this.allBlueprints()) {
      if (!this.tryItem(bpDef.output.typeId)) {
        issues.push(`${bpDef.id}: output references unknown type ${bpDef.output.typeId}`);
      }
      for (const input of bpDef.inputs) {
        if (!this.tryItem(input.typeId)) {
          issues.push(`${bpDef.id}: input references unknown type ${input.typeId}`);
        }
        if (input.qty <= 0) issues.push(`${bpDef.id}: non-positive input qty`);
      }
      if (bpDef.baseTimeSec <= 0) issues.push(`${bpDef.id}: non-positive job time`);
    }

    for (const hull of this.allHulls()) {
      for (const req of hull.disciplines) {
        if (!this.hasDiscipline(req.id)) issues.push(`${hull.id}: unknown discipline ${req.id}`);
      }
      for (const b of hull.bonuses) {
        if (!this.hasDiscipline(b.disciplineId)) {
          issues.push(`${hull.id}: bonus references unknown discipline ${b.disciplineId}`);
        }
      }
      const layers = [hull.shield.resists, hull.armor.resists, hull.structure.resists];
      for (const r of layers) {
        for (const v of [r.kinetic, r.thermal, r.ion, r.breach]) {
          if (v < 0 || v > 0.85) issues.push(`${hull.id}: resist ${v} outside [0, 0.85]`);
        }
      }
      if (hull.power <= 0 || hull.compute <= 0) issues.push(`${hull.id}: non-positive fitting budget`);
    }

    for (const m of this.allModules()) {
      for (const req of m.disciplines) {
        if (!this.hasDiscipline(req.id)) issues.push(`${m.id}: unknown discipline ${req.id}`);
      }
      if (m.slot !== 'weave' && m.powerMW === 0 && m.computeTF === 0) {
        issues.push(`${m.id}: non-weave module with zero fitting cost`);
      }
      if (m.active) {
        if (m.active.cycleSec <= 0) issues.push(`${m.id}: non-positive cycle time`);
        if (m.active.fluxPerCycle < 0) issues.push(`${m.id}: negative flux cost`);
        const fx = m.active.effect;
        if ((fx.kind === 'turret' || fx.kind === 'launcher') && m.slot !== 'hardpoint') {
          issues.push(`${m.id}: weapon outside hardpoint slot`);
        }
        if (fx.kind === 'turret' && fx.munitionFamily !== undefined) {
          const anyOfFamily = this.allMunitions().some((mu) => mu.family === fx.munitionFamily);
          if (!anyOfFamily) issues.push(`${m.id}: no munitions exist for family ${fx.munitionFamily}`);
        }
        if (fx.kind === 'launcher') {
          const anyOfFamily = this.allMunitions().some((mu) => mu.family === fx.munitionFamily);
          if (!anyOfFamily) issues.push(`${m.id}: no munitions exist for family ${fx.munitionFamily}`);
        }
      }
    }

    return issues;
  }
}

/** Build the canonical v1 content pack. */
export function buildContentV1(): ContentRegistry {
  return new ContentRegistry(
    'content-v1',
    [...MINERALS, ...ORES, ...MUNITIONS, ...HULLS, ...MODULES, ...BLUEPRINTS],
    DISCIPLINES,
  );
}
