import { describe, expect, it } from "vitest";
import {
  CENTER,
  OrientationType,
  SeededChallenge,
  TOURNAMENT_CHAMPION_COBBLES,
  TOURNAMENT_COBBLES,
  TOURNAMENT_ROUNDS,
  tournamentCobbles,
  tournamentRoundEnd,
  tournamentRoundStart,
  tournamentWeekOf,
  tournamentWeekStart,
  tournamentWinner,
  type SeededMove,
} from "@paved/game-core";
import type { TournamentGameRecord } from "../src/data/tournament-source";
import { MockLedger } from "../src/data/mock/ledger";
import { mockTournament } from "../src/data/mock/overlay";
import { claim, freshTournament, newGame, runOf, stateOf, type StoredTournament } from "../src/data/mock/tournament";
import { memoryStore } from "./data-fakes";

// The mock's Tournament (the weekly individual event, all on the client): Monday's registration, Tuesday's draw, one game a round on
// the round's deck, who goes through, the Cobbles of the round reached, and a new tournament each week.

const ME = "0x51a7";
const ORIENTATIONS = Object.values(OrientationType);
const WEEK = tournamentWeekOf(Date.parse("2026-11-10T12:00:00Z") / 1000);
const MONDAY = tournamentWeekStart(WEEK) + 43_200;
const NEXT_MONDAY = tournamentWeekStart(WEEK + 1) + 3_600;
const names = () => null;

function world(at = MONDAY) {
  const clock = { now: at };
  const ledger = new MockLedger({ store: () => memoryStore(), seller: "0x3", latencyMs: 0, now: () => clock.now });
  return { clock, ledger, tournament: mockTournament(ledger) };
}

/** A whole game on its record, the first legal placement each turn (a discard when none), every move sent. */
async function playOut(tournament: ReturnType<typeof mockTournament>, record: TournamentGameRecord): Promise<number> {
  const engine = new SeededChallenge(BigInt(record.seed), BigInt(record.player), BigInt(record.deckSeed));
  while (!engine.over) {
    const p = engine.rules.legalPlacements()[0];
    const move: SeededMove = p ? { kind: "build", orientation: ORIENTATIONS.indexOf(p.orientation), x: CENTER + p.x, y: CENTER + p.y } : { kind: "discard" };
    engine.play(move);
    await tournament.play(ME, record.id, move);
  }
  return engine.score;
}

/** A stored Tournament where ME is registered in `group` for WEEK, with a finished game of `score` in each of `rounds`. */
function stored(group: number, rounds: readonly number[], score: number): StoredTournament {
  const t = freshTournament();
  t.registrations[WEEK] = [{ player: ME, group, at: MONDAY }];
  for (const round of rounds) {
    const at = tournamentRoundStart(WEEK, round) + 60;
    t.games[round] = { id: round, week: WEEK, round, day: Math.floor(at / 86_400), player: ME, seed: "0x1", moves: [], score, over: true, start: at, end: at, last: at };
  }
  t.nextId = 10;
  return t;
}

