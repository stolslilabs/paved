Follows [`profile.webp`](../profile.webp), 2026-11-05.

EDIT-VILLAGE (2026-11-05), after the Paved UX Book's "Edit my village" (the owner's approved mockups: the village score's tap opens
edit mode, tiles moved from the inventory, three layouts, the save's return home), the Missions' method and the owner's asks of the
same day, each step shown as screenshots at 320, 375, 768 and 1440 px. The bar (`containers/edit-bar.tsx`): one band in the HUD's
frame, Back as the HUD drawers' chevron (in place of the book's gold disc), "Edit" (at every phone's width, the owner's ask), the
book's die on the HUD's raised disc, Erase held (#756's Reset all, the whole layout back to the starter: the eraser, the
owner's ask, in place of the book's reset arrow), Save on a disc as a floppy disk and Use on the book's gold pill: the layout
shown made the village attackers face, asked first (#804's Make active), pressed in and off on the village's own, off until the
layouts are served, never hidden, so the bar's buttons keep their places (the owner's asks: Use in Save's place, Save an icon,
"Active" the carousel's alone). From `tablet` the bar is the side menu's band (the owner's asks: floating, it was out of place
there, first on desktop, then on tablet), as the HUD drawers' (the Missions', the profile's, the League's): their band over their
lighter body, their width where there is room (half the screen on a tablet, at least 22 rem), "Edit village" ("Edit" under `desktop`)
on the left in their title's display font, their red close at the end in Back's place. Edit mode's questions
(`containers/hud-dialog.tsx`: the layouts' load, use and unlock, and Leave without saving) in the drawers' look too (the owner's
asks: the old card did not match; the book draws no such popup): their band, title and red close (it cancels: no Cancel beside it),
their body, one answer the body's width as the Shop's raised button with its icon (Unlock as the Shop's price, the Cobble and the
figure, the Cobbles held under it; Leave in red with the way out: it drops the changes; the village page keeps the app's card). The layouts (`containers/layout-slots-strip.tsx`) are a carousel of one above the inventory at every width (the owner's ask:
in place of the book's cards): ‹ Layout N, "Active" or "Empty" ›; an arrow loads the next layout into the editor (asked first over
changes kept nowhere; an empty one keeps the draft, Save keeps it there) and the scene slides in from that side (not under reduced
motion); a locked layout is a step of its own (#1033: the layouts are bought in any order, and a locked layout 2 must not wall off
an owned layout 3): shown, its word is its Purchase (the book's padlock, the Cobbles and #804's price), asked first, the draft and
Save's layout unchanged (said under it), the arrows going on past it; once bought the carousel moves on to it. Use waits for a save
(it takes the saved layout).
The points (`EditPoints`, `containers/edit-panel.tsx`) at the top left, under the bar (at the top from `tablet`): the live score as the home's village capsule
(the village tile, not the book's crown; its change against the saved beside it) and every structure's line under it on the home's
soft veil, a tap lighting the structure (#758), its line ringed inside its edge. The tile's actions (`containers/village-bubble.tsx`): the book's Rotate, Back to the
inventory and Cancel, icons alone on the soft veil of the home's mission preview, above the tile (the owner's ask, in place of the
book's speech bubble and words). The inventory (`containers/edit-panel.tsx`, in place of the book's floating window and its tabs, at
the owner's asks): on a phone a plain bottom sheet at the foot (square corners, no grabber, one height, a carousel with no scroll
bar), from `tablet` a side menu at the right under the docked bar, the screen's height (a grid); "Inventory" in the display font, the drawers' engraved rule up
to the slots used with the slabs (`deck`); the cards the tiles' top-down art (the owner's choice over the book's angled renders,
whose images carry a slate square) with the dock's red count. The camera frames the village between the bar, with room for the
tile's actions, and the inventory; the plan view (no WebGL, or the renderer failed) scrolls in the room the bar and the inventory
leave, padded past the points' column, so every tile and lit cell can be tapped (#1033, `e2e/edit-plan.e2e.ts`); its still tile
actions stand over a phone's sheet, at the side menu's top from `tablet`. The tile's actions on the scene keep left of the side menu,
told by its mark (`data-edit-panel="side"`), not its place. Back home after a save, the capsule counts up (#802) and the book's notice, "Layout saved · 874
(+36)", shows for a few seconds (under the profile on a phone: our HUD has no room between the profile and the balances). Gaps
kept: the HUD's grey rim and charcoal faces in place of the book's blue and navy; the tile in hand sits on its cell in the boards'
placed tint rather than floating over a glowing cyan cell (a renderer change); the book's 25 px round buttons at the 44 px touch
floor; one size at every width, not the book's larger desktop bar (the stylesheet's budget: the editor's looks are two utilities,
`gold-pill` and `hud-disc`, and styles). The inventory, the points and the tile's actions are chunks of their own, so the home's
first load does not grow. Rotate, the crate, the padlock and the book's Save pill (Use's) were decomposed and cut from the book's
own pixels by Codex (its image tool unavailable), Cancel by script, each checked side by side with the book; the floppy disk and
the eraser (chunky, about square, in neutral greys: the owner's asks), which the book does not draw, painted by Codex's built-in
image tool after the HUD's icons, and the book's die redrawn by it with a real die's faces (its cut, enlarged, was blurry: the
owner's ask), each checked beside them at 128, 32 and 24 px (`scripts/compress-ui-art.ts`).
