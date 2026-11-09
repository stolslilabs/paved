import { ViewError, WriteError, type DecodedEvent } from "@paved/chain";
import { type SeededMove, PUZZLE_PRIZE_COBBLES, comparePuzzle, puzzleDayEnd, puzzleDayOf, puzzlePlaceAmong } from "@paved/game-core";
import { addressKey } from "../keys";
import { PUZZLE_PRIZE_TOP, PUZZLE_STANDING_LIMIT, type PuzzleEntry, type PuzzleGameRecord, type PuzzleGameResult, type PuzzlePrize, type PuzzleStanding } from "../puzzle-source";
import { dayRanking, dayResults, freshPuzzle, mockDaySeed, newGame, openGameOf, playMove as playPuzzleMove, recordOf, type StoredPuzzle, type StoredPuzzleGame } from "./puzzle";
import { type StoredPlayer, sleep } from "./ledger-state";
import { LedgerChat } from "./ledger-chat";

/** The Puzzle (Play's Limited mode, `puzzle.ts`). One link of `MockLedger`'s chain (`ledger.ts`). */
export abstract class LedgerPuzzle extends LedgerChat {
  /** The stored Puzzle for a read (none stored yet: a fresh one's). */
  private puzzle(): StoredPuzzle {
    this.sync();
    return this.state.puzzle ?? freshPuzzle();
  }

  /** A Puzzle write: `change` works on the player's copy and the stored Puzzle (created on the first write), put back on a throw (`commit`). */
  private async writePuzzle<T>(account: string, change: (player: StoredPlayer, puzzle: StoredPuzzle) => { events: DecodedEvent[]; value: T }): Promise<T> {
    let value: T | undefined;
    await this.write(account, (p) => {
      const out = change(p, (this.state.puzzle ??= freshPuzzle()));
      value = out.value;
      return out.events;
    });
    return value as T;
  }

  /** A ranked result as a leaderboard's row: the player's public profile as the guilds read it. */
  private puzzleEntries(ranked: readonly { address: string; score: number; place: number }[], limit: number): PuzzleEntry[] {
    return this.guildRead((_world, people) => ranked.slice(0, limit).map((r) => ({ profile: people(r.address), score: r.score, place: r.place })));
  }

  /** `PuzzleSource.standing`: a day's results set by the ledger's clock, ranked (today's fills as the day goes). */
  async puzzleStanding(day: number | null, viewer: string | null): Promise<PuzzleStanding> {
    const now = this.second();
    const d = day ?? puzzleDayOf(now);
    const ranked = dayRanking(this.puzzle(), d, now);
    const mine = viewer === null ? undefined : ranked.find((r) => r.address === addressKey(viewer));
    return {
      day: d,
      endsAt: puzzleDayEnd(d),
      seed: `0x${mockDaySeed(d).toString(16)}`,
      entries: this.puzzleEntries(ranked, PUZZLE_STANDING_LIMIT),
      players: ranked.length,
      me: mine ? { place: mine.place, score: mine.score } : null,
    };
  }

  /** `PuzzleSource.activeGame`: the account's game of today still open, or null. */
  async puzzleActiveGame(player: string): Promise<PuzzleGameRecord | null> {
    const game = openGameOf(this.puzzle(), player, this.second());
    return game ? recordOf(game) : null;
  }

  /** `PuzzleSource.game`: a game by its id; an id with no game is the view's refusal. */
  async puzzleGame(gameId: number): Promise<PuzzleGameRecord> {
    const game = this.puzzle().games[gameId];
    if (!game) throw new ViewError("game-not-found", "Puzzle: game does not exist");
    return recordOf(game);
  }

  /**
   * `PuzzleSource.result`: the player's best of the day before the game (their games completed and ranked before it) and after, and
   * their place before and after among the day's other results now, in the standings' order (`comparePuzzle`). A game that ended past
   * its day ranks nowhere (`late`).
   */
  async puzzleResult(gameId: number): Promise<PuzzleGameResult> {
    const puzzle = this.puzzle();
    const game = puzzle.games[gameId];
    if (!game) throw new ViewError("game-not-found", "Puzzle: game does not exist");
    if (!game.over) throw new ViewError("not-available", "Puzzle: the game is not over");
    const dayEnd = puzzleDayEnd(game.day);
    const resultOf = (g: StoredPuzzleGame) => ({ score: g.score, at: g.end, order: g.order ?? 0 });
    const mine = resultOf(game);
    // Completed before this game: an earlier end, else an earlier order; two games stored before the order was kept (both 0) by
    // their ids, as then.
    const before = (g: StoredPuzzleGame) => g.end < game.end || (g.end === game.end && ((g.order ?? 0) < mine.order || ((g.order ?? 0) === mine.order && g.id < game.id)));
    const prior =
      Object.values(puzzle.games)
        .filter((g) => g.player === game.player && g.day === game.day && g.over && g.end < dayEnd && g.id !== game.id && before(g))
        .map(resultOf)
        .sort(comparePuzzle)[0] ?? null;
    const others = dayResults(puzzle, game.day, this.second()).filter((r) => r.address !== game.player);
    const late = game.end >= dayEnd;
    const after = late ? prior : prior && prior.score >= game.score ? prior : mine;
    return {
      gameId,
      day: game.day,
      score: game.score,
      bestBefore: prior?.score ?? null,
      bestAfter: after?.score ?? null,
      placeBefore: prior ? puzzlePlaceAmong(prior, others) : null,
      placeAfter: after ? puzzlePlaceAmong(after, others) : null,
      players: others.length + (after ? 1 : 0),
      late,
    };
  }

