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
  drawView,
  hasDrawViews,
} from "./views";
export type {
  BuilderView,
  DrawView,
  DrawViews,
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
export { LEVEL_STEP, MAX_XP, PLAYER_LEVEL_FIELDS, XP_SOURCE, levelFloor, levelOf, playerLevelOf } from "./level";
export type { LevelViews, PlayerLevel } from "./level";
export {
  DEMOLITION_OFFER_FIELDS,
  VILLAGE_CELL_FIELDS,
  VILLAGE_INFO_FIELDS,
  VILLAGE_SPEND_REASON,
  VILLAGE_TILE_FIELDS,
  buyParcelCall,
  demolishCall,
  demolitionOffer,
  foundVillageCall,
  fromCell,
  toCell,
  NO_VILLAGE,
  hasVillageViews,
  villageCell,
  villageInfo,
  villageTile,
} from "./village";
export type { DemolitionOffer, FakeVillagePlayer, VillageCell, VillageInfo, VillageTile, VillageViews } from "./village";
export {
  ATTACK_DECK_FIELDS,
  ATTACK_DRAW_KIND,
  ATTACK_FIELDS,
  ATTACK_MOVE_FIELDS,
  ATTACK_STATUS,
  DRAWS_PER_ATTACK,
  STAR_PERCENTS,
  attack,
  attackDeck,
  attackMove,
  drawIndex,
  playCall,
  playCalls,
  startAttackCalls,
  starsOf,
  surrenderCall,
} from "./arena";
export type { Attack, AttackDeck, AttackMove, AttackPlay } from "./arena";
export {
  ATTACK_SHIELD_S,
  LEAGUE_COUNT,
  LEAGUE_FLOORS,
  LEAGUE_GROUPS,
  LEAGUE_STATUS_FIELDS,
  MATCHMAKER_STATUS,
  MATCHMAKER_VILLAGE_FIELDS,
  MATCH_DRAW_KIND,
  MATCH_FIELDS,
  MIN_SEASON_ATTACKS,
  NEXT_PRICE,
  NO_MATCH,
  NPC_LEVEL_FIELDS,
  SEASON_REWARDS,
  SHIELD_FIELDS,
  costOf,
  floorOf,
  groupOf,
  hasPvpViews,
  isNpcAddress,
  groupsOf,
  leagueName,
  leagueOfCrowns,
  leagueStatus,
  matchmakerVillage,
  nextCalls,
  npcLevel,
  offerOf,
  prizeOf,
  pvpMatch,
  pvpShield,
  searchCalls,
  seasonRewardOf,
} from "./matchmaker";
export type { FakePvpState, LeagueStatus, MatchmakerVillage, NpcLevel, PvpMatch, PvpShield, PvpViews } from "./matchmaker";
export {
  REWARD_CHOICE,
  REWARD_COBBLES,
  REWARD_DRAW_KIND,
  REWARD_GRANTS_FIELDS,
  REWARD_OFFER_FIELDS,
  claimRewardCall,
  isOfferOpen,
  openRewardCalls,
  rewardGrants,
  rewardOffer,
  tierOf,
} from "./rewards";
export type { RewardClaim, RewardGrants, RewardOffer } from "./rewards";
export type { SkinChange, SkinViews } from "./skins";
export {
  AVATAR_FORMAT_VERSION,
  AVATAR_LISTED,
  AVATAR_MAX_ID,
  AVATAR_MAX_PARTS,
  AVATAR_UNLISTED,
  AVATAR_WITHDRAWN,
  canSetLook,
  isFreeItem,
  isOnSale,
  lookIds,
  lookOf,
  ownsItem,
} from "./avatar";
export type { AvatarItem, AvatarViews } from "./avatar";
export {
  RECEIPT_POLL_MS,
  PavedWriter,
  VILLAGE_REFUSAL_TEXT,
  VillageRefusedError,
  PVP_REFUSAL_TEXT,
  PvpRefusedError,
  AVATAR_REFUSAL_TEXT,
  AvatarPriceChangedError,
  AvatarRefusedError,
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
  SendUnconfirmedError,
  WALLET_REJECTED_TEXT,
  WalletRejectedError,
  WriteError,
  buyPackArgs,
  isWalletRejection,
  packBoughtOf,
  refusedBeforeSending,
} from "./writer";
export type { AvatarRefusal, BuildMove, BuyAvatarItemRequest, BuyPackRequest, BuyParcelRequest, BuySkinRequest, ClaimRefusal, PackBought, PackRefusal, SkinRefusal, VillageRefusal, PvpRefusal, WriteAccount, WriteResult } from "./writer";
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
  IndexedAttack,
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
export { CONTROLLER_ENTRY_POINTS, controllerPolicies } from "./auth/controller";
export {
  AccountDeployError,
  DEVICE_KEY,
  DEVICE_KEY_SIGNED_OUT,
  DEVNET_FUNDING,
  LOCAL_ACCOUNT_CLASS_HASH,
  STRK_ADDRESS,
  createLocalKeyConnector,
  deployedBy,
  deployedBySelf,
  isDeployed,
  localKey,
  newPrivateKey,
  starknetAccount,
} from "./auth/local-key";
export type { AccountProvider, DeployLocalAccount, KeyStorage, LocalKey, LocalKeyConnector, LocalKeyConnectorOptions } from "./auth/local-key";

// Cartridge's VRF per draw (#638)
export {
  CARTRIDGE_VRF_NETWORKS,
  CARTRIDGE_VRF_PROVIDER,
  VRF_DRAW_DOMAIN,
  VRF_REQUEST_ENTRY_POINT,
  VRF_SOURCE,
  vrfPolicies,
  vrfProvider,
  vrfRequestCall,
  vrfSalt,
  withVrfRequest,
} from "./vrf";
export type { VrfRequest } from "./vrf";

// Economy (P8, E1 to E3: the committed ABIs)
export { ECONOMY_ABIS, createEconomyCodecs } from "./abis";
export type { EconomyCodecs, EconomyContractName } from "./abis";
export * from "./economy";
