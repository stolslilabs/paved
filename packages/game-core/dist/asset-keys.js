import { PlanType } from "./types/plan";
const PLAN_KEYS = {
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
export function getPlanKey(plan) {
    return PLAN_KEYS[plan] ?? "00";
}
export function getTilePath(plan, basePath = "/assets/tiles") {
    return `${basePath}/${getPlanKey(plan)}.png`;
}
const CHARACTER_KEYS = ["lord", "lady", "adventurer", "paladin", "pilgrim"];
export function getCharacterKey(index) {
    return CHARACTER_KEYS[index - 1] ?? "00";
}
export function getCharacterPath(index, basePath = "/assets/characters") {
    const key = getCharacterKey(index);
    return key === "00" ? `${basePath}/00.png` : `${basePath}/${key}.png`;
}
//# sourceMappingURL=asset-keys.js.map