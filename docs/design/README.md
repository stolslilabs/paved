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
  COLLECTION-PAGE (2026-11-05), after the Paved UX Book's Collection ("Turn a tile, zoom, choose its skin"), the Missions' method:
  the page is Tiles (the owner's name, the home's button's), the HUD's drawer at `/tiles` in place of Settings' sheet My tiles
  (`/settings/tiles` lands on it), a full page with Back on a phone, from `tablet` a side panel docked at the right under the right
  column's Tiles, the Cobbles at its header's end. In the profile's and the Missions' style (the owner's ask of the same day, after a
  first pass too far from them): the selected tile's name in the profile's name's weight (bold Rubik, outlined), the tile alone in
  3D over the drawer's face (the owner's choice of a live view: `containers/tile-showcase.tsx`, the renderer on a transparent canvas
  as the hand's stack, first seen as the tile renders are, in a lazy chunk of its own; one WebGL context beside the village's while the
  page is open; the tile's image until its models are in, and without WebGL). The owner's asks of the same day: the finger alone
  presents it, a drag turning it and tilting the view (the renderer's showcase camera, its tilt from straight above to about 76°, never
  from under the tile; the arrow keys the same), no zoom, no arrows, no pedestal (the book's three left). Then a Description (the
  owner's ask, not in the book), read from the plan alone (`elements/tile-features.ts`: the layouts' areas and the sides each opens
  onto): one sentence ("A city open on two sides, a road linking two sides and two forests.") and the profile's carved band of figures,
  the Stats' painted icons beside the tile's cities, roads, forests and wonders, and its copies in the base deck. Then two drawer sections (`SectionTitle`): Skins, the count owned of five beside it as the Missions'
  ("Skins 2/5"), the five on one carved band parted by the drawer's rules as the profile's figures (three a row under `mobile`):
  Default and Forest (active: the book's gold wash and the Hall of Fame's gold ring, a carved "Active"; owned: the whole cell
  presses, a raised "Use"; not owned: the Missions' painted lock at the tile's corner, a raised "Shop" to Forest's shop; the owner's
  four words, Active, Use, Shop and Soon), then Snow,
  Desert and Volcano locked as "Soon" (the owner's choice, the book's locked Snow; nothing to buy yet); and All
  tiles, the 19 seen from above (the owner's ask: the grid top-down, the isometric view the stage's alone), four a row on a carved
  panel as the Hall of Fame's seasons, each in the skin it wears, the selected one in the same gold. The skins' cells show the tile
  from above too (the owner's ask: the angled renders' navy backdrop showed round the tile, cut by one outline for all): the top-down
  renders fill their square, so nothing shows round them; a skin coming soon is the tile greyed and dimmed. The picks keep their data flow: batched, a gold dot on a tile
  whose pick is not saved (where the book draws its count), saved in one `set_skins` from the sticky Save bar, or discarded. Gaps from
  the book, each for a reason: the book's arrows, zoom and pedestal left (the owner's ask, the finger alone); the grid top-down, not
  the book's isometric tiles (the owner's ask); the tiles are "Tile 7", not the book's names ("City corner"), which no data holds; no count on the
  grid's tiles (the owner's choice: no data for it); the book's centred window from `tablet` gave way to the side panel (the owner's
  choice, the drawers' pattern); the house's greys and gold in place of the book's blue panel and buttons (as Profile and Missions);
  a skin coming soon has no Shop (nothing to buy). No painted asset was made.
  GUILD-PAGE (2026-11-05), after the Paved UX Book's "Run my guild" (`guild`, `guild-announcements`, `guild-requests`, `guild-log`),
  in the house style of the profile, the Missions, the League and the Shop (the owner's ask of the same day, after a first pass too
  close to the book's gold): the Guild (`/guild`) is the HUD's drawer as the Shop, the dock's other page: a full page with Back on a
  phone, from `tablet` a side panel docked at the right (the book's tablet and desktop draw a centred window, which the Shop's rule
  docks at the right). The identity on the drawer's face, as the profile's: the guild's emblem; its name in the profile's name's
  weight and the menu ("…") a small raised square beside it, as the profile's Edit name; the tag under it; the player's rank in a
  carved pill in the medal's gold (the Leader's crown, the Officer's star, the Member's bust: the HUD's painted user, the owner's ask
  of an icon for each rank). Then the profile's carved band of figures parted by the
  drawer's rules: Members ("9/50"), Score (the painted crown, the sum of the crowns), Join (Open, Request, Invite only: "Request", the
  owner's word, in place of "By request"). Then the
  description folded to two lines, and at its right Chat, a raised tile as the profile's actions (the HUD's chat icon over its word),
  the dock's red count on it for the guild chat's unread messages (the chat's overview). The tabs are the Shop's (the book's words, the
  current one underlined in gold), the dock's red count on Announcements (unread) and Requests (waiting). Each list is the battle logs'
  carved list, a rule between its rows. Members: each portrait in the rim of the member's league with its crest, the name, the rank's
  carved pill, the painted crown and the crowns; the player's own row on a discreet wash of the primary gold, no ring (the owner's
  ask), with a "You" tag as the Hall of Fame's "Now". Announcements: the newest pinned, on the same wash under the book's pin; an
  officer's raised Post (the book's pencil); Edit and Delete two small raised squares on what the viewer may change. Requests (officers
  and the leader): under the drawer's engraved title and its count, each request's portrait, name, level and crowns and message, a
  raised Accept (its check in the success green) and Decline; then "Invitations sent", each invitation's player and when it lapses in a
  carved pill. Log: newest first, each line under the book's painted icon (joined: its door; promoted: the star; removed: its member
  with a red minus; posted: the speech bubble, the HUD's Chat), the HUD's crown, user, gear and banners for a new leader, a demotion,
  the settings and the founding, the menu's Leave door for a member who left; "Show all 42" the battle logs' "Show more" button. The menu
  and what it opens are views in the drawer, never sheets over it (the owner's ask of the same day: the navigation stays in the side
  sheets, Back goes back, the red cross or a tap on the village leaves): the menu's view, titled "Guild menu" on the drawer's header,
  holds raised rows, each a painted icon, its words outlined and the chevron of a view (Invite a player, Guild settings, Find guilds),
  Leave or Disband apart in the destructive colour, dimmed with why when refused; each of those opens its view in turn (the player
  search, the settings' form, the guild search), Back one view back. A member's row tapped opens their profile, FRIENDS-PAGE's drawer over the
  guild's (the owner's ask of the same day: straight to it, no view between), the rank's actions its tiles (Promote, Demote, Leader,
  Kick, named by the rank they give: "Promote to Veteran"); one's own row, one's own profile. The views slide in from the right and back from the left, as the Shop's theme's. On a phone a view's header has the red cross at its end
  besides Back (`HudDrawer`, every drawer's views: the Shop's theme's too), so one press leaves. The icons of Invite a player, Find
  guilds, Leave, Disband, Promote and Demote (the log's promotions and demotions) were drawn by the Codex CLI's image tool, in the HUD icons' style
  (`scripts/compress-ui-art.ts`). Kept as they were: the finder for a player in no guild, the confirmations (Leave, Disband, a rank's
  action), another guild in its sheet (`?guild=`, the
  same identity and figures), the link to the chat, the profiles (the home's host, over the drawer). Removed from the page, the book
  drawing none: a member row's level and last seen (on their profile, a tap away), the menu's sheets (their descriptions are the
  views' first lines, the menu's guild name is the page's), the member header's requirements (a visitor's keeps them), a request's age, the tabs' icons. Gaps
  from the book: the house's greys, raised and carved surfaces and the medal's gold in place of the book's blue panels, gold rows and
  gold buttons (as Profile, Missions, League and Shop); the guild's own emblem in place of the book's banners (the emblem is the
  guild's, its settings choose it); the score, members and join type on the profile's band, not the book's corner of the card; a
  request's crowns beside its level, not in a column (no room for the name on a phone, and the drawer keeps the phone's layout at
  every width); an invitation sent has no Cancel (the guild source cannot take one back), when it lapses in its place; Post above the
  list, not in the tabs' row (no room on a phone); the times as the formatter writes them ("2h ago", the book's "2 h"); the log's lines
  in the app's words; 44 px targets; the settings' form keeps the app's fields and its gold Save (shared with Create a guild). The pencil,
  the door and the removed member were first cut from the book's pixels, then redrawn the same day by the Codex CLI's image tool from
  those crops, in the HUD icons' style (the pinned announcement's pin is the chat's, CHAT-PAGE's, the same drawing) (`scripts/compress-ui-art.ts`). The guilds' emblems bear twenty-four charges drawn by
  Codex in place of twelve Font Awesome icons (the owner's asks of the same day: original ones; flat silhouettes, no detail but their
  cut-outs, so their colour is chosen; four rows of six): the first twelve keep the subjects they replace (hammer, crossed swords,
  crown, tree, star, castle, tower, cogwheel, trophy, eye, flag, flame), so a guild's emblem keeps its meaning; twelve are new (lantern,
  windmill, anchor, thistle, wolf, key, mountain, wheat, pickaxe, bridge, horseshoe, owl). The charge is tinted in a third colour of the
  emblem (`charge`, optional), edged in the shield's dark rim. Eighteen colours, three rows of six (the metals and greys, the reds and
  purples, the greens and blues): the first eight those of #953, Silver (the charge's colour before, its default), then Coal, Crimson,
  Coral, Rose, Plum, Violet, Lime, Forest and Teal (Rose, Plum, Violet and Teal outside the palettes). Game-core: `GUILD_EMBLEM_ICONS`
  24, `GUILD_EMBLEM_COLOURS` 18, `GUILD_EMBLEM_SILVER` (`elements/emblem-art.ts`, `GUILD_EMBLEM_PALETTE` for the picker's order).
  Five ranks in place of three (the owner's choice of the same day): Recruit (who joins), Member (invites), Veteran (answers the
  requests, posts announcements), Officer (kicks, once per 20 minutes, and promotes up to Veteran), Leader (the settings, the Officers'
  ranks, Make leader, disband); a promotion or a demotion is one rank, to a rank under the actor's; the rotation takes the highest rank
  who played. Each rank has its painted icon (the Recruit's sprout and the Veteran's medal by Codex; the HUD's bust, star and crown);
  the log says the new rank. The settings and Create a guild (a view in the drawer too, no more a sheet) and the finder in the drawer's
  style: the engraved titles in the display font, carved panels and fields, the charges and colours six to a row, the join types raised
  tiles under Codex's open padlock and sealed letter and the HUD's padlock, Save a raised button; the finder's invitations, request and
  lists on carved panels, the search carved under Codex's magnifier, Suggested and Ranking the Shop's word tabs, each card a row of the
  carved list with the painted busts, crown and join type, its place in the medal's gold for the first three.
  CHAT-PAGE (2026-11-05), after the Paved UX Book's Chat ("chat-world", "chat", "chat-private": every avatar in its league's rim,
  with the level and the guild's tag), the Missions' method: the chat (`/chat`, `/chat/<tab>`, `/chat/private/<player>`) is the
  HUD's drawer (`PageDef.drawer`), a full page with Back on a phone, from `tablet` a side panel docked at the left beside the home's
  Chat tab that opens it (the book draws a centred window: the League's rule decides), its red cross at its header's right end after
  the page's menu (the muted players). The book's three tabs as words, the current one lit and underlined in gold (the Shop's),
  their counts in the book's red squares. The World's and the guild's conversation in one carved panel as tall as the drawer leaves
  it (and above a phone's keyboard, as before): each author in the rim of their league with its crest (`LeaguePortrait`, beside
  `PlayerRim` in `containers/league-control.tsx`: the League's battle logs' portrait, now shared), their name, their level in the
  profile's blue star (`elements/level-star.tsx`, the level bar's star; the owner's ask: no "Lv" chip) and the time over the text in
  a soft flat slate bubble (the owner's ask of the same day: softer than the drawer's raised plates); the player's own at the right
  in a faint gold (the owner's ask: the book's full gold too strong) with its tail; no rule between the messages of one day, a rule
  with the day ("Today", "Oct 13") where the day changes (the owner's ask); each message's menu (Profile, Mute, Report) a quiet "…"
  beside its bubble, with no Delete (the owner's ask: a message is published on the ledger, and deleting it would be one more event
  that leaves it readable; the source's `deleteMessage` stays, unused by the page). The guild's pinned post above its panel on a
  gold plate with the book's pin, two lines at most, a tap opening the guild's page where it is whole; with none, the guild's
  emblem, name and tag, the same way to its page. The composer: the field and the book's gold Send with its paper plane. The chat's
  gold buttons (Send, Accept, New message, Find a guild) raised as Decline is (the owner's ask: the gold lit along its top and
  deeper at its foot, the near-black outline and lip; a style in the page's chunk, as the Shop's price). Private: one carved panel,
  New message at its top right, the requests under their section title, each "Wants to chat" with the book's gold check and dark
  cross (a request is accepted or declined from the list too), then the conversations on a raised card, each the other player in
  their rim with their level's star, the last line in a bubble, its time and its unread count in a red square; a conversation opens
  over the list, headed by Back and the other player in their rim with their level's star. No guild's tag beside a level (the
  owner's ask of the same day: the name opens the profile, which has it). Data: a message's author carries their league
  (`ChatAuthor.league`), the mock filling it from the profiles. Gaps from the book: the side panel in place of its centred window,
  and the house's greys and gold in place of its blue and navy (as every drawer); no guild's tag beside the names (the book's
  "[HMW]"); the level in the house's blue star, not the book's "Lv" chip; the encryption line (#997) kept at the top of the World's
  and the guild's panel, and in private the opening of an empty conversation, gone at its first message as the first conversation's
  notice (the owner's ask); the message's menu kept; the draft's count shown past 80 % of the limit only (the book has none); a
  private row's time on its last line (the name and its level keep the first); the private rows' times the conversations' clock
  ("16:49", the date past a day) in place of "11min ago". The Send's paper plane, the pin, the check and the cross are redrawn by
  Codex's built-in image tool from their crops of the book (first cut from its pixels, the tool unavailable that morning), each
  checked beside its crop and its cut on navy and on gold (`scripts/compress-ui-art.ts`).
  FRIENDS-PAGE (2026-11-05), after the Paved UX Book's "Friends and followers" (`friends`, `friends-followers`, `friend-profile`), the
  Missions' method: `/friends` is the HUD's drawer, a full page with Back on a phone, from `tablet` a side panel docked at the right
  (the book centres it, which no drawer does; the home's Friends button is on the right). Under its header the book's carved search
  ("Find a player by name or ID"), then the book's three tabs (the word and its count, the current one underlined in gold, the new
  followers' count in the HUD's red on Followers), each list one carved panel of rows: the avatar in its league's rim with the league's
  crest at its lower right and, for a new follower, the HUD's red dot at its upper right (the owner's asks: in place of the guild's
  emblem and the book's New), the name, the level in the HUD's blue star (the Chat's `LevelStar`) and the crowns, the guild's emblem and name; at the row's end
  online or when last seen (Friends), Following (Following, unfollows once confirmed), the book's gold Follow back pill (cut from its
  pixels, its words painted out, 3-sliced) or Following (Followers). Then the Suggestions, and the blocked players in a sheet. A
  row opens the player's profile, the owner's asks of the same day: the player's own Profile page (avatar and crest, name, presence
  and the Friends or Follows you mark, the player ID a tap copies; their guild line, then the actions as the Profile's tiles: Message,
  Follow or Following, Block, and the guild's Promote, Demote, Leader, Kick; then Level with their XP, League, the village score and
  the follow counts, the Hall of Fame and the Stats), docked at the right in the friends page's place (one's own profile at the left)
  with Back at every width; one's own profile gained its guild line and the tiles under the avatar too. Gaps from the book, each for a
  reason: no Remove on a follower (the book's rows have none), Message and Unfollow on the profile, not the rows (the book's); no
  "Friends"/"Follows you" marks in the rows; the house's greys and charcoal, not the book's navy; the Hall of Fame and Stats are the
  mock's, the same for every player, as the own profile's. Painted assets: the followers and Block icons cut from the book's pixels;
  the gold pill from them; the guild's Promote, Demote, Leader and Kick drawn by Codex's built-in image tool in the HUD's rendering
  (`packages/app/ui-sources/friends/`, `scripts/compress-ui-art.ts`).
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
  PLAY-PAGE (2026-11-06), after the Paved UX Book's "modes", "modes-resume" and "challenge", the Missions' method, then the owner's
  asks of the same day: `/play` is the HUD's drawer, a full page with Back on a phone, from `tablet` a side panel docked at the right
  (the book centres a window, which no drawer does: docked as the Shop). Four groups under the drawers' section titles, each with its
  painted mark, in the owner's order, every card raised alike (the book's gold fill on the Challenge left on the owner's ask): Ranked
  (the crown), Attack, its castle and crossed swords, "Raid a rival village"; Paid (the USDC coin), the Challenge, its trophy and coins,
  "Beat the threshold"; Free (the Shop's Forest leaf), one raised card, the Shop's soft rule between its rows, Training ("A full game,
  just for practice") and Story ("Learn the rules, level by level"); Limited (the season's calendar), a mode to come, off ("Coming
  soon"). In place of the book's tags ("from 2 USDC", "Crowns · chests", the owner's asks), a mode's rewards show what it pays, the
  HUD's icons at its end, bobbing in turn: first under the open gift, fanned over it; since the owner's ask of 2026-11-08
  (PLAY-REWARDS) the icons alone in the gift's 76 x 68 px box, upright, in a pile, the mode's own reward on top and XP (the level
  bar's star with "XP") and the dock's chest side by side under it: the Challenge's PAVED, Attack's crowns, Story's Cobbles (paid
  for its stars); Training none. With a Challenge game still open (the home's `useActiveGame`) its time left and its score, stacked,
  and Resume on edit mode's gold pill take the rewards' place. Free Challenge (a free game from the missions' credits) left with the owner's
  ask, and Multiplayer ("coming soon") with the book. The stake (`/play/challenge`, one component with Play) is a panel of its own in
  the modes' place at every width (the owner's ask: no sheet from the bottom), sliding in, its Back to the modes and the red cross
  out, the USDC balance at its header's end (the drawers' rule, from 360 px). Its body left the book's sheet on the owner's asks of
  the same day (a page that tells what a stake can win, colourful): the stake in USDC, never in stakes, by USDC's own logo (Circle's
  mark, inline, not the painted coin), under its section title (a money bag, not USDC's mark): a painting per stake, as many USDC coins as
  its USDC (stake N, 2N coins, each counted; Codex's first sheet of piles, the owner's pick, its piles kept where their count is right and the others redrawn from it pile by pile, one coin size), the price under it in the body's
  font at its boldest, outlined thick in black as the painting is, between the League's thin arrows (the owner's choice among four
  proposals, the slider left; no carved box); right under it two tiles alike, break even (a level
  scale) and max gain (a pile of PAVED), each the score to make (the star) and the PAVED it wins, break even's the score whose reward
  wins the price back at its PAVED worth at the guard's rate; one PAVED's price in USD at that rate, for the conversion; the reward by
  score from the threshold to the cap under "Rewards" (the star and PAVED's coin together; each score after a star, each reward
  before PAVED's coin, the cap's row its "+" without "max") and, out of its carved box, what it means in two short lines (#705; the
  owner's ask): the stake lost under the winning score, and why these are estimates; the Split (USDC's coin and three short arrows in
  the bar's colours, drawn by Codex), a bar of each recipient's portion in its colour (the burn's fire, the Vault's silver, the referral's
  green), rounded at its two ends and joined straight between portions, over a tile per recipient with its painted icon, its share and its amount, the burn's boost on it; the
  24 h validity and its deadline; and the bill at the drawer's foot while the page scrolls, the header's band, the total on the left,
  Confirm on the right as the chests' Take (the book's gold pill 3-sliced, the word outlined in black, the passing light; no glow
  nor pulse, the owner's ask: a footer's button stays quiet). Scores wear the star, not the
  crown (Play's running Challenge too). Story stays a sheet over Play. Gaps from the book,
  each for a reason: the house's greys and charcoal, not the book's navy; the Free card's rows at every width (the drawer is a phone's
  width; the book's tablet draws three columns in its wider window); the title on the left (the drawers'). The four paintings were redrawn by Codex's built-in image tool from their crops of the
  book, each checked beside its crop on navy and on gold; then Attack, Training and Story drawn again without the book's bushes and
  grass (the owner's ask), in the Challenge trophy's rendering, the open gift drawn from the HUD's closed one (left on 2026-11-08), and the stake's
  burned coin, Vault (the HUD's piggy bank fed a vPAVED coin), referral handshake, break-even scale and top win drawn in the HUD
  icons' rendering
  (`packages/app/ui-sources/play/`, `ui-sources/icons/`, `scripts/compress-ui-art.ts`); the mode cards' board renders left with them.
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
  SETTINGS-PAGE (2026-11-06), after the Paved UX Book's Settings (`settings`: "the page scrolls"; Credits under More), the Missions'
  method: `/settings` is the HUD's drawer, a full page with Back on a phone, from `tablet` a side panel docked at the right (the book
  centres a two-column window at those widths, which no drawer does; Settings is the dock's right-most button, the Shop's rule). Its
  groups in the book's order, each the drawers' section title over one carved surface of rows between near-black rules: Visuals (the
  quality's pill, "Auto (Medium) >", the day and night cycle, the ambient effects, the other players' skins), Sound (the book's two
  sliders on one row each, the painted icon the mute, a carved track, the gold fill and knob; the music player of #569 kept under them),
  Gameplay (tile preview, placement highlight, the square grid), Account (the portrait in its league's rim and crest, the name,
  Connected in green, the address, the raised Disconnect; a guest's Connect; Reset kept for testing), More (Themes, kept, and Credits,
  raised rows), the version at the foot. The switches are the book's green with a light knob (`Switch` `tone="success"`). The
  quality's choice, Credits and Themes open as views in the drawer, sliding in: the header names the view, Back goes back to
  Settings, the red cross leaves (the Guild's menu's pattern); Credits and Themes keep their URLs (`/settings/credits`,
  `/settings/theme`), the quality's choice is the page's state. The board's settings sheet draws the same panel on the drawer's
  charcoal, its quality's choice a view of the sheet. Gaps from the book, each for a reason: one column in a side panel, not the
  book's centred two-column window; the drawers' titles above each group, not inside it; no hints under the rows (read out with the
  switches); the music player and Reset kept; Themes kept under More (the only way to apply an owned theme); the referral left
  Settings for the profile's Invite (the book's), a page of its own; the house's greys and charcoal, not the book's navy. Painted
  assets: the monitor, sparkles, players, note, speaker, grass block, blue block and grid redrawn by Codex's built-in image tool from
  their crops of the book; the sun and the scroll are the shipped `sun` and `missions` (`scripts/compress-ui-art.ts`).
  VAULT-PAGE (2026-11-06), after the Paved UX Book's "vault" and "vault-withdraw", the owner's direction (more information than the
  mockup, a page close to the Challenge's stake panel, PLAY-PAGE) and the figures of Glitchbomb's staking page the owner pointed at (its
  data, not its look): `/vault` is the HUD's drawer, a full page with Back on a phone, from `tablet` a side panel docked at the right
  (the home's right column holds the Vault). Its header: the title, the book's line under it, PAVED over vPAVED at its end. Three tabs in
  the drawer's footer, a bottom navigation (`containers/footer-tabs.tsx`, reusable by any sheet that keeps its `Tabs`), the Position
  first (the owner's ask of 2026-11-07, to lighten the forms): the vPAVED coin in a silver light of two layers turning either way and a
  pulse (the opened chest's liveliness, not the Missions' gold glow), the vPAVED held, their share of the supply, their worth in PAVED
  and in dollars at the guard's rate; two tiles alike, withdrawable now and the exit fee; the rates as chips, one vPAVED in PAVED and one
  PAVED in dollars; the Vault's notes. Deposit and Withdraw: the book's unit switch, PAVED or vPAVED, which picks ERC4626's operation
  (Deposit or Mint, Withdraw or Redeem: the owner's ask of 2026-11-06, an exact output too), the amount, its dollars, Max and the
  wallet, what leaves now or the vPAVED held; an exit's receipt with its fee (on top of a withdraw, inside a redeem), Withdraw all with
  its fee; then its notes, a short line each with a painted icon; over the tabs, the bill on the body's charcoal: the operation's other
  side on the left (what a deposit mints, a mint takes, a withdraw uses, a redeem pays), the gold action on the right. The tabs' look
  (the owner's asks): the bar carved and the app's darkest, a tab in it its icon alone, two such tabs parted by a carved groove; the
  current tab on the body's charcoal, joined to the page and casting a shadow sideways onto the others (in front, on the page's plane),
  flush with the screen's or the sheet's edges, its foot rounded only towards the tabs in the background, its icon lifted and its word
  under it, every change a transition. Gaps from the book, each for a reason: no "Earned … USDC" pill and no APR (the app reads
  neither; the rate is the reward, nothing to claim), no "i" (the notes say it). Painted assets: Position (the silver coins with a rising
  chart), Deposit and Withdraw (a gold coin turning into the silver one, and back; one of four pairs drawn after the owner set a first
  piggy-bank pair aside), the exit fee and the coin's two lights, drawn by Codex's built-in image tool in the HUD icons' rendering
  (`ui-sources/vault/`, their own kind in `scripts/compress-ui-art.ts`); no blue in them (the owner's ask of 2026-11-07: the silver
  coins' blue tint turned grey, the vPAVED token's master too, `token-sources/vpaved.webp`).
  LEADERBOARD-PAGE (2026-11-07), the dock's Ranking: the Paved UX Book draws no leaderboard, so in the integrated pages' style (the
  Guild page's members' rows above all, the Profile's and the Missions' titles and carved surfaces). `/ranking` is the HUD's drawer, a
  full page with Back on a phone, from `tablet` a side panel docked at the right, as the dock's other pages. Its tabs at its foot, the
  Vault's bottom navigation (`containers/footer-tabs.tsx`): Players, Guilds, Alliances and Friends under the HUD's painted player, a red
  shield, two shields over a laurel and the HUD's handshake; Alliances in its place but disabled until the game has alliances, a carved
  "Soon" at its icon's corner (`FooterTab`'s `soon`, the Tiles' mark); Friends at the right end (the owner's ask of 2026-11-07), the
  viewer among their friends, the mutual follows, by the same crowns (game-core's `rankAmongFriends`); the tab the URL's (`?tab=guilds`,
  `?tab=friends`). Each tab the drawers' section title with its count over one carved list, a row per place: the first three under a
  painted medal (gold, silver, bronze), then the figure; the player's portrait in their league's rim with its crest (the guild's
  emblem), the name outlined, the level's blue star (the guild's members out of 50), the crowns at the end under the painted crown (the
  guild's score, the sum of its members' crowns: the owner's rule). The viewer's own row on the Guild page's gold wash with "You"
  ("Yours" on their guild's); while it is out of view (or past the list's end), the same row pinned at the foot over the tabs on the
  body's charcoal (the Vault's bill's place), a tap bringing it into view. A player's row opens their profile over the drawer, a guild's
  its page. Painted assets: the gold and silver medals redrawn by Codex's built-in image tool from the HUD's bronze medal, and the tabs'
  Alliances icon (a blue and a red shield over a gold laurel, the owner's pick of three ideas, 2026-11-07) and Guilds icon (its red
  shield alone, the owner's ask) painted by it in the HUD icons' rendering (`scripts/compress-ui-art.ts`, kind `ranking`).
  ATTACK-SCOUT (2026-11-07), after the Paved UX Book's "Attack a rival" (`search`, `scout`), the user's direction of the same day
  (the search, the scout's Next and Attack under its header, the village with the deck at its bottom right, the deck to inspect, the
  deck page in the Tiles page's style). The search (`/pvp`, full screen) is an empty village in the rival's animated void (the user's
  ask of the same day: the clouds and their blue sky are gone from the app and the stories; `routes/search-void.tsx`, the scout's
  board with no tile), and over it one window on the HUD's frame, solid: the painted radar (a gold dish, its sweep turning over it,
  three crowns lighting as it passes; still under reduced motion), "Searching for a rival", "near 1,240" and the crown, then its two
  actions at its foot, half its width each in every state: Cancel (the raised grey) at the left, and at the right the Vault's gold
  action held (dimmed, no light) reading "Searching…", its dots lit in turn. Found: the sweep stops, the rival's portrait in its
  league's rim on the dish, "Rival found", the name and the level's star, "Scouting…", Cancel dimmed. None in range or an error: the
  dish goes grey, the line or the error, and the gold action is Search. The scout: the rival's village fills the screen; at the top the book's header on
  the HUD's frame (Back, Scout, the player's shield and its time while it lasts, the info, the Cobbles) and the rival in the
  panel at the bottom (the user's asks: no card of their own at the top, no crest beside the avatar; the avatar in its league's rim,
  the crest on its corner, two lines at most: the name on the first, cut with its whole in its title rather than wrapped, and
  on the second their guild, its emblem and tag, or the guild emblem's shield empty and "No guild" in the muted grey without one;
  no level and no village score, the
  user's asks: the three stars' points say the target); at the bottom right, over the village,
  the deck (the user's ask: a painted pile of tiles over "Deck", the tiles the attack draws in the dock's red square; a pile only in v1,
  which has no tile list; the pile is the HUD's icon `tile-stack`, which the home's Tiles wears too, the user's ask); under it the book's panel: the crowns at stake in a carved row of four (the user's ask: each case its stars, its points and the
  crowns won, the defeat first, a grey star under the first star's points and the crowns it loses), "Attacking drops your shield,
  07h42m left",
  Next and its Cobble price on the raised grey, Attack on the book's gold pill (Play's Confirm, the passing light, no glow nor pulse),
  Search again in its place when the village was shielded since the draw. The info opens how an attack goes as a HUD drawer (a sheet
  on a phone, the red cross). The deck page (`containers/deck-sheet.tsx`, the board's and the scout's)
  is the HUD's drawer, a full page with Back on a phone, a side panel from `tablet` (the board's at the left, its stack stays free;
  the scout's at the right), in the URL from the scout (`?view=deck`, the system's Back closes it): a carved band of figures (left,
  played, discarded, each with its painted icon, a zero dimmed), one line for the mode's rule, then Tiles' grid, four a row on a
  carved panel, the top-down renders in the board's skins (or the plans' nine areas: the toggle's two painted icons in the header):
  one tile per plan with the tiles left of it in the red square (a random draw, the village's tiles), the plan in hand in Tiles' gold
  and an attack's next two ringed in blue; a Story level's draw in its order, numbered, "Now" under the tile in hand; an attack's
  extras as unknown tiles until drawn. Played and discarded tiles are dimmed and marked with the HUD's check or bin. Gaps from the
  book: the board's void, not the blurred village, behind the search (the home is not under `/pvp`); the actions in the window;
  the crowns of each case in the panel; "23 tiles" left the panel for the deck
  (no duplicate); the HUD's grey rims and charcoal, not the book's blue and navy; the level as the blue star, not "Level 12". The radar
  (dish and sweep, the sweep painted on black and keyed; `packages/app/ui-sources/attack/`, `attack-art.ts`) and the deck's pile (the
  icon `tile-stack`, `ui-sources/icons/`) were drawn by Codex's built-in image tool from their crops of the book; the shield, swords, info, star, crown, check, bin, grass block
  and grid are the HUD's own icons.
  UNRANKED-PLACEHOLDER (2026-11-07, the owner's asks): Unranked, a player who has not attacked yet, is no longer a league of its own.
  The League page's carousel holds the 23 leagues alone, Wood to Grand Master; an Unranked player's opens on Wood, the league a first
  attack enters, with no slide marked as theirs, and the header's League control alone says Unranked. Its art (the badge, the
  crest's icon form on the player card's corner, the League control and the profile; the crest; the season's banner; and with them
  the avatar's rim and the plate) is a placeholder, an empty slot waiting for its league, and not painted: vector shapes (the
  owner's "closer to an SVG than a PNG, very digital lines"), the leagues' silhouettes filled with a neutral grey gradient ("empty,
  not transparent", a faint light and shade inside the edges for a slight volume), crisp, evenly spaced dashes a little lighter
  than the fill running just inside their edge, never past it; the banner's rod and the avatar's rim the fill alone, no dashes; no
  metal, no gem, nothing that shines. Sources: `unranked/` (one SVG a part), rendered into `packages/app/league-sources/` by the
  rules of `scripts/compress-league-art.ts`. Painted directions came first (an empty socket in a grey frame, a blank grey model, a
  stitched felt patch, then dashes alone on nothing); the owner kept the dashes and asked for the fill, the vector line, softer
  dashes inside the body and a rim without them.
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
  PLAYER-RENAME (2026-11-07), the owner's ask: an edit button beside the player's own name in their Profile, the first change free,
  then 50 Cobbles a change. The Paved UX Book draws none, so in the Profile's and Missions' style: a raised square button beside the
  name holding the HUD's painted pencil (the guild's Post's; a quill in an inkwell drawn by Codex was tried and set aside by the
  owner); it opens "Name" in the Profile drawer (Back to the profile, the Cobbles at the header's end): the name now and "New name"
  in two carved boxes of one size, the field's count of characters over it, three short rules under it each marked as the typed name
  meets it, the Missions' green check badge or the drawers' red cross disc (the owner's ask), greyed while not judged (3 to 15
  characters; letters, digits, single spaces or hyphens; not another player's name), then the fixed footer: the cost on the left
  ("Free" for the first change, else the Cobble and 50) and the gold Rename (the drawers' gold action, its passing light) on the
  right. What the player can mend is said where it already shows, never in the app's error box, whose Copy is for the server's
  failures (the owner's ask): too few Cobbles, the field and Rename held and the cost's label reading "30 Cobbles missing" over the
  figure, both in the warning colour; a name taken, its rule's line ("Taken by another player", crossed); a broken rule in the
  warning colour. The success is a carved line with the HUD's check. Names of any script (the owner's ask): Chinese shows in the
  system's font.
  STORY-PAGE (2026-11-07), Story's campaigns (`/story`) and a level's end: the Paved UX Book draws neither, so in the integrated pages'
  style (Play's raised cards, the League's carousel, the Leaderboard's carved rows) and, for the end, the Ranked end (`attack-end`, the
  owner's words: "s'inspirer aussi de l'écran des scores des ranked games"). The campaigns are a view of Play's drawer, as the stake
  (no sheet over the drawer any more): "Story" on its band, Back to the modes, the red cross to the village. At its head one campaign
  per view, no card (the owner's ask of 2026-11-07): its build-time picture (no WebGL) from the header down, edge to edge, fading into
  the body by the end of its words; over it its name (the view's heading) and its stars (the painted star), its summary in full and a
  status line (its levels under the HUD's pile; "Finish the Tutorial to open" under the painted lock; Complete under the painted
  check); the League's thin arrows on the picture's edges on dark rounds, no dots; a locked one blurred under the painted gold lock,
  which opens (the HUD's `unlock`) and goes as it unlocks, once, still under reduced
  motion. Under it its Levels on a carved list: the number, the title (wrapping), three painted stars always (the empty ones in the
  end's greys), a locked level dimmed with the painted lock in its number's place, any open level a tap away; the last level unlocked
  on the Leaderboard's gold wash, shaped as its place in the list (square between two rows, the owner's rule of 2026-11-07), and the gold Play in the drawer's footer (the Challenge's Confirm's place, the page's
  one gold) playing it (the owner's ask of 2026-11-07: the player sees they progress). A level opens once the one before it is finished;
  every other campaign once the Tutorial is finished (the owner's rule of 2026-11-07), a locked one saying so at its head only (no box repeating it over its levels, the owner's ask of 2026-11-07). The end keeps the book's window
  (`GameEnd`) with the Ranked end's beats and lights, the stars filling with the score (shares only: the thresholds stay hidden), and
  the same carved card of rows: the best (the trophy; a new best in gold with the one before it), the points the next star was
  missing (a grey star), the XP the run's report gave (the Ranked end's row, only when it gave some); then the level's chest, opened
  there, or a carved line saying why this run won none (already won, or 3 stars win it: the owner's ask of 2026-11-07); Retry, Levels
  and Next on one row (Levels raised grey as Retry, the owner's ask of 2026-11-07; Retry and Levels in gold when no level follows; with
  no star, "Level failed", Retry in gold and Next disabled in its place);
  Tutorial level 1's First Stone as a carved row under the painted medal, its Claim raised grey. No new painting: the lock, open lock,
  star, trophy, medal, pile and check are the HUD's own icons.

  STAR-ART (2026-11-07), the owner's ask (the score screen's star "très mal détourée", small artifacts): the painted star (`star`, the
  ends', Story's cards and levels, the Attack) extracted again from the Paved UX Book's original, the middle star of the result
  screen (`attack-end`), by Codex's image tool, the star alone on transparency with its shape, faces, colours and outline kept (three
  variants; the one closest to the book kept, measured on it); its cut cleaned by script (the body made fully opaque, a faint fringe
  cleared). It replaces MATCH-PAGE's flood-fill cut, which left specks, a brown halo and light bites in the outline. Checked at each
  step: one alpha island, no fringe off its palette, an even outline; on five grounds, zoomed on every tip and notch, gold and greyed,
  with and without its light. The same frame and centre: the light behind a full star and every place it shows are unchanged.
  STORY-INTRO (2026-11-07), a Story level's opening, shown before the board the first time a device opens the level (and again from
  the deck page's "Present the level again"): the Paved UX Book draws none, so each piece from the integrated page that shows the same
  information (the owner's words: "s'inspirer des styles existants qui manipulent le même genre d'information"). It stays a veil over
  the blurred board, as the level's end, with the HUD's framed window over it (the end's `HudFrame`), so a level opens and closes in
  the same window. At its head the campaign and the level's number, its title in the display font and its intro, outlined, on the
  campaign's picture fading into the window (Story's campaign head); then the deck page's section: the HUD's pile, "Deck" and the
  count, one short line ("Dealt in this order."), the tiles seen from above in the campaign's theme, four a row on a carved panel,
  each numbered in draw order (a deck shorter than a row: the panel hugs its tiles at the same size, in the middle), dealt one after
  another; the tip in a carved box beside a painted bulb; at the foot, as Story's footer, the device's best (the end's trophy, the
  figure and the painted stars; a grey trophy and "No best yet" without one) on the left and the window's one gold action, Start
  (the drawers' gold pill and its passing light), on the right. A tap anywhere or Escape starts too. No star threshold anywhere.
  Under reduced motion the window and the tiles are there at once. The coach mark during play takes the tip's look: the bulb and its
  words on the HUD's frame (the header's above it; a carved box belongs inside a frame), "Got it" the raised grey answer. The bulb
  (`ui-sources/icons/bulb.webp`, `UI_ICONS`) was drawn by Codex's built-in image tool, the HUD's trophy, star, info and open lock as
  its style's references; the pile, trophy and star are the HUD's own icons.
  TILE-COUNTS (2026-11-07), the owner's two asks of the same day. First, Tiles' All tiles shows each tile's copies in the deck: the
  dock's red square at its top right (the deck page's `Left`, the same classes), read from game-core's base deck (`baseCopies`, the 72
  cards of the Challenge's draw, the shop's rarity and the chests' odds; Tutorial and Story levels bring their own, so Tiles means
  this one, as its Description's "In deck" already did), each tile's button named "City corner, 5 in deck"; a pick not saved yet keeps
  its gold dot, now at the top left. Second, the owner's rule: a section's title is a fixed word, with no count, X/Y, total, timer or
  amount in it nor in its `end` slot, which holds a control at most (`SectionTitle`'s doc, `__tests__/section-title-rule.test.ts`
  fails on a figure's marks in either). Each figure was dropped where the page already shows it, or moved into the section's content:
  Skins' owned of five (dropped); Missions' Tutorial, Daily, Weekly and Achievements counts (dropped: the medallions and the
  milestones' bars say them) and the Daily's and Weekly's reset timers (moved to a carved chip on the section's first line); the
  Ranking's list counts (dropped: the ranks); the deck page's Tiles, Order, Village and Extras counts (dropped: the band of Left,
  Played and Discarded, the red squares); the guild's Requests, Invitations sent and a visitor's Members counts (dropped: the
  Requests tab's badge, the rows, the figures' band's members against the cap), the guild finder's Invitations and the Chat's
  Requests (dropped: the rows, the Private tab's badge); the name's characters in Rename (moved to the end of the "3 to 15
  characters" rule, under the field) and in the guild form's Name and Description (moved under the field, at the right); the
  village editor's slots used (moved to a carved chip under Inventory, the hint beside it), the old layout editor's inventory
  total (dropped: each card's ×N) and a Story level's opening's Deck count (dropped: the tiles are numbered in draw order, the
  last number the count; its section no longer a named region, "Deck" alone repeating the board's stack under the veil). Kept: the Profile's Stats span at its title's end, a filter's chip with its cross (a control);
  the drawers' Cobbles at their headers' end (the HUD's balance, a press opens the packs: a header, not a section's title); and
  the pages' names that identify what they show ("Challenge #1234", a Story level's name, a village owner's): fixed for the
  page's life, names rather than figures. This supersedes the counts beside the titles described in MISSIONS-PAGE, COLLECTION-PAGE,
  ATTACK-SCOUT, LEADERBOARD-PAGE, GUILD-PAGE, EDIT-VILLAGE, PLAYER-RENAME and STORY-INTRO above.

  ALLIANCES (2026-11-07), the alliance feature on the mock (client only; the contracts' spec comes once the owner is satisfied): the
  Paved UX Book draws no alliance, so in the Guild page's look and parts. An alliance is a union of up to five guilds (the Leaderboard's
  Alliances icon, two guilds' shields over a laurel), ranked by the sum of its guilds' scores; guild leaders act for their guilds, the
  founding guild is its head and its leader leads it (game-core's `social/alliance.ts`). Its page is a view of the Guild drawer ("Alliance",
  Back, the red cross; `/guild?alliance=<id>`, the player's own at `/guild?view=alliance`): the emblem, the name and the viewer's guild's
  role in a carved pill, the figures on the carved band (guilds out of 5, score, players), the description folded, its guilds on carved
  rows (the head with its crown, the viewer's on the gold wash); for its leader the requests (raised Accept and Decline) and the
  invitations sent; for an outside guild's leader, the drawer's footer: Cancel or Decline raised grey at the left, the gold Request to
  join or Accept at the right, in their places whatever the state. The emblem: a guild emblem's shield (the same charges, colours and
  picker) standing on the gold laurel of the Alliances icon, which Codex's built-in image tool painted alone (three variants, the third
  kept). The Guild page: the guild's alliance under its tag (a small raised pill, or "No alliance" written out), an Alliance tile beside
  Chat (the Alliances icon, its red count what waits), a "No alliance" view (the invitations, the request, Create an alliance, Find an
  alliance as the menu's raised rows); another guild's page carries the alliance leader's Invite, or Make head and Remove (Codex painted
  Invite a guild and Remove a guild: the ranking's red guild shield with Invite a player's plus and Kick's minus). The Leaderboard's
  Alliances tab is live, its rows the guilds' with the laurelled emblem and the guilds out of 5.
  RANKING-GUILD-ICON (2026-11-08, the owner's ask): the Leaderboard's Guilds tab draws the dock's Guild (`UiIcon` `guild`, its two
  banners) at 36 px, as Players and Friends draw theirs, in place of the red shield. The shield (`ranking-art.ts`'s `guilds`) stays as an
  alliance's guild count's (`GuildCount`, the Alliances rows and the alliance finder), beside the Alliances icon's two shields.

  GAME-OVERLAY (2026-11-07), the in-game overlay after the Paved UX Book's board screen (mockup 3 of "Resume a Challenge") and the
  owner's words ("un genre de wireframe autour du deck en jaune qui pulse", "plus proche du style du reste de l'app", Story's Restart
  "avec une confirmation long press", "de vieilles icones FA a remplacer"). Story's coach mark: the yellow outline that pulsed round the
  tile stack (levels 1-5 and 1-11) and the yellow rings on the other targets are one mark, the opened chest's light behind the control a
  tip names (`elements/coach-mark.tsx`: the chest's painted rays, Codex on black, tinted in the hold rings' gold, two fans turning either
  way, a breathing glow, waves, a flash as it comes; a starburst, never a colour alone; still under reduced motion), on the tile's
  Confirm and trash, the stack's trash, the pile, the season wheel and the gear. Story's Restart on the board: a painted red arrow going
  back round in the header, before the gear, held as the tile's Discard (its red rail, charge and burst: the hold confirms, no dialog);
  Story's settings lose their game row, Training keeps its Restart there, and tip 1-7 names the arrow. The header on the HUD's frame
  (the Scout's): Back (the drawers' chevron), the title outlined in the display font, under it the score by the painted star (the last
  move's gain green, the placed tile's points gold), then for a Challenge behind a carved groove the time left by the book's stopwatch
  ("19h 0m") and the reward by the PAVED coin ("≈ 5.66" over "PAVED", white: gold is the main action's), the painted gear. The stack's
  tiles left in the dock's red square, its trash the tile's painted red one, its hint and "fits nowhere" on HUD capsules; the closings
  on HUD capsules by the Tiles page's painted city, road, forest and wonder; the lines under the header (another player's game, storage
  off, a board out of date, the dev's prediction) on the HUD's frame by the painted "i" or an amber sign (`containers/board-notice.tsx`);
  the score meter under the header in every mode (the owner's ask of 2026-11-08: the Ranked's bar, restyled; `elements/score-meter.tsx`,
  `lib/score-meter.ts`): on the HUD's frame, the Missions' painted rail in even steps, a painted mark at each step's end (grey ahead,
  gold and glowing reached, lit, popped and flashing the end's star light as the gold gets there, still under reduced motion) and the
  score's share of the goal outlined after it: the Attack's three stars, Story's three (the first at the start, held by finishing; no
  figure, #593), a Challenge's trophy at the score to beat and PAVED coin at the cap, Training's crown at the device's best; the replay's bar
  on the HUD's frame, its play and pause painted, its steps the League's thin arrows; the board's settings in the HUD's drawer (never a
  bottom sheet), Surrender and Training's Restart asked in `HudDialog`. New paintings by Codex's built-in image tool, three variants
  for Restart (orange, red, white on a red disc; the red kept), one each for the stopwatch (from its crop of the book), the white flag
  and the amber sign (`restart`, `countdown`, `surrender`, `caution` in `UI_ICONS`).

  TRAINING-END (2026-11-08), Training's header and score screen (the owner's words: "on est encore sur un vieux layout"; the book draws
  neither, so in the integrated pages' style: GAME-OVERLAY's HUD, the Ranked and Story ends). The header: Training takes Story's held
  red Restart before the gear (one place for one action, the hold its confirmation), its settings lose their game row, and the Restart
  dialog is gone; the rest was already Story's (Back, the title, the score, the crown's meter to the device's best). The end
  (`/training/over`, `containers/training-end.tsx` on `GameEnd`): the book's window over the final board blurred, crowned by the crown of
  Training's meter in the middle star's place (`EndMark`: gold from the left by the score's share of the best, popping with the third
  star's sound and buzz and lit as a won star once beaten, grey on the device's first game); "New best!" or "Game over", "Training",
  the score; the carved card of the Ranked end's rows, the best (the crown, the figure, the best before → the score when beaten) and the
  tiles (placed, discarded, what the discards took); the closed structures by category in carved boxes (the painted city, road, forest
  and wonder, the count, the points); every closing in a carved list that scrolls in its box; Home and the gold Play again at the foot.
  The window's cross shows the board, free to pan and zoom, and the gold Scores pill brings the window back at once. A Challenge's end
  keeps its layout.
- `avatar-king.webp`: the avatar's render target (2026-10-31): the king as a voxel bust, three-quarter view, on a blurred village.
  The client's bust is built from cuboids measured on it (`packages/renderer/src/core/avatar/avatar-king-spec.ts`) and its view
  fitted to it (`KING_VIEW`). Generated with OpenAI's image model through the Codex CLI.

The leagues' client shows them as images: the masters in `packages/app/league-sources/`, compressed into
`packages/app/public/league-art/` by `scripts/compress-league-art.ts`. Each tier has a crest, an icon and a banner (in four versions on
the seven divided tiers, plain and one per division), a blank nameplate (the app writes the name in its `font-display`) and an
avatar rim.