describe("the mock's Tournament: a week on the client", () => {
  it("opens the registration on Monday, in the player's league, and closes it on Tuesday", async () => {
    const { tournament, clock } = world();
    let state = await tournament.state(ME);
    expect(state).toMatchObject({ week: WEEK, phase: "registration", round: 0, endsAt: tournamentRoundStart(WEEK, 1), league: "Wood", registered: false, deckSeed: null, run: null, last: null });
    const before = state.entrants;
    await expect(tournament.start(ME)).rejects.toThrow("Tournament: the rounds have not begun");
    await tournament.register(ME);
    await expect(tournament.register(ME)).rejects.toThrow("Tournament: already registered");
    state = await tournament.state(ME);
    expect(state).toMatchObject({ registered: true, entrants: before + 1, run: null });
    // The mock's players register through the day.
    clock.now = tournamentRoundStart(WEEK, 1) - 60;
    expect((await tournament.state(ME)).entrants).toBeGreaterThan(before + 1);
    // Tuesday: closed. A player who did not register watches the week.
    const late = world(tournamentRoundStart(WEEK, 1) + 60);
    await expect(late.tournament.register(ME)).rejects.toThrow("Tournament: the registration is closed");
    await expect(late.tournament.start(ME)).rejects.toThrow("Tournament: not registered");
    expect(await late.tournament.state(ME)).toMatchObject({ phase: "rounds", round: 1, registered: false, run: null });
    expect((await late.tournament.state(null)).league).toBeNull();
  });

  it("runs a registered player's week: the draw, one game a round, the day's verdict, the Cobbles, then a new week", async () => {
    const { tournament, clock, ledger } = world();
    await tournament.register(ME);
    let status = "";
    let played = 0;
    for (let round = 1; round <= TOURNAMENT_ROUNDS; round++) {
      clock.now = tournamentRoundStart(WEEK, round) + 3_600;
      const state = await tournament.state(ME);
      const run = state.run!;
      expect(state).toMatchObject({ phase: "rounds", round, endsAt: tournamentRoundEnd(WEEK, round) });
      expect(run.players).toBeGreaterThan(16);
      expect(run).toMatchObject({ week: WEEK, league: "Wood", registeredIn: "Wood", bracket: 1 });
      status = run.status;
      if (status === "out") {
        await expect(tournament.start(ME)).rejects.toThrow("Tournament: eliminated");
        break;
      }
      const step = run.path[run.path.length - 1]!;
      expect(step).toMatchObject({ round, outcome: "pending" });
      if (status === "waiting") {
        // A bye of the draw: no game today, the first duel is later.
        expect(step).toMatchObject({ kind: "bye", opponent: null });
        await expect(tournament.start(ME)).rejects.toThrow("Tournament: no duel this round");
        continue;
      }
      expect(status).toBe("to-play");
      await expect(tournament.claim(ME, WEEK)).rejects.toThrow("Tournament: the run is not over");
      const record = await tournament.start(ME);
      expect(record).toMatchObject({ week: WEEK, round, endsAt: tournamentRoundEnd(WEEK, round), deckSeed: state.deckSeed, over: false });
      await expect(tournament.start(ME)).rejects.toThrow("Tournament: a game is open");
      expect((await tournament.state(ME)).run).toMatchObject({ status: "playing", open: { id: record.id } });
      const score = await playOut(tournament, record);
      played += 1;
      await expect(tournament.start(ME)).rejects.toThrow("Tournament: one game per round");
      // The day is not over: the game stands against the opponent's, when they have played.
      const live = await tournament.result(record.id);
      expect(live).toMatchObject({ score, round, secures: round === TOURNAMENT_ROUNDS ? TOURNAMENT_CHAMPION_COBBLES : TOURNAMENT_COBBLES[round] });
      expect(["waiting", "ahead", "behind"]).toContain(live.standing);
      expect((await tournament.state(ME)).run!.status).toBe("played");
      // Midnight decides: the better score, the earlier game at an equal one.
      clock.now = tournamentRoundEnd(WEEK, round) + 1;
      const after = round < TOURNAMENT_ROUNDS ? (await tournament.state(ME)).run! : (await tournament.state(ME)).last!;
      const decided = after.path.find((s) => s.round === round)!;
      const through = decided.kind === "walkover" || tournamentWinner({ score, at: decided.own!.at }, decided.theirs && { score: decided.theirs.score, at: decided.theirs.at }) === "a";
      expect(decided.outcome).toBe(through ? "won" : "lost");
      expect((await tournament.result(record.id)).standing).toBe(through ? "won" : "lost");
    }
    expect(played).toBeGreaterThan(0);

    // Monday: a new tournament's registration is open; last week's run is out, its Cobbles claimed once.
    clock.now = NEXT_MONDAY;
    const state = await tournament.state(ME);
    expect(state).toMatchObject({ week: WEEK + 1, phase: "registration", registered: false, run: null });
    const last = state.last!;
    expect(["out", "champion"]).toContain(last.status);
    expect(last.cobbles).toBe(tournamentCobbles(last.reached, last.status === "champion", true));
    expect(last).toMatchObject({ week: WEEK, claimable: true, claimed: false });
    const before = (await ledger.account(ME)).cobbles;
    expect(await tournament.claim(ME, WEEK)).toEqual({ cobbles: last.cobbles });
    expect((await ledger.account(ME)).cobbles).toBe(before + last.cobbles);
    await expect(tournament.claim(ME, WEEK)).rejects.toThrow("Tournament: already claimed");
    expect((await tournament.state(ME)).last).toMatchObject({ claimable: false, claimed: true });
    await tournament.register(ME);
    expect((await tournament.state(ME)).registered).toBe(true);
  });

  it("refuses a move past the round's end but a surrender, and counts the unfinished game at its last move", async () => {
    const { tournament, clock } = world();
    await tournament.register(ME);
    // The player's first duel: the first round they are not waiting in.
    let round = 1;
    for (; round <= TOURNAMENT_ROUNDS; round++) {
      clock.now = tournamentRoundEnd(WEEK, round) - 600;
      if ((await tournament.state(ME)).run!.status === "to-play") break;
    }
    const record = await tournament.start(ME);
    const engine = new SeededChallenge(BigInt(record.seed), BigInt(record.player), BigInt(record.deckSeed));
    const p = engine.rules.legalPlacements()[0]!;
    const move: SeededMove = { kind: "build", orientation: ORIENTATIONS.indexOf(p.orientation), x: CENTER + p.x, y: CENTER + p.y };
    engine.play(move);
    await tournament.play(ME, record.id, move);
    const lastMove = clock.now;
    clock.now = tournamentRoundEnd(WEEK, round) + 1;
    await expect(tournament.play(ME, record.id, { kind: "discard" })).rejects.toThrow("Tournament: the round is over");
    // Left unfinished: it counted with its score at its last move.
    const run = round < TOURNAMENT_ROUNDS ? (await tournament.state(ME)).run! : (await tournament.state(ME)).last!;
    expect(run.path.find((s) => s.round === round)!.own).toEqual({ score: engine.score, at: lastMove, over: false });
    await tournament.play(ME, record.id, { kind: "surrender" });
    expect((await tournament.game(record.id)).over).toBe(true);
  });
});

