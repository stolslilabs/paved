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

/**
 * ALLIANCES: the alliance emblem's laurel, the gold wreath of the Leaderboard's Alliances icon (`ranking-art.ts`) alone, painted by
 * Codex's built-in image tool from that icon, two branches and their bow framing an empty middle where the alliance's shield stands
 * (a guild emblem's parts, `AllianceEmblem`). Not tinted: the laurel is what tells an alliance's emblem from a guild's. On a 512 px
 * square (the drawing fitted to 480 px), copies of 64, 128 and 256 px for the emblem's 32 to 104 CSS px.
 */
export const ALLIANCE_ART = ["alliance-laurel"] as const;
export const ALLIANCE_ART_FRAME = { width: 512, height: 512, side: "width", sizes: [64, 128, 256] } as const satisfies Frame;
/**
 * ALLIANCES: the alliance menu's and a guild page's actions, Invite a guild and Remove a guild: the ranking's red guild shield
 * (`ranking-art.ts`'s `guilds`) with Invite a player's green plus and Kick's red minus (`ui-art.ts`), painted by Codex in the HUD icons'
 * rendering. On the icons' frame (256 px, the drawing fitted to 240 px), copies of 64 and 128 px; apart from `UI_ICONS`, so the first
 * load does not carry them.
 */
export const ALLIANCE_ICONS = ["invite-guild", "remove-guild"] as const;
export const ALLIANCE_ICON_FRAME = { width: 256, height: 256, side: "width", sizes: [64, 128] } as const satisfies Frame;
export type AllianceArtName = (typeof ALLIANCE_ART)[number] | (typeof ALLIANCE_ICONS)[number];

const allianceFrame = (name: AllianceArtName) => ((ALLIANCE_ICONS as readonly string[]).includes(name) ? ALLIANCE_ICON_FRAME : ALLIANCE_ART_FRAME);

/** An alliance image's copy at one of its sizes: `/ui-art/emblems/<size>/<name>.webp`, beside the charges. */
export const allianceArtUrl = (name: AllianceArtName, size: number) => `/ui-art/emblems/${size}/${name}.webp`;

/** An `<img>`'s sources for an alliance image shown `px` CSS pixels wide: its copies with their widths, the screen picking the one it needs. */
export function allianceArtSources(name: AllianceArtName, px: number) {
  const { sizes, width, height } = allianceFrame(name);
  return {
    src: allianceArtUrl(name, sizes[1]),
    srcSet: sizes.map((s) => `${allianceArtUrl(name, s)} ${s}w`).join(", "),
    sizes: `${Math.ceil(px)}px`,
    width,
    height,
  };
}
