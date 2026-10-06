// The client's data layer on the native contracts: typed clients on starknet.js, views, events,
// writes and the game session. See docs/architecture/client-data-layer.md.

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
  PriceView,
  TileView,
  TournamentView,
  ViewErrorKind,
} from "./views";
export { EventReader, receiptEvents } from "./events";
export type { PlayerGame } from "./events";
export { placementOutcome } from "./placement";
export type { PlacementOutcome } from "./placement";
export { RECEIPT_POLL_MS, PavedWriter, WriteError } from "./writer";
export type { BuildMove, WriteAccount, WriteResult } from "./writer";
export { PavedClient, createPavedClient } from "./paved-client";
export type { PavedRpc, PlayerRecord } from "./paved-client";
export { GameSession } from "./session";
export type { BoardCharacter, BoardTile, PlaceMove, SessionState } from "./session";

// React
export { PavedProvider, connectionStatus, useGameSession, usePaved, useRead } from "./react";
export type { ConnectionStatus, PavedContextValue, ReadState } from "./react";

// Auth
export { controllerPolicies, createControllerConnector } from "./auth/controller";
export type { ControllerConfig } from "./auth/controller";
