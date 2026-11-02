# Design references

Reference images the client is drawn after. They are not shipped: nothing under `docs/` is bundled.

- `league-standards.webp`: the leagues' standards as the owner redrew them (2026-11-01), ten tiers from Unranked to Grand Master,
  each row its crest (plain, then III, II, I), its banner (the same), its blank plate and its avatar rim. One material and one
  colour a tier, and the same shield, banner, plate and ring for all: cracked mossy stone (Unranked, a torn banner), oak (Wood),
  hammered iron, bronze, silver, gold, then cut emerald, diamond and amethyst (Master), and ruby set in gold (Grand Master). The
  division's numeral in the middle of the crest and the banner; Grand Master, which has none, its golden horned helmet; Unranked
  and Wood an empty field. Generated with OpenAI's image model through the Codex CLI, cut and put on the client's frames as
  `scripts/compress-league-art.ts` describes.
- `player-badge.webp`: the player badge's target (2026-10-31), from the owner's starting image: the round voxel portrait in a ring
  of paving stones with gold ornaments, the luminous level bar in the ring's groove, under the gold shield that holds the level (the
  client starts it at 12 o'clock, under the shield, for a whole turn clockwise: the owner, 2026-10-31), and the name plate, bricks top and bottom, ended by a gold arrow cap.
  `player-badge-states.webp`: the same at three lengths of name (3 to 15 characters) and three shares of the level, the plate
  stretching to the name. Generated with OpenAI's image model through the Codex CLI; the client's parts are in
  `packages/app/badge-sources/` (`scripts/compress-badge-art.ts`).
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
  generated again alone (vPAVED and USDC from PAVED's coin), the plate cut into its caps and a seamless tile, the stone toned to the
  badge's, and USDC's face given Circle's own mark. The client's images are in `packages/app/token-sources/`
  (`scripts/compress-token-art.ts`).

- `avatar-king.webp`: the avatar's render target (2026-10-31): the king as a voxel bust, three-quarter view, on a blurred village.
  The client's bust is built from cuboids measured on it (`packages/renderer/src/core/avatar/avatar-king-spec.ts`) and its view
  fitted to it (`KING_VIEW`). Generated with OpenAI's image model through the Codex CLI.

The leagues' client shows them as images: the masters in `packages/app/league-sources/`, compressed into
`packages/app/public/league-art/` by `scripts/compress-league-art.ts`. Each tier has a crest, an icon and a banner (in four versions on
the seven divided tiers, plain and one per division), a blank nameplate (the app writes the name in its `font-display`) and an
avatar rim.
