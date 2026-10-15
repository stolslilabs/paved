// The data layer of the v2 app (P2, section 3.3): TanStack Query hooks over `@paved/chain` and the indexer client,
// each returning the type its scene's prop takes, and the board's sessions (Training's, Challenge's predicted one, P5).
// Writes are P5's (the board's moves, through the sources' `signer`), P7's and P10's.

export { DataProvider, useDataSources } from "./sources";
export type { DataSources, GameSigner } from "./sources";
export { addressKey, queryKeys } from "./keys";
export {
  useActiveGame,
  useEconomyDay,
  useEntryPrice,
  useGame,
  usePavedBalance,
  usePlayerGames,
  usePoolQuote,
  useQuote,
  useSpawnPaused,
  useSplit,
  useTerms,
  useUsdcBalance,
  useVaultPosition,
} from "./chain";
export {
  scheduled,
  useDefinitions,
  useIndexedGame,
  useIndexedPlayerGames,
  useLeaderboard,
  useLeaderboardEntry,
  usePlayerAchievements,
  usePlayerProfile,
  usePlayerQuests,
  usePlayerStatus,
  useTopThree,
} from "./indexer";
export { boardOf, remainingOf, useTrainingSave, useTrainingSession } from "./training";
export { useChallengeSession } from "./challenge";
export * from "./rewards";
export type { ChallengeSession } from "./challenge";
export type { SessionBoard } from "./training";
