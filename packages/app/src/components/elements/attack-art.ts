/**
 * ATTACK-SCOUT: the search's radar, after the Paved UX Book's "Attack a rival" (`search`): its gold dish, and the sweep's light that
 * turns over it. Each painted by Codex's built-in image tool from its crop of the book, the dish on a transparent ground (trimmed and
 * fitted to its frame), the sweep on pure black, its black turned into alpha, its pivot the frame's centre. The scout's deck, a pile of
 * tiles, is the HUD's icon `tile-stack` (`ui-art.ts`), the home's Tiles too. Apart from `ui-art.ts` so the first load does not carry
 * them. The masters are `ui-sources/attack/<name>.webp`; `node scripts/compress-ui-art.ts` writes their copies. URLs and measures only: the module stays plain TypeScript so the script reads
 * it under Node.
 */

/** The radar's frame: a square drawn about 176 px wide, copies 192 px (1x) and 384 px (2x); the sweep's pivot at its centre. */
export const RADAR_FRAME = { width: 512, height: 512, side: "width", sizes: [192, 384] } as const;

export const RADAR_ART = ["radar", "radar-beam"] as const;
export type RadarArtName = (typeof RADAR_ART)[number];

/** A painting's copy at one of its sizes: `/ui-art/attack/<size>/<name>.webp`. */
export const attackArtUrl = (name: RadarArtName, size: number) => `/ui-art/attack/${size}/${name}.webp`;

/** An `<img>`'s sources for a painting shown `px` CSS pixels wide: its copies with their widths, the screen picking the one it needs. */
export function attackArtSources(name: RadarArtName, px: number) {
  const { sizes, width, height } = RADAR_FRAME;
  return {
    src: attackArtUrl(name, sizes[sizes.length - 1]!),
    srcSet: sizes.map((s) => `${attackArtUrl(name, s)} ${s}w`).join(", "),
    sizes: `${Math.ceil(px)}px`,
    width,
    height,
  };
}
