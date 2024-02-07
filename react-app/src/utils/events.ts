import { LogType } from "@/hooks/useLogs";

export type Event = {
  keys: string[];
  data: string[];
  createdAt: string;
};

//---------------------------------------------------------------------
// Scored event
interface ScoredEventResult {
  gameId: number;
  builderId: string;
  orderId: number;
  score: number;
  timestamp: Date;
}

export const parseScoredEvent = (event: Event): ScoredEventResult => {
  const gameId = parseInt(event.data[0]);
  const builderId = event.data[1];
  const orderId = parseInt(event.data[2]);
  const score = parseInt(event.data[3]);
  const timestamp = new Date(event.createdAt);

  return {
    gameId,
    builderId,
    orderId,
    score,
    timestamp,
  };
};

export const createScoredLog = (result: ScoredEventResult): LogType => {
  return {
    timestamp: result.timestamp.getTime(),
    log: `${result.builderId} scored ${result.score}`,
  };
};