  /** `PuzzleSource.prizes`: the days over that the account finished first (its games' days, its welcome's), the newest first. */
  async puzzlePrizes(player: string): Promise<PuzzlePrize[]> {
    const puzzle = this.puzzle();
    const key = addressKey(player);
    const today = puzzleDayOf(this.second());
    const days = new Set<number>();
    for (const g of Object.values(puzzle.games)) if (g.player === key && g.over && g.day < today) days.add(g.day);
    const visited = puzzle.visits[key];
    if (visited !== undefined && visited - 1 < today) days.add(visited - 1);
    const claimed = new Set(puzzle.claims[key] ?? []);
    return [...days]
      .sort((a, b) => b - a)
      .flatMap((day) => {
        const ranked = dayRanking(puzzle, day, puzzleDayEnd(day));
        const first = ranked[0];
        if (!first || first.address !== key) return [];
        return [{ day, score: first.score, players: ranked.length, top: this.puzzleEntries(ranked, PUZZLE_PRIZE_TOP), claimed: claimed.has(day) }];
      });
  }

  /** `PuzzleSource.visit`: the account's first visit, recorded once (the mock's welcome prize is the day before it). */
  async puzzleVisit(player: string): Promise<void> {
    const key = addressKey(player);
    if (this.puzzle().visits[key] !== undefined) return;
    await this.writePuzzle(player, (_p, puzzle) => {
      puzzle.visits[key] ??= puzzleDayOf(this.second());
      return { events: [], value: undefined };
    });
  }

  /** `PuzzleSource.start`: a new game of today, refused while one of today is open. Its receipt names it (`PuzzleSpawned`). */
  async puzzleStart(player: string): Promise<PuzzleGameRecord> {
    await sleep(this.latency);
    return this.writePuzzle(player, (_p, puzzle) => {
      const now = this.second();
      if (openGameOf(puzzle, player, now)) throw new WriteError("Puzzle: a game is open");
      const game = newGame(puzzle, player, now);
      return { events: [this.event("PuzzleSpawned", { gameId: game.id, playerId: player, day: game.day })], value: recordOf(game) };
    });
  }

  /**
   * `PuzzleSource.play`: a move of the account's open game, by the engine's rules (its refusal is the writer's `WriteError` with the
   * contract's text); a build or a discard past the game's day is refused, a surrender is not. `PuzzleOver` when the move ends it.
   */
  async puzzlePlay(player: string, gameId: number, move: SeededMove): Promise<void> {
    await sleep(this.latency);
    await this.writePuzzle(player, (_p, puzzle) => {
      const game = puzzle.games[gameId];
      if (!game) throw new WriteError("Puzzle: game does not exist");
      if (game.player !== addressKey(player)) throw new WriteError("Puzzle: not the game player");
      if (game.over) throw new WriteError("Game: is over");
      const now = this.second();
      if (move.kind !== "surrender" && now >= puzzleDayEnd(game.day)) throw new WriteError("Puzzle: the day is over");
      try {
        // The move's transaction number (`commit`'s): the game's completion order when it ends it.
        playPuzzleMove(game, move, now, this.state.transactions + 1);
      } catch (error) {
        throw new WriteError(error instanceof Error ? error.message : String(error));
      }
      return { events: game.over ? [this.event("PuzzleOver", { gameId, playerId: player, day: game.day, score: game.score })] : [], value: undefined };
    });
  }

  /** `PuzzleSource.claim`: each day's prize the account won and has not claimed, its Cobbles added (`PuzzlePrizeClaimed` each). */
  async puzzleClaim(player: string, days: readonly number[]): Promise<{ cobbles: number }> {
    await sleep(this.latency);
    return this.writePuzzle(player, (p, puzzle) => {
      const key = addressKey(player);
      const today = puzzleDayOf(this.second());
      const claimed = (puzzle.claims[key] ??= []);
      const events: DecodedEvent[] = [];
      let cobbles = 0;
      for (const day of new Set(days)) {
        if (day >= today) throw new WriteError("Puzzle: the day is not over");
        if (claimed.includes(day)) throw new WriteError("Puzzle: already claimed");
        const first = dayRanking(puzzle, day, puzzleDayEnd(day))[0];
        if (!first || first.address !== key) throw new WriteError("Puzzle: not the day's winner");
        claimed.push(day);
        p.cobbles += PUZZLE_PRIZE_COBBLES;
        cobbles += PUZZLE_PRIZE_COBBLES;
        events.push(this.event("PuzzlePrizeClaimed", { playerId: player, day, cobbles: PUZZLE_PRIZE_COBBLES, balance: p.cobbles }));
      }
      return { events, value: { cobbles } };
    });
  }
}
