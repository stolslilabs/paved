import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { IndexerError, indexerPlayerId, tokenIdOf, useIndexer, useIndexerRead } from "@paved/chain";
import type { IndexedGame } from "@paved/chain";
import { DayPicker } from "../components/DayPicker";
import { IndexerFailure, IndexerLag } from "../components/IndexerLag";
import { GameNft, useCollection, type Collection } from "../components/GameNft";
import { ProgressSections } from "../components/Progress";
import { useDays } from "../utils/use-days";
import { GAMES_PAGE, PLAYER_TOURNAMENTS_SHOWN, dayLabel, playerLabel, slotsLabel } from "../utils/indexer-view";

const page = { minHeight: "100%", background: "#0a0a0a", color: "#f5f5f5", padding: 24, display: "flex", flexDirection: "column", gap: 12, maxWidth: 960, margin: "0 auto", boxSizing: "border-box" } as const;
const cell = { padding: "6px 10px", textAlign: "left" } as const;
const button = { border: "1px solid rgba(255,255,255,0.25)", background: "rgba(255,255,255,0.08)", color: "#fff", borderRadius: 8, padding: "6px 12px", cursor: "pointer" } as const;

/** A player's page from the indexer: their stats, their games, and their rank on the days they played. */
export function PlayerPage() {
  const params = useParams();
  const indexer = useIndexer();
  const id = (() => {
    try {
      return indexerPlayerId(params.playerId ?? "");
    } catch {
      return null;
    }
  })();
  const profile = useIndexerRead(id ? (c) => c.player(id) : null, [id], { onVisible: true });
  const games = useIndexerRead(id ? (c) => c.playerGames(id, { limit: GAMES_PAGE }) : null, [id], { onVisible: true });
  const [more, setMore] = useState<string[]>([]);
  const collection = useCollection(id !== null);

  const back = <Link to="/leaderboard" style={{ color: "#f59e0b" }}>Leaderboard</Link>;
  if (!indexer) {
    return (
      <div style={page}>
        {back}
        <h1 style={{ margin: 0 }}>Player</h1>
        <IndexerFailure error={null} />
      </div>
    );
  }
  if (!id) {
    return (
      <div style={page}>
        {back}
        <div role="alert">Not a player id</div>
      </div>
    );
  }

  const player = profile.data?.data.player ?? null;
  const stats = profile.data?.data.stats ?? null;
  const first = games.data?.data.games ?? [];
  const tournamentIds = [...new Set(first.map((g) => g.countedTournamentId).filter((t) => t > 0))].slice(0, PLAYER_TOURNAMENTS_SHOWN);

  return (
    <div style={page}>
      {back}
      <h1 style={{ margin: 0 }}>{playerLabel(player?.name ?? null, id)}</h1>
      <div style={{ color: "#999", fontSize: 12, wordBreak: "break-all" }}>{id}</div>
      <IndexerLag answer={profile.data} error={profile.cause} />

      {!profile.data && profile.error ? (
        <IndexerFailure error={profile.cause} onRetry={profile.refresh} />
      ) : !profile.data ? (
        <div role="status">Loading player…</div>
      ) : !player ? (
        <div role="status">The indexer has no record of this player.</div>
      ) : (
        stats && (
          <dl style={{ display: "grid", gridTemplateColumns: "max-content 1fr", gap: "4px 16px", margin: 0, fontSize: 14 }}>
            <dt style={{ color: "#999" }}>Best score</dt>
            <dd style={{ margin: 0 }}>{stats.bestScore}</dd>
            <dt style={{ color: "#999" }}>Daily games</dt>
            <dd style={{ margin: 0 }}>{`${stats.dailyGames} (${stats.dailyFinished} finished)`}</dd>
            <dt style={{ color: "#999" }}>Tutorial games</dt>
            <dd style={{ margin: 0 }}>{stats.tutorialGames}</dd>
          </dl>
        )
      )}

      <PlayerProgress playerId={id} />

      <h2 style={{ margin: "12px 0 0" }}>Tournaments</h2>
      <div style={{ color: "#999", fontSize: 12 }}>{`Among the last ${GAMES_PAGE} games.`}</div>
      {!games.data ? (
        games.error ? <IndexerFailure error={games.cause} onRetry={games.refresh} /> : <div role="status">Loading…</div>
      ) : tournamentIds.length === 0 ? (
        <div role="status">No tournament played yet.</div>
      ) : (
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 14 }}>
          <thead>
            <tr style={{ color: "#999" }}>
              <th style={cell}>Day</th>
              <th style={cell}>Rank</th>
              <th style={cell}>Best score</th>
              <th style={cell}>Games</th>
              <th style={cell}>Prize slots</th>
            </tr>
          </thead>
          <tbody>
            {tournamentIds.map((t) => (
              <TournamentRow key={t} playerId={id} tournamentId={t} />
            ))}
          </tbody>
        </table>
      )}

      <h2 style={{ margin: "12px 0 0" }}>Games</h2>
      {games.data && <GamesTable games={first} collection={collection} />}
      {games.data && first.length === 0 && <div role="status">No games yet.</div>}
      {more.map((before, i) => (
        <MoreGames key={before} playerId={id} collection={collection} before={before} last={i === more.length - 1} onMore={(next) => setMore((m) => [...m, next])} />
      ))}
      {more.length === 0 && games.data?.data.next && (
        <button type="button" style={button} onClick={() => setMore([games.data!.data.next!])}>
          Show more games
        </button>
      )}
      {games.data && games.cause !== null && <IndexerFailure error={games.cause} onRetry={games.refresh} />}
      <p style={{ color: "#999", fontSize: 12, margin: 0 }}>
        From the indexer, for display. Prize slots are the contract's top 3 replayed; prizes and claims are read from the contract, on the home page.
      </p>
    </div>
  );
}

