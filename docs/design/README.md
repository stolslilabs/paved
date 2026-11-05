# Design references

Reference images the client is drawn after. They are not shipped: nothing under `docs/` is bundled.

- `league-standards.webp`: the leagues' standards as the owner redrew them (2026-11-01), ten tiers from Unranked to Grand Master,
  each row its crest (plain, then III, II, I), its banner (the same), its blank plate and its avatar rim. One material and one
  colour a tier, and the same shield, banner, plate and ring for all: cracked mossy stone (Unranked, a torn banner), oak (Wood),
  hammered iron, bronze, silver, gold, then cut emerald, diamond and amethyst (Master), and ruby set in gold (Grand Master). The
  division's numeral in the middle of the crest and the banner; Grand Master, which has none, its golden horned helmet; Unranked
  and Wood an empty field. Generated with OpenAI's image model through the Codex CLI, cut and put on the client's frames as
  `scripts/compress-league-art.ts` describes.
- `season-wheel.webp`: the season wheel (2026-10-31), aligned that day with the player badge: the badge ring's paving stones,
  gold blocks and groove around the four seasons as one little planet (summer top right, then autumn, winter, spring), the day and
  night disc at the centre (night 135°, day 225°), the gold arrow cap at 12 o'clock and its inner notch reading the season and the
  time of day; the two painted discs toned to a warm grey (60 % chroma) so the gold reads over them. Six moments of the cycle at
  512, 144 and 96 px. Generated with OpenAI's image model through the Codex CLI; the client's layers are in
  `packages/app/wheel-sources/` (`scripts/compress-wheel-art.ts`).
- `chests.webp`: the chests' sheet (2026-10-31), approved by the owner: the basic, rare and epic chests closed, open and as icons,
  and the opening's effects (rays, a sparkle, a dust puff), in a Supercell-like mobile game's rendering, original designs. Generated
  with OpenAI's image model through the Codex CLI; each asset was then generated again alone from its cell (the open chests' lids
  redrawn to swing up on their hinges) and the open chest cut into its lid and body. The client's layers are in
  `packages/app/chest-sources/` (`scripts/compress-chest-art.ts`).
- `balances.webp`: the balances' direction A (2026-11-01), chosen by the owner among three: the player badge's name plate made
  small (a slate face between two rows of bricks, a gold point closing its open end) and the four currencies as single objects,
  the Cobbles a hewn paving stone, PAVED a thick gold coin with its "P", vPAVED the same coin in silver (its padlock dropped by the
  owner), USDC the same coin with Circle's mark. Generated with OpenAI's image model through the Codex CLI; each asset was then
  generated again alone (vPAVED and USDC from PAVED's coin), the stone toned to the badge's, and USDC's face given Circle's own
  mark. The client's images are in `packages/app/token-sources/` (`scripts/compress-token-art.ts`). The plate gave way to the HUD's
  frame of `home.webp` (HOME-UI-CAPSULES, 2026-11-02).

- `home.webp`: the home's mobile direction (2026-11-01), chosen by the owner after rounds of proposals in Supercell's rendering:
  the player card (the avatar in its league's rim and crest, the name, the XP bar with its level star and "90/150"), the trophies
  (to the League) and the village score (to the build mode) as capsules whose icon caps their left end, the balances mirrored on the
  right edge, the season dial as a half-disc on the left edge (it stays during a game), Chat on the left edge, Missions, Vault and
  Friends on the right, and an anchored ribbon dock: Shop, Chests, PLAY, Guild, Settings. Generated with OpenAI's image model through
  the Codex CLI; its icons and frames are in `packages/app/ui-sources/` (`scripts/compress-ui-art.ts`). The owner kept the app's
  layout (2026-11-02): its components take this direction one at a time, the player card first (`containers/player-badge.tsx`), then
  the capsules and the balances (HOME-UI-CAPSULES), then the dock (HOME-DOCK, 2026-11-03): its wood, parchment, dividers and PLAY
  medallion cut from this mockup's footer (Codex redrew each layer at the footer's framing, registered on the mockup until their
  restack matched it) and drawn at its scale, Shop, Chests, PLAY, Guild, Settings (Guild in League's place), full width on a phone,
  centred from a tablet, on the home from a desktop too. The season dial keeps its look for now: the mockup's, tried on 2026-11-02, was set aside to come back to.
  HOME-EDGES (2026-11-04), the rest of the home's buttons from the book (`containers/home-edges.tsx`, its own chunk): the right
  column's four tiles, Missions, Vault, Friends and Tiles (to My tiles, the skins owned; the book's Collection, renamed Tiles here
  and in the profile at the owner's ask), at every width, centred under the balances; the orange Chat tab on the left edge, the
  screen's safe area inside it; the mission in progress (the day's first daily not done: its title, "4/8", a gold ring around the
  hammer, and its task on one line in place of the book's bar) at the left 16 px above the dock (clear of PLAY's medallion), 18 rem
  wide (less on a narrow phone, clear of the Camera button), in the owner's place rather than the book's (centred over the dock),
  on a veil almost see-through, blurred, its edges faded, no border. The Edit hammer left: the
  village score's capsule opens edit mode. The book's blue tiles, redrawn by Codex from its crops, were set aside by the owner as too
  blue; a grey CSS face, then three directions in the HUD's greys drawn by Codex (the capsules' frame, a carved slate, a soft
  charcoal) were tried under the real icons, and the owner settled on none: the right column draws its icons and their names alone
  over the village, on transparent 64 px hit boxes. The Chat tab keeps the book's orange, redrawn at its new size (56 x 64 points).
  The tab and the mission's hammer (an icon) are in `packages/app/ui-sources/`. HUD-RIM-GREY (the
  same day, the owner's ask): the HUD's frame (the player card, the capsules, the balances, the drawer) takes this mockup's rim, a
  cool grey lit along its top and darker at its foot, its painted patches a grey noise, in place of the blue slate and its blue and
  violet noise, 3 px on every box whatever its size (sampled on the capsules here; `--hud-rim*` in `theme.css`). CAMERA-EXPLORE (the
  same day): the Camera mode's button at the bottom right reads Explore, an icon over the word as the right column's, no box; of
  three icons Codex drew in the icons' rendering (a spyglass, an eye in a turning arrow, a house on its tile with an arrow in orbit
  round it), the owner chose the house, the prettiest if not the most literal (`packages/app/ui-sources/icons/explore.webp`). In the
  mode every overlay leaves the screen by its nearest edge, the profile and the balances too, in three waves 90 ms apart (the dock
  and the edges' buttons, the capsules' column, then the profile and the balances), and comes back in the reverse order; Exit, an icon
  over its word drawn by Codex as Explore's companion (the same house, a straight arrow going out of it; `exit.webp`), goes down to
  the screen's corner. A cut under reduced motion.

