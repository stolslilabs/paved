Follows [`profile.webp`](../profile.webp), 2026-11-05.

SHOP-PAGE (2026-11-05), after the Paved UX Book's Shop (the owner's approved mockups, "Buy a tile", "Get Cobbles", "Buy a theme"):
Tiles, Cobbles and Themes as tabs of one Shop (`/village/shop`, the tab in its URL, `?tab=cobbles`, `?tab=themes`, a change
replacing the entry), the HUD's drawer as Missions (`PageDef.drawer`): a full page with Back on a phone, from `tablet` a side panel
docked at the right (the owner's choice over the book's centred window), the Cobbles at its header's end, and USDC beside them on
the Cobbles tab (USDC alone under 360 px, where the two plates and the title do not fit). The tabs are the book's words, the current
one lit and underlined in gold (`ui/tabs.tsx`). One card style (`containers/shop-card.tsx`) in one carved panel, a faint rule between
the cards: the art, the name, a chip and a line, then the price's button, raised grey (the owner's choice "C" over the book's blue
and the house gold), dimmed while it cannot be pressed, Bought or Owned carved in its place. Tiles: the time until tomorrow's tiles
in a carved chip, the day's three tiles as the board draws them (the build-time renders, faded at their edges and drawn larger:
they stand on an opaque navy backdrop), their rarity, the tiles held; a tile bought says so in the app's toast. Cobbles: the four
packs two a row, each its pile of stones and its price in USDC; a price picks the pack (ringed in gold) and Pay buys it, the
purchase's flow unchanged (#621). Themes: each theme on sale a section (its painted mark, its name, its tiles owned, All tiles), its
first three tiles not owned in the cards, then the themes to come, Coming soon; All tiles opens the theme's own view in place of
the tabs, sliding in, its Back to the tab (the owner's rule of the same day: never a sheet over a sheet). The old `/cobbles` and
`/settings/theme/:theme` land on the Shop's tabs; Settings keeps Themes (Use a theme), its tiles now the Shop's; the Cobbles' plate
opens the Cobbles tab from the home and is inert in the Shop. The rarity chips take the book's pills everywhere (the owner's ask:
grey, green, purple). Gaps from the book: the tiles' names (the book's "City corner" and the like are no data: the plans keep
"Tile 2"), no "Popular" tag (no rule says which pack is), the old discount chips left, the renders' navy backdrop faded rather than
removed, Volcano's mark Font Awesome's (the book draws none). The book's own pixels, Codex's image tool not being available that
day: the themes' marks (leaf, snowflake, cactus), cut from its phone Themes screen; and, on the owner's asks of the same day, the
rarity pills (text-free, the word written by the client) and a painted pile a Cobble pack (in place of a stack of the Cobble's
stone), extracted by Codex from its Tiles and Cobbles screens (`packages/app/ui-sources/shop/`, `scripts/compress-ui-art.ts`).
