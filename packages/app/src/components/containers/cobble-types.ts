import type { AchievementCobbles as AchievementCobblesView, CobbleKind, PackView, PeriodProgress, QuestCobbles as QuestCobblesView } from "@paved/chain";

/**
 * The Cobbles of P-61 as the scenes read them. The ledger's types are `@paved/chain`'s (`Setup`'s views of cobbles v1, part 1,
 * CORE #440: `CobbleAccount`, `PeriodProgress`, `QuestCobbles`, `AchievementCobbles`); the scenes take the part they show.
 * Types and pure helpers only; nothing here reads the chain.
 *
 * `Pack` is `Setup.pack`'s (part 2, CORE #453; P7b). The skins are `Setup`'s
 * (part 3, CORE #463; P11b): `skin_price`, `skins` and `active_skins`, read by `data/skins.ts`.
 */

export type { CobbleAccount, CobbleKind } from "@paved/chain";

/** A period's claims (`day_progress`, `week_progress`): the quests claimed for it (bit `i` is quest `i`) and its free game. */
export type PeriodClaims = Pick<PeriodProgress, "claimed" | "credit">;

/**
 * The Cobbles a quest gives and its claim's period, from its definition (`/v1/definitions`, `cobbles` and `cobbles_kind`);
 * a quest without Cobbles is not listed.
 */
export type QuestCobbles = Pick<QuestCobblesView, "questId" | "cobbles"> & { kind: CobbleKind };

/** The Cobbles an achievement gives (its points; On the Podium none in v1); one without Cobbles is not listed. */
export type AchievementCobbles = Pick<AchievementCobblesView, "achievementId" | "cobbles">;

/** `Setup.pack(pack_id)` (2.1): `price` in USDC base units (6 decimals); `cobbles` 0 is an id never set. */
export type Pack = PackView;

/** The packs that can be bought: on sale, with Cobbles and a price (a pack's price per Cobble and its discount divide by them). */
export const packsOnSale = (packs: readonly Pack[]): Pack[] => packs.filter((p) => p.active && p.cobbles > 0 && p.price > 0n);

/** A skin's state for the player: not owned, owned and inactive, owned and active (5.3). */
export type SkinState = "none" | "owned" | "active";

/** X (5.1): the Challenge deck's 19 plans, so at most 19 active skins. Plans are the `u8` codes 1 to 19. */
export const PLANS = 19;

/** The reference price of a Cobble (2.1): 100 Cobbles for $20, in USDC base units. */
export const REFERENCE_PER_COBBLE = 200_000n;

/** A pack's price at the reference, struck through on its card. */
export const referencePrice = (cobbles: number): bigint => BigInt(cobbles) * REFERENCE_PER_COBBLE;

/** A pack's discount against the reference, a whole percent: 50 for 50 Cobbles at $5; 0 for a pack without Cobbles. */
export const packDiscount = (pack: Pick<Pack, "cobbles" | "price">): number =>
  pack.cobbles > 0 ? Number(100n - (pack.price * 100n) / referencePrice(pack.cobbles)) : 0;

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

/**
 * The batch without the plans whose saved value is now the change itself: after a save whose receipt could not be read the
 * transaction may have landed, and the read of the active set that follows shows it. The same object when nothing drops.
 */
export function dropSavedChanges(active: readonly number[], changes: Readonly<Record<number, number>>): Record<number, number> {
  const kept = Object.entries(changes).filter(([plan, theme]) => active[Number(plan) - 1] !== theme);
  return kept.length === Object.keys(changes).length ? (changes as Record<number, number>) : Object.fromEntries(kept);
}
