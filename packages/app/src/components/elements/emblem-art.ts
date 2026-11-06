import type { Frame } from "./ui-art";

/**
 * GUILD-PAGE: the guild emblems' charges (the owner's asks of 2026-11-05: about twenty original ones drawn for the game, in place of
 * Font Awesome's; flat silhouettes, no detail but their cut-outs, so the leader picks their colour), by index (game-core's
 * `GUILD_EMBLEM_ICONS`, four rows of six in the settings): the first twelve keep the subjects of the icons they replace (so a guild's
 * emblem keeps its meaning), the last twelve are new. Drawn by the Codex CLI's image tool, each a mask (its alpha only matters) the client tints, apart from `ui-art.ts` so
 * the first load does not carry them. The masters are `ui-sources/emblems/<name>.webp`; `node scripts/compress-ui-art.ts` writes their
 * copies.
 */
export const GUILD_EMBLEM_CHARGES = [
  "hammer",
  "swords",
  "crown",
  "tree",
  "star",
  "castle",
  "tower",
  "gear",
  "trophy",
  "eye",
  "flag",
  "flame",
  "lantern",
  "windmill",
  "anchor",
  "thistle",
  "wolf",
  "key",
  "mountain",
  "wheat",
  "pickaxe",
  "bridge",
  "horseshoe",
  "owl",
] as const;
export type GuildEmblemCharge = (typeof GUILD_EMBLEM_CHARGES)[number];

/** A charge's frame, the HUD icons' square; drawn 16 to 40 CSS px on a shield or in the settings' picker: copies of 64 (1x) and 128 px (2x). */
export const EMBLEM_FRAME = { width: 256, height: 256, side: "width", sizes: [64, 128] } as const satisfies Frame;

/** A charge's copy at one of its sizes: `/ui-art/emblems/<size>/<name>.webp`. */
export const emblemChargeUrl = (name: GuildEmblemCharge, size: number) => `/ui-art/emblems/${size}/${name}.webp`;

/** A charge as a CSS mask image: its two copies as an `image-set` (1x, 2x). */
export function emblemChargeMask(name: GuildEmblemCharge): string {
  const [small, large] = EMBLEM_FRAME.sizes;
  return `image-set(url("${emblemChargeUrl(name, small)}") 1x, url("${emblemChargeUrl(name, large)}") 2x)`;
}
