/**
 * ATTACK-SCOUT: the attack's first half's paintings, after the Paved UX Book's "Attack a rival" (`search`, `scout`): the search's radar
 * (its gold dish, and the sweep's light that turns over it) and the scout's deck (a pile of tiles, the button over the village that
 * opens the attack's deck). Each painted by Codex's built-in image tool from its crop of the book, the dish and the pile on a
 * transparent ground (trimmed and fitted to their frame), the sweep on pure black, its black turned into alpha, its pivot the frame's
 * centre. Apart from `ui-art.ts` so the first load does not carry them. The masters are `ui-sources/attack/<name>.webp`;
 * `node scripts/compress-ui-art.ts` writes their copies. URLs and measures only: the module stays plain TypeScript so the script reads
 * it under Node.
 */

/** The radar's frame: a square drawn about 176 px wide, copies 192 px (1x) and 384 px (2x); the sweep's pivot at its centre. */
export const RADAR_FRAME = { width: 512, height: 512, side: "width", sizes: [192, 384] } as const;

export const RADAR_ART = ["radar", "radar-beam"] as const;
export type RadarArtName = (typeof RADAR_ART)[number];

/** The deck's pile: a square of the HUD's art (240 px fitted in 256), drawn about 56 px wide, copies 64 px (1x) and 128 px (2x). */
export const DECK_ART_FRAME = { width: 256, height: 256, side: "width", sizes: [64, 128] } as const;

export const DECK_ART = ["deck-stack"] as const;
export type DeckArtName = (typeof DECK_ART)[number];

type AttackArtName = RadarArtName | DeckArtName;

/** A painting's copy at one of its sizes: `/ui-art/attack/<size>/<name>.webp`. */
export const attackArtUrl = (name: AttackArtName, size: number) => `/ui-art/attack/${size}/${name}.webp`;

/** An `<img>`'s sources for a painting shown `px` CSS pixels wide: its copies with their widths, the screen picking the one it needs. */
export function attackArtSources(name: AttackArtName, px: number) {
  const { sizes, width, height } = (RADAR_ART as readonly string[]).includes(name) ? RADAR_FRAME : DECK_ART_FRAME;
  return {
    src: attackArtUrl(name, sizes[sizes.length - 1]!),
    srcSet: sizes.map((s) => `${attackArtUrl(name, s)} ${s}w`).join(", "),
    sizes: `${Math.ceil(px)}px`,
    width,
    height,
  };
}
