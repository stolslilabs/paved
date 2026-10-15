// Compile-time checks, no runtime code: each hook's data is exactly the type its scene's prop takes (`tsc -b` fails
// otherwise). The hooks' tests (`__tests__/data-*.test.tsx`) check the values on `@paved/chain`'s fakes.
import type { AchievementsSceneProps } from "../components/scenes/achievements-scene";
import type { BoardSceneProps } from "../components/scenes/board-scene";
import type { HomeSceneProps } from "../components/scenes/home-scene";
import type { LeaderboardSceneProps } from "../components/scenes/leaderboard-scene";
import type { OverSceneProps } from "../components/scenes/over-scene";
import type { PlayerSceneProps } from "../components/scenes/player-scene";
import type { PurchaseSceneProps } from "../components/scenes/purchase-scene";
import type { QuestsSceneProps } from "../components/scenes/quests-scene";
import type { VaultSceneProps } from "../components/scenes/vault-scene";
import type * as chain from "./chain";
import type * as indexer from "./indexer";
import type * as training from "./training";

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;
/** What a hook's `data` holds once read: the loading `undefined` taken out. */
type Data<H extends (...args: never[]) => { data: unknown }> = Exclude<ReturnType<H>["data"], undefined>;
/** A read the economy answers: null without an economy deployment. */
type OrNull<T> = T | null;

export type SceneTypes = [
  // home
  Expect<Equal<Data<typeof indexer.usePlayerStatus>, HomeSceneProps["player"]>>,
  Expect<Equal<Data<typeof indexer.useTopThree>, HomeSceneProps["leaderboard"]>>,
  Expect<Equal<Data<typeof chain.useActiveGame>, HomeSceneProps["activeGame"]>>,
  Expect<Equal<Data<typeof training.useTrainingSave>, HomeSceneProps["training"]>>,
  Expect<Equal<Data<typeof chain.useSpawnPaused>, HomeSceneProps["spawnPaused"]>>,
  // purchase
  Expect<Equal<Data<typeof chain.useQuote>, OrNull<PurchaseSceneProps["quote"]>>>,
  Expect<Equal<Data<typeof chain.useSplit>, OrNull<PurchaseSceneProps["split"]>>>,
  Expect<Equal<Data<typeof chain.useUsdcBalance>, OrNull<PurchaseSceneProps["balance"]>>>,
  // board
  Expect<Equal<training.SessionBoard["tiles"], BoardSceneProps["tiles"]>>,
  Expect<Equal<training.SessionBoard["lastScored"], BoardSceneProps["lastScored"]>>,
  Expect<Equal<Data<typeof chain.useGame>, OverSceneProps["game"]>>,
  // leaderboard and player
  Expect<Equal<Data<typeof indexer.useLeaderboard>, NonNullable<LeaderboardSceneProps["leaderboard"]>>>,
  Expect<Equal<Data<typeof indexer.useLeaderboardEntry>, NonNullable<LeaderboardSceneProps["viewer"]> | null>>,
  Expect<Equal<Data<typeof indexer.usePlayerProfile>, NonNullable<PlayerSceneProps["profile"]>>>,
  Expect<Equal<Data<typeof indexer.useIndexedPlayerGames>, NonNullable<PlayerSceneProps["games"]>>>,
  // quests and achievements
  Expect<Equal<Data<typeof indexer.usePlayerQuests>, NonNullable<QuestsSceneProps["quests"]>>>,
  Expect<Equal<Data<typeof indexer.usePlayerAchievements>, NonNullable<AchievementsSceneProps["achievements"]>>>,
  // vault
  Expect<Equal<Data<typeof chain.useVaultPosition>, VaultSceneProps["position"]>>,
  Expect<Equal<Data<typeof chain.usePavedBalance>, OrNull<VaultSceneProps["balance"]>>>,
  Expect<Equal<Data<typeof chain.useSplit>, VaultSceneProps["split"]>>,
];
