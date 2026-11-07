/**
 * VAULT-PAGE: the Vault's painted icons, apart from `ui-art.ts` so the first load does not carry them, the footer's three tabs and their
 * sections: Position (the silver vPAVED coins before a rising gold chart), Deposit (the gold PAVED coin turning into the silver vPAVED one
 * under a green arrow), Withdraw (the silver back into gold under an orange arrow); and the exit fee (the coin with a red "%" tag). Drawn
 * by Codex's built-in image tool in the HUD icons' rendering, with the PAVED and vPAVED coins as its references, each on a transparent
 * square, no blue (the owner's ask of 2026-11-07: the silver's blue tint turned grey); trimmed and fitted to the HUD icons' frame (a 240
 * px box centred on 256), so they swap with a `UiIcon`. The masters are `ui-sources/vault/<name>.webp`;
 * `node scripts/compress-ui-art.ts` writes their copies. URLs and measures only: the module stays plain TypeScript so the script reads
 * it under Node.
 */

/** The HUD icons' frame (`ICON_FRAME`): drawn 20 to 48 px, copies 64 px (1x) and 128 px (2x). */
export const VAULT_ART_FRAME = { width: 256, height: 256, side: "width", sizes: [64, 128] } as const;

export const VAULT_ART = ["position", "deposit", "withdraw", "exit-fee"] as const;
export type VaultArtName = (typeof VAULT_ART)[number];

/** A painting's copy at one of its sizes: `/ui-art/vault/<size>/<name>.webp`. */
export const vaultArtUrl = (name: VaultArtName, size: number) => `/ui-art/vault/${size}/${name}.webp`;

/**
 * The vPAVED coin's light (the owner's asks of 2026-11-07: silver, not the Missions' gold glow, and alive as the opened chest's): two
 * layers drawn by Codex's built-in image tool on pure black, the black turned to alpha by the brightest channel and every pixel to the
 * neutral grey of its luminance (no blue, the owner's ask of the same day), a square each: broad
 * rays (`coin-rays`) and a fine starburst with its sparkles (`coin-glow`), turned either way behind the coin. Drawn about 136 px wide:
 * copies 160 px (1x) and 320 px (2x).
 */
export const VAULT_LIGHT_FRAME = { width: 512, height: 512, side: "width", sizes: [160, 320] } as const;
export const VAULT_LIGHTS = ["coin-rays", "coin-glow"] as const;
export type VaultLightName = (typeof VAULT_LIGHTS)[number];

/** A light's `<img>` sources, shown `px` CSS pixels wide. */
export function vaultLightSources(name: VaultLightName, px: number) {
  const { sizes } = VAULT_LIGHT_FRAME;
  const url = (size: number) => `/ui-art/vault/${size}/${name}.webp`;
  return { src: url(sizes[sizes.length - 1]), srcSet: sizes.map((s) => `${url(s)} ${s}w`).join(", "), sizes: `${Math.ceil(px)}px` };
}

/** An `<img>`'s sources for a painting shown `px` CSS pixels wide: its copies with their widths, the screen picking the one it needs. */
export function vaultArtSources(name: VaultArtName, px: number) {
  const { sizes } = VAULT_ART_FRAME;
  return {
    src: vaultArtUrl(name, sizes[sizes.length - 1]),
    srcSet: sizes.map((s) => `${vaultArtUrl(name, s)} ${s}w`).join(", "),
    sizes: `${Math.ceil(px)}px`,
  };
}
