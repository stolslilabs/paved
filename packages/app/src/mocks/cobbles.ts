import type { AchievementCobbles, CobbleAccount, Pack, PeriodClaims, QuestCobbles } from "../components/containers/cobble-types";
import { PLANS } from "../components/containers/cobble-types";

/**
 * The Cobbles of P-61 for the stories, with the names and amounts of `docs/architecture/cobbles-v1.md`. The ledger's shapes
 * are `@paved/chain`'s (cobbles v1, part 1); the packs and the skins stay provisional until P7b and P11b.
 */
export type { AchievementCobbles, CobbleAccount, Pack, PeriodClaims, QuestCobbles };

/** The owner's tiers (2.1, `set_pack` of the fresh deployment, 6.4): 50 for $5, 100 for $9, 500 for $40, 1,000 for $70. */
export const PACKS: readonly Pack[] = [
  { packId: 1, cobbles: 50, price: 5_000_000n, active: true },
  { packId: 2, cobbles: 100, price: 9_000_000n, active: true },
  { packId: 3, cobbles: 500, price: 40_000_000n, active: true },
  { packId: 4, cobbles: 1_000, price: 70_000_000n, active: true },
];

/**
 * The Cobbles of the fresh quests (3.1): none of their own. A daily none since #869 (the owner's decisions of 2026-10-28: the
 * day's milestones pay instead, `DAILY_MILESTONES`), where 3.1 gave a family's easy, middle and hard target 5, 10 and 15 and
 * Daily Run 5; a weekly none since #976 (the owner's decisions of 2026-11-01: the week's milestones pay, `WEEKLY_MILESTONES`),
 * where 3.1 gave it 15. Ids 2 to 4 are not defined; 17 to 19 are #869's fourth rotating family, 20 and 21 #976's PvP weeklies.
 */
export const QUEST_COBBLES: readonly QuestCobbles[] = [
  ...[1, 5, 6, 7, 8, 9, 10, 11, 12, 13].map((questId) => ({ questId, cobbles: 0, kind: "daily" as const })),
  ...[14, 15, 16].map((questId) => ({ questId, cobbles: 0, kind: "weekly" as const })),
  ...[17, 18, 19].map((questId) => ({ questId, cobbles: 0, kind: "daily" as const })),
  ...[20, 21].map((questId) => ({ questId, cobbles: 0, kind: "weekly" as const })),
];

/** The Cobbles of the achievements (3.1): their display points; On the Podium (9) has none in v1, so it is not listed. */
export const ACHIEVEMENT_COBBLES: readonly AchievementCobbles[] = [
  [1, 10], [2, 10], [3, 20], [4, 40], [5, 20], [6, 20], [7, 30], [8, 30], [10, 40], [11, 50], [12, 40], [13, 50], [14, 80], [15, 60], [16, 80],
].map(([achievementId, cobbles]) => ({ achievementId, cobbles }));

/** The default skin price (5.2): `50 + 50 x (9 - c) / 8`, rounded to the nearest 5 (halves up), `c` the plan's count in 72. */
export const skinPrice = (count: number): number => Math.floor((50 + (50 * (9 - count)) / 8) / 5 + 0.5) * 5;

/** Each plan's count among the Challenge deck's 72 tiles (5.2), by `u8` code 1 to 19. */
export const PLAN_COUNTS: readonly number[] = [1, 4, 3, 3, 3, 2, 5, 5, 4, 8, 5, 3, 9, 3, 3, 4, 1, 4, 2];

/** The rarity table (5.2): `skin_price(theme, p)` at index p - 1, the default of every theme. */
export const SKIN_PRICES: readonly number[] = PLAN_COUNTS.map(skinPrice);

/** A theme with no prices yet sells nothing (6.4: no skin prices until a theme's art exists). */
export const NO_PRICES: readonly number[] = Array.from({ length: PLANS }, () => 0);

/** Claim bits of a claim word for the ids given. */
export const bits = (...ids: number[]): bigint => ids.reduce((word, id) => word | (1n << BigInt(id)), 0n);

/** An `owned` word of `skins(player_id, theme)` for the plans given. */
export const ownedPlans = (...plans: number[]): number => plans.reduce((word, p) => word | (1 << p), 0);

/** `active_skins` with `theme` on the plans given, the default theme (0) elsewhere. */
export const activeOn = (theme: number, ...plans: number[]): number[] => Array.from({ length: PLANS }, (_, i) => (plans.includes(i + 1) ? theme : 0));

/**
 * The player's account in the stories: 240 Cobbles, no free game, two achievements claimed. `gems` repeats `cobbles` for
 * `mocks/scenes.ts` (home, purchase, theme: P6, P7b, P11b), which still reads the old name; it goes with them.
 */
export const ACCOUNT: CobbleAccount & { gems: number } = {
  cobbles: 240, gems: 240, credits: 0, games: 12, forests: 9, wonders: 1, big: 2, high: 0, achievementsClaimed: bits(1, 2), xp: 0,
};

/** Every claim of a period open. */
export const NOTHING_CLAIMED: PeriodClaims = { claimed: 0n, credit: false };
