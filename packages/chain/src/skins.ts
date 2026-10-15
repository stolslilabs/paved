// The tile skins of `Setup` (P-61, `docs/architecture/cobbles-v1.md`, part 3, CORE #463): a skin is a tile plan (the `Plan`
// codes 1 to 19) in a theme (1 to 255; theme 0 is the default, free and owned by everyone). The owner prices it in Cobbles,
// the player buys it once (`PavedWriter.buySkin`) and sets which owned skin is active for each plan (`PavedWriter.setSkins`,
// one write for a batch). The views are read here; the writes and their typed refusals are the writer's.

/** The plans that have a skin: the `Plan` codes 1 to 19 (`setup.cairo`, `PLANS`). */
export const SKIN_PLANS = 19;

/** The default theme: free, never priced, owned by everyone. */
export const DEFAULT_THEME = 0;

/** Theme 1, the high-forest set, priced for all 19 plans by the fresh deployment (`FRESH_SKIN_THEMES` in `deploy.sh`). */
export const FOREST_THEME = 1;

/** One change of a `set_skins` batch: the plan (1 to 19) and the theme it shows from then on (0: the default). */
export interface SkinChange {
  plan: number;
  theme: number;
}

/**
 * The reads of the skins on `Setup`. `RpcGameViews` implements them (a `not-configured` `ViewError` without a Setup address)
 * and `FakeGameViews` answers them in memory; `GameViews` does not require them.
 */
export interface SkinViews {
  /** `skin_price(theme, plan)`: the price in Cobbles, 50 to 100; 0: not for sale. */
  skinPrice(theme: number, plan: number): Promise<number>;
  /** The 19 prices of a theme, plan 1 first (19 `skin_price` calls). */
  skinPrices(theme: number): Promise<number[]>;
  /** `skins(player_id, theme)`: bit `p` is the skin of plan `p`, owned (bit 0 unused). */
  ownedSkins(playerId: string, theme: number): Promise<number>;
  /** `active_skins(player_id)`: the theme active for each plan, plan 1 first; 0 the default. */
  activeSkins(playerId: string): Promise<number[]>;
}

/** Bit `plan` of an owned word: the skin of that plan is owned. */
export const ownsSkin = (owned: number, plan: number): boolean => ((owned >>> plan) & 1) === 1;

/** The 19 themes of a `SkinsActivated.active` word (the theme of plan `p` in byte `p - 1`), plan 1 first. */
export function activeThemes(word: string | number | bigint): number[] {
  let value = BigInt(word);
  const themes: number[] = [];
  for (let i = 0; i < SKIN_PLANS; i++) {
    themes.push(Number(value & 0xffn));
    value >>= 8n;
  }
  return themes;
}

/** True for a plan code that has a skin, 1 to 19. */
export const isSkinPlan = (plan: number): boolean => Number.isInteger(plan) && plan >= 1 && plan <= SKIN_PLANS;

/** A player's skins in `FakeGameViews`: the owned word of each theme and the active set. */
export interface FakeSkinPlayer {
  owned: Map<number, number>;
  active: number[];
}
