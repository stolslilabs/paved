# Design references

Reference images the client is drawn after. They are not shipped: nothing under `docs/` is bundled.

- `league-standards.webp`: the owner's design of the leagues' crests (issue 917, approved 2026-10-30), ten tiers from Unranked
  (broken wood) and Wood (pure wood, no plant) to Grand Master: broad heater shields, as wide as tall, swords from Iron to Gold, a
  knight helmet from Emerald to Grand Master that grows horns and spikes league after league, the stones set in the shields.
  Generated with OpenAI's image model through the Codex CLI.
- `league-divisions.webp`: the crests of Gold to Grand Master in their four versions: plain, then I, II and III, the numeral on a
  ribbon under the motif, drawn into the art.

The client shows them as images: the masters in `packages/app/league-sources/`, compressed into
`packages/app/public/league-art/` by `scripts/compress-league-art.ts`. Each tier has a crest and an icon in four versions, a
blank nameplate (the app writes the name in its `font-display`) and a square banner.
