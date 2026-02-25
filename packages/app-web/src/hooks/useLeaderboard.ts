import { useState, useEffect, useRef } from "react";
import { toriiQuery } from "../utils/torii";
import { parseLeaderboardRow, type LeaderboardEntry } from "../utils/landing-helpers";

/** Pure async function for fetching leaderboard. Testable without React. */
export async function fetchLeaderboard(
  toriiUrl: string | null
): Promise<LeaderboardEntry[]> {
  if (!toriiUrl) return [];

  try {
    const rows = await toriiQuery(
      toriiUrl,
      `SELECT name, score FROM [paved-Player] ORDER BY score DESC LIMIT 10`
    );

    return rows.map((row: any, index: number) =>
      parseLeaderboardRow(row, index + 1)
    );
  } catch {
    return [];
  }
}

const POLL_INTERVAL = 10000;

/** React hook that polls for global leaderboard every 10 seconds. */
export function useLeaderboard(toriiUrl: string | null): {
  players: LeaderboardEntry[];
  isLoading: boolean;
} {
  const [players, setPlayers] = useState<LeaderboardEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    const poll = async () => {
      const result = await fetchLeaderboard(toriiUrl);
      if (mountedRef.current) {
        setPlayers(result);
        setIsLoading(false);
      }
    };

    poll();
    const interval = setInterval(poll, POLL_INTERVAL);

    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, [toriiUrl]);

  return { players, isLoading };
}
