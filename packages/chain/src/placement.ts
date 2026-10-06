import type { DecodedEvent } from "./codec";

/** What a `build` or `discard` receipt says, read from its events without re-reading the board. */
export interface PlacementOutcome {
  built: { tileId: number; plan: number; orientation: number; x: number; y: number; role: number; spot: number } | null;
  discarded: { tileId: number; plan: number; points: number } | null;
  scored: Array<{ category: number; size: number; points: number }>;
  /** Sum of the `Scored` points of this transaction. */
  scoredPoints: number;
  over: { score: number; tournamentId: number; endTime: number } | null;
}

/** Reads the `Built`, `Discarded`, `Scored` and `GameOver` events of one game from a receipt. */
export function placementOutcome(events: DecodedEvent[], gameId: number): PlacementOutcome {
  const outcome: PlacementOutcome = { built: null, discarded: null, scored: [], scoredPoints: 0, over: null };
  for (const { name, fields: f } of events) {
    if (Number(f.gameId) !== gameId) continue;
    if (name === "Built") {
      outcome.built = {
        tileId: Number(f.tileId),
        plan: Number(f.plan),
        orientation: Number(f.orientation),
        x: Number(f.x),
        y: Number(f.y),
        role: Number(f.role),
        spot: Number(f.spot),
      };
    } else if (name === "Discarded") {
      outcome.discarded = { tileId: Number(f.tileId), plan: Number(f.plan), points: Number(f.points) };
    } else if (name === "Scored") {
      const score = { category: Number(f.category), size: Number(f.size), points: Number(f.points) };
      outcome.scored.push(score);
      outcome.scoredPoints += score.points;
    } else if (name === "GameOver") {
      outcome.over = { score: Number(f.score), tournamentId: Number(f.tournamentId), endTime: Number(f.endTime) };
    }
  }
  return outcome;
}
