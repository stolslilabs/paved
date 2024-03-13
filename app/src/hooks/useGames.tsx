import { useDojo } from "@/dojo/useDojo";
import { Event } from "@/dojo/createCustomEvents";
import { useEffect, useState } from "react";
import { useQueryParams } from "@/hooks/useQueryParams";
import { GAME_OVER_EVENT } from "@/constants/events";
import { parseGameOverEvent } from "@/utils/events";

export type GameOverEvent = {
  id: string;
  gameId: number;
  tournamentId: number;
  gameScore: number;
  playerId: string;
  playerName: string;
  playerMaster: string;
  timestamp: Date;
};

const parse = (event: Event): GameOverEvent => {
  if (event.keys[0] === GAME_OVER_EVENT) {
    return parseGameOverEvent(event);
  }
  throw new Error("Unknown event type");
};

export const useGames = () => {
  const { gameId } = useQueryParams();
  const [games, setGames] = useState<GameOverEvent[]>([]);

  const {
    setup: {
      contractEvents: { queryEvents },
    },
  } = useDojo();

  useEffect(() => {
    const query = async () => {
      let gameIdString = `0x${gameId.toString(16)}`;
      const events = await queryEvents([GAME_OVER_EVENT, gameIdString]);
      setGames((prevGames) => [...prevGames, ...events.map(parse)]);
    };
    query();
  }, []);

  // Remove duplicates
  const dedupedLogs = games.filter(
    (game, idx) => idx === games.findIndex((g) => g.id === game.id)
  );
  const sortedLogs = dedupedLogs.sort(
    (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
  );
  return { logs: sortedLogs };
};
