# Design references

Reference images the client is drawn after. They are not shipped: nothing under `docs/` is bundled.

- `league-standards.webp`: the owner's design of the leagues' crests (issue 917, approved 2026-10-30), ten tiers from Unranked
  (broken wood) and Wood (pure wood, no plant) to Grand Master: broad heater shields, as wide as tall, swords from Iron to Gold, a
  knight helmet from Emerald to Grand Master that grows horns and spikes league after league, the stones set in the shields.
  Generated with OpenAI's image model through the Codex CLI.
- `league-divisions.webp`: the crests of Gold to Grand Master in their four versions: plain, then I, II and III, the numeral on a
  ribbon under the motif, drawn into the art.
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

- `avatar-king.webp`: the avatar's render target (2026-10-31): the king as a voxel bust, three-quarter view, on a blurred village.
  The client's bust is built from cuboids measured on it (`packages/renderer/src/core/avatar/avatar-king-spec.ts`) and its view
  fitted to it (`KING_VIEW`). Generated with OpenAI's image model through the Codex CLI.

The leagues' client shows them as images: the masters in `packages/app/league-sources/`, compressed into
`packages/app/public/league-art/` by `scripts/compress-league-art.ts`. Each tier has a crest and an icon in four versions, a
blank nameplate (the app writes the name in its `font-display`) and a square banner.
