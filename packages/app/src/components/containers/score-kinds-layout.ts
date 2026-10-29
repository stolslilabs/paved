// The village score's kinds' row (#831, scaled up by V4-VILLAGE-POINTS-SIZE), apart from the lazy list: the accordion's folded
// box lays out an invisible row the same way, so it is as wide folded as unfolded and never jumps.

/** One row: a fixed height (the stand-in while the list's chunk arrives is four of them), on one line. */
export const KIND_ROW = "flex h-8 items-center gap-2 whitespace-nowrap desktop:h-9";
/** A kind's icon: `sm`, `md` from `desktop`; 1.25em wide, so the column lines up. */
export const KIND_ICON = "desktop:text-[1.25rem]";
/** The icon column's box where no icon stands (the "Other" row, the sizer). */
export const KIND_ICON_BOX = "w-[1.25em] shrink-0 text-[1rem] desktop:text-[1.25rem]";
/** A kind's points, at the row's end: the figures line up in a column (tabular). */
export const KIND_POINTS = "numeric ml-auto font-semibold";
/** The list's padding under the total, the button's sides. */
export const KINDS_PAD = "px-3 pb-2";
