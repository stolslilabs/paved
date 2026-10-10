// The client's data layer on the native contracts: typed clients on starknet.js, views, events,
// writes and the game session. See docs/architecture/client-data-layer.md.

export { ABIS, FAUCET_USDC_AMOUNT, createCodecs } from "./abis";
export type { ContractName, Codecs } from "./abis";
export { AbiCodec, sameAddress } from "./codec";
export type { Abi, DecodedEvent, RawEvent } from "./codec";
export { resolveDeployment } from "./deployment";
export type { Deployment, DeploymentEnv, DeploymentFile } from "./deployment";
export {
  MAX_PAGE,
  MODE_CODE,
  TILE_STATUS,
  FakeGameViews,
  RpcGameViews,
  ViewError,
  emptyTournament,
  gameContract,
  modeFromCode,
  toViewError,
} from "./views";
export type {
  BuilderView,
  CharacterView,
  FakeGame,
  GameKey,
  GameMode,
  GameView,
  GameViews,
  PriceView,
  TileView,
  TournamentView,
  ViewErrorKind,
} from "./views";
export { EventReader, receiptEvents } from "./events";
export type { PlayerGame, Sponsorship } from "./events";
export { placementOutcome } from "./placement";
export type { PlacementOutcome } from "./placement";
export { claimableRanks, countedTournamentIds, rewardOf } from "./prize";
export type { Rank } from "./prize";
export {
  RECEIPT_POLL_MS,
  PavedWriter,
  NoPrizeDayError,
  NothingToReclaimError,
  ReclaimAmountChangedError,
  RewardChangedError,
  SponsorAmountChangedError,
  WriteError,
} from "./writer";
export type { BuildMove, WriteAccount, WriteResult } from "./writer";
export { PavedClient, createPavedClient } from "./paved-client";
export type { PavedRpc, PlayerRecord } from "./paved-client";
export {
  DEFAULT_MAX_LAG,
  INDEXER_API_VERSION,
  MAX_INDEXER_PAGE,
  MAX_TOURNAMENT_ID,
  IndexerClient,
  IndexerError,
  createIndexerClient,
  indexerPlayerId,
} from "./indexer";
export type {
  AchievementDefinition,
  Definitions,
  Freshness,
  IndexedGame,
  IndexedPlayer,
  IndexerAnswer,
  IndexerContract,
  IndexerErrorKind,
  IndexerHead,
  IndexerHeadInfo,
  IndexerOptions,
  IndexerStatus,
  Leaderboard,
  LeaderboardEntry,
  PlayerAchievement,
  PlayerAchievements,
  PlayerGames,
  PlayerProfile,
  PlayerQuest,
  PlayerQuests,
  PlayerStats,
  QuestDefinition,
  TaskProgress,
  TaskTarget,
  TournamentDetail,
  TournamentList,
  TournamentSummary,
} from "./indexer";
export { GameSession } from "./session";
export type { BoardCharacter, BoardTile, PlaceMove, SessionState } from "./session";

// React
export { PavedProvider, connectionStatus, useAsyncRead, useGameSession, usePaved, useRead } from "./react";
export type { ConnectionStatus, PavedContextValue, ReadState } from "./react";
export { IndexerProvider, useIndexer, useIndexerRead } from "./indexer-react";

// Auth
export { controllerPolicies, createControllerConnector } from "./auth/controller";
export type { ControllerConfig } from "./auth/controller";

// Economy (P8, E1 to E3: the committed ABIs)
export { ECONOMY_ABIS, createEconomyCodecs } from "./abis";
export type { EconomyCodecs, EconomyContractName } from "./abis";
export * from "./economy";
