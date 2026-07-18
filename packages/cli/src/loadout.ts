/** Convert a core FitLoadout (branded ItemTypeId arrays) to the plain-string
 *  shape the protocol's FIT_SHIP payload expects. */

import type { FitLoadout } from '@starweft/core';

/** Mutable-array shape matching StarweftClient.fitShip's parameter. */
export interface MutableLoadoutJson {
  hullId: string;
  hardpoints: string[];
  auxiliary: string[];
  core: string[];
  weaves: string[];
}

export function toLoadoutJson(fit: FitLoadout): MutableLoadoutJson {
  return {
    hullId: fit.hullId as string,
    hardpoints: fit.hardpoints.map((id) => id as string),
    auxiliary: fit.auxiliary.map((id) => id as string),
    core: fit.core.map((id) => id as string),
    weaves: fit.weaves.map((id) => id as string),
  };
}
