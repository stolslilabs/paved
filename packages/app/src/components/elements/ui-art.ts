/**
 * The HUD's images (the owner's mobile direction of 2026-11-01, `docs/design/home.webp`, after Supercell's games): the icons of the
 * home's buttons, of the dock, of the seasons and of the Play sheet, the profile drawer's actions (Avatar, Collection, Invite,
 * Disconnect, after its mockup of 2026-11-02), and the frames the home draws with them: the XP bar's track and fill. The owner kept the
 * app's layout (2026-11-02), so the dock's ribbon, the PLAY medallion, the season dial's frame, the dock's divider and the game modes'
 * icons went unused and were removed; the HUD's frame (the player card's, the capsules') is CSS since HUD-FRAME-CSS (`hud-frame.tsx`),
 * its painted 9-slice (`card-frame`) left on 2026-11-03. Panels, capsules, buttons, badges and bars are CSS; the league's art is
 * `league-standards.ts`; the currencies stay `token-art.ts` and the chests `chest-art.ts`. Images, not drawings: WebP copies in
 * `public/ui-art/` of the masters in `ui-sources/` (`scripts/compress-ui-art.ts`). URLs and measures only: nothing here imports an
 * image, and the module stays plain TypeScript so the script reads it under Node.
 */

/** The icons, each a square master: the drawing trimmed, fitted to a 240 px box and centred on 256, so any one swaps for another. */
export const UI_ICONS = [
  "shop",
  "chests",
  "guild",
  "settings",
  "missions",
  "vault",
  "friends",
  "chat",
  "trophy",
  "crown",
  "shield",
  "village",
  "level-star",
  "spring",
  "summer",
  "autumn",
  "winter",
  "moon",
  "sun",
  "swords",
  "deck",
  "rotate",
  "discard",
  "lock",
  "info",
  "build",
  "plus",
  "user",
  "close",
  "avatar",
  "collection",
  "invite",
  "disconnect",
] as const;
export type UiIconName = (typeof UI_ICONS)[number];

/** The frames, each an image of its own. */
export const UI_FRAMES = ["xp-track", "xp-fill"] as const;
export type UiFrameName = (typeof UI_FRAMES)[number];

interface Frame {
  /** The master's size: every file of a kind has it, so an image takes its box before it loads. */
  width: number;
  height: number;
  /** The side the copies are sized on, and their sizes on it (the other side follows the frame). */
  side: "width" | "height";
  sizes: readonly number[];
}

/** The icons' frame: 256 px, copies for a 32 px icon on a 2x screen to a 64 px one on a 2x screen. */
export const ICON_FRAME: Frame = { width: 256, height: 256, side: "width", sizes: [64, 128] };

/** The frames' masters. */
export const FRAME_ART = {
  "xp-track": { width: 1464, height: 181, side: "width", sizes: [360, 720] },
  "xp-fill": { width: 1466, height: 119, side: "width", sizes: [360, 720] },
} as const satisfies Record<UiFrameName, Frame>;

/** The XP bar's track (outline, silver bevel, dark recess): its rounded ends kept whole; its height is its two halves. */
export const XP_TRACK_SLICE = { x: 72 / 1464 } as const;

/** A frame's copies as a CSS `image-set`, the 1x copy and the 2x one. */
export const uiFrameImageSet = (name: UiFrameName) => {
  const [small, large] = FRAME_ART[name].sizes;
  return `image-set(url("${uiFrameUrl(name, small!)}") 1x, url("${uiFrameUrl(name, large ?? small!)}") 2x)`;
};

export const UI_ART_DIR = "/ui-art";

/** An icon's copy at one of its sizes: `/ui-art/icons/<size>/<name>.webp`. */
export const uiIconUrl = (name: UiIconName, size: number) => `${UI_ART_DIR}/icons/${size}/${name}.webp`;
/** A frame's copy at one of its sizes: `/ui-art/frames/<size>/<name>.webp`. */
export const uiFrameUrl = (name: UiFrameName, size: number) => `${UI_ART_DIR}/frames/${size}/${name}.webp`;

/** A copy's width and height in pixels, `size` on its frame's side. */
export function copySize(frame: Frame, size: number): { width: number; height: number } {
  return frame.side === "width"
    ? { width: size, height: Math.round((size * frame.height) / frame.width) }
    : { width: Math.round((size * frame.width) / frame.height), height: size };
}

/**
 * An `<img>`'s sources for an icon shown `px` CSS pixels wide: the largest copy as `src`, every copy with its width in `srcSet`,
 * and `sizes`, so a screen picks the smallest copy that stays sharp at its density.
 */
export function uiIconSources(name: UiIconName, px: number) {
  const { sizes } = ICON_FRAME;
  return {
    src: uiIconUrl(name, sizes[sizes.length - 1]!),
    srcSet: sizes.map((s) => `${uiIconUrl(name, s)} ${s}w`).join(", "),
    sizes: `${Math.ceil(px)}px`,
  };
}

/** The same for a frame shown `px` CSS pixels wide. */
export function uiFrameSources(name: UiFrameName, px: number) {
  const frame: Frame = FRAME_ART[name];
  return {
    src: uiFrameUrl(name, frame.sizes[frame.sizes.length - 1]!),
    srcSet: frame.sizes.map((s) => `${uiFrameUrl(name, s)} ${copySize(frame, s).width}w`).join(", "),
    sizes: `${Math.ceil(px)}px`,
    width: frame.width,
    height: frame.height,
  };
}