- `profile.webp`: the profile's mobile direction (2026-11-02), in `home.webp`'s rendering: what a tap on the player card opens, a drawer
  that rises over the village and stops under the HUD (the player card and the capsules stay in view): "Your profile", the avatar in
  its league's rim and crest, the name, the short address with Copy, the guild, the level and its XP bar, Games, Best, Followers and
  Following in one band, four actions as tiles (Battle logs, Avatar, Collection, Invite) and Disconnect. Generated with OpenAI's image
  model through the Codex CLI; its four new icons were redrawn from crops of it (`packages/app/ui-sources/icons/`). The owner's
  pattern of 2026-11-02: a page is a side panel on a large screen and a full page with Back on a phone, the same layout in both; the
  profile is the HUD's drawer (`containers/hud-drawer.tsx`, PROFILE-DRAWER): since 2026-11-04 a full page with Back on a phone; from
  `tablet` a side panel docked at the left, the window's height. The dock stays under every page (DOCK-UNDER-PAGES, the owner's ask of
  the same day, in place of the dock over them): veiled and blurred with the village beside a side panel, covered by a phone's page;
  no page carries a dock of its own, its way out is its Back; the swipe between pages, the dock's highlight of the current page and
  its re-tap left with the pages' docks. The owner's changes of 2026-11-03:
  the HUD's frame and the interface's greys in place of the mockup's blue, no Best, no XP line under the bar; of four side-panel
  directions drawn through the Codex CLI that day (a native sheet, frosted glass, game-native, a Material side sheet), the game-native
  one (a darker header band, outlined tiles lit along their top over a dark lip) with the native sheet's straight edge. The HUD's
  frame itself is CSS since that day (HUD-FRAME-CSS, `elements/hud-frame.tsx`). PROFILE-PAGE (2026-11-04), after rounds of
  proposals drawn through the Codex CLI and approved by the owner: titled "Profile", titles in the display font, each section's
  followed by an engraved rule; the presentation (the avatar in its rim, the name with a pencil, the address under it, a tap copies
  it); Level; League (the crowns and the league, chips that wrap); Games and the follow counts; the four actions; the Hall of Fame
  (each season's banner and crowns, four a row, the filter of the Stats); the Stats (Total, then a section per structure type: Total
  points, Best points, Total closed; a figure from a million short, "1.2M"). One rule: what presses is raised, what informs is
  carved. No Disconnect (Settings') and no guild line. Five icons drawn for it in the dock's rendering, the four structures on one
  shared slab and the Stats alone (`packages/app/ui-sources/icons/`). The Hall of Fame and the Stats are the mock's until the
  indexer sums them (`data/player-records.ts`).
  MISSIONS-PAGE (2026-11-04), after the Paved UX Book's Missions (the owner's approved mockups, "Claim a milestone" and "Claim a
  lifetime mission"), in the profile's style: Missions is the HUD's drawer too (`PageDef.drawer`, `routes/home-hosts.tsx`), at
  every width over the home's village: a full page with Back on a phone, from `tablet` a side panel docked at the right, under the
  right column's Missions, its red cross at its header's right end; the title on the left (on a phone right after Back, about 12 px
  from the chevron, as the pages' header), the Cobbles at the header's top right (the HUD's balance the panel covers, the claims'
  bursts' target); the dock under it (DOCK-UNDER-PAGES). Inside, after the owner's asks of the same day (no more text than that):
  the selected mission's card (its medallion, its kind in a carved chip, its title, its task, the description's first clause, and its
  counter, "4 / 8" in gold, the text the card's whole width; a mission with Cobbles of its own claimed from the gift badge at its
  medallion's foot, its tooltip "+20" and the Cobble as the milestones' gifts', silvered until done, then lit in its halo and shaking,
  opening as the claim lands and its Cobbles bursting into the header's balance; no Claim or Go button), the engraved rule; then
  the Tutorial, the Daily, the Weekly and the Achievements (the lifetime missions, the owner's name for them, never locked: nothing
  counted, an achievement is to do) as the profile's sections (display font, engraved rule, the count beside the title, the reset's
  countdown in a carved chip at the row's end), the missions as medallions five a row: each the book's painting of its mission (the
  subject on its painted ground, `elements/medallion-art.ts`), in a silver ring whose gold arc is the progress, green with the book's
  painted check at its foot once done, gold and glowing with the book's gift at its foot while its Cobbles wait, greyed with a lock
  while a Tutorial step waits for the one before; the selected one haloed in gold, a gold point under it. The milestones' line as the
  book's: a thin dark rail in a silver rim, its edges done filled in bright gold, gold orbs reached and dark beads in a silver ring
  ahead, and the book's gift (silvered out of reach; the week's the same gift as the day's, as the book draws them), its tooltip
  "+50" and the Cobble alone. No Limited heading, no paragraph at the page's foot. The paintings (`ui-sources/medallions/`, the
  owner's ask of the same day: the book's images, not the HUD's icons): ten extracted from the book's Missions screens by the session
  "UI layout et design exploration" (its medallions cropped, each face redrawn by Codex without its ring or its badge, the locked
  ones in colour), nine more painted by Codex in their rendering for the missions the book does not draw; each of the book's checked
  side by side with its crop (the helmet, its ground not the book's, left out with the road, the handshake and the tower, drawn by no
  mission). The points take the book's coins, the leagues its banner. The milestones' gift is the HUD's `invite`, the book's red
  gift. The book's painted look (the owner's choice "B" of the same day, among a CSS/SVG rendering and Codex's pieces, compared with
  the mockup at 390 px): the medallions' rings (silver; the gold over it to the progress' arc, full while the Cobbles wait; green once
  done), the milestones' rail (its steel, its gold from the start to the last quest done, 9-sliced), its orbs and beads, and the done
  badge's green check (on a done medallion and a claimed gift, `elements/check-badge.tsx`), each extracted alone from the book's
  Missions screens by Codex and checked side by side with it (`ui-sources/medallions/ring-*`, `ui-sources/missions/`). Its
  gold leans a little more orange than the book's, its beads a little blue: gaps the owner accepted. A waiting gift, on the bar and
  at the card's medallion's foot, sits in the book's gold halo (`gift-glow`, extracted alone the same way; the bar's swells as the gift
  opens), its box rimmed with a light gold and an orange glow.
  LEAGUE-PAGE (2026-11-05), after the Paved UX Book's League (the owner's approved mockups, "Compare a battle"), the Missions'
  method: the League is the HUD's drawer too (`PageDef.drawer`), a full page with Back on a phone, from `tablet` a side panel docked
  at the left, under the HUD's crowns that open it (#829's side), its red cross at its header's right end; at the header's end the
  League control (the painted crown, the crowns, the league's crest; a tap brings the carousel back to the player's league). Its
  waits and refusals (connect, no PvP on the network, loading, a failed read with Retry) in the drawer. Inside, after the owner's
  asks of the same day: the leagues' carousel on the drawer's face (no carved panel, no dots: 24 were too many), two thin muted
  arrows at its edges (subtle arrows rather than the book's chunky chevrons), each card the crest beside the league's name in the
  display font and its range of crowns (no season's reward on the card); the season in one carved row: the book's calendar, the
  season's name, the player's league's Cobbles in the middle (Wood and Unranked: the way to Iron III), its time left in a carved
  chip at the end as the Missions' resets (`Countdown`, the warning colour on its last day; "Ended" once over), no attacks' count
  (it stood for nothing concrete); then the battle logs under the drawer's section title, one carved list of rows: the side's badge
  and name (the book's Attack badge, the crossed swords on a gold shield; Defence, the HUD's blue shield; the name at the 12 px
  floor, its letters tight, a clear gap before the portrait), the rival's portrait in their league's rim with its crest, as tall as
  the three lines beside it (their name; the crowns won or lost, in the gain or the loss colour; the stars and how long ago), then
  behind a vertical rule the score, an attack's XP and its chest's icon, no label. Gaps from the book, each for the 320 to 375 px
  phone: the time under the name beside the stars (wrapping under them where there is no room), the stars' count in words left to
  the stars. The crests stay the owner's standards (the book's hexagons with laurels are not them). The calendar and the Attack badge
  are the book's own pixels, cut from its phone screen (Codex's image tool was not available that day: its models listed no
  `image_gen`), keyed out of their navy panel and checked side by side with the book (`scripts/compress-ui-art.ts`).
  MATCH-PAGE (2026-11-05), after the Paved UX Book's "Battle log" (a match, `/pvp/match/:id`, which a battle log row opens), the
  owner's decisions of the same day, each step shown to the owner as screenshots at 375, 320 and 1440 px: no split (the board's
  renderer draws one board a WebGL context, so the book's draggable split of the rival's village and the player's attack is set
  aside); a full-screen page at every width, not the League's drawer, under the pages' header (`TopBar`) titled "Battle log" with
  Back up to the League; on a phone the page fills the screen, from `tablet` its panels are centred at 42 rem. The one board in a
  framed panel, the book's blue rim and glow (`match-frame`, `--match-rim`), its pan and zoom the board's own, its voids kept (the
  rival's village red, the player's attack blue; in a defence the player's village green, the rival's attack red). The two views
  are two tabs at the board's top corners, the book's own labels, "Rival" and "Your attack" (the owner's choice B among the house's
  segmented bar and these: the labels bare on the board, the active one lit and underlined in gold); a defence's, "You" and "Rival"
  (the owner's choice among three; the book draws only an attack). The flick across the board still switches. The book's three
  gold stars over the board's foot (the earned ones gold, the others greyed), then the caption in the panel, "Attack · Wren of
  Hollowmere · 4,037 · [crown] +30" (the name cut with an ellipsis at 320 px). Under it the replay's panel: the book's round gold
  Play (Pause while it plays), then the moves' timeline centred on it, in the Missions' Daily and Weekly look (the owner's ask of the
  same day: their painted steel rail, its gold up to the move shown, gold orbs passed and dark beads ahead, the move shown a bigger
  glowing orb; as many dots as the width holds, at most the book's twelve, evenly spread; a Radix slider: drag, tap or the arrow
  keys), "Move" over "14 / 23" at its right end (the owner's ask: the book has it under the bar). Play
  or the timeline from the village's tab shows the build; the village's tab pauses the replay. No previous or next step buttons and
  no live score (the book has neither; the timeline's keys step one move). Gaps from the book: no split; the stars and the caption
  stay on both tabs (they are the match's); no blurred village behind the panels (the page's own background). The gold Play and
  the star are the book's own pixels (Codex's built-in image tool was still unavailable: its `imagegen` skill offered only a CLI on
  the OpenAI API), Play keyed out of its navy panel, the star cut from the result screen's glow from its face outward, each checked
  side by side with its crop; Pause, which the book does not draw, derived from Play (its triangle erased, two bars painted in its
  colours) (`scripts/compress-ui-art.ts`).
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
- `avatar-king.webp`: the avatar's render target (2026-10-31): the king as a voxel bust, three-quarter view, on a blurred village.
  The client's bust is built from cuboids measured on it (`packages/renderer/src/core/avatar/avatar-king-spec.ts`) and its view
  fitted to it (`KING_VIEW`). Generated with OpenAI's image model through the Codex CLI.

The leagues' client shows them as images: the masters in `packages/app/league-sources/`, compressed into
`packages/app/public/league-art/` by `scripts/compress-league-art.ts`. Each tier has a crest, an icon and a banner (in four versions on
the seven divided tiers, plain and one per division), a blank nameplate (the app writes the name in its `font-display`) and an
avatar rim.
