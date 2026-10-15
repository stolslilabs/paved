// The quests' and achievements' data of P9 (Cobbles, cobbles v1 part 1): one entry for `index.ts`, and the compile-time
// checks `scene-types.ts` spreads into its list (`RewardSceneTypes`), so neither file grows past one line for them.
import type { AchievementsSceneProps } from "../components/scenes/achievements-scene";
import type { QuestsSceneProps } from "../components/scenes/quests-scene";
import type * as cobbles from "./cobbles";

export {
  achievementCobbles,
  applyClaimEvents,
  claimSigner,
  cobbleKeys,
  cobbleViews,
  questCobbles,
  useAchievementRewards,
  useClaims,
  useCobbleAccount,
  useFreeCredits,
  useQuestRewards,
} from "./cobbles";
export type { ClaimSigner, ClaimTarget } from "./cobbles";
export { clockKey, firstQuestDay, useIndexerNow } from "./quests";
export type { IndexerClock } from "./quests";
export { completionMemory, useCompletionMemory, useCompletionStore } from "./completion-memory";

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;
type Data<H extends (...args: never[]) => { data: unknown }> = Exclude<ReturnType<H>["data"], undefined>;
/** Without the Cobbles views (a views double without them) the rewards read null, and the scene shows none. */
type OrNull<T> = T | null;
/** The scene's rewards without the claim on its way, which the route adds. */
type Read<T> = Omit<NonNullable<T>, "claiming">;

export type RewardSceneTypes = [
  Expect<Equal<Data<typeof cobbles.useQuestRewards>, OrNull<Read<QuestsSceneProps["rewards"]>>>>,
  Expect<Equal<Data<typeof cobbles.useAchievementRewards>, OrNull<Read<AchievementsSceneProps["rewards"]>>>>,
];
