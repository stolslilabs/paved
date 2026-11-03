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
  the capsules and the balances (HOME-UI-CAPSULES), then the dock (HOME-DOCK, 2026-11-03): the ribbon, its posts and the PLAY
  medallion, Shop, Chests, PLAY, Guild, Settings (Guild in League's place), full width on a phone, centred from a tablet, on the home
  from a desktop too. The season dial keeps its look for now: the mockup's, tried on 2026-11-02, was set aside to come back to.

- `profile.webp`: the profile's mobile direction (2026-11-02), in `home.webp`'s rendering: what a tap on the player card opens, a drawer
  that rises over the village and stops under the HUD (the player card and the capsules stay in view): "Your profile", the avatar in
  its league's rim and crest, the name, the short address with Copy, the guild, the level and its XP bar, Games, Best, Followers and
  Following in one band, four actions as tiles (Battle logs, Avatar, Collection, Invite) and Disconnect. Generated with OpenAI's image
  model through the Codex CLI; its four new icons were redrawn from crops of it (`packages/app/ui-sources/icons/`). The owner's
  pattern of 2026-11-02: a page is a side panel on a large screen and a full page with Back on a phone, the same layout in both; the
  profile is the HUD's drawer (`containers/hud-drawer.tsx`, PROFILE-DRAWER): on a phone from the bottom, under the HUD, its frame
  meeting the screen's sides; from `tablet` a side panel docked at the left, the window's height. The owner's changes of 2026-11-03:
  the HUD's frame and the interface's greys in place of the mockup's blue, no Best, no XP line under the bar; of four side-panel
  directions drawn through the Codex CLI that day (a native sheet, frosted glass, game-native, a Material side sheet), the game-native
  one (a darker header band, outlined tiles lit along their top over a dark lip) with the native sheet's straight edge. The HUD's
  frame itself is CSS since that day (HUD-FRAME-CSS, `elements/hud-frame.tsx`).

- `avatar-king.webp`: the avatar's render target (2026-10-31): the king as a voxel bust, three-quarter view, on a blurred village.
  The client's bust is built from cuboids measured on it (`packages/renderer/src/core/avatar/avatar-king-spec.ts`) and its view
  fitted to it (`KING_VIEW`). Generated with OpenAI's image model through the Codex CLI.

The leagues' client shows them as images: the masters in `packages/app/league-sources/`, compressed into
`packages/app/public/league-art/` by `scripts/compress-league-art.ts`. Each tier has a crest, an icon and a banner (in four versions on
the seven divided tiers, plain and one per division), a blank nameplate (the app writes the name in its `font-display`) and an
avatar rim.
