/**
 * The Missions page's painted art (MISSIONS-PAGE, the owner's asks of 2026-11-04: the book's images, not the HUD's icons, and its
 * painted look on the medallions' rings and the milestones' rail). A module apart from `ui-art.ts`, which the home's
 * first load carries: only the Missions page's chunk reads it. URLs and measures only, plain TypeScript (the script reads it under
 * Node). WebP copies in `public/ui-art/medallions/` and `public/ui-art/missions/` of the masters in `ui-sources/`
 * (`scripts/compress-ui-art.ts`).
 *
 * The medallions' paintings: each picture painted on its own ground, a disc, transparent outside it, the whole face of a medallion
 * inside its ring. Ten are the Paved UX Book's (its Missions screens' medallions cropped, each face redrawn by Codex without its ring
 * or its badge, the locked ones in colour), each checked side by side with its crop of the book; nine more were painted by Codex in
 * their rendering for the missions the book does not draw (wonder, dice, chest, shop, gift, level, star, trophy, scroll), checked
 * against them. The rings, the rail, its nodes and the gift's halo were extracted from the same screens by Codex, each piece alone
 * (the owner's choice of 2026-11-04 among a CSS rendering and these), each checked side by side with the book.
 */

export const UI_MEDALLIONS = [
  "hammer",
  "boot",
  "forest",
  "coins",
  "swords",
  "house",
  "castle",
  "crown",
  "banner",
  "book",
  "wonder",
  "dice",
  "chest",
  "shop",
  "gift",
  "level",
  "star",
  "trophy",
  "scroll",
] as const;
export type MedallionName = (typeof UI_MEDALLIONS)[number];

/**
 * The medallions' rings, on the paintings' frame: the silver of a mission to do, the gold of one under way or whose Cobbles wait, the
 * green of one done. Their hole is 78% of the square (the painting's size), their outer edge on the square's edge.
 */
export const UI_RINGS = ["ring-silver", "ring-gold", "ring-green"] as const;
export type RingName = (typeof UI_RINGS)[number];

/** The paintings' and the rings' frame: 256 px squares, copies for a 64 px medallion on a 1x screen (96) and an 88 px one on a 2x screen (192). */
export const MEDALLION_FRAME = { width: 256, height: 256, side: "width", sizes: [96, 192] } as const;

/** A painting's or a ring's copy at one of its sizes: `/ui-art/medallions/<size>/<name>.webp`. */
export const medallionUrl = (name: MedallionName | RingName, size: number) => `/ui-art/medallions/${size}/${name}.webp`;

/** An `<img>`'s sources for a painting or a ring shown `px` CSS pixels wide: every copy with its width, the screen picking the one it needs. */
export function medallionSources(name: MedallionName | RingName, px: number) {
  const { sizes } = MEDALLION_FRAME;
  return {
    src: medallionUrl(name, sizes[sizes.length - 1]),
    srcSet: sizes.map((s) => `${medallionUrl(name, s)} ${s}w`).join(", "),
    sizes: `${Math.ceil(px)}px`,
  };
}

/**
 * The milestones' and the card's painted pieces, each on its own frame (the master's size): the rail's steel and its gold (since RAILS,
 * 2026-11-08, each its painting's middle, a tile that repeats seamlessly: `missionRail`), a node ahead (the bead) and one reached (the orb), the gold halo a waiting gift sits in (its rays fading
 * out, the owner's ask of 2026-11-04) and the green check a done medallion and a claimed gift wear. One copy for the rails, at their
 * own height; two for the nodes, the halo and the check.
 */
export const MISSION_PARTS = {
  "rail-track": { width: 1325, height: 12, side: "height", sizes: [12] },
  "rail-fill": { width: 1313, height: 17, side: "height", sizes: [17] },
  orb: { width: 128, height: 128, side: "width", sizes: [32, 64] },
  bead: { width: 128, height: 128, side: "width", sizes: [32, 64] },
  "gift-glow": { width: 256, height: 256, side: "width", sizes: [96, 192] },
  "check-badge": { width: 256, height: 256, side: "width", sizes: [32, 64] },
} as const;
export type MissionPart = keyof typeof MISSION_PARTS;
export const UI_MISSION_PARTS = Object.keys(MISSION_PARTS) as MissionPart[];

/** A piece's copy at one of its sizes: `/ui-art/missions/<size>/<name>.webp`. */
export const missionPartUrl = (name: MissionPart, size: number) => `/ui-art/missions/${size}/${name}.webp`;

/** A piece as a CSS image: its one copy, or its two as an `image-set` (1x, 2x). */
export function missionPartImage(name: MissionPart): string {
  const sizes: readonly number[] = MISSION_PARTS[name].sizes;
  if (sizes.length === 1) return `url("${missionPartUrl(name, sizes[0]!)}")`;
  return `image-set(url("${missionPartUrl(name, sizes[0]!)}") 1x, url("${missionPartUrl(name, sizes[1]!)}") 2x)`;
}

/** An `<img>`'s sources for a square piece shown `px` CSS pixels wide: its copies with their widths, the screen picking the one it needs. */
export function missionPartSources(name: MissionPart, px: number) {
  const sizes: readonly number[] = MISSION_PARTS[name].sizes;
  return {
    src: missionPartUrl(name, sizes[sizes.length - 1]!),
    srcSet: sizes.map((s) => `${missionPartUrl(name, s)} ${s}w`).join(", "),
    sizes: `${Math.ceil(px)}px`,
  };
}

/**
 * How much narrower than its painting a rail's tile is drawn (RAILS): the grain the rails had on a phone before (the whole painting
 * squeezed into a bar of about 300 px), now the same at every length.
 */
export const RAIL_GRAIN = 3;

/**
 * A painted rail drawn `height` px tall (RAILS, the owner's asks of 2026-11-08: round ends, the inside never stretched, any length,
 * the painted look kept). Its master is its painting's middle, cut past the tapered ends and crossfaded at its seam so it repeats
 * without one; drawn at the rail's height, `RAIL_GRAIN` times narrower, repeated along the bar from its start (a fill that grows keeps
 * its grain in place). Its ends are round (`border-radius`), ringed in the HUD's outline as the painting's edge is. Any length, nothing
 * stretched; a bar at least as long as it is tall (its ends then meet in a dot).
 */
export function missionRail(name: "rail-track" | "rail-fill", height: number) {
  const frame = MISSION_PARTS[name];
  const tile = (frame.width * height) / frame.height / RAIL_GRAIN;
  return {
    height,
    minWidth: height,
    borderRadius: 9999,
    backgroundImage: missionPartImage(name),
    backgroundSize: `${tile.toFixed(1)}px 100%`,
    backgroundRepeat: "repeat-x",
    backgroundPosition: "0 50%",
    boxShadow: "inset 0 0 0 1px color-mix(in oklab, var(--hud-outline) 85%, transparent)",
  } as const;
}

