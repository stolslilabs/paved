import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  CENTER,
  OrientationType,
  SeededChallenge,
  gameStats,
  pageStateOf,
  puzzleDeck,
  type GameStats,
  type PageState,
  type PlaceMove,
  type PlanType,
  type SeededMove,
} from "@paved/game-core";
import { addressKey } from "./keys";
import { puzzleKeys, usePuzzleGameRecord } from "./puzzle";
import type { PuzzleGameRecord } from "./puzzle-source";
import { useDataSources } from "./sources";
import type { Closing } from "./training";

// A Puzzle game on the board (Play's Limited mode): its engine on the device (`SeededChallenge` with the day's deck), each move
// applied at once and sent to the source in order, as a Challenge game's moves are predicted and confirmed. The board reads it as it
// reads Training's (`TrainingGame`): its state, the last move's points, every closing.

/** What the board reads of a Puzzle game; a new object after each move. */
export interface PuzzleSnapshot {
  state: PageState;
  /** Points the last move added (a discard takes some: negative); null before the first move of this page. */
  delta: number | null;
  /** Every closing of the game, in move order. */
  closings: Closing[];
  /** Moves applied on the board, not yet taken by the source. */
  sending: number;
  /** Why the source refused a move: the board then reads the game again from the source. */
  refused: string | null;
}

const ORIENTATIONS = Object.values(OrientationType);

/** `move` in the engine's relative coordinates, or null for an orientation that is none. */
function toPlacement(move: PlaceMove) {
  const orientation = ORIENTATIONS[move.orientation];
  if (!orientation || orientation === OrientationType.None) return null;
  return { orientation, x: move.x - CENTER, y: move.y - CENTER };
}

/** The game's engine from its record, its moves played again, and its closings with the tile that closed each. */
export function replayPuzzle(record: PuzzleGameRecord): { engine: SeededChallenge; closings: Closing[] } {
  const engine = new SeededChallenge(BigInt(record.seed), BigInt(record.player), BigInt(record.deckSeed));
  const closings: Closing[] = [];
  for (const move of record.moves) {
    const outcome = engine.play(move);
    closings.push(...outcome.scored.map((s) => ({ ...s, tileId: outcome.tileId })));
  }
  return { engine, closings };
}

export class PuzzleGame {
  private readonly listeners = new Set<() => void>();
  private current: PuzzleSnapshot;
  private queue: Promise<void> = Promise.resolve();
  /** The day's deck: the deck sheet's cards. */
  readonly deck: PlanType[];

  private constructor(
    readonly record: PuzzleGameRecord,
    private readonly engine: SeededChallenge,
    closings: Closing[],
    private readonly send: ((move: SeededMove) => Promise<void>) | null,
  ) {
    this.deck = puzzleDeck(BigInt(record.deckSeed));
    this.current = { state: this.project([], null), delta: null, closings, sending: 0, refused: null };
  }

  /**
   * The game of `record`, its moves played again; `send` takes each new move to the source. Without `send` (another player's game)
   * the game is only shown: it takes no move.
   */
  static open(record: PuzzleGameRecord, send: ((move: SeededMove) => Promise<void>) | null): PuzzleGame {
    const { engine, closings } = replayPuzzle(record);
    return new PuzzleGame(record, engine, closings, send);
  }

  /** Whether the game takes moves: the viewer's own game. Another player's is only shown. */
  get writable(): boolean {
    return this.send !== null;
  }

  /** Settles once every move applied so far has been sent (taken or refused). */
  idle(): Promise<void> {
    return this.queue;
  }

