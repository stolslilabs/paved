import { CENTER, CategoryType, MASTERPIECE_DAYS, Masterpiece, OrientationType, PlanType, masterpieceCards, pageStateOf, type BoardTile, type ClosedTileAreas, type MasterpieceEntry, type MasterpieceProspect, type PlaceMove, type ScoredStructure } from "@paved/game-core";
import type { MasterpieceBoardRecord, MasterpieceShown } from "./masterpiece-source";

// A Masterpiece board on the page (the weekly individual event): its engine on the device (game-core's `Masterpiece`, the record's
// log played again), each move applied at once and sent to the source in order, as a Puzzle game's (`PuzzleGame`). One tile in hand at
// a time, the next of the board's order while the day has tiles waiting: the page gives the day (`setDay`).

const ORIENTATIONS = Object.values(OrientationType);
const CATEGORIES = Object.values(CategoryType);
const PLANS = Object.values(PlanType);

/** What the page reads of a board; a new object after each move or day. */
export interface MasterpieceSnapshot {
  tiles: BoardTile[];
  closed: ClosedTileAreas[][];
  discardedPlans: number[];
  /** The masterpiece's points less the discards'. */
  score: number;
  /** Points the last move moved the score by (a new masterpiece adds, a discard takes 50); null before the first move of this page. */
  delta: number | null;
  lastScored: ScoredStructure[];
  /** The masterpiece so far, and whether the last move made it. */
  piece: MasterpieceShown | null;
  improved: boolean;
  /** The open structure of the kind worth the most if it closed now. */
  prospect: MasterpieceProspect | null;
  /** The tile in hand, its plan's chain id; null while no tile waits. */
  hand: number | null;
  waiting: number;
  toCome: number;
  played: number;
  discards: number;
  /** Why the engine refused the last move; null otherwise. */
  writeError: string | null;
  /** Moves applied on the board, not yet taken by the source. */
  sending: number;
  /** Why the source refused a move: the board then reads the game again from the source. */
  refused: string | null;
}

function toPlacement(move: PlaceMove) {
  const orientation = ORIENTATIONS[move.orientation];
  if (!orientation || orientation === OrientationType.None) return null;
  return { orientation, x: move.x - CENTER, y: move.y - CENTER };
}

type Rest = Pick<MasterpieceSnapshot, "delta" | "lastScored" | "improved" | "writeError" | "sending" | "refused">;

export class MasterpieceGame {
  private readonly listeners = new Set<() => void>();
  private current: MasterpieceSnapshot;
  private queue: Promise<void> = Promise.resolve();

  private constructor(
    readonly record: MasterpieceBoardRecord,
    private readonly engine: Masterpiece,
    private day: number,
    private readonly send: ((move: MasterpieceEntry) => Promise<void>) | null,
  ) {
    this.current = this.project({ delta: null, lastScored: [], improved: false, writeError: null, sending: 0, refused: null });
  }

  /** The board of `record` on `day`, its log played again; `send` takes each new move to the source. Without it the board is only shown. */
  static open(record: MasterpieceBoardRecord, day: number, send: ((move: MasterpieceEntry) => Promise<void>) | null): MasterpieceGame {
    return new MasterpieceGame(record, Masterpiece.replay(record.week, BigInt(record.seed), record.log), day, send);
  }

  get writable(): boolean {
    return this.send !== null;
  }

  /** Settles once every move applied so far has been sent (taken or refused). */
  idle(): Promise<void> {
    return this.queue;
  }

