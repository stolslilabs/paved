// The quests' bonus (PvP v2, #732, #738, owner decision of 2026-10-24): finishing every quest of a day or a week gives bonus
// Cobbles instead of a free Challenge game, so the economy holds without PAVED, vPAVED and the Challenge (which still counts
// towards quests).

/** The bonus Cobbles of finishing every quest of a period (#738 open point 1: 20 a day, 60 a week). */
export const QUEST_BONUS_COBBLES = { daily: 20, weekly: 60 } as const;
