/**
 * A control a Story coach mark points at (#546): the board lights it (`CoachMark`, GAME-OVERLAY) while the tip names it ("place": the
 * tile's Confirm, #568).
 */
export type CoachTarget = "place" | "discard" | "deck" | "settings";

/** The box of a control that may be coached: the mark lies behind the control, inside it (`CoachMark`'s `-z-10`). */
export const COACH_BOX = "relative isolate";
