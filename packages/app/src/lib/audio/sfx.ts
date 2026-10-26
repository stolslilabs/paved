// The sound effects (AUDIO-SETTINGS, #541): the names and where the files are served. Nothing here imports a file, and the
// engine (its own chunk) is what fetches and decodes them: `public/sfx/*.wav`, written by `scripts/make-sfx.ts`.

/** The first set. A structure closed has one sound per category. A chest's opening (#784): `shake`, `burst`, `flip` (each tile), `keep`. */
export const SFX_NAMES = ["tap", "select", "rotate", "place", "invalid", "discard", "road", "city", "forest", "wonder", "cobbles", "gameover", "shake", "burst", "flip", "keep"] as const;
export type SfxName = (typeof SFX_NAMES)[number];

export const SFX_DIR = "/sfx";

export const sfxUrl = (name: SfxName): string => `${SFX_DIR}/${name}.wav`;

/** What the Credits page lists: each sound and its licence. */
export const SFX_CREDITS: readonly string[] = SFX_NAMES.map((n) => `${n}.wav, written for Paved (CC0 1.0)`);
