/** Name generation banks — all original STARWEFT flavor (doc 01 §6). */

import type { Rng } from '../kernel/rng.js';
import type { FactionKey } from '../content/types.js';

const REGION_FIRST = [
  'Lantern', 'Cindral', 'Vellum', 'Ashen', 'Quiet', 'Sable', 'Amber', 'Hollow',
  'Winnowed', 'Sundered', 'Gilded', 'Pale', 'Iron', 'Thistle', 'Umbral', 'Argent',
  'Fallow', 'Keening', 'Loomward', 'Tidal',
];
const REGION_SECOND = [
  'Shallows', 'Reach', 'Deep', 'Verge', 'Anvil', 'Expanse', 'Threads', 'Quarter',
  'Span', 'Weft', 'Marches', 'Shroud', 'Passage', 'Lattice', 'Drift', 'Chain',
];

const PHONEMES: Record<FactionKey, { a: string[]; b: string[] }> = {
  accord: {
    a: ['Meri', 'Alta', 'Vell', 'Quan', 'Sexta', 'Cardi', 'Nadi', 'Zeni'],
    b: ['dia', 'brik', 'mos', 'tara', 'line', 'dral', 'vane', 'gate'],
  },
  combine: {
    a: ['Vey', 'Assa', 'Bulli', 'Ingo', 'Ledg', 'Ferro', 'Ochre', 'Gant'],
    b: ['ra', 'yard', 'on', 'tas', 'erin', 'vane', 'holt', 'ridge'],
  },
  covenant: {
    a: ['Cin', 'Pyra', 'Lita', 'Ember', 'Vigi', 'Sanc', 'Kindle', 'Ash'],
    b: ['dral', 'los', 'nia', 'mark', 'lance', 'tum', 'row', 'fell'],
  },
  freeholds: {
    a: ['Kess', 'Varn', 'Siro', 'Zeph', 'Harr', 'Gale', 'Moot', 'Skerry'],
    b: ['ari', 'holt', 'cco', 'yr', 'ow', 'stead', 'vik', 'moor'],
  },
  none: {
    a: ['Nul', 'Ost', 'Ferr', 'Dun', 'Grey', 'Mar', 'Tor', 'Wold'],
    b: ['mark', 'en', 'ide', 'moor', 'fall', 'row', 'gard', 'wick'],
  },
};

export class NameForge {
  private readonly used = new Set<string>();

  private unique(base: string, alt: () => string): string {
    let candidate = base;
    let guard = 0;
    while (this.used.has(candidate)) {
      candidate = alt();
      if (++guard > 200) {
        // Deterministic last resort: numeric disambiguation.
        candidate = `${base}-${guard}`;
      }
    }
    this.used.add(candidate);
    return candidate;
  }

  regionName(rng: Rng): string {
    const make = (): string => {
      const style = rng.int(0, 3);
      const first = rng.pick(REGION_FIRST);
      const second = rng.pick(REGION_SECOND);
      if (style === 0) return `The ${second === 'Weft' ? `${first} Weft` : second}`;
      return `${first} ${second}`;
    };
    return this.unique(make(), make);
  }

  systemName(rng: Rng, flavor: FactionKey, band: 'named' | 'open' | 'deep'): string {
    if (band === 'open') {
      const make = (): string =>
        `OW-${String(rng.int(100, 1000))}-${String.fromCharCode(65 + rng.int(0, 26))}`;
      return this.unique(make(), make);
    }
    if (band === 'deep') {
      const make = (): string =>
        `DW-${String(rng.int(100, 1000))}-${String.fromCharCode(65 + rng.int(0, 26))}`;
      return this.unique(make(), make);
    }
    const bank = PHONEMES[flavor];
    const make = (): string => {
      const name = rng.pick(bank.a) + rng.pick(bank.b);
      return name.charAt(0).toUpperCase() + name.slice(1);
    };
    return this.unique(make(), make);
  }

  stationName(rng: Rng, systemName: string): string {
    const kind = rng.pick(['Anchorage', 'Bastion', 'Terminal', 'Refuge', 'Yard', 'Spindle']);
    const make = (): string => `${systemName} ${kind} ${rng.pick(['I', 'II', 'III', 'IV', 'V'])}`;
    return this.unique(`${systemName} ${kind} I`, make);
  }

  /** Authored flagship station names for the four capitals (doc 01 §6). */
  capitalStationName(faction: FactionKey): string {
    const authored: Record<FactionKey, string> = {
      accord: 'The First Loom',
      combine: 'Assay Prime',
      covenant: "Pilgrim's Rest",
      freeholds: 'The Long Moot',
      none: 'Waystation Zero',
    };
    return this.unique(authored[faction], () => `${authored[faction]} Annex`);
  }
}

export const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
