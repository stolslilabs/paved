// The tracks the Storybook serves (P-81): the Live player story plays these two, the smallest. `scripts/storybook-static-dirs.ts`
// copies only these from `public/music/` to the Storybook (the other 14 tracks, 80 MiB, stay out of `storybook-static/`).
// A plain module with no import: Node reads it as is, in the static-dirs script.

export const STORY_TRACKS: readonly string[] = ["/music/03-market-day.m4a", "/music/04-the-rivers-path.m4a"];
