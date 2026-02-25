import { PlanType } from "./types/plan";

const PLAN_KEYS: Record<PlanType, string> = {
  [PlanType.None]: "00",
  [PlanType.CCCCCCCCC]: "ccccccccc",
  [PlanType.CCCCCFFFC]: "cccccfffc",
  [PlanType.CCCCCFRFC]: "cccccfrfc",
  [PlanType.CFFFCFFFC]: "cfffcfffc",
  [PlanType.FFCFFFCFF]: "ffcfffcff",
  [PlanType.FFCFFFFFC]: "ffcfffffc",
  [PlanType.FFFFCCCFF]: "ffffcccff",
  [PlanType.FFFFFFCFF]: "ffffffcff",
  [PlanType.RFFFRFCFR]: "rfffrfcfr",
  [PlanType.RFFFRFFFR]: "rfffrfffr",
  [PlanType.RFRFCCCFR]: "rfrfcccfr",
  [PlanType.RFRFFFCFR]: "rfrfffcfr",
  [PlanType.RFRFFFFFR]: "rfrfffffr",
  [PlanType.RFRFRFCFF]: "rfrfrfcff",
  [PlanType.SFRFRFCFR]: "sfrfrfcfr",
  [PlanType.SFRFRFFFR]: "sfrfrfffr",
  [PlanType.SFRFRFRFR]: "sfrfrfrfr",
  [PlanType.WFFFFFFFF]: "wffffffff",
  [PlanType.WFFFFFFFR]: "wfffffffr",
};

export function getPlanKey(plan: PlanType): string {
  return PLAN_KEYS[plan] ?? "00";
}

export function getTilePath(plan: PlanType, basePath = "/assets/tiles"): string {
  return `${basePath}/${getPlanKey(plan)}.png`;
}

const CHARACTER_KEYS = ["lord", "lady", "adventurer", "paladin", "pilgrim"] as const;

export function getCharacterKey(index: number): string {
  return CHARACTER_KEYS[index - 1] ?? "00";
}

export function getCharacterPath(index: number, basePath = "/assets/characters"): string {
  const key = getCharacterKey(index);
  return key === "00" ? `${basePath}/00.png` : `${basePath}/${key}.png`;
}
