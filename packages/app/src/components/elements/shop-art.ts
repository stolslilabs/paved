/**
 * SHOP-PAGE: the Shop's painted pieces, the Paved UX Book's own (the owner's asks of 2026-11-05), each on its own frame (the master's
 * size), apart from `ui-art.ts` so the first load does not carry them: the rarity pills (their rounded ends kept whole, 3-sliced
 * across, the word written over them by the client) and the Cobble packs' piles (one painting a pack, all four at one scale on one
 * frame, standing on its foot). The masters are `ui-sources/shop/<name>.webp`; `node scripts/compress-ui-art.ts` writes their copies.
 */
export const SHOP_PARTS = {
  // The pills at the book's tablet scale; drawn 20 px tall: copies 22 px (1x) and 44 px (2x) tall.
  "rarity-common": { width: 182, height: 46, side: "height", sizes: [22, 44] },
  "rarity-uncommon": { width: 191, height: 45, side: "height", sizes: [22, 44] },
  "rarity-mythic": { width: 186, height: 45, side: "height", sizes: [22, 44] },
  // The piles at the book's phone scale (1x its pixels), the smallest to the largest pack, on one frame, their foot 4 px above its
  // bottom: drawn about 120 px wide, copies 128 px (1x) and 256 px (2x) wide.
  "pile-1": { width: 256, height: 160, side: "width", sizes: [128, 256] },
  "pile-2": { width: 256, height: 160, side: "width", sizes: [128, 256] },
  "pile-3": { width: 256, height: 160, side: "width", sizes: [128, 256] },
  "pile-4": { width: 256, height: 160, side: "width", sizes: [128, 256] },
} as const;
export type ShopPart = keyof typeof SHOP_PARTS;
export const UI_SHOP_PARTS = Object.keys(SHOP_PARTS) as ShopPart[];

/** A rarity pill's rounded end, in the master's pixels: it is never stretched (`borderImageSlice`). */
export const RARITY_END: Record<"common" | "uncommon" | "mythic", number> = { common: 26, uncommon: 23, mythic: 31 };

/** The piles, the smallest pack's first: a pack's by its rank among the packs on sale (the largest for the fourth and after). */
export const PILES = ["pile-1", "pile-2", "pile-3", "pile-4"] as const satisfies readonly ShopPart[];

/** A piece's copy at one of its sizes: `/ui-art/shop/<size>/<name>.webp`. */
export const shopPartUrl = (name: ShopPart, size: number) => `/ui-art/shop/${size}/${name}.webp`;

/** A piece as a CSS image: its two copies as an `image-set` (1x, 2x). */
export function shopPartImage(name: ShopPart): string {
  const [small, large] = SHOP_PARTS[name].sizes;
  return `image-set(url("${shopPartUrl(name, small)}") 1x, url("${shopPartUrl(name, large)}") 2x)`;
}

/** An `<img>`'s sources for a pile shown `px` CSS pixels wide: its copies with their widths, the screen picking the one it needs. */
export function shopPartSources(name: ShopPart, px: number) {
  const { sizes, width, height } = SHOP_PARTS[name];
  return {
    src: shopPartUrl(name, sizes[sizes.length - 1]!),
    srcSet: sizes.map((s) => `${shopPartUrl(name, s)} ${s}w`).join(", "),
    sizes: `${Math.ceil(px)}px`,
    width,
    height,
  };
}
