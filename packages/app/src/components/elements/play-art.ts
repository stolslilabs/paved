/**
 * PLAY-PAGE: the Play page's mode paintings, the Paved UX Book's ("modes"): the Challenge's trophy and coins, Attack's castle and
 * crossed swords, Training's target, Story's book and stars (Free Challenge's scroll left with the mode, the owner's ask). Each redrawn by Codex's built-in image tool from
 * its crop of the book, on a transparent ground, then trimmed and fitted to one 3:2 frame, its foot on the frame's bottom. Apart from
 * `ui-art.ts` so the first load does not carry them. The masters are `ui-sources/play/<name>.webp`; `node scripts/compress-ui-art.ts`
 * writes their copies. URLs and measures only: the module stays plain TypeScript so the script reads it under Node.
 */

/** The frame: 3:2, drawn about 112 px wide on a phone's row and 128 px on the Challenge's card: copies 128 px (1x) and 256 px (2x) wide. */
export const PLAY_ART_FRAME = { width: 384, height: 256, side: "width", sizes: [128, 256] } as const;

export const PLAY_ART = ["challenge", "attack", "training", "story"] as const;
export type PlayArtName = (typeof PLAY_ART)[number];

/** A painting's copy at one of its sizes: `/ui-art/play/<size>/<name>.webp`. */
export const playArtUrl = (name: PlayArtName, size: number) => `/ui-art/play/${size}/${name}.webp`;

/** An `<img>`'s sources for a painting shown `px` CSS pixels wide: its copies with their widths, the screen picking the one it needs. */
export function playArtSources(name: PlayArtName, px: number) {
  const { sizes, width, height } = PLAY_ART_FRAME;
  return {
    src: playArtUrl(name, sizes[sizes.length - 1]),
    srcSet: sizes.map((s) => `${playArtUrl(name, s)} ${s}w`).join(", "),
    sizes: `${Math.ceil(px)}px`,
    width,
    height,
  };
}

/**
 * The stake's paintings (the owner's asks of 2026-11-06: an asset per stake, as many USDC coins as the stake's USDC, in the first
 * sheet's look), one per stake from 1 to `MAX_STAKE`: a stake is 2 USDC (`CHALLENGE_PRICE`, a constant of the contracts), so stake
 * N's pile holds 2N coins, each counted: a coin, then stacks, then a pyramid (a tall middle stack between two shorter ones) with loose
 * coins in front. The first sheet's own piles where their count is right, the others redrawn from it pile by pile by Codex's built-in
 * image tool, brought to one coin size, fitted to one 3:2 frame at one scale, each standing on the frame's foot, so a pile grows by
 * its coins. Drawn about
 * 192 px wide: copies 192 px (1x) and 384 px (2x) wide.
 */
export const STAKE_ART_FRAME = { width: 384, height: 256, side: "width", sizes: [192, 384] } as const;

export const STAKE_ART = ["stake-1", "stake-2", "stake-3", "stake-4", "stake-5", "stake-6", "stake-7", "stake-8", "stake-9", "stake-10"] as const;
export type StakeArtName = (typeof STAKE_ART)[number];

/** A stake's painting, by stake (1 to 10; outside, the nearest end's). */
export const stakeArtName = (stake: number): StakeArtName => STAKE_ART[Math.min(STAKE_ART.length, Math.max(1, Math.round(stake))) - 1]!;

/** An `<img>`'s sources for a stake's painting shown `px` CSS pixels wide. */
export function stakeArtSources(stake: number, px: number) {
  const { sizes, width, height } = STAKE_ART_FRAME;
  const url = (size: number) => `/ui-art/play/${size}/${stakeArtName(stake)}.webp`;
  return {
    src: url(sizes[sizes.length - 1]),
    srcSet: sizes.map((s) => `${url(s)} ${s}w`).join(", "),
    sizes: `${Math.ceil(px)}px`,
    width,
    height,
  };
}