/** The token id a row carries, if it has one: an older indexer or a game before the Collection shows no NFT. */
function rowToken(game: IndexedGame): bigint | null {
  if (game.tokenId === undefined || game.tokenId === null) return null;
  try {
    return tokenIdOf(game.tokenId);
  } catch {
    return null;
  }
}

function GamesTable({ games, collection }: { games: IndexedGame[]; collection: Collection }) {
  if (games.length === 0) return null;
  const nft = collection.address !== null;
  return (
    <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 14 }}>
      <thead>
        <tr style={{ color: "#999" }}>
          <th style={cell}>Mode</th>
          <th style={cell}>Game</th>
          <th style={cell}>Started</th>
          <th style={cell}>Score</th>
          <th style={cell}>Day</th>
          {nft && <th style={cell}>NFT</th>}
        </tr>
      </thead>
      <tbody>
        {games.map((g) => (
          <tr key={`${g.contract}:${g.gameId}`}>
            <td style={cell}>{g.contract === "daily" ? "Daily" : "Tutorial"}</td>
            <td style={cell}>{`#${g.gameId}`}</td>
            <td style={cell}>{dayLabel(g.startTime)}</td>
            <td style={cell}>{g.over ? g.score : "In progress"}</td>
            <td style={cell}>
              {g.countedTournamentId > 0 ? <Link to={`/leaderboard/${g.countedTournamentId}`} style={{ color: "#f5f5f5" }}>{g.countedTournamentId}</Link> : "–"}
            </td>
            {nft && (
              <td style={cell}>
                <GameNft tokenId={rowToken(g)} collection={collection} />
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function MoreGames({ playerId, before, last, collection, onMore }: { playerId: string; before: string; last: boolean; collection: Collection; onMore: (next: string) => void }) {
  const chunk = useIndexerRead((c) => c.playerGames(playerId, { limit: GAMES_PAGE, before }), [playerId, before]);
  if (!chunk.data) return chunk.error ? <IndexerFailure error={chunk.cause} onRetry={chunk.refresh} /> : <div role="status">Loading…</div>;
  const next = chunk.data.data.next;
  return (
    <>
      <GamesTable games={chunk.data.data.games} collection={collection} />
      {last && next && (
        <button type="button" style={button} onClick={() => onMore(next)}>
          Show more games
        </button>
      )}
    </>
  );
}

function TournamentRow({ playerId, tournamentId }: { playerId: string; tournamentId: number }) {
  const entry = useIndexerRead((c) => c.playerTournament(playerId, tournamentId), [playerId, tournamentId]);
  const row = entry.data?.data ?? null;
  const slots = row ? slotsLabel(row.prizeRanks) : null;
  const text = (v: string | number) => (entry.data ? v : entry.error ? "?" : "…");
  return (
    <tr>
      <td style={cell}>
        <Link to={`/leaderboard/${tournamentId}`} style={{ color: "#f5f5f5" }}>{`Day ${tournamentId}`}</Link>
      </td>
      <td style={cell}>{text(row ? row.rank : "–")}</td>
      <td style={cell}>{text(row ? row.bestScore : "–")}</td>
      <td style={cell}>{text(row ? row.gamesPlayed : "–")}</td>
      <td style={cell}>
        {text(row ? (slots ? `${slots}${row.prizeRanks.length > 1 ? ` (${row.prizeRanks.length} slots)` : ""}` : "–") : "–")}
        {entry.error && !entry.data && entry.cause instanceof IndexerError ? ` (${entry.cause.kind})` : ""}
      </td>
    </tr>
  );
}

/** The player's quests of a day (today's first, the leaderboard's day picker) and their achievements. */
function PlayerProgress({ playerId }: { playerId: string }) {
  const [day, setDay] = useState<number | undefined>(undefined);
  const { current, waitingForToday, id, listed } = useDays(day);
  return (
    <>
      {id !== null && <DayPicker id={id} listed={listed} today={current.data} onChange={setDay} />}
      <ProgressSections playerId={playerId} day={id} waiting={waitingForToday} />
    </>
  );
}
