import {
  CENTER,
  CategoryType,
  Expedition,
  OrientationType,
  PlanType,
  expeditionBag,
  pageStateOf,
  type BoardTile,
  type ClosedTileAreas,
  type ExpeditionObjective,
  type ExpeditionProgress,
  type PlaceMove,
  type ScoredStructure,
} from "@paved/game-core";
import type { ExpeditionBoardRecord, ExpeditionPlay } from "./expedition-source";

// An Expedition board on the page (the weekly individual event): its engine on the device (game-core's `Expedition`, the record's log
// played again), each move applied at once and sent to the source in order, as a Puzzle game's (`PuzzleGame`). The hand is the whole
// hand: the player picks one of its tiles (`select`), and the board places that one as it places a game's tile in hand.

const ORIENTATIONS = Object.values(OrientationType);
const CATEGORIES = Object.values(CategoryType);
const PLANS = Object.values(PlanType);

/** A tile of the hand as the page shows it: its card (its name in a move) and its plan's chain id. */
export interface HandTile {
  card: number;
  plan: number;
}

/** What the page reads of a board; a new object after each move or pick. */
export interface ExpeditionSnapshot {
  tiles: BoardTile[];
  closed: ClosedTileAreas[][];
  discardedPlans: number[];
  score: number;
  /** What a discard takes now (the engine's `discardCost`: 50, at most the total score). */
  discardCost: number;
  /** Points the last move added (a discard takes some: negative); null before the first move of this page. */
  delta: number | null;
  lastScored: ScoredStructure[];
  /** The objectives the last move completed. */
  completed: readonly ExpeditionObjective[];
  hand: HandTile[];
  /** The card picked in the hand: the tile the board places; null with an empty hand. */
  selected: number | null;
  toCome: number;
  objectives: ExpeditionProgress[];
  /** The last day drawn, 0 Monday to 6 Sunday. */
  lastDay: number;
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

export class ExpeditionGame {
  private readonly listeners = new Set<() => void>();
  private current: ExpeditionSnapshot;
  private queue: Promise<void> = Promise.resolve();
  /** The week's bag: the deck sheet's cards. */
  readonly bag: PlanType[];

  private constructor(
    readonly record: ExpeditionBoardRecord,
    private readonly engine: Expedition,
    private readonly send: ((move: ExpeditionPlay) => Promise<void>) | null,
  ) {
    this.bag = expeditionBag(record.week);
    this.current = this.project({ delta: null, lastScored: [], completed: [], selected: null, writeError: null, sending: 0, refused: null });
  }

  /** The board of `record`, its log played again; `send` takes each new move to the source. Without it the board is only shown. */
  static open(record: ExpeditionBoardRecord, send: ((move: ExpeditionPlay) => Promise<void>) | null): ExpeditionGame {
    return new ExpeditionGame(record, Expedition.replay(record.week, BigInt(record.seed), record.log), send);
  }

  get writable(): boolean {
    return this.send !== null;
  }

  /** Settles once every move applied so far has been sent (taken or refused). */
  idle(): Promise<void> {
    return this.queue;
  }

  get snapshot(): ExpeditionSnapshot {
    return this.current;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Picks the tile of the hand the board places. */
  select(card: number): void {
    if (card === this.current.selected || !this.engine.hand.some((c) => c.card === card)) return;
    this.set({ ...this.current, selected: card, writeError: null });
  }

  private picked() {
    const playing = !this.current.refused && this.writable;
    return playing ? (this.engine.hand.find((c) => c.card === this.current.selected) ?? null) : null;
  }

  /** Every legal slot of the picked tile at `orientation` (1 North to 4 West), in the chain's coordinates. */
  slots(orientation: number): { x: number; y: number }[] {
    const tile = this.picked();
    if (!tile) return [];
    const wanted = ORIENTATIONS[orientation];
    return this.engine
      .legalPlacements(tile.plan)
      .filter((p) => p.orientation === wanted)
      .map((p) => ({ x: CENTER + p.x, y: CENTER + p.y }));
  }

  /** The orientations (1 North to 4 West) the picked tile may take at `slot`; none when it cannot go there. */
  orientationsAt(slot: { x: number; y: number }): number[] {
    const tile = this.picked();
    if (!tile) return [];
    return [1, 2, 3, 4].filter((o) => this.engine.refusal(tile.plan, toPlacement({ orientation: o, ...slot })!) === null);
  }

  /** The points laying the picked tile as `move` would add, a landmark's bonus included; null when the move is not legal. */
  preview(move: PlaceMove): number | null {
    const tile = this.picked();
    const placement = toPlacement(move);
    if (!tile || !placement || this.engine.refusal(tile.plan, placement) !== null) return null;
    return this.engine.clone().build(tile.card, placement).points;
  }

  /** Lays the picked tile. */
  place(move: PlaceMove): boolean {
    const tile = this.picked();
    return tile !== null && this.run({ k: "build", card: tile.card, o: move.orientation, x: move.x - CENTER, y: move.y - CENTER });
  }

  /** Discards the picked tile. */
  discard(): boolean {
    const tile = this.picked();
    return tile !== null && this.run({ k: "discard", card: tile.card });
  }

  /** Applies `move` on the board at once (an illegal one refused, nothing moved), then sends it after the moves before it. */
  private run(move: ExpeditionPlay): boolean {
    const send = this.send;
    if (!send || this.current.refused) return false;
    let outcome;
    try {
      outcome = this.engine.apply(move)!;
    } catch (error) {
      this.set({ ...this.current, writeError: error instanceof Error ? error.message : String(error) });
      return false;
    }
    this.set(
      this.project({
        delta: outcome.points,
        lastScored: outcome.scored.map((s) => ({ category: CATEGORIES.indexOf(s.category), size: s.size, points: s.points })),
        completed: outcome.objectives,
        selected: null,
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

  private project(rest: Pick<ExpeditionSnapshot, "delta" | "lastScored" | "completed" | "selected" | "writeError" | "sending" | "refused">): ExpeditionSnapshot {
    const page = pageStateOf(this.engine.rules);
    const hand = this.engine.hand.map((c) => ({ card: c.card, plan: PLANS.indexOf(c.plan) }));
    return {
      ...rest,
      tiles: page.tiles,
      closed: page.closed ?? [],
      discardedPlans: page.discardedPlans ?? [],
      score: this.engine.score,
      discardCost: this.engine.discardCost,
      hand,
      // The pick stays while its tile is in hand; else the hand's first.
      selected: hand.some((c) => c.card === rest.selected) ? rest.selected : (hand[0]?.card ?? null),
      toCome: this.engine.toCome,
      objectives: this.engine.objectives(),
      lastDay: this.engine.lastDay,
    };
  }

  private set(snapshot: ExpeditionSnapshot): void {
    this.current = snapshot;
    for (const listener of this.listeners) listener();
  }
}
