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
 * The batch without the plans whose saved value is now the change itself: after a save whose receipt could not be read the
 * transaction may have landed, and the read of the active set that follows shows it. The same object when nothing drops.
 */
export function dropSavedChanges(active: readonly number[], changes: Readonly<Record<number, number>>): Record<number, number> {
  const kept = Object.entries(changes).filter(([plan, theme]) => active[Number(plan) - 1] !== theme);
  return kept.length === Object.keys(changes).length ? (changes as Record<number, number>) : Object.fromEntries(kept);
}

/** How many of the 19 plans a theme's owned word holds (`skins(player_id, theme)`, bit p for plan p). */
export const ownedCount = (owned: number): number => Array.from({ length: PLANS }, (_, i) => i + 1).filter((plan) => ownsSkin(owned, plan)).length;

/**
 * The active set a theme gives when it is chosen whole (THEMES-RENDERS, the owner's ruling of 2026-10-18): each plan the
 * player owns in `theme` wears it, every other plan the default (0). Theme 0 is every plan on the default. `owned` maps a
 * theme id to its owned word; a theme it does not name owns nothing.
 */
export function themeSet(owned: Readonly<Record<number, number>>, theme: number): number[] {
  return Array.from({ length: PLANS }, (_, i) => (theme !== 0 && ownsSkin(owned[theme] ?? 0, i + 1) ? theme : 0));
}

const sameSet = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((t, i) => t === b[i]);

/** Whether `theme` is the one in use: the active set is exactly what choosing it gives, and it is owned somewhere (0 aside). */
export function themeInUse(active: readonly number[], owned: Readonly<Record<number, number>>, theme: number): boolean {
  if (theme !== 0 && ownedCount(owned[theme] ?? 0) === 0) return false;
  return sameSet(active, themeSet(owned, theme));
}

/**
 * What choosing `theme` sends: the plans whose active theme changes, plan to new theme, for one `set_skins`; and whether
 * that replaces a choice made tile by tile, so the page asks first. The active set is a tile-by-tile choice when it is not
 * what choosing some theme gives (a mix, or a plan left on the default while its skin is owned and the theme is on).
 */
export function chooseTheme(active: readonly number[], owned: Readonly<Record<number, number>>, theme: number): { changes: Record<number, number>; overridesChoice: boolean } {
  const next = themeSet(owned, theme);
  const changes: Record<number, number> = {};
  next.forEach((t, i) => {
    if (t !== active[i]) changes[i + 1] = t;
  });
  const themes = [0, ...Object.keys(owned).map(Number)];
  const chosenWhole = themes.some((t) => sameSet(active, themeSet(owned, t)));
  return { changes, overridesChoice: !chosenWhole && Object.keys(changes).length > 0 };
}

/** The batch after picking `theme` for `plan` (My tiles): a pick back to the saved value leaves the batch. */
export function pickSkin(active: readonly number[], changes: Readonly<Record<number, number>>, plan: number, theme: number): Record<number, number> {
  const rest = { ...changes };
  delete rest[plan];
  return theme === active[plan - 1] ? rest : { ...rest, [plan]: theme };
}
