import { useState, useEffect, useRef } from "react";
import { feltToString, toriiQuery } from "../utils/torii";
import { parseTournamentRow, type TournamentInfo } from "../utils/landing-helpers";
import { Mode, ModeType, Tournament } from "@paved/game-core";

export interface TournamentResults {
  daily: TournamentInfo | null;
  weekly: TournamentInfo | null;
}

const MODES: { key: keyof TournamentResults; mode: Mode }[] = [
  { key: "daily", mode: new Mode(ModeType.Daily) },
  { key: "weekly", mode: new Mode(ModeType.Weekly) },
];

/** Fetch tournament info for a single mode. */
async function fetchTournamentForMode(
  toriiUrl: string,
  mode: Mode
): Promise<TournamentInfo | null> {
  const duration = mode.duration();
  const tournamentId = Tournament.computeId(duration);

  const rows = await toriiQuery(
    toriiUrl,
    `SELECT * FROM [paved-Tournament] WHERE id = ${tournamentId}`
  );

  if (!rows.length) return null;

  const row = rows[0];

  // Collect player IDs that have scores
  const playerIds: string[] = [];
  if (Number(row.top1_score) > 0 && row.top1_player_id) {
    playerIds.push(String(row.top1_player_id));
  }
  if (Number(row.top2_score) > 0 && row.top2_player_id) {
    playerIds.push(String(row.top2_player_id));
  }
  if (Number(row.top3_score) > 0 && row.top3_player_id) {
    playerIds.push(String(row.top3_player_id));
  }

  // Fetch player names
  const playerNames: Record<string, string> = {};
  if (playerIds.length > 0) {
    const idList = playerIds.map((id) => `'${id}'`).join(",");
    const playerRows = await toriiQuery(
      toriiUrl,
      `SELECT id, name FROM [paved-Player] WHERE id IN (${idList})`
    );
    for (const p of playerRows) {
      playerNames[String(p.id)] = feltToString(String(p.name));
    }
  }

  return parseTournamentRow(row, playerNames);
}

/** Pure async function for fetching tournaments for all modes. Testable without React. */
export async function fetchTournaments(
  toriiUrl: string | null
): Promise<TournamentResults> {
  const empty: TournamentResults = { daily: null, weekly: null };
  if (!toriiUrl) return empty;

  try {
    const results: TournamentResults = { daily: null, weekly: null };
    for (const { key, mode } of MODES) {
      results[key] = await fetchTournamentForMode(toriiUrl, mode);
    }
    return results;
  } catch {
    return empty;
  }
}

const POLL_INTERVAL = 10000;

/** React hook that polls for tournament data every 10 seconds. */
export function useTournaments(toriiUrl: string | null): {
  tournaments: TournamentResults;
  isLoading: boolean;
} {
  const [tournaments, setTournaments] = useState<TournamentResults>({
    daily: null,
    weekly: null,
  });
  const [isLoading, setIsLoading] = useState(true);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    const poll = async () => {
      const result = await fetchTournaments(toriiUrl);
      if (mountedRef.current) {
        setTournaments(result);
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

  return { tournaments, isLoading };
}