  get snapshot(): PuzzleSnapshot {
    return this.current;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Every legal slot of the tile in hand at `orientation` (1 North to 4 West), in the chain's coordinates. */
  slots(orientation: number): { x: number; y: number }[] {
    const rules = this.engine.rules;
    if (rules.over || this.current.refused || !this.writable) return [];
    const wanted = ORIENTATIONS[orientation];
    return rules
      .legalPlacements()
      .filter((p) => p.orientation === wanted)
      .map((p) => ({ x: CENTER + p.x, y: CENTER + p.y }));
  }

  /** The orientations (1 North to 4 West) the tile in hand may take at `slot`; none when it cannot go there. */
  orientationsAt(slot: { x: number; y: number }): number[] {
    const rules = this.engine.rules;
    if (rules.over || this.current.refused || !this.writable) return [];
    return [1, 2, 3, 4].filter((o) => rules.canPlace(toPlacement({ orientation: o, ...slot })!));
  }

  /** The points placing the tile in hand as `move` would add; null when the move is not legal. */
  preview(move: PlaceMove): number | null {
    const placement = toPlacement(move);
    const rules = this.engine.rules;
    if (!placement || rules.over || !rules.canPlace(placement)) return null;
    return rules.clone().build(placement).points;
  }

  /** The game's figures as it stands (`gameStats`). */
  stats(): GameStats {
    return gameStats(this.engine.rules);
  }

  place(move: PlaceMove): boolean {
    return this.run({ kind: "build", orientation: move.orientation, x: move.x, y: move.y });
  }

  discard(): boolean {
    return this.run({ kind: "discard" });
  }

  surrender(): boolean {
    return this.run({ kind: "surrender" });
  }

  /** Applies `move` on the board at once (an illegal one refused, nothing moved), then sends it after the moves before it. */
  private run(move: SeededMove): boolean {
    const send = this.send;
    if (!send || this.engine.over || this.current.refused) return false;
    const before = this.engine.score;
    let outcome;
    try {
      outcome = this.engine.play(move);
    } catch (error) {
      this.set({ ...this.current, state: this.project([], error instanceof Error ? error.message : String(error)) });
      return false;
    }
    const closed = outcome.scored.map((s) => ({ ...s, tileId: outcome.tileId }));
    this.set({
      ...this.current,
      state: this.project(outcome.scored, null),
      delta: move.kind === "surrender" ? null : this.engine.score - before,
      closings: closed.length ? [...this.current.closings, ...closed] : this.current.closings,
      sending: this.current.sending + 1,
    });
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

  private project(lastScored: PageState["lastScored"], writeError: string | null): PageState {
    return pageStateOf(this.engine.rules, { lastScored, writeError, gameId: this.record.id, playerId: this.record.player });
  }

  private set(snapshot: PuzzleSnapshot): void {
    this.current = snapshot;
    for (const listener of this.listeners) listener();
  }
}

/**
 * The board's Puzzle game `gameId` as `viewer` (the current account, null for none) sees it: read once from the source (`game`), then
 * played on the device, each move sent in order as the viewer's. Only the game's own player plays it: another account's game (or any
 * game without an account) is shown read-only. A switch of account shows no game until the moves sent so far are taken and the game
 * is read again from the source, then opens it for the new account (never from the record first read). A refused move (another
 * tab played it, the day ended) stops the game until `reload` reads it again. Once the last move is taken, the day's reads are
 * refreshed (the leaderboard, the open game, the result).
 */
export function usePuzzleSession(gameId: number, viewer: string | null) {
  const { puzzle } = useDataSources();
  const client = useQueryClient();
  const record = usePuzzleGameRecord(gameId);
  const [game, setGame] = useState<PuzzleGame | null>(null);
  const [opened, setOpened] = useState(0);
  // The game from the first record read (and from the next after a reload or a switch of account): a refetch of the record never
  // resets the board.
  const viewerKey = viewer === null ? null : addressKey(viewer);
  const [built, setBuilt] = useState<{ opened: number; viewer: string | null } | null>(null);
  useEffect(() => {
    if (!record.data || !puzzle || built?.opened === opened) return;
    const data = record.data;
    const own = viewerKey !== null && viewerKey === addressKey(data.player);
    setGame(PuzzleGame.open(data, own ? (move) => puzzle.play(viewerKey, gameId, move) : null));
    setBuilt({ opened, viewer: viewerKey });
  }, [record.data, puzzle, gameId, built, opened, viewerKey]);

  // A switch of account: the moves on their way are sent first, then the game is read again and opened for the new account. The record
  // first read is never refreshed by the moves, so opening from it would roll the board back.
  const switching = game !== null && built !== null && built.opened === opened && built.viewer !== viewerKey;
  useEffect(() => {
    if (!switching || !game) return;
    let live = true;
    void game
      .idle()
      .then(() => client.invalidateQueries({ queryKey: puzzleKeys.game(gameId) }))
      .then(() => {
        if (live) setOpened((n) => n + 1);
      });
    return () => {
      live = false;
    };
  }, [switching, game, client, gameId]);
  const current = switching ? null : game;

  const subscribe = useCallback((listener: () => void) => (current ? current.subscribe(listener) : () => {}), [current]);
  const snapshot = useSyncExternalStore(subscribe, () => current?.snapshot ?? null);

  const settled = snapshot !== null && snapshot.sending === 0;
  const over = snapshot?.state.game?.over ?? false;
  useEffect(() => {
    if (settled && over) void client.invalidateQueries({ queryKey: puzzleKeys.all });
  }, [settled, over, client]);

  const reload = useCallback(() => {
    void client.invalidateQueries({ queryKey: puzzleKeys.game(gameId) }).then(() => setOpened((n) => n + 1));
  }, [client, gameId]);

  const deck = useMemo(() => current?.deck ?? null, [current]);
  return { game: current, snapshot, record, settled, reload, deck };
}
