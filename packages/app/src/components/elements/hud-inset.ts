/**
 * HOME-HUD-PADDING: the home HUD's one inset at the top and on both sides, as classes, so the home and the previews of its corners
 * (`Containers/Balances`' `Stack*`, `Containers/PlayerBadge`) lay out alike. The values are the theme's tokens (`--hud-inset` and
 * `--hud-inset-top`, `-left`, `-right` in theme.css: 8 px on a phone, 16 from `tablet`, each edge's safe area added there).
 */
export const HUD_INSET_BOX = "pt-(--hud-inset-top) pr-(--hud-inset-right) pl-(--hud-inset-left)";

/**
 * The phone's balance plates (below `desktop`) moved onto the profile's painted edge, the near-black outline its CSS frame draws
 * 1.5 px outside the card's box (HUD-FRAME-CSS): their icons' art keeps a margin in its square and the 44 px target centres the
 * 40 px icon, so their painted top and right sat about 5.7 and 4.3 px further in than the card's outline (measured on the art's
 * opaque pixels by the `Scenes/Home` `HudInset*` stories' play, at 320, 375 and 667 px alike).
 * Only while plates are drawn (`has-` a HUD frame): Connect, the loading stand-in and the error mark keep the plain inset. From
 * `desktop` the rail's plates stay where they were (the desktop layout is kept).
 */
export const HUD_PLATES_NUDGE = "has-[[data-slot=hud-frame]]:-mt-1.5 has-[[data-slot=hud-frame]]:-mr-1";

/**
 * The capsules (below `desktop`) moved onto the profile's painted edge the same way: their icons' painted left sat about 2.75 px
 * further in than the card's outline (the same stories' play). From `desktop` they stay where they were.
 */
export const HUD_CAPSULES_NUDGE = "-ml-0.75 desktop:ml-0";
