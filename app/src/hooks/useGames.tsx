import { useDojo } from "@/dojo/useDojo";
import { Event } from "@/dojo/events";
import { useEffect, useState } from "react";
import { parseGameOverEvent } from "@/dojo/game/events";
import data from "@/data";
import { WorldEvents } from "@/dojo/generated/contractEvents";
import { Mode } from "@/dojo/game/types/mode";

export type GameOverEvent = {
  id: string;
  gameId: number;
  tournamentId: number;
  seasonId: number;
  gameMode: Mode;
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

export const useGames = ({ mode }: { mode: Mode }) => {
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
        // Filter by mode
        const filteredGames = newGames.filter(
          (game) => game.gameMode.value == mode.value,
        );
        // Remove duplicates
        const dedupedGames = filteredGames.filter(
          (game, idx) =>
            idx === filteredGames.findIndex((g) => g.id === game.id),
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
    games,
    ids,
  };
};
