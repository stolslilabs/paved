// A Story run: one level played on the engine (deck `story`: the level's fixed draw order, no withdrawal, no reseed),
// in the shape the game page renders (`PageState`). Nothing reaches a chain. The moves are kept in the shape of the
// end-of-run submission (`StorySubmission`); a finished run is recorded in the progress by the page.

import { CENTER, EngineGame, type Placement } from "../engine";
import type { ClosedStructure, Scored } from "../engine";
import { closedOf } from "../sessions/closed";
import type { BoardTile, PageState, PlaceMove, ScoredStructure } from "../sessions/types";
import { CategoryType } from "../types/category";
import { OrientationType } from "../types/orientation";
import { PlanType } from "../types/plan";
import type { StoryCampaign, StoryLevel } from "./plan";
import type { StoryMoveInput, StorySubmission } from "./progress";

const PLANS = Object.values(PlanType);
const ORIENTATIONS = Object.values(OrientationType);
const CATEGORIES = Object.values(CategoryType);

/** The player of a Story run: the engine's default, no account behind it. */
const PLAYER = "0x1";

/** The tiles a run shows after the one in hand (#701): the next two of the level's order, as Training and the VRF Challenge (#645). */
const COMING = 2;

function scoredOf(scored: readonly Scored[]): ScoredStructure[] {
  return scored.map((s) => ({ category: CATEGORIES.indexOf(s.category), size: s.size, points: s.points }));
}

function toPlacement(move: PlaceMove): Placement | null {
  const orientation = ORIENTATIONS[move.orientation];
  if (!orientation || orientation === OrientationType.None) return null;
  return { orientation, x: move.x - CENTER, y: move.y - CENTER };
}

/** A new engine game of `level`, before its first move. */
export function startLevel(level: Pick<StoryLevel, "deck" | "placed">): EngineGame {
  return EngineGame.start({ deck: "story", seed: 0n, sequence: level.deck, placed: level.placed });
}

/** What a run reads after each move; a new object each time. */
export interface StorySnapshot {
  readonly state: PageState;
  /** Points the last move added (a discard takes some: negative); null before the first move. */
  readonly delta: number | null;
  /** Every structure the run closed, in move order. */
  readonly closings: readonly ClosedStructure[];
  /** The moves played, in the submission's shape. */
  readonly moves: readonly StoryMoveInput[];
}

export class StoryRun {
  private game: EngineGame;
  private moves: StoryMoveInput[] = [];
  private current: StorySnapshot;
  private readonly listeners = new Set<() => void>();

  constructor(
    readonly campaign: Pick<StoryCampaign, "id">,
    readonly level: StoryLevel,
  ) {
    this.game = startLevel(level);
    this.current = this.project([], null, null);
  }

  get snapshot(): StorySnapshot {
    return this.current;
  }

  get over(): boolean {
    return this.game.over;
  }

  get score(): number {
    return this.game.score;
  }

  /** The engine as it stands (read only: a move goes through `place` or `discard`). */
  get engine(): EngineGame {
    return this.game;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** The run as `submit_run` will take it. */
  submission(): StorySubmission {
    return { campaignId: this.campaign.id, levelIndex: this.level.id, moves: [...this.moves] };
  }

  /** Every legal slot of the tile in hand at `orientation` (1 North to 4 West), in the chain's coordinates. */
  slots(orientation: number): { x: number; y: number }[] {
    if (this.game.over) return [];
    const wanted = ORIENTATIONS[orientation];
    return this.game
      .legalPlacements()
      .filter((p) => p.orientation === wanted)
      .map((p) => ({ x: CENTER + p.x, y: CENTER + p.y }));
  }

  /** The orientations (1 North to 4 West) the tile in hand may take at `slot` (the chain's coordinates). */
  orientationsAt(slot: { x: number; y: number }): number[] {
    if (this.game.over) return [];
    return [1, 2, 3, 4].filter((o) => this.game.canPlace(toPlacement({ orientation: o, ...slot }) as Placement));
  }

  /** The points placing the tile in hand as `move` would add; null when the move is not legal. */
  preview(move: PlaceMove): number | null {
    const placement = toPlacement(move);
    if (!placement || this.game.over || !this.game.canPlace(placement)) return null;
    return this.game.clone().build(placement).points;
  }

  /** Places the tile in hand; `move` in the chain's coordinates. False (and the reason in `writeError`) when refused. */
  place(move: PlaceMove): boolean {
    const placement = toPlacement(move);
    return this.play({ discard: false, orientation: move.orientation, x: move.x, y: move.y }, () => {
      if (!placement) throw new Error("Orientation: not valid");
      return this.game.build(placement);
    });
  }

  discard(): boolean {
    return this.play({ discard: true, orientation: 0, x: 0, y: 0 }, () => this.game.discard());
  }

  /** The level from its first tile again. */
  restart(): void {
    this.game = startLevel(this.level);
    this.moves = [];
    this.set(this.project([], null, null));
  }

  private play(input: StoryMoveInput, apply: () => ReturnType<EngineGame["build"]>): boolean {
    if (this.game.over) return false;
    const before = this.game.score;
    try {
      const result = apply();
      this.moves.push(input);
      this.set(this.project(scoredOf(result.scored), null, this.game.score - before));
      return true;
    } catch (error) {
      this.set({ ...this.current, state: { ...this.current.state, writeError: error instanceof Error ? error.message : String(error) } });
      return false;
    }
  }

  private project(lastScored: ScoredStructure[], writeError: string | null, delta: number | null): StorySnapshot {
    const g = this.game;
    const hand = g.over ? null : g.hand;
    const tiles: BoardTile[] = g.placed().map((t) => ({
      id: t.id,
      plan: PLANS.indexOf(t.plan),
      orientation: ORIENTATIONS.indexOf(t.orientation),
      x: CENTER + t.x,
      y: CENTER + t.y,
    }));
    // The level's order is fixed, so the tiles after the hand are known (the deck sheet shows them all, #613): the hand is the
    // order's tile at the count of moves played, as `deckSheetOrder` counts it.
    const after = this.moves.length + 1;
    const coming = hand ? this.level.deck.slice(after, after + COMING).map((plan, i) => ({ tileId: hand.id + 1 + i, plan: PLANS.indexOf(plan) })) : [];
    const state: PageState = {
      key: { gameId: 0 },
      status: "ready",
      error: null,
      message: null,
      game: {
        playerId: PLAYER,
        score: g.score,
        over: g.over,
        placedCount: g.built + 1,
        deckSize: g.tileLimit,
        discardedCount: g.discarded,
      },
      tiles,
      discardedPlans: [...g.discardedPlans],
      hand: hand ? { tileId: hand.id, plan: PLANS.indexOf(hand.plan) } : null,
      coming,
      lastScored,
      closed: closedOf(g.closings()),
      readonly: false,
      pending: false,
      writeError,
      readError: null,
    };
    return { state, delta, closings: [...g.closings()], moves: [...this.moves] };
  }

  private set(snapshot: StorySnapshot): void {
    this.current = snapshot;
    for (const listener of this.listeners) listener();
  }
}

/** Replays a submission on its level: the engine at its end (throws on a move the level refuses). */
export function replaySubmission(level: Pick<StoryLevel, "deck" | "placed">, run: StorySubmission): EngineGame {
  const game = startLevel(level);
  for (const move of run.moves) {
    if (move.discard) game.discard();
    else {
      const placement = toPlacement(move);
      if (!placement) throw new Error("Orientation: not valid");
      game.build(placement);
    }
  }
  return game;
}