  get snapshot(): MasterpieceSnapshot {
    return this.current;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** The day of the week the page is on (0 Monday to 6 Sunday; 7 and more: the week is over, nothing waits): a new day opens its twelve tiles. */
  setDay(day: number): void {
    if (day === this.day) return;
    this.day = day;
    this.set(this.project(this.current));
  }

  /** The cards the days opened so far brought, in day order: the deck sheet's. */
  cards(): PlanType[] {
    return Array.from({ length: Math.min(this.day, 6) + 1 }, (_, day) => masterpieceCards(this.record.week, day)).flat();
  }

  private playing(): boolean {
    return !this.current.refused && this.writable && this.current.hand !== null;
  }

  /** Every legal slot of the tile in hand at `orientation` (1 North to 4 West), in the chain's coordinates. */
  slots(orientation: number): { x: number; y: number }[] {
    if (!this.playing()) return [];
    const wanted = ORIENTATIONS[orientation];
    return this.engine
      .legalPlacements()
      .filter((p) => p.orientation === wanted)
      .map((p) => ({ x: CENTER + p.x, y: CENTER + p.y }));
  }

  /** The orientations (1 North to 4 West) the tile in hand may take at `slot`; none when it cannot go there. */
  orientationsAt(slot: { x: number; y: number }): number[] {
    if (!this.playing()) return [];
    return [1, 2, 3, 4].filter((o) => this.engine.refusal(toPlacement({ orientation: o, ...slot })!) === null);
  }

  /** The points laying the tile in hand as `move` would move the score by (zero unless it makes the masterpiece); null when the move is not legal. */
  preview(move: PlaceMove): number | null {
    const placement = toPlacement(move);
    if (!this.playing() || !placement || this.engine.refusal(placement) !== null) return null;
    return this.engine.clone().build(placement).points;
  }

  /** Lays the tile in hand. */
  place(move: PlaceMove): boolean {
    return this.run({ k: "build", o: move.orientation, x: move.x - CENTER, y: move.y - CENTER });
  }

  /** Discards the tile in hand. */
  discard(): boolean {
    return this.run({ k: "discard" });
  }

  /** Applies `move` on the board at once (an illegal one refused, nothing moved), then sends it after the moves before it. */
  private run(move: MasterpieceEntry): boolean {
    const send = this.send;
    if (!send || !this.playing()) return false;
    let outcome;
    try {
      outcome = this.engine.apply(move);
    } catch (error) {
      this.set({ ...this.current, writeError: error instanceof Error ? error.message : String(error) });
      return false;
    }
    this.set(
      this.project({
        delta: outcome.points,
        lastScored: outcome.scored.map((s) => ({ category: CATEGORIES.indexOf(s.category), size: s.size, points: s.points })),
        improved: outcome.improved,
        writeError: null,
        sending: this.current.sending + 1,
        refused: null,
      }),
    );
    this.queue = this.queue.then(async () => {
      if (this.current.refused) return;
      try {
        await send(move);
        this.set({ ...this.current, sending: this.current.sending - 1 });
      } catch (error) {
        this.set({ ...this.current, sending: 0, refused: error instanceof Error ? error.message : String(error) });
      }
    });
    return true;
  }

  private project(rest: Rest): MasterpieceSnapshot {
    const page = pageStateOf(this.engine.rules);
    const piece = this.engine.piece();
    // The week over (`MASTERPIECE_DAYS` and more): the board is frozen, the tiles not played are lost.
    const over = this.day >= MASTERPIECE_DAYS;
    const waiting = over ? 0 : this.engine.waiting(this.day);
    const next = this.engine.next;
    return {
      delta: rest.delta,
      lastScored: rest.lastScored,
      improved: rest.improved,
      writeError: rest.writeError,
      sending: rest.sending,
      refused: rest.refused,
      tiles: page.tiles,
      closed: page.closed ?? [],
      discardedPlans: page.discardedPlans ?? [],
      score: this.engine.score,
      piece: piece && { kind: piece.kind, size: piece.size, points: piece.points },
      prospect: this.engine.prospect(),
      hand: waiting > 0 && next ? PLANS.indexOf(next) : null,
      waiting,
      toCome: over ? 0 : this.engine.toCome(this.day),
      played: this.engine.played,
      discards: this.engine.discards,
    };
  }

  private set(snapshot: MasterpieceSnapshot): void {
    this.current = snapshot;
    for (const listener of this.listeners) listener();
  }
}
