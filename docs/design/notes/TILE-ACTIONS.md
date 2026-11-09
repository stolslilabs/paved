Follows [`profile.webp`](../profile.webp), 2026-11-07.

TILE-ACTIONS (2026-11-07), after the Paved UX Book's board screen (mockup 3 of "Resume a Challenge"), the owner's asks of the same
day: the actions on a tile being placed, on every board and in the home's editor, one painted round button out of each side of the
tile in place of the bubble at its top-right corner (`containers/tile-bubble.tsx`, `tile-actions-layout.ts`). In the owner's order
(the left column cancels and turns, the right one decides): up and left, Cancel (a white cross on a neutral charcoal disc); down
and left, Rotate (the blue turning arrow); up and right, Confirm, held, the gold check; down and right, Discard, held, the white trash
on the red of the HUD's close, its cost in its name (the editor's Back to the inventory in its place, the blue box and its arrow, a
tap). A hold fills the Missions' gold rail (the Daily and Weekly progress, `rail-fill`) round the button, just outside its disc, on a
dark track; Discard's the same tube in red (`--hold-gold-*`, `--hold-red-*` in `theme.css`, sampled from the rail and `close`). The
places are the screen's, not the tile's edges: each button goes out of the tile along a diagonal of the screen, so Confirm stays at
the top right whatever the compass; on the play view (the board seen from the south, its cells square to the screen) they stand out
of the tile's corners, on the book's diamond (the board turned 45 degrees) out of the middle of its sides. An absent action leaves
its place empty (Rotate with one valid rotation; Cancel for an editor's tile from the inventory; Confirm in the editor, whose tap
places the tile); the others never move. The gap to the tile is 6 screen px at every zoom, computed from the tile's outline on
screen (`GameScene.projectCellOutline`, its cell's corners at the slab's top) on each camera notification: the bubble before stood
on a corner projected at the tallest tile's height, 2.625 world units above the board, so its gap grew as the player zoomed in. Far
out the four spread apart so their 44 px targets never meet; each is kept inside the room the HUD, the hand panel and the editor's
side menu leave, a button pinned to an edge taking its neighbour with it rather than meet it. Without WebGL (the plan view) the same
buttons stand still in a row over the hand, in reading order. Holds, keys (R, Escape, Enter or Space held), sounds, haptics, Story's
coach rings and the busy and disabled states are unchanged. The trash, the arrow, the check, the box and the neutral cross were drawn
by Codex's built-in image tool from their crops of the book and the HUD's `info` and `close` (`ui-sources/icons/`, `UI_ICONS`); edit
mode's bare Rotate, Back to the inventory and Cancel left with its bubble.
