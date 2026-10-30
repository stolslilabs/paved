# Design references

Reference images the client is drawn after. They are not shipped: nothing under `docs/` is bundled.

- `league-standards.webp`: the owner's design of the leagues' standards (issue 917, 2026-10-30), ten tiers from Unranked to
  Grand Master, each a crest over a nameplate over a banner. The client draws them in SVG (`packages/app/src/components/elements/`,
  `league-standards.ts` and its components); the plate's lettering is the app's `font-display`, not the design's.
