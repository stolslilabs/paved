import { BuiltLog, ScoredLog, DiscardedLog, Log } from "@/hooks/useLogs";
import { GameOverEvent } from "@/hooks/useGames";
import { shortString } from "starknet";
import { getColor } from "@/dojo/game";
import { TOURNAMENT_ID_OFFSET } from "./constants";

export type Event = {
  id: string;
  keys: string[];
  data: string[];
  createdAt: string;
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
  const points = parseInt(event.data[0]);
  const size = parseInt(event.data[1]);
  const playerId = event.data[2];
  const playerName = shortString.decodeShortString(event.data[3]);
  const playerColor = getColor(playerId);
  const playerMaster = event.data[4];
  const orderId = parseInt(event.data[5]);
  const timestamp = new Date(event.createdAt);

  return {
    id,
    gameId,
    points,
    size,
    cities: 0,
    roads: 0,
    playerId,
    playerName,
    playerColor,
    playerMaster,
    orderId,
    timestamp,
  };
};

export const createScoredCityLog = (log: ScoredLog): Log => {
  return {
    id: log.id,
    timestamp: log.timestamp,
    category: "ScoredCity",
    builder: log.playerName,
    color: log.playerColor,
    log: `+${log.points}`,
  };
};

export const createScoredRoadLog = (log: ScoredLog): Log => {
  return {
    id: log.id,
    timestamp: log.timestamp,
    category: "ScoredRoad",
    builder: log.playerName,
    color: log.playerColor,
    log: `+${log.points}`,
  };
};

export const parseScoredForestEvent = (event: Event): ScoredLog => {
  const id = event.id;
  const gameId = parseInt(event.keys[2]);
  const points = parseInt(event.data[0]);
  const size = parseInt(event.data[1]);
  const cities = parseInt(event.data[2]);
  const roads = parseInt(event.data[3]);
  const playerId = event.data[4];
  const playerName = shortString.decodeShortString(event.data[5]);
  const playerColor = getColor(playerId);
  const playerMaster = event.data[6];
  const orderId = parseInt(event.data[7]);
  const timestamp = new Date(event.createdAt);

  return {
    id,
    gameId,
    points,
    size,
    cities,
    roads,
    playerId,
    playerName,
    playerColor,
    playerMaster,
    orderId,
    timestamp,
  };
};

export const createScoredForestLog = (log: ScoredLog): Log => {
  if (log.roads > 0) {
    return {
      id: log.id,
      timestamp: log.timestamp,
      category: "ScoredForestRoad",
      builder: log.playerName,
      color: log.playerColor,
      log: `+${log.points}`,
    };
  }
  return {
    id: log.id,
    timestamp: log.timestamp,
    category: "ScoredForestCity",
    builder: log.playerName,
    color: log.playerColor,
    log: `+${log.points}`,
  };
};

export const parseScoredWonderEvent = (event: Event): ScoredLog => {
  const id = event.id;
  const gameId = parseInt(event.keys[2]);
  const points = parseInt(event.data[0]);
  const playerId = event.data[1];
  const playerName = shortString.decodeShortString(event.data[2]);
  const playerColor = getColor(playerId);
  const playerMaster = event.data[3];
  const orderId = parseInt(event.data[4]);
  const timestamp = new Date(event.createdAt);

  return {
    id,
    gameId,
    points,
    size: 0,
    cities: 0,
    roads: 0,
    playerId,
    playerName,
    playerColor,
    playerMaster,
    orderId,
    timestamp,
  };
};

export const createScoredWonderLog = (log: ScoredLog): Log => {
  return {
    id: log.id,
    timestamp: log.timestamp,
    category: "ScoredWonder",
    builder: log.playerName,
    color: log.playerColor,
    log: `+${log.points}`,
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

export const parseGameOverEvent = (event: Event): GameOverEvent => {
  const id = event.id;
  const gameId = parseInt(event.keys[1], 16);
  const tournamentId = parseInt(event.keys[2], 16) - TOURNAMENT_ID_OFFSET;
  const gameScore = parseInt(event.data[0]);
  const gameStartTime = new Date(parseInt(event.data[1], 16) * 1000);
  const gameEndTime = new Date(parseInt(event.data[2], 16) * 1000);
  const playerId = event.data[3];
  const playerName = shortString.decodeShortString(event.data[4]);
  const playerMaster = event.data[5];
  const timestamp = new Date(event.createdAt);

  return {
    id,
    gameId,
    tournamentId,
    gameScore,
    gameStartTime,
    gameEndTime,
    playerId,
    playerName,
    playerMaster,
    timestamp,
  };
};

export const createGameOverLog = (log: GameOverEvent): Log => {
  return {
    id: log.id,
    timestamp: log.timestamp,
    category: "GameOver",
    builder: log.playerName,
    color: "black",
    log: `Game Over! ${log.gameScore} points`,
  };
};
