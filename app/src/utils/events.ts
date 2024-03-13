import { BuiltLog, ScoredLog, DiscardedLog, Log } from "@/hooks/useLogs";
import { GameOverEvent } from "@/hooks/useGames";
import { shortString } from "starknet";
import { getColor } from "@/utils";

export type Event = {
  id: string;
  keys: string[];
  data: string[];
  createdAt: string;
};

export const parseGameOverEvent = (event: Event): GameOverEvent => {
  const id = event.id;
  const gameId = parseInt(event.keys[2]);
  const tournamentId = parseInt(event.data[0]);
  const gameScore = parseInt(event.data[1]);
  const playerId = event.data[2];
  const playerName = shortString.decodeShortString(event.data[3]);
  const playerMaster = event.data[4];
  const timestamp = new Date(event.createdAt);

  return {
    id,
    gameId,
    tournamentId,
    gameScore,
    playerId,
    playerName,
    playerMaster,
    timestamp,
  };
};

export const parseBuiltEvent = (event: Event): BuiltLog => {
  const id = event.id;
  const gameId = parseInt(event.keys[2]);
  const tileId = parseInt(event.data[0]);
  const tileX = parseInt(event.data[1]);
  const tileY = parseInt(event.data[2]);
  const playerId = event.data[3];
  const playerName = shortString.decodeShortString(event.data[4]);
  const playerColor = getColor(playerId);
  const timestamp = new Date(event.createdAt);

  return {
    id,
    gameId,
    tileId,
    tileX,
    tileY,
    playerId,
    playerName,
    playerColor,
    timestamp,
  };
};

export const createBuiltLog = (log: BuiltLog): Log => {
  return {
    id: log.id,
    timestamp: log.timestamp,
    category: "Built",
    builder: log.playerName,
    color: log.playerColor,
    log: ``,
  };
};

export const parseScoredEvent = (event: Event): ScoredLog => {
  const id = event.id;
  const gameId = parseInt(event.keys[2]);
  const tileId = parseInt(event.data[0]);
  const tileX = parseInt(event.data[1]);
  const tileY = parseInt(event.data[2]);
  const playerId = event.data[3];
  const playerName = shortString.decodeShortString(event.data[4]);
  const playerColor = getColor(playerId);
  const orderId = parseInt(event.data[5]);
  const score = parseInt(event.data[6]);
  const timestamp = new Date(event.createdAt);

  return {
    id,
    gameId,
    tileId,
    tileX,
    tileY,
    playerId,
    playerName,
    playerColor,
    orderId,
    score,
    timestamp,
  };
};

export const createScoredLog = (log: ScoredLog): Log => {
  return {
    id: log.id,
    timestamp: log.timestamp,
    category: "Scored",
    builder: log.playerName,
    color: log.playerColor,
    log: `+${log.score}`,
  };
};

export const parseDiscardedEvent = (event: Event): DiscardedLog => {
  const id = event.id;
  const gameId = parseInt(event.keys[2]);
  const tileId = parseInt(event.data[0]);
  const playerId = event.data[1];
  const playerName = shortString.decodeShortString(event.data[2]);
  const playerColor = getColor(playerId);
  const orderId = parseInt(event.data[3]);
  const score = parseInt(event.data[4]);
  const timestamp = new Date(event.createdAt);

  return {
    id,
    gameId,
    tileId,
    playerId,
    playerName,
    playerColor,
    orderId,
    score,
    timestamp,
  };
};

export const createDiscardedLog = (log: DiscardedLog): Log => {
  return {
    id: log.id,
    timestamp: log.timestamp,
    category: "Discarded",
    builder: log.playerName,
    color: log.playerColor,
    log: `-${log.score}`,
  };
};
