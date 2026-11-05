/**
 * FRIENDS-PAGE: the friends page's and a player's profile's painted pieces, the Paved UX Book's own (the owner's asks of 2026-11-05),
 * apart from `ui-art.ts` so the first load does not carry them: the followers' three people and Block's no-entry sign, the guild's
 * Promote, Demote, Leader and Kick, on the HUD icons' frame (`ICON_FRAME`: drawn as `UiIcon`s are), and the gold pill of Follow back, its rounded ends kept whole, 3-sliced across,
 * the words written over it by the client. The masters are `ui-sources/friends/<name>.webp`; `node scripts/compress-ui-art.ts`
 * writes their copies.
 */
export const FRIENDS_PARTS = {
  // Icons, on the HUD icons' frame: copies for 32 to 64 px at 1x and 2x.
  followers: { width: 256, height: 256, side: "width", sizes: [64, 128] },
  block: { width: 256, height: 256, side: "width", sizes: [64, 128] },
  // The guild's rank actions on a player's profile, drawn by Codex in the HUD's rendering (the owner's ask of 2026-11-05).
  "guild-promote": { width: 256, height: 256, side: "width", sizes: [64, 128] },
  "guild-demote": { width: 256, height: 256, side: "width", sizes: [64, 128] },
  "guild-leader": { width: 256, height: 256, side: "width", sizes: [64, 128] },
  "guild-kick": { width: 256, height: 256, side: "width", sizes: [64, 128] },
  // The book's phone pill at 2x its pixels, its words painted out; drawn 32 px tall: copies 32 px (1x) and 64 px (2x) tall.
  "gold-pill": { width: 317, height: 105, side: "height", sizes: [32, 64] },
} as const;
export type FriendsPart = keyof typeof FRIENDS_PARTS;
export const UI_FRIENDS_PARTS = Object.keys(FRIENDS_PARTS) as FriendsPart[];
/** The pieces drawn as icons (square, on `ICON_FRAME`). */
export type FriendsArtName = "followers" | "block" | "guild-promote" | "guild-demote" | "guild-leader" | "guild-kick";
export const isFriendsArt = (name: string): name is FriendsArtName => name in FRIENDS_PARTS && name !== "gold-pill";

/** The gold pill's rounded end, in the master's pixels: never stretched (`borderImageSlice`). */
export const GOLD_PILL_END = 59;

/** A piece's copy at one of its sizes: `/ui-art/friends/<size>/<name>.webp`. */
export const friendsPartUrl = (name: FriendsPart, size: number) => `/ui-art/friends/${size}/${name}.webp`;

/** A piece as a CSS image: its two copies as an `image-set` (1x, 2x). */
export function friendsPartImage(name: FriendsPart): string {
  const [small, large] = FRIENDS_PARTS[name].sizes;
  return `image-set(url("${friendsPartUrl(name, small)}") 1x, url("${friendsPartUrl(name, large)}") 2x)`;
}

/** An `<img>`'s sources for a piece shown `px` CSS pixels wide: its copies with their widths, the screen picking the one it needs. */
export function friendsPartSources(name: FriendsPart, px: number) {
  const { sizes } = FRIENDS_PARTS[name];
  return {
    src: friendsPartUrl(name, sizes[sizes.length - 1]!),
    srcSet: sizes.map((s) => `${friendsPartUrl(name, s)} ${s}w`).join(", "),
    sizes: `${Math.ceil(px)}px`,
  };
}
