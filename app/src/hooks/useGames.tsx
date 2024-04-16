import { useDojo } from "@/dojo/useDojo";
import { Event } from "@/dojo/events";
import { useEffect, useState } from "react";
import { parseGameOverEvent } from "@/dojo/game/events";
import data from "@/data";
import { WorldEvents } from "@/dojo/generated/contractEvents";
import { ModeType } from "@/dojo/game/types/mode";

export type GameOverEvent = {
  id: string;
  gameId: number;
  tournamentId: number;
  seasonId: number;
  gameScore: number;
  gameStartTime: Date;
  gameEndTime: Date;
  playerId: string;
  playerName: string;
  playerMaster: string;
  timestamp: Date;
};

const parse = (event: Event): GameOverEvent => {
  if (event.keys[0] === WorldEvents.GameOver) {
    return parseGameOverEvent(event);
  }
  throw new Error("Unknown event type");
};

export const useGames = (mode: ModeType) => {
  const [games, setGames] = useState<GameOverEvent[]>(data);
  const [ids, setIds] = useState<number[]>([]);

  const {
    setup: {
      contractEvents: { queryEvents },
    },
  } = useDojo();

  useEffect(() => {
    const query = async () => {
      const events = await queryEvents([WorldEvents.GameOver]);
      setGames((prevGames) => {
        const newGames = [...prevGames, ...events.map(parse)];
        // Remove duplicates
        const dedupedGames = newGames.filter(
          (game, idx) => idx === newGames.findIndex((g) => g.id === game.id),
        );
        // Sort by score
        const sortedGames = dedupedGames.sort(
          (a, b) => b.gameScore - a.gameScore,
        );
        // Extract all unique tournament ids
        const uniqueIds = Array.from(
          new Set(
            sortedGames.map((game) => {
              return game.tournamentId;
            }),
          ),
        );
        setIds(uniqueIds);
        return sortedGames;
      });
    };
    query();
  }, [data]);

  return {
    games: games.filter(
      (game) =>
        (mode == ModeType.Single && game.tournamentId == 0) ||
        (mode == ModeType.Ranked && game.tournamentId > 0),
    ),
    ids: ids.filter(
      (id) =>
        (mode === ModeType.Single && id === 0) ||
        (mode === ModeType.Ranked && id > 0),
    ),
  };
};
