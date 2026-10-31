/** A chest's rank (issue 732): basic one tile with no choice, rare one of 2, epic one of 3. */
export type ChestRank = "basic" | "rare" | "epic";

/** The tiles a chest of each rank shows: the player keeps one. */
export const CHEST_CHOICES: Readonly<Record<ChestRank, number>> = { basic: 1, rare: 2, epic: 3 };
export const CHEST_NAME: Readonly<Record<ChestRank, string>> = { basic: "Basic chest", rare: "Rare chest", epic: "Epic chest" };

/**
 * The chests (the owner's direction of 2026-10-31, `docs/design/chests.webp`, which supersedes issue 874's SVG drawings): three
 * ranks in a Supercell-like mobile game's rendering, each told apart by its shape and materials as well as its colour. Basic: oak
 * planks, iron bands and a round bronze lock. Rare: walnut under silver plating, studded corner guards, a shield lock set with a
 * sapphire. Epic: engraved gold over crimson panels, a crown on the lid, an emerald medallion, rubies, a velvet lining. Each in two
 * versions: the icon (`ChestIcon`) and the art that opens (`ChestArt`), images in `chest-images.ts`.
 */
export const CHEST_RANKS: readonly ChestRank[] = ["basic", "rare", "epic"];

/** The detailed art's sizes, as the rem of its square box: the slots' chests (`xs` three in a row once won, `sm`), the modal's (`lg`, `xl`). */
export const CHEST_ART_REM = { xs: 4, sm: 6, md: 8, lg: 12, xl: 16 } as const;
export type ChestArtSize = keyof typeof CHEST_ART_REM;
/** The opened chest, grey and dimmed: inline, so the stylesheet gains nothing. */
export const CHEST_SPENT = { filter: "grayscale(1)", opacity: 0.6 } as const;

/** The modal's chest drops in from above and lands (s): its shake waits for it (`ChestArt`'s `drop`). */
export const CHEST_DROP_S = 0.6;

/** Each rank's light (the opening's rays, the glow at rest): its medal colour. */
export const RANK_LIGHT: Readonly<Record<ChestRank, string>> = { basic: "var(--medal-3)", rare: "var(--medal-2)", epic: "var(--medal-1)" };
