import type { Trait } from "@paved/renderer";

/**
 * AVATAR-PAGE: the avatar editor's painted category icons, the Paved UX Book's "avatar-editor" strip (each a painting over its label),
 * apart from `ui-art.ts` so the first load does not carry them. Each was cropped from the book's tablet screen and redrawn by Codex in
 * the HUD icons' rendering; Pauldrons and Backdrop, which the book does not draw, were painted in the same style. Headwear is the book's
 * crown, the HUD's own (`crown` of `UI_ICONS`). And the foot's Undo (back to the saved look; the owner's ask of 2026-11-07: an icon in
 * Reset's place), a curved arrow turning back, painted by Codex in the HUD icons' rendering (the die's off-white). Square masters on the HUD icons' frame (the drawing fitted to 240 px, centred on 256)
 * in `ui-sources/avatar/<name>.webp`; `node scripts/compress-ui-art.ts` writes their copies.
 */
export const AVATAR_ART = ["skin", "hair", "hairStyle", "beard", "eyes", "accessory", "outfit", "pauldrons", "backdrop", "undo"] as const satisfies readonly (Trait | "undo")[];
export type AvatarArtName = (typeof AVATAR_ART)[number];

/** The masters' frame (the HUD icons'): drawn about 36 px, copies 48 px (1x) and 96 px (2x). */
export const AVATAR_ART_FRAME = { width: 256, height: 256, side: "width", sizes: [48, 96] } as const;

/** A painting's copy at one of its sizes: `/ui-art/avatar/<size>/<name>.webp`. */
export const avatarArtUrl = (name: AvatarArtName, size: number) => `/ui-art/avatar/${size}/${name}.webp`;

/** An `<img>`'s sources for a painting shown `px` CSS pixels wide: its copies with their widths, the screen picking the one it needs. */
export function avatarArtSources(name: AvatarArtName, px: number) {
  const { sizes } = AVATAR_ART_FRAME;
  return {
    src: avatarArtUrl(name, sizes[sizes.length - 1]),
    srcSet: sizes.map((s) => `${avatarArtUrl(name, s)} ${s}w`).join(", "),
    sizes: `${Math.ceil(px)}px`,
  };
}
