// Config
export { createDojoConfig } from "./config";
export type { DojoConfig } from "./config";
export { resolveChainProfileConfig } from "./network";
export type { ChainProfile, ChainProfileKey, ContractAddresses, ResolveChainProfileInput } from "./network";

// Client
export { createChainClient } from "./client";
export type { ChainClient, SyncOptions, WorldClient, BurnerManagerLike } from "./client";

// Contracts
export { createSystems } from "./contracts";
export type {
  BuildParams,
  ModeTypeValue,
  CreateGameParams,
  PreviewValidationParams,
  GameParams,
  ClaimParams,
  SponsorParams,
  DiscardParams,
  SurrenderParams,
  CreatePlayerParams,
  MintTokenParams,
  PreviewEconomyMultiplierParams,
  EconomyPreviewResult,
} from "./contracts";

// Model Adapters
export {
  toGame,
  toPlayer,
  toBuilder,
  toCharacter,
  toTile,
  toTournament,
} from "./models/adapters";

// Hooks
export { useGame } from "./hooks/useGame";
export { usePlayer } from "./hooks/usePlayer";
export { useBuilder } from "./hooks/useBuilder";
export { useTiles } from "./hooks/useTiles";
export { useCharacters } from "./hooks/useCharacters";
export { useTournament } from "./hooks/useTournament";
export { useActions } from "./hooks/useActions";
export type { ActionState } from "./hooks/useActions";
export { useBalance } from "./hooks/useBalance";
export { useTokenSupply } from "./hooks/useTokenSupply";
export { useEconomyConfig } from "./hooks/useEconomyConfig";
export { useEconomyState } from "./hooks/useEconomyState";
export { useGameEconomySnapshot } from "./hooks/useGameEconomySnapshot";

// Provider
export { DojoChainProvider, useDojo } from "./provider";

// Auth
export { controllerPolicies, createControllerConnector } from "./auth/controller";
export type { ControllerConfig } from "./auth/controller";

// Native data layer (P-10): typed clients on starknet.js, views, events. See
// docs/architecture/client-data-layer.md.
export { ABIS, createCodecs } from "./abis";
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
  TileView,
  TournamentView,
  ViewErrorKind,
} from "./views";
export { EventReader, receiptEvents } from "./events";
export type { PlayerGame } from "./events";
export { placementOutcome } from "./placement";
export type { PlacementOutcome } from "./placement";
export { DAILY_PRICE, RECEIPT_POLL_MS, PavedWriter, WriteError } from "./writer";
export type { BuildMove, WriteAccount, WriteResult } from "./writer";
export { PavedClient, createPavedClient } from "./paved-client";
export type { PavedProvider, PlayerRecord } from "./paved-client";
