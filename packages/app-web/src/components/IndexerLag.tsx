import type { IndexerAnswer } from "@paved/chain";
import { describeIndexerError, isLate, lagLabel } from "../utils/indexer-view";

const base = { fontSize: 13, padding: "6px 10px", borderRadius: 6 } as const;

/**
 * How current the rows are: the lag as the indexer reports it, in the warning colour once it is above
 * the client's `maxLag`. After a failed refresh the rows stay, marked stale next to the reason.
 */
export function IndexerLag({ answer, error, subject, lateNote = "scores may be late", testId = "lag" }: { answer: IndexerAnswer<unknown> | null; error: unknown; subject?: string; lateNote?: string; testId?: string }) {
  return (
    <>
      {answer && (
        <div role="status" data-testid={testId} style={{ ...base, background: isLate(answer.freshness) ? "#78350f" : "rgba(255,255,255,0.08)", color: "#f5f5f5" }}>
          {lagLabel(answer.behind)}
          {isLate(answer.freshness) ? `: ${lateNote}` : ""}
          {` (block ${answer.head.number})`}
        </div>
      )}
      {error !== null && answer && (
        <div role="alert" data-testid={testId === "lag" ? "stale" : `${testId}-stale`} style={{ ...base, background: "#7f1d1d", color: "#fff" }}>
          {`Stale: ${describeIndexerError(error, subject)}. Showing the last answer.`}
        </div>
      )}
    </>
  );
}

/** The whole screen's failure: nothing was ever read. */
export function IndexerFailure({ error, onRetry, subject }: { error: unknown; onRetry?: () => void; subject?: string }) {
  return (
    <div role="alert" style={{ ...base, background: "#7f1d1d", color: "#fff", display: "flex", gap: 12, alignItems: "center" }}>
      <span>{describeIndexerError(error, subject)}</span>
      {onRetry && (
        <button type="button" onClick={onRetry} style={{ background: "transparent", border: "1px solid #fff", color: "#fff", borderRadius: 6, cursor: "pointer" }}>
          Retry
        </button>
      )}
    </div>
  );
}
