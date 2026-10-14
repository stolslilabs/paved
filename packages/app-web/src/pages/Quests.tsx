import { Link, useNavigate, useParams } from "react-router-dom";
import { MAX_TOURNAMENT_ID, useIndexer } from "@paved/chain";
import { DayPicker } from "../components/DayPicker";
import { IndexerFailure } from "../components/IndexerLag";
import { ProgressSections } from "../components/Progress";
import { useMe } from "../utils/player-label";
import { useDays } from "../utils/use-days";

const page = { minHeight: "100%", background: "#0a0a0a", color: "#f5f5f5", padding: 24, display: "flex", flexDirection: "column", gap: 12, maxWidth: 960, margin: "0 auto", boxSizing: "border-box" } as const;

/** A day from the route; null when it is not a plain decimal or is above what the API serves. */
function routeDay(text: string | undefined): number | null {
  return text !== undefined && /^\d+$/.test(text) && Number(text) <= MAX_TOURNAMENT_ID ? Number(text) : null;
}

/**
 * The connected player's quests of one day (today's by default), their achievements, and the list of what counts, from
 * the indexer. Display only: the indexer counts the chain's reports, and nothing is granted for them.
 */
export function QuestsPage() {
  const params = useParams();
  const navigate = useNavigate();
  const indexer = useIndexer();
  // D-25 (E): the connected wallet is the player, with no registration to read first.
  const myId = useMe().id;

  const requested = params.day === undefined ? undefined : routeDay(params.day);
  const { current, waitingForToday, id, listed } = useDays(requested);

  if (!indexer) {
    return (
      <div style={page}>
        <Link to="/" style={{ color: "#f59e0b" }}>Back</Link>
        <h1 style={{ margin: 0 }}>Quests</h1>
        <IndexerFailure error={null} subject="Quests" />
      </div>
    );
  }

  return (
    <div style={page}>
      <Link to="/" style={{ color: "#f59e0b" }}>Back</Link>
      <h1 style={{ margin: 0 }}>Quests</h1>
      {id !== null && <DayPicker id={id} listed={listed} today={current.data} onChange={(day) => navigate(`/quests/${day}`)} />}
      {requested === null && <div role="alert">Not a day</div>}
      {myId === null && <div role="status">Connect an account to see your quests and achievements.</div>}
      <ProgressSections playerId={myId} day={requested === null ? null : id} waiting={waitingForToday} definitions label="Your quests" />
      <p style={{ color: "#999", fontSize: 12, margin: 0 }}>
        Counted by the indexer from the games the chain reports. Daily quests start over at 00:00 UTC. Achievement points are for display.
      </p>
    </div>
  );
}
