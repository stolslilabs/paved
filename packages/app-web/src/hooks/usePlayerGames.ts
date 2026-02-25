import { useState, useEffect, useRef } from "react";
import { padAddress, toriiQuery } from "../utils/torii";
import {
  parseGameRow,
  splitGames,
  type PlayerGame,
} from "../utils/landing-helpers";

/** Pure async function for fetching and parsing player games. Testable without React. */
export async function fetchPlayerGames(
  toriiUrl: string | null,
  accountAddress: string | null
): Promise<{ activeGames: PlayerGame[]; completedGames: PlayerGame[] }> {
  const empty = { activeGames: [], completedGames: [] };
  if (!toriiUrl || !accountAddress) return empty;

  try {
    const padded = padAddress(accountAddress);
    const builderRows = await toriiQuery(
      toriiUrl,
      `SELECT game_id FROM [paved-Builder] WHERE player_id = '${padded}'`
    );

    if (!builderRows.length) return empty;

    const games: PlayerGame[] = [];
    for (const row of builderRows) {
      const gameRows = await toriiQuery(
        toriiUrl,
        `SELECT * FROM [paved-Game] WHERE id = ${row.game_id}`
      );
      if (gameRows.length > 0) {
        games.push(parseGameRow(gameRows[0]));
      }
    }

    return splitGames(games);
  } catch {
    return empty;
  }
}

const POLL_INTERVAL = 5000;

/** React hook that polls for player games every 5 seconds. */
export function usePlayerGames(
  toriiUrl: string | null,
  accountAddress: string | null
): {
  activeGames: PlayerGame[];
  completedGames: PlayerGame[];
  isLoading: boolean;
} {
  const [activeGames, setActiveGames] = useState<PlayerGame[]>([]);
  const [completedGames, setCompletedGames] = useState<PlayerGame[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    const poll = async () => {
      const result = await fetchPlayerGames(toriiUrl, accountAddress);
      if (mountedRef.current) {
        setActiveGames(result.activeGames);
        setCompletedGames(result.completedGames);
        setIsLoading(false);
      }
    };

    poll();
    const interval = setInterval(poll, POLL_INTERVAL);

    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, [toriiUrl, accountAddress]);

  return { activeGames, completedGames, isLoading };
}
