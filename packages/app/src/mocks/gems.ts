import type { AchievementGems, AccountView, Pack, PeriodClaims, QuestGems } from "../components/containers/gem-types";
import { PLANS } from "../components/containers/gem-types";

/**
 * The gems of P-61 for the stories, with the names and amounts of `docs/architecture/gems-v1.md`. **Provisional until
 * CORE's ABI (gems PRs 1 to 3)**: the types are `components/containers/gem-types.ts`, written from the design's views,
 * and P9, P7b and P11b swap them for `@paved/chain`'s once the ABI is regenerated.
 */
export type { AchievementGems, AccountView, Pack, PeriodClaims, QuestGems };

/** The owner's tiers (2.1, `set_pack` of the fresh deployment, 6.4): 50 for $5, 100 for $9, 500 for $40, 1,000 for $70. */
export const PACKS: readonly Pack[] = [
  { packId: 1, gems: 50, price: 5_000_000n, active: true },
  { packId: 2, gems: 100, price: 9_000_000n, active: true },
  { packId: 3, gems: 500, price: 40_000_000n, active: true },
  { packId: 4, gems: 1_000, price: 70_000_000n, active: true },
];

/**
 * The gems of the 13 fresh quests (3.1): a family's easy, middle and hard target give 5, 10 and 15; Daily Run 5; a
 * weekly 15. Ids 2 to 4 are not defined.
 */
export const QUEST_GEMS: readonly QuestGems[] = [
  { questId: 1, gems: 5, kind: 1 },
  { questId: 5, gems: 5, kind: 1 },
  { questId: 6, gems: 10, kind: 1 },
  { questId: 7, gems: 15, kind: 1 },
  { questId: 8, gems: 5, kind: 1 },
  { questId: 9, gems: 10, kind: 1 },
  { questId: 10, gems: 15, kind: 1 },
  { questId: 11, gems: 5, kind: 1 },
  { questId: 12, gems: 10, kind: 1 },
  { questId: 13, gems: 15, kind: 1 },
  { questId: 14, gems: 15, kind: 2 },
  { questId: 15, gems: 15, kind: 2 },
  { questId: 16, gems: 15, kind: 2 },
];

/** The gems of the achievements (3.1): their display points; On the Podium (9) has none in v1, so it is not listed. */
export const ACHIEVEMENT_GEMS: readonly AchievementGems[] = [
  [1, 10], [2, 10], [3, 20], [4, 40], [5, 20], [6, 20], [7, 30], [8, 30], [10, 40], [11, 50], [12, 40], [13, 50], [14, 80], [15, 60], [16, 80],
].map(([achievementId, gems]) => ({ achievementId, gems }));

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

/** The player's balance in the stories: 240 gems, no free game. */
export const ACCOUNT: AccountView = { gems: 240, credits: 0, achievementsClaimed: bits(1, 2) };

/** Every claim of a period open. */
export const NOTHING_CLAIMED: PeriodClaims = { claimed: 0n, credit: false };
