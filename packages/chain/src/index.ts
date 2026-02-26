// Config
export { createDojoConfig } from "./config";
export type { DojoConfig } from "./config";
export { resolveChainProfileConfig } from "./network";
export type { ChainProfile, ChainProfileKey, ResolveChainProfileInput } from "./network";

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
export { createControllerConnector } from "./auth/controller";
export type { ControllerConfig } from "./auth/controller";
