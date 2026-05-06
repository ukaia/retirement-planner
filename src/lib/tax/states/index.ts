import { alaska } from "./alaska";
import { idaho } from "./idaho";
import { oregon } from "./oregon";
import { washington } from "./washington";
import type { StateCode, StateTaxModule } from "./types";

export const STATE_TAX_REGISTRY: Record<StateCode, StateTaxModule> = {
  AK: alaska,
  WA: washington,
  OR: oregon,
  ID: idaho,
};

export function stateTaxModule(code: StateCode): StateTaxModule {
  return STATE_TAX_REGISTRY[code];
}

export type { StateCode, StateTaxModule } from "./types";
