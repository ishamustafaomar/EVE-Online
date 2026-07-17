/** Canonical reference fits: new-character starters and balance-harness inputs. */

import { itemTypeId } from '../kernel/ids.js';
import type { FitLoadout, SkillLevels } from '../fitting/types.js';

const t = itemTypeId;

/** Skills granted to fresh characters (day-one frigate viability, doc 02 §7). */
export const STARTER_SKILLS: SkillLevels = {
  'disc.spaceframes': 2,
  'disc.gunnery': 2,
  'disc.warheads': 1,
  'disc.engineering': 2,
  'disc.shields': 2,
  'disc.armaturics': 2,
  'disc.navigation': 2,
  'disc.subterfuge': 1,
  'disc.extraction': 2,
  'disc.refining': 2,
  'disc.industry': 2,
  'disc.trade': 1,
  'disc.sounding': 1,
  'disc.command': 1,
};

/** Combat starter: ion skirmish Verge. */
export const STARTER_FIT_VERGE: FitLoadout = {
  hullId: t('hull.verge'),
  hardpoints: [t('mod.arc-projector1-l'), t('mod.arc-projector1-l'), t('mod.ember-lance1-l')],
  auxiliary: [t('mod.aegis-pulser1'), t('mod.bulwark-extender1'), t('mod.coilburner1')],
  core: [t('mod.flux-battery1'), t('mod.flux-relay1')],
  weaves: [],
};

/** Mining starter: Mattock with a Burrower. */
export const STARTER_FIT_MATTOCK: FitLoadout = {
  hullId: t('hull.mattock'),
  hardpoints: [t('mod.burrower1')],
  auxiliary: [t('mod.bulwark-extender1')],
  core: [t('mod.surveyor-lens1'), t('mod.flux-relay1')],
  weaves: [],
};

/** Tackle scout: Plumb with snare. */
export const REFERENCE_FIT_PLUMB: FitLoadout = {
  hullId: t('hull.plumb'),
  hardpoints: [t('mod.slugthrower1-l'), t('mod.slugthrower1-l')],
  auxiliary: [t('mod.threadlock1'), t('mod.drag-anchor1'), t('mod.coilburner1'), t('mod.aegis-pulser1')],
  core: [t('mod.flux-battery1'), t('mod.flux-relay1')],
  weaves: [],
};

/** Brawler reference: thermal Brand. */
export const REFERENCE_FIT_BRAND: FitLoadout = {
  hullId: t('hull.brand'),
  hardpoints: [t('mod.ember-lance1-l'), t('mod.ember-lance1-l'), t('mod.ember-lance1-l')],
  auxiliary: [t('mod.coilburner1'), t('mod.drag-anchor1')],
  core: [t('mod.patchweld-mender1'), t('mod.ferrite-wrap1'), t('mod.flux-battery1')],
  weaves: [],
};

export const ALL_REFERENCE_FITS: ReadonlyArray<{ name: string; fit: FitLoadout }> = [
  { name: 'starter-verge', fit: STARTER_FIT_VERGE },
  { name: 'starter-mattock', fit: STARTER_FIT_MATTOCK },
  { name: 'reference-plumb', fit: REFERENCE_FIT_PLUMB },
  { name: 'reference-brand', fit: REFERENCE_FIT_BRAND },
];
