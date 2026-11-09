Follows [`profile.webp`](../profile.webp), 2026-11-06.

CHESTS-PAGE and END-SCREENS (2026-11-06), after the Paved UX Book's "Open a chest" (`chest-reveal`) and the victory screen's
`attack-end` and `attack-chest`. The owner's ruling of the same day: every chest is opened where it is won, so the Chests page
(`/village/chests`) is gone, with its dock item, its badge and the village page's Chests; the dock's place is Ranking, the HUD's
trophy, leading nowhere until the Leaderboard comes. A chest holds no Cobbles. The ends of a game (`containers/game-end.tsx`) are
the book's window over the blurred board (the HUD's frame), in the book's lettering: Lilita One for the verdict and the reveal's
headings (`font-game`), Fredoka for the rest (`font-round`), both self-hosted from `@fontsource` (OFL, the owner's ask). Its three
painted stars over it fill with gold from left to right as the score goes (`starFills`: each star a third of the way to three, the
attack's own thresholds), in place of the percentage meter; an empty star is the painted star in greys, its outline and relief
kept; a partial one is grey with its gold share and does not shine; a full one pops in with a sound and a buzz, the book's light
behind it (`StarLight`: the book's own light of one star, a yellow heart, fine orange rays and three sparkles; full stars side by
side share one sunburst, as the book's; alive as the opened chest's light, `Shine`: bursting in with a flash as the star's gold
completes, waves of it gushing out from then, two copies turning either way, breathing) and sparkles twinkling round it (tight, the
owner's ask; the PvP end's board starts loading once the stars are lit, its renderer's start no longer freezing them); the verdict large in gold outlined in black,
what it was against, the score; a carved card of the crowns (the painted
crown, large; won or lost, before and after, the league's crest shining on a promotion, on two lines) and the XP (the level's star,
large; "+20 XP" and the Profile's own level bar, `LevelBar` without its star); the chest's
panel (`EndChestPanel`: the book's gold panel and its chest shaking over "Tap to open", the reveal over the end on a tap; the tile
kept said once claimed; capped, carved, the slots' reset counting down in the Missions' chip); the book's two answers (PvP: Home and
Again; Story: Retry and Next, the owner's words), Levels under Story's. No League and no closings' window (the owner's asks of the
same day); the board kept: the drawers' red cross at the window's top right closes the scores on the game's board, clear, and a
gold Scores pill at the screen's foot brings them back, at once (`ShowScores`). The PvP end (`/pvp/result/:id`) and the Story end (`StoryEnd`) share it; the chest of the game is found among those
waiting by its rank and origin and opened there (`routes/end-chest.tsx`). A chest left to open (drawn and left, or won and not
opened: the end left before its tap) is asked over the home when the app runs (`routes/chest-prompt.tsx`, `home-hosts.tsx`). The
reveal (`containers/chest-modal.tsx`, `chest-reveal.tsx`): over the blurred page at every width, in front of everything; tapped,
it cannot be closed until a tile is taken. "Choose 1 of 3" in large outlined type (no rank's word over it), the tiles flying out of
the chest as the book's cards: about square (120 px at most), the tile's angled render in the player's skin inside, its whole width,
its navy backdrop keyed out (an SVG filter on the renders' one band of navies) and brightened, its name on one line under its point
(`TILE_NAMES` of `elements/tile-render.tsx`, 12 characters at most), its rarity a word in see-through white (a trial on these
cards); the first chosen from the start and one always (a tap moves the choice, none takes it back); the chosen card the book's gold
(`GOLD_FILL`), a light crossing it, its rim lit as by a light facing it, the opened chest's rays faint behind it; the others the
house's grey (`CARD_GREY`); soft shadows, no lip; a bounce on the pick, in place. Under them the chest open, its light gushing
(`chest-art.tsx`: rays turning and breathing, waves springing from its mouth), then Take, the gold pill at 52 px, its word outlined
in black, glowing, breathing, a light crossing it. A buzz at each beat (Android's browsers; iOS Safari has no Vibration API). The
tile kept on its gold card with one answer, Claim, back to the end (or the home). Gaps from the book: #874's chests (the epic gold
and crimson, the rare oak and steel, not violet and blue); the cards not chosen grey, not navy. The star light
(`chest-sources/fx/star-light.webp`) was extracted by Codex's built-in image tool from the book's `attack-end` crop, the light of
one star alone on pure black, the black then turned to transparency (alpha from the brightest channel, the colour unpremultiplied),
checked side by side with the book; the sparkle (`glint.webp`) painted by the same tool; both served by
`scripts/compress-chest-art.ts`. A first halo it painted, and a light drawn in CSS after it, were dropped (a grey haze, then not the
book's: the owner's notes). The chest to open on the end's gold panel and the promoted league's crest sit in the book's gold halo,
the Missions' own (`PrizeHalo`, `gift-glow`), the chest with sparkles round it.
