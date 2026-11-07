/**
 * LEADERBOARD-PAGE: the ranking's medals for its first two places, gold and silver, Codex's redraws of the HUD's bronze medal (`medal`
 * of `ui-art.ts`, the third place's): the same medal, ribbon and star, its metal changed; and the footer's Alliances and Guilds tabs'
 * icons, painted by Codex in the HUD icons' rendering (the owner's asks of 2026-11-07: two shields over a laurel for the alliances, the
 * red one of them alone for the guilds; the handshake went to the Friends tab). On the icons' frame (256 px square, the drawing fitted
 * to 240 px), so they stand as the HUD's icons. Apart from `ui-art.ts` so the first load does not carry them. The masters are
 * `ui-sources/ranking/<name>.webp`; `node scripts/compress-ui-art.ts` writes their copies. URLs and measures only: the module stays
 * plain TypeScript so the script reads it under Node.
 */

/** The frame: the icons' (`ICON_FRAME`), copies 64 px (a row's 28 px at 2x) and 128 px. */
export const RANKING_ART_FRAME = { width: 256, height: 256, side: "width", sizes: [64, 128] } as const;

export const RANKING_ART = ["medal-gold", "medal-silver", "alliances", "guilds"] as const;
export type RankingArtName = (typeof RANKING_ART)[number];

/** An image's copy at one of its sizes: `/ui-art/ranking/<size>/<name>.webp`. */
export const rankingArtUrl = (name: RankingArtName, size: number) => `/ui-art/ranking/${size}/${name}.webp`;

/** An `<img>`'s sources for an image shown `px` CSS pixels wide: its copies with their widths, the screen picking the one it needs. */
export function rankingArtSources(name: RankingArtName, px: number) {
  const { sizes, width, height } = RANKING_ART_FRAME;
  return {
    src: rankingArtUrl(name, sizes[sizes.length - 1]),
    srcSet: sizes.map((s) => `${rankingArtUrl(name, s)} ${s}w`).join(", "),
    sizes: `${Math.ceil(px)}px`,
    width,
    height,
  };
}
