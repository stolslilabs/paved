import { useDojo } from "@/dojo/useDojo";
import { Event } from "@/dojo/events";
import { useEffect, useState } from "react";
import { GAME_OVER_EVENT } from "@/constants/events";
import { parseGameOverEvent } from "@/dojo/game/events";

export type GameOverEvent = {
  id: string;
  gameId: number;
  tournamentId: number;
  gameScore: number;
  gameStartTime: Date;
  gameEndTime: Date;
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
  const [games, setGames] = useState<GameOverEvent[]>([]);
  const [ids, setIds] = useState<number[]>([]);

  const {
    setup: {
      contractEvents: { queryEvents },
    },
  } = useDojo();

  useEffect(() => {
    const query = async () => {
      const events = await queryEvents([GAME_OVER_EVENT]);
      setGames((prevGames) => {
        const newGames = [...prevGames, ...events.map(parse)];
        // Remove duplicates
        const dedupedGames = newGames.filter(
          (game, idx) => idx === newGames.findIndex((g) => g.id === game.id)
        );
        // Sort by score
        const sortedGames = dedupedGames.sort(
          (a, b) => b.gameScore - a.gameScore
        );
        // Extract all unique tournament ids
        const uniqueIds = Array.from(
          new Set(sortedGames.map((game) => game.tournamentId))
        );
        setIds(uniqueIds);
        return sortedGames;
      });
    };
    query();
  }, []);

  return { games, ids };
};
