import { BuiltLog, ScoredLog, Log } from "@/hooks/useLogs";
import { shortString } from "starknet";
import { getColorFromAddress } from "@/utils";

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
  const builderId = event.data[3];
  const builderName = shortString.decodeShortString(event.data[4]);
  const builderColor = getColorFromAddress(builderId);
  const timestamp = new Date(event.createdAt);

  return {
    id,
    gameId,
    tileId,
    tileX,
    tileY,
    builderId,
    builderName,
    builderColor,
    timestamp,
  };
};

export const createBuiltLog = (log: BuiltLog): Log => {
  return {
    id: log.id,
    timestamp: log.timestamp,
    category: "Built",
    builder: log.builderName,
    color: log.builderColor,
    log: ``,
  };
};

export const parseScoredEvent = (event: Event): ScoredLog => {
  const id = event.id;
  const gameId = parseInt(event.keys[2]);
  const tileId = parseInt(event.data[0]);
  const tileX = parseInt(event.data[1]);
  const tileY = parseInt(event.data[2]);
  const builderId = event.data[3];
  const builderName = shortString.decodeShortString(event.data[4]);
  const builderColor = getColorFromAddress(builderId);
  const orderId = parseInt(event.data[5]);
  const score = parseInt(event.data[6]);
  const timestamp = new Date(event.createdAt);

  return {
    id,
    gameId,
    tileId,
    tileX,
    tileY,
    builderId,
    builderName,
    builderColor,
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
    builder: log.builderName,
    color: log.builderColor,
    log: `+${log.score}`,
  };
};
