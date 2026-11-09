# Design references

Reference images the client is drawn after. They are not shipped: nothing under `docs/` is bundled.

Each change drawn after one of these images writes its design notes in its own file, `notes/<ID>.md` (the brief's ID, e.g.
`notes/HOME-EDGES.md`), whose first line names the reference image it follows and the date. It adds one link line to that image's
"Notes" below and writes nothing else in this file. A new reference image gets one short entry here.

- `league-standards.webp`: the leagues' standards as the owner redrew them (2026-11-01), ten tiers from Unranked to Grand Master,
  each row its crest (plain, then III, II, I), its banner (the same), its blank plate and its avatar rim. One material and one
  colour a tier, and the same shield, banner, plate and ring for all: cracked mossy stone (Unranked, a torn banner), oak (Wood),
  hammered iron, bronze, silver, gold, then cut emerald, diamond and amethyst (Master), and ruby set in gold (Grand Master). The
  division's numeral in the middle of the crest and the banner; Grand Master, which has none, its golden horned helmet; Unranked
  and Wood an empty field. Generated with OpenAI's image model through the Codex CLI, cut and put on the client's frames as
  `scripts/compress-league-art.ts` describes.
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
  Notes:
  - [HOME-EDGES](notes/HOME-EDGES.md) (2026-11-04)
  - [HUD-RIM-GREY](notes/HUD-RIM-GREY.md) (2026-11-04)
  - [CAMERA-EXPLORE](notes/CAMERA-EXPLORE.md) (2026-11-04)

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
  frame itself is CSS since that day (HUD-FRAME-CSS, `elements/hud-frame.tsx`).
  Notes:
  - [PROFILE-PAGE](notes/PROFILE-PAGE.md) (2026-11-04)
  - [MISSIONS-PAGE](notes/MISSIONS-PAGE.md) (2026-11-04)
  - [LEAGUE-PAGE](notes/LEAGUE-PAGE.md) (2026-11-05)
  - [MATCH-PAGE](notes/MATCH-PAGE.md) (2026-11-05)
  - [SHOP-PAGE](notes/SHOP-PAGE.md) (2026-11-05)
  - [COLLECTION-PAGE](notes/COLLECTION-PAGE.md) (2026-11-05)
  - [GUILD-PAGE](notes/GUILD-PAGE.md) (2026-11-05)
  - [CHAT-PAGE](notes/CHAT-PAGE.md) (2026-11-05)
  - [FRIENDS-PAGE](notes/FRIENDS-PAGE.md) (2026-11-05)
  - [EDIT-VILLAGE](notes/EDIT-VILLAGE.md) (2026-11-05)
  - [PLAY-PAGE](notes/PLAY-PAGE.md) (2026-11-06)
  - [END-SCREENS](notes/END-SCREENS.md) (2026-11-06)
  - [SETTINGS-PAGE](notes/SETTINGS-PAGE.md) (2026-11-06)
  - [VAULT-PAGE](notes/VAULT-PAGE.md) (2026-11-06)
  - [LEADERBOARD-PAGE](notes/LEADERBOARD-PAGE.md) (2026-11-07)
  - [ATTACK-SCOUT](notes/ATTACK-SCOUT.md) (2026-11-07)
  - [UNRANKED-PLACEHOLDER](notes/UNRANKED-PLACEHOLDER.md) (2026-11-07)
  - [TILE-ACTIONS](notes/TILE-ACTIONS.md) (2026-11-07)
  - [PLAYER-RENAME](notes/PLAYER-RENAME.md) (2026-11-07)
  - [STORY-PAGE](notes/STORY-PAGE.md) (2026-11-07)
  - [STAR-ART](notes/STAR-ART.md) (2026-11-07)
  - [STORY-INTRO](notes/STORY-INTRO.md) (2026-11-07)
  - [TILE-COUNTS](notes/TILE-COUNTS.md) (2026-11-07)
  - [RANKING-GUILD-ICON](notes/RANKING-GUILD-ICON.md) (2026-11-08)
  - [GAME-OVERLAY](notes/GAME-OVERLAY.md) (2026-11-07)
  - [PRESS-BUILD](notes/PRESS-BUILD.md) (2026-11-08)
  - [TRAINING-END](notes/TRAINING-END.md) (2026-11-08)
  - [END-VERDICTS](notes/END-VERDICTS.md) (2026-11-08)
  - [NO-ALLIANCES](notes/NO-ALLIANCES.md) (2026-11-08)
- `avatar-king.webp`: the avatar's render target (2026-10-31): the king as a voxel bust, three-quarter view, on a blurred village.
  The client's bust is built from cuboids measured on it (`packages/renderer/src/core/avatar/avatar-king-spec.ts`) and its view
  fitted to it (`KING_VIEW`). Generated with OpenAI's image model through the Codex CLI.

The leagues' client shows them as images: the masters in `packages/app/league-sources/`, compressed into
`packages/app/public/league-art/` by `scripts/compress-league-art.ts`. Each tier has a crest, an icon and a banner (in four versions on
the seven divided tiers, plain and one per division), a blank nameplate (the app writes the name in its `font-display`) and an
avatar rim.
