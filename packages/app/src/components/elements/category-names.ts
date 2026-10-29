import type { CategoryType } from "@paved/game-core";

// The categories' names apart from their icons (`category.tsx`), split out by V4-VILLAGE-POINTS-SIZE for the village score's
// folded box (which no longer reads them: its rows show no name since V4-VILLAGE-POINTS-3). Keyed by `CategoryType`'s values as strings, with a type import only: the enum's module
// brings the game's constants, which the home's first load does not carry.

export type CategoryName = { label: string; plural: string };

export const CATEGORY_NAMES: Partial<Record<`${CategoryType}`, CategoryName>> = {
  Forest: { label: "Forest", plural: "Forests" },
  Road: { label: "Road", plural: "Roads" },
  City: { label: "City", plural: "Cities" },
  Wonder: { label: "Wonder", plural: "Wonders" },
};
