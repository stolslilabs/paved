/**
 * PLAY-MODES (the owner's picks of 2026-11-08, direction C): the Play page's mode icons and scenes. An icon per mode, one object
 * each, used nowhere else: Attack's catapult, the Challenge's war horn, Training's straw dummy, Story's map, the Puzzle's tile cut as
 * a jigsaw piece. A scene per mode, a whole landscape behind its card, one series (one style, only the game's own pieces) with its
 * own subject and light: Attack the siege at a gate at dusk, the Challenge the great walled city at golden hour, Training a misty
 * meadow, Story the wonder on its hill, the Puzzle the tiles' grid from above at midday. Drawn by Codex's built-in image tool. The
 * Joust's scene (the tournament ground cut in two halves, blue and crimson) is the hero of its design proposal of 2026-11-09, the
 * Expedition's (the camp, its road and the sacred wood in the mist) its own proposal's, as the Masterpiece's (the giant walled city
 * in the snow, its last wall lowered by a crane) and the Colossus's (the half-built wonder-city and its builders). Apart
 * from `ui-art.ts` so the first load does not carry them. The masters are `ui-sources/play/<name>.webp`;
 * `node scripts/compress-ui-art.ts` writes their copies. URLs and measures only: the module stays plain TypeScript so the script reads
 * it under Node.
 */

/** A mode of the Play page, as its art is named. */
export type PlayMode = "attack" | "challenge" | "training" | "story" | "puzzle" | "joust" | "expedition" | "masterpiece" | "colossus";
/** The modes with an icon of their own: the Joust has none yet (its card shows the two allegiances' emblems), nor the Expedition (its card shows the day). */
export type IconMode = Exclude<PlayMode, "joust" | "expedition" | "masterpiece" | "colossus">;

/** The icons' frame (the HUD icons'): drawn 84 to 116 px wide over a card's edge, copies 128 px (1x) and 256 px (2x). */
export const MODE_ICON_FRAME = { width: 256, height: 256, side: "width", sizes: [128, 256] } as const;
export const MODE_ICONS = ["mode-attack", "mode-challenge", "mode-training", "mode-story", "mode-puzzle"] as const;

/** The scenes' frame, 3:2, cropped by each card (the hero about 1.7:1, the wide cards 3:1, the squares about 1:1): copies 400 px and 800 px wide (a phone's 358 px card at 2x takes the 800). */
export const MODE_SCENE_FRAME = { width: 960, height: 640, side: "width", sizes: [400, 800] } as const;
export const MODE_SCENES = ["scene-attack", "scene-challenge", "scene-training", "scene-story", "scene-puzzle", "scene-joust", "scene-expedition", "scene-masterpiece", "scene-colossus"] as const;

const sources = (name: string, frame: { width: number; height: number; sizes: readonly number[] }, px: number) => {
  const url = (size: number) => `/ui-art/play/${size}/${name}.webp`;
  return {
    src: url(frame.sizes[frame.sizes.length - 1]!),
    srcSet: frame.sizes.map((s) => `${url(s)} ${s}w`).join(", "),
    sizes: `${Math.ceil(px)}px`,
    width: frame.width,
    height: frame.height,
  };
};

/** An `<img>`'s sources for a mode's icon shown `px` CSS pixels wide: its copies with their widths, the screen picking the one it needs. */
export const modeIconSources = (mode: IconMode, px: number) => sources(`mode-${mode}`, MODE_ICON_FRAME, px);

/** An `<img>`'s sources for a mode's scene shown `px` CSS pixels wide (the card's width, or its height times 1.5 when the card is the taller). */
export const modeSceneSources = (mode: PlayMode, px: number) => sources(`scene-${mode}`, MODE_SCENE_FRAME, px);

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
