import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { MAX_TOURNAMENT_ID, indexerPlayerId, useIndexer, useIndexerRead, usePaved, useRead } from "@paved/chain";
import type { LeaderboardEntry } from "@paved/chain";
import { DayPicker } from "../components/DayPicker";
import { IndexerFailure, IndexerLag } from "../components/IndexerLag";
import { BOARD_PAGE, playerLabel, slotsLabel } from "../utils/indexer-view";
import { useDays } from "../utils/use-days";

const page = { minHeight: "100%", background: "#0a0a0a", color: "#f5f5f5", padding: 24, display: "flex", flexDirection: "column", gap: 12, maxWidth: 960, margin: "0 auto", boxSizing: "border-box" } as const;
const cell = { padding: "6px 10px", textAlign: "left" } as const;
const button = { border: "1px solid rgba(255,255,255,0.25)", background: "rgba(255,255,255,0.08)", color: "#fff", borderRadius: 8, padding: "6px 12px", cursor: "pointer" } as const;

/** A tournament id from the route; null when it is not a plain decimal or is above what the API serves. */
function routeId(text: string | undefined): number | null {
  return text !== undefined && /^\d+$/.test(text) && Number(text) <= MAX_TOURNAMENT_ID ? Number(text) : null;
}

/**
 * The leaderboard of one day (today's by default) from the indexer, for display only. The prize slots
 * are the indexer's replay of the contract's top 3; the prize amounts and the claims are on the home
 * page, read from the contract.
 */
export function LeaderboardPage() {
  const params = useParams();
  const navigate = useNavigate();
  const indexer = useIndexer();
  const { address } = usePaved();

  const requested = params.tournamentId === undefined ? undefined : routeId(params.tournamentId);
  const { days, current, waitingForToday, id, listed } = useDays(requested);
  const me = useRead((c) => (address ? c.player(address) : Promise.resolve(null)), [address]);

  const [paging, setPaging] = useState({ id: -1, offset: 0 });
  const offset = paging.id === id ? paging.offset : 0;
  const board = useIndexerRead(
    id === null || waitingForToday ? null : (c) => c.leaderboard(id, { limit: BOARD_PAGE, offset }),
    [id, offset],
    { onVisible: true },
  );

  const myId = me.data ? indexerPlayerId(me.data.id) : null;

  if (!indexer) {
    return (
      <div style={page}>
        <Link to="/" style={{ color: "#f59e0b" }}>Back</Link>
        <h1 style={{ margin: 0 }}>Leaderboard</h1>
        <IndexerFailure error={null} />
      </div>
    );
  }

  // `useIndexerRead` shows an answer only for the day and page asked now, so these rows are never another's.
  const answer = board.data;
  const rows = answer?.data.entries ?? [];
  const total = answer?.data.total ?? 0;

  return (
    <div style={page}>
      <Link to="/" style={{ color: "#f59e0b" }}>Back</Link>
      <h1 style={{ margin: 0 }}>Leaderboard</h1>
      {id !== null && (
        <DayPicker id={id} listed={listed} today={current.data} startTime={answer?.data.startTime} onChange={(day) => navigate(`/leaderboard/${day}`)} />
      )}
      <IndexerLag answer={answer} error={board.cause} />

      {requested === null ? (
        <div role="alert">Not a tournament</div>
      ) : !answer && board.error ? (
        <IndexerFailure error={board.cause} onRetry={board.refresh} />
      ) : id === null && !waitingForToday && !days.data && days.error ? (
        <IndexerFailure error={days.cause} onRetry={days.refresh} />
      ) : id === null && !waitingForToday && days.data ? (
        <div role="status">No tournament yet</div>
      ) : !answer ? (
        <div role="status">{board.loading || waitingForToday || days.loading || id === null ? "Loading leaderboard…" : "No tournament yet"}</div>
      ) : total === 0 ? (
        <div role="status">No finished games on this day yet.</div>
      ) : (
        <>
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 14 }}>
            <thead>
              <tr style={{ color: "#999" }}>
                <th style={cell}>Rank</th>
                <th style={cell}>Player</th>
                <th style={cell}>Best score</th>
                <th style={cell}>Games</th>
                <th style={cell}>Prize slots</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <Row key={r.playerId} entry={r} mine={r.playerId === myId} />
              ))}
            </tbody>
          </table>
          <div style={{ display: "flex", gap: 12, alignItems: "center", fontSize: 13 }}>
            <button type="button" style={button} disabled={offset === 0} onClick={() => id !== null && setPaging({ id, offset: Math.max(0, offset - BOARD_PAGE) })}>
              Previous
            </button>
            <span>{`${offset + 1}–${offset + rows.length} of ${total}`}</span>
            <button
              type="button"
              style={button}
              disabled={answer.data.nextOffset === null}
              onClick={() => id !== null && answer.data.nextOffset !== null && setPaging({ id, offset: answer.data.nextOffset })}
            >
              Next
            </button>
          </div>
          <p style={{ color: "#999", fontSize: 12, margin: 0 }}>
            Ranked by player. The contract ranks games, so one player can hold several prize slots. Prizes and claims are read from the contract, on the home page.
          </p>
        </>
      )}
    </div>
  );
}

function Row({ entry, mine }: { entry: LeaderboardEntry; mine: boolean }) {
  const slots = slotsLabel(entry.prizeRanks);
  return (
    <tr style={{ background: mine ? "rgba(245,158,11,0.15)" : undefined }}>
      <td style={cell}>{entry.rank}</td>
      <td style={cell}>
        <Link to={`/player/${entry.playerId}`} style={{ color: "#f5f5f5" }}>{playerLabel(entry.name, entry.playerId)}</Link>
        {mine ? " (you)" : ""}
      </td>
      <td style={cell}>{entry.bestScore}</td>
      <td style={cell}>{entry.gamesPlayed}</td>
      <td style={cell}>
        {slots ? `${slots}${entry.prizeRanks.length > 1 ? ` (${entry.prizeRanks.length} slots)` : ""}` : "–"}
      </td>
    </tr>
  );
}
