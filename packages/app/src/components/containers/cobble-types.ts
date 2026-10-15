/**
 * The Cobbles of P-61, as the client will read them: the views and entry points of `docs/architecture/gems-v1.md` (sections
 * 1.2, 2, 3, 5, 6.1), with its names. **Provisional until CORE's ABI (gems PRs 1 to 3)**: P9, P7b and P11b replace these
 * with `@paved/chain`'s parsed types once the ABI is regenerated. Types and pure helpers only; nothing here reads the chain.
 *
 * The currency is **Cobbles** on screen (owner, 2026-10-15). The contracts and the indexer still say gems until CORE's
 * Cobbles rename PR: the fields below that mirror an ABI shape keep CORE's names (`gems` of `AccountView`, `Pack` and the
 * `quest_gems` and `achievement_gems` entries; events such as `GemsClaimed`, which becomes `CobblesClaimed`), and that PR
 * renames them here too.
 */

/** `Setup.account(player_id) -> AccountView` (1.2 `accounts`): the Cobbles, the free-game credits, the claimed achievements. */
export interface AccountView {
  /** `gems: u64`; a number here, far under 2^53 in practice. */
  gems: number;
  /** `credits: u16`: free Challenge games to spend with `Challenge.spawn_free`. */
  credits: number;
  /** `achievements_claimed: u64`: bit `i` is achievement `i`. */
  achievementsClaimed: bigint;
}

/** `Setup.day_progress(player_id, day)` and `week_progress(player_id, week)`: what the claims of a period read. */
export interface PeriodClaims {
  /** `claimed: u64`: bit `i` is quest `i`, claimed for that period. */
  claimed: bigint;
  /** `credit: bool`: the period's free game was claimed. */
  credit: boolean;
}

/** `Setup.quest_gems(quest_id)` (3.1): the Cobbles a quest gives; `kind` 1 daily, 2 weekly. */
export interface QuestCobbles {
  questId: number;
  gems: number;
  kind: 1 | 2;
}

/** `Setup.achievement_gems(achievement_id)` (3.1): its Cobbles, its display points. On the Podium (9) has none in v1. */
export interface AchievementCobbles {
  achievementId: number;
  gems: number;
}

/** `Setup.pack(pack_id)` (2.1): `price` in USDC base units (6 decimals). */
export interface Pack {
  packId: number;
  gems: number;
  price: bigint;
  active: boolean;
}

/** A skin's state for the player: not owned, owned and inactive, owned and active (5.3). */
export type SkinState = "none" | "owned" | "active";

/** X (5.1): the Challenge deck's 19 plans, so at most 19 active skins. Plans are the `u8` codes 1 to 19. */
export const PLANS = 19;

/** The reference price of a Cobble (2.1): 100 Cobbles for $20, in USDC base units. */
export const REFERENCE_PER_COBBLE = 200_000n;

/** A pack's price at the reference, struck through on its card. */
export const referencePrice = (cobbles: number): bigint => BigInt(cobbles) * REFERENCE_PER_COBBLE;

/** A pack's discount against the reference, a whole percent: 50 for 50 Cobbles at $5. */
export const packDiscount = (pack: Pick<Pack, "gems" | "price">): number => Number(100n - (pack.price * 100n) / referencePrice(pack.gems));

/** Bit `id` of a claim word (`claimed`, `achievements_claimed`). */
export const isClaimed = (bits: bigint, id: number): boolean => ((bits >> BigInt(id)) & 1n) === 1n;

/** Bit `plan` of `skins(player_id, theme) -> u32`: the skin of that plan is owned. */
export const ownsSkin = (owned: number, plan: number): boolean => ((owned >>> plan) & 1) === 1;

/**
 * The active set with the batch applied: `active_skins` is one theme id per plan (index `plan - 1`, 0 the default), and
 * the batch maps a plan to its new theme. At most one theme per plan holds by construction (5.3).
 */
export function applySkinChanges(active: readonly number[], changes: Readonly<Record<number, number>>): number[] {
  return active.map((theme, i) => changes[i + 1] ?? theme);
}

/**
 * The batch after one toggle of `theme`'s skin of `plan`: on when another theme (or none) was active, off (theme 0)
 * when it was this one. A change back to the saved value leaves the batch, so `set_skins` sends only real changes.
 */
export function toggleSkin(active: readonly number[], changes: Readonly<Record<number, number>>, plan: number, theme: number): Record<number, number> {
  const current = changes[plan] ?? active[plan - 1];
  const next = current === theme ? 0 : theme;
  const rest = { ...changes };
  delete rest[plan];
  return next === active[plan - 1] ? rest : { ...rest, [plan]: next };
}
