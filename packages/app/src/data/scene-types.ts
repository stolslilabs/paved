// Compile-time checks, no runtime code: each hook's data is exactly the type its scene's prop takes (`tsc -b` fails
// otherwise). The hooks' tests (`__tests__/data-*.test.tsx`) check the values on `@paved/chain`'s fakes.
import type { AchievementsSceneProps } from "../components/scenes/achievements-scene";
import type { BoardSceneProps } from "../components/scenes/board-scene";
import type { CobblesSceneProps } from "../components/scenes/cobbles-scene";
import type { HomeSceneProps } from "../components/scenes/home-scene";
import type { ProfileSheetProps } from "../components/containers/profile-sheet";
import type { OverSceneProps } from "../components/scenes/over-scene";
import type { PurchaseSceneProps } from "../components/scenes/purchase-scene";
import type { QuestsSceneProps } from "../components/scenes/quests-scene";
import type { VaultSceneProps } from "../components/scenes/vault-scene";
import type { AvatarCreator } from "../components/scenes/avatar-creator-scene";
import type { PvpAttackSceneProps } from "../components/scenes/pvp-attack-scene";
import type { PvpScoutSceneProps } from "../components/scenes/pvp-scout-scene";
import type { PvpSearchSceneProps } from "../components/scenes/pvp-search-scene";
import type * as avatar from "./avatar";
import type * as avatarCatalogue from "./avatar-catalogue";
import type * as avatarOffers from "./avatar-offers";
import type * as chain from "./chain";
import type * as indexer from "./indexer";
import type * as playerProgress from "./player-progress";
import type * as purchase from "./purchase";
import type * as pvp from "./pvp";
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
  Expect<Equal<Data<typeof chain.useActiveGame>, HomeSceneProps["activeGame"]>>,
  Expect<Equal<Data<typeof training.useTrainingSave>, HomeSceneProps["training"]>>,
  Expect<Equal<Data<typeof chain.useSpawnPaused>, HomeSceneProps["spawnPaused"]>>,
  // the XP ring and the profile sheet (#625): null is no player, the sheet takes undefined for it
  Expect<Equal<NonNullable<Data<typeof playerProgress.usePlayerProgress>>, NonNullable<ProfileSheetProps["progress"]>>>,
  // purchase
  Expect<Equal<Data<typeof chain.useQuote>, OrNull<PurchaseSceneProps["quote"]>>>,
  Expect<Equal<Data<typeof chain.useSplit>, OrNull<PurchaseSceneProps["split"]>>>,
  Expect<Equal<Data<typeof chain.useUsdcBalance>, OrNull<PurchaseSceneProps["balance"]>>>,
  // the Cobble packs
  Expect<Equal<Data<typeof chain.useSplit>, OrNull<CobblesSceneProps["split"]>>>,
  Expect<Equal<Data<typeof chain.useUsdcBalance>, OrNull<CobblesSceneProps["balance"]>>>,
  Expect<Equal<Data<typeof purchase.usePacks>, OrNull<CobblesSceneProps["cobbles"]["packs"]>>>,
  // board
  Expect<Equal<training.SessionBoard["tiles"], BoardSceneProps["tiles"]>>,
  Expect<Equal<training.SessionBoard["lastScored"], BoardSceneProps["lastScored"]>>,
  Expect<Equal<Data<typeof chain.useGame>, OverSceneProps["game"]>>,
  // quests and achievements
  Expect<Equal<Data<typeof indexer.usePlayerQuests>, NonNullable<QuestsSceneProps["quests"]>>>,
  Expect<Equal<Data<typeof indexer.usePlayerAchievements>, NonNullable<AchievementsSceneProps["achievements"]>>>,
  ...import("./rewards").RewardSceneTypes,
  // the avatar (#626 PR 2): the creator's offers, and the menus' saved avatar (null: the default one)
  Expect<Equal<ReturnType<typeof avatarOffers.avatarOffers>, AvatarCreator["offers"]>>,
  Expect<Equal<ReturnType<typeof avatar.savedLook>, OrNull<NonNullable<ProfileSheetProps["look"]>>>>,
  Expect<Equal<NonNullable<Data<typeof avatarCatalogue.useAvatarCatalogue>>["balance"], AvatarCreator["balance"]>>,
  // the PvP flow (#647 PR 2): a player, the scout's village and stakes, the attack's board (null: no PvP on the network)
  Expect<Equal<Data<typeof pvp.usePvpPlayer>, OrNull<PvpSearchSceneProps["player"]>>>,
  Expect<Equal<NonNullable<Data<typeof pvp.usePvpScout>>["village"], PvpScoutSceneProps["village"]>>,
  Expect<Equal<NonNullable<Data<typeof pvp.usePvpScout>>["stakes"], PvpScoutSceneProps["stakes"]>>,
  Expect<Equal<NonNullable<Data<typeof pvp.usePvpAttack>>["tiles"], PvpAttackSceneProps["tiles"]>>,
  Expect<Equal<NonNullable<Data<typeof pvp.usePvpAttack>>["lastScored"], PvpAttackSceneProps["lastScored"]>>,
  // vault
  Expect<Equal<Data<typeof chain.useVaultPosition>, VaultSceneProps["position"]>>,
  Expect<Equal<Data<typeof chain.usePavedBalance>, OrNull<VaultSceneProps["balance"]>>>,
  Expect<Equal<Data<typeof chain.useSplit>, VaultSceneProps["split"]>>,
];
