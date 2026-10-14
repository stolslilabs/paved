import { PlanType, getPlanKey } from "@paved/game-core";

/** The 19 base plans the game plays, in the contracts' order (`PlanType` without None). */
export const BASE_PLANS: readonly PlanType[] = Object.values(PlanType).filter((p) => p !== PlanType.None);

/** The chain id of a plan (`PlanType`'s index): what `TileView` takes. */
export const planId = (plan: PlanType): number => Object.values(PlanType).indexOf(plan);

/** The file key of a plan: its nine letters in lower case, as `models/<key>.glb` and `assets/tiles/<key>.png`. */
export const planFile = (plan: PlanType): string => getPlanKey(plan);

export type Density = "LF" | "HF";

/**
 * The variants of `origin/dev` (PR #162) per base plan: how many `<plan>_LF_<n>` and `<plan>_HF_<n>` models exist, `n`
 * from 1. `__tests__/tiles.test.tsx` checks this table against `public/models/extended/`.
 */
export const EXTENDED_VARIANTS: Readonly<Record<string, Readonly<Record<Density, number>>>> = {
  ccccccccc: { LF: 1, HF: 1 },
  cccccfffc: { LF: 4, HF: 4 },
  cccccfrfc: { LF: 3, HF: 3 },
  cfffcfffc: { LF: 3, HF: 3 },
  ffcfffcff: { LF: 3, HF: 3 },
  ffcfffffc: { LF: 2, HF: 2 },
  ffffcccff: { LF: 5, HF: 5 },
  ffffffcff: { LF: 5, HF: 5 },
  rfffrfcfr: { LF: 4, HF: 4 },
  rfffrfffr: { LF: 8, HF: 8 },
  rfrfcccfr: { LF: 5, HF: 5 },
  rfrfffcfr: { LF: 3, HF: 3 },
  rfrfffffr: { LF: 9, HF: 9 },
  rfrfrfcff: { LF: 3, HF: 3 },
  sfrfrfcfr: { LF: 3, HF: 3 },
  sfrfrfffr: { LF: 4, HF: 4 },
  sfrfrfrfr: { LF: 1, HF: 1 },
  wffffffff: { LF: 4, HF: 4 },
  wfffffffr: { LF: 2, HF: 2 },
};

/** The extended model file names (without `.glb`), plan by plan, low density first. */
export const EXTENDED_MODELS: readonly string[] = Object.entries(EXTENDED_VARIANTS).flatMap(([plan, counts]) =>
  (["LF", "HF"] as const).flatMap((d) => Array.from({ length: counts[d] }, (_, i) => `${plan}_${d}_${i + 1}`)),
);

/**
 * The 2D tiles of `origin/dev` that the 19-model set lacks (`public/models/extended/tiles/<key>.png`): plans of the old
 * game that have no model and no `PlanType`.
 */
export const EXTRA_TILES: readonly string[] = [
  "cfcfccccc", "cfcfcfcfc", "cfcfcfffc", "cffcfcffc", "cfffcfrfc", "fccfcccfc", "fccfcfcfc", "ffcfcccff", "ffcfcfcfc",
  "ffcfffccc", "ffcfffcfc", "rfffffcfr", "rfffrfcff", "rfrfcccff", "rfrfffccc", "rfrfffcff", "sfffffffr", "wcccccccc",
];