describe("the mock's Tournament: a run from its stored games", () => {
  it("crowns the player who wins every duel: six rounds, the champion's Cobbles, the final in the last eight", () => {
    const t = stored(0, [1, 2, 3, 4, 5, 6], 99_999);
    const run = runOf(t, WEEK, ME, NEXT_MONDAY, names)!;
    expect(run).toMatchObject({ status: "champion", reached: TOURNAMENT_ROUNDS, cobbles: TOURNAMENT_CHAMPION_COBBLES, claimable: true });
    expect(run.path.map((s) => s.round)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(run.path.every((s) => s.outcome === "won" || s.outcome === "skipped")).toBe(true);
    // The last eight: four quarter-finals, two semi-finals, the final, the champion on its winning side.
    expect(run.finals.map((m) => m.round)).toEqual([4, 4, 4, 4, 5, 5, 6]);
    const final = run.finals[6]!;
    expect(final.winner && final[final.winner]!.player.address).toBe(ME);
    expect(claim(t, ME, WEEK, NEXT_MONDAY, names)).toBe(TOURNAMENT_CHAMPION_COBBLES);
  });

  it("puts out the player who does not play, with nothing to claim; and pays the round reached to the one who played", () => {
    const absent = stored(0, [], 0);
    const run = runOf(absent, WEEK, ME, NEXT_MONDAY, names)!;
    expect(run).toMatchObject({ status: "out", cobbles: 0, claimable: false });
    expect(run.path[run.path.length - 1]).toMatchObject({ own: null, outcome: "lost" });
    expect(() => claim(absent, ME, WEEK, NEXT_MONDAY, names)).toThrow("Tournament: nothing to claim");
    // Won every duel until the quarter-final, then stayed away: out there, with its Cobbles.
    const quarter = runOf(stored(0, [1, 2, 3], 99_999), WEEK, ME, NEXT_MONDAY, names)!;
    expect(quarter).toMatchObject({ status: "out", reached: 4, cobbles: TOURNAMENT_COBBLES[3] });
    // In the middle of the week the same run is still on: Thursday, round 3 is theirs to win.
    expect(runOf(stored(0, [1, 2, 3], 99_999), WEEK, ME, tournamentRoundStart(WEEK, 3) + 3_600, names)).toMatchObject({ status: "played", reached: 3, claimable: false });
  });

  it("resumes only the game of today's round: an unfinished game that won at midnight leaves today's to play", () => {
    const first = runOf(stored(0, [], 0), WEEK, ME, tournamentRoundStart(WEEK, 1) + 60, names)!.firstDuel!;
    expect(first).toBeLessThan(TOURNAMENT_ROUNDS);
    // Left unfinished on its last move, with a score that wins the duel.
    const t = stored(0, [first], 99_999);
    t.games[first]!.over = false;
    const during = runOf(t, WEEK, ME, tournamentRoundStart(WEEK, first) + 3_600, names)!;
    expect(during).toMatchObject({ status: "playing", open: { id: first, score: 99_999 } });
    const now = tournamentRoundStart(WEEK, first + 1) + 3_600;
    const run = runOf(t, WEEK, ME, now, names)!;
    expect(run.path.find((s) => s.round === first)).toMatchObject({ outcome: "won", own: { over: false } });
    expect(run).toMatchObject({ status: "to-play", open: null });
    expect(newGame(t, ME, now, names)).toMatchObject({ round: first + 1, over: false });
    expect(runOf(t, WEEK, ME, now, names)).toMatchObject({ status: "playing", open: { id: 10 } });
  });

  it("shows no open game once an unfinished game lost its duel at midnight", () => {
    const first = runOf(stored(0, [], 0), WEEK, ME, tournamentRoundStart(WEEK, 1) + 60, names)!.firstDuel!;
    const t = stored(0, [first], 1);
    t.games[first]!.over = false;
    const now = tournamentRoundStart(WEEK, first + 1) + 3_600;
    const run = runOf(t, WEEK, ME, now, names)!;
    expect(run.path.find((s) => s.round === first)).toMatchObject({ outcome: "lost" });
    expect(run).toMatchObject({ status: "out", open: null });
    // The week after: last week's run carries no open game either.
    expect(stateOf(t, NEXT_MONDAY, ME, 0, names).last).toMatchObject({ status: "out", open: null });
  });

  it("carries a small league group down: a Grand Master plays in a lower group's bracket", () => {
    const state = stateOf(stored(8, [], 0), tournamentRoundStart(WEEK, 1) + 60, ME, 8, names);
    expect(state.league).toBe("Grand Master");
    expect(state.run).toMatchObject({ registeredIn: "Grand Master" });
    expect(state.run!.league).not.toBe("Grand Master");
    expect(state.entrants).toBeGreaterThanOrEqual(16);
    expect(state.entrants).toBeGreaterThanOrEqual(state.run!.players);
  });
});
