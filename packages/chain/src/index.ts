// The client's data layer on the native contracts: typed clients on starknet.js, views, events,
// writes and the game session. See docs/architecture/client-data-layer.md.

export { ABIS, FAUCET_ABI, FAUCET_USDC_AMOUNT, createCodecs } from "./abis";
export type { ContractName, Codecs } from "./abis";
export { AbiCodec, sameAddress } from "./codec";
export type { Abi, DecodedEvent, RawEvent } from "./codec";
export { FAUCET_NETWORKS, resolveDeployment } from "./deployment";
export type { Deployment, DeploymentEnv, DeploymentFile } from "./deployment";
export {
  MAX_PAGE,
  MODE_CODE,
  TILE_STATUS,
  FakeGameViews,
  MAX_PACK_ID,
  PACK_VIEW_FIELDS,
  RpcGameViews,
  ViewError,
  gameContract,
  modeFromCode,
  toViewError,
  NOT_AVAILABLE_MESSAGE,
} from "./views";
export type {
  BuilderView,
  FakeGame,
  GameKey,
  GameMode,
  GameView,
  GameViews,
  PackView,
  PackViews,
  PriceView,
  TileView,
  ViewErrorKind,
} from "./views";
export {
  COLLECTION_ABI,
  FakeCollectionViews,
  MAX_TOKEN_URI_LENGTH,
  NftMetadataError,
  RpcCollectionViews,
  TOKEN_LIMIT,
  collectionAddress,
  nftLabel,
  nftOf,
  parseTokenUri,
  shortAddress,
  tokenIdOf,
} from "./nft";
export type { CollectionViews, NftAttribute, NftMetadata } from "./nft";
export { EventReader, receiptEvents } from "./events";
export type { PlayerGame } from "./events";
export { placementOutcome } from "./placement";
export type { PlacementOutcome } from "./placement";
export {
  COBBLE_DAY,
  COBBLE_VIEW_FIELDS,
  COBBLE_WEEK,
  COBBLE_WEEK_START,
  NO_ACCOUNT,
  NO_PROGRESS,
  weekOfDay,
} from "./cobbles";
export type { AchievementCobbles, CobbleAccount, CobbleClaim, CobbleKind, CobbleViews, PeriodProgress, QuestCobbles } from "./cobbles";
export { DEFAULT_THEME, FOREST_THEME, SKIN_PLANS, activeThemes, isSkinPlan, ownsSkin } from "./skins";
export type { SkinChange, SkinViews } from "./skins";
export {
  RECEIPT_POLL_MS,
  PavedWriter,
  CLAIM_REFUSAL_TEXT,
  ClaimRefusedError,
  FaucetCapError,
  GameExpiredError,
  GAME_EXPIRED_TEXT,
  INVALID_POSITION_TEXT,
  InvalidPositionError,
  NO_CREDIT_TEXT,
  NoCreditError,
  FreeSpawnPausedError,
  SKIN_REFUSAL_TEXT,
  SkinPriceChangedError,
  SkinRefusedError,
  FREE_SPAWN_PAUSED_TEXT,
  PACK_REFUSAL_TEXT,
  PackOutcomeUnknownError,
  PackRefusedError,
  WALLET_REJECTED_TEXT,
  WalletRejectedError,
  WriteError,
  buyPackArgs,
  isWalletRejection,
  packBoughtOf,
} from "./writer";
export type { BuildMove, BuyPackRequest, BuySkinRequest, ClaimRefusal, PackBought, PackRefusal, SkinRefusal, WriteAccount, WriteResult } from "./writer";
export { PACK_IDS, PackBuyer, PackNotOnSaleError, PackPriceChangedError, onSale, packBuyerOf, packReferrer, packSwapInput, readPacks } from "./packs";
export type { PackBuyerOptions, PackPlan, PackPurchaseRequest } from "./packs";
export { PavedClient, createPavedClient } from "./paved-client";
export type { PavedRpc } from "./paved-client";
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
  PlayerReferrals,
  PlayerStats,
  QuestDefinition,
  ReferralTotal,
  TaskProgress,
  TaskTarget,
  TournamentDetail,
  TournamentList,
  TournamentSummary,
} from "./indexer";
export { GameSession } from "./session";
export type { BoardTile, PlaceMove, ScoredStructure, SessionState } from "./session";

// React
export { PavedProvider, connectionStatus, useAsyncRead, useGameSession, usePaved, useRead } from "./react";
export type { ConnectionStatus, PavedContextValue, ReadState } from "./react";
export { IndexerProvider, useIndexer, useIndexerRead } from "./indexer-react";

// Auth
export { CONTROLLER_ENTRY_POINTS, controllerPolicies, createControllerConnector } from "./auth/controller";
export type { ControllerConfig } from "./auth/controller";

// Economy (P8, E1 to E3: the committed ABIs)
export { ECONOMY_ABIS, createEconomyCodecs } from "./abis";
export type { EconomyCodecs, EconomyContractName } from "./abis";
export * from "./economy";
