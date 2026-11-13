import { describe, expect, it } from "vitest";
import {
  PUZZLE_TILES,
  TOURNAMENT_BYE,
  TOURNAMENT_CHAMPION_COBBLES,
  TOURNAMENT_COBBLES,
  TOURNAMENT_LEAGUES,
  TOURNAMENT_ROUNDS,
  TOURNAMENT_SEATS,
  TOURNAMENT_TILES,
  TOURNAMENT_VACANT,
  tournamentBracketCount,
  tournamentCobbles,
  tournamentDraw,
  tournamentDuel,
  tournamentFirstRound,
  tournamentGroups,
  tournamentLeagueGroup,
  tournamentNextRound,
  tournamentPhaseOf,
  tournamentPlayersIn,
  tournamentPlaysIn,
  tournamentRoundDay,
  tournamentRoundEnd,
  tournamentRoundName,
  tournamentRoundOf,
  tournamentRoundStart,
  tournamentSeatOf,
  tournamentWeekOf,
  tournamentWeekStart,
  tournamentWinner,
  type TournamentGame,
} from "../src";

const at = (iso: string) => Date.parse(iso) / 1000;

/** A draw's random, the same at each run. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1_664_525) + 1_013_904_223) >>> 0;
    return s / 4_294_967_296;
  };
}

/** Round 1's seats of bracket `bracket` of a draw: each seat's player, or a bye. */
function seatsOf(draw: { bracket: number; seat: number }[], bracket = 0): number[] {
  const seats = new Array<number>(TOURNAMENT_SEATS).fill(TOURNAMENT_BYE);
  draw.forEach((d, player) => {
    if (d.bracket === bracket) seats[d.seat] = player;
  });
  return seats;
}

describe("the Tournament's calendar", () => {
  it("runs a week from Monday 00:00 UTC: a day of registration, then a round a day until Sunday's final", () => {
    const monday = at("2027-04-05T00:00:00Z");
    const week = tournamentWeekOf(monday);
    expect(tournamentWeekStart(week)).toBe(monday);
    expect(tournamentWeekOf(monday - 1)).toBe(week - 1);
    expect(tournamentRoundOf(monday)).toBe(0);
    expect(tournamentPhaseOf(at("2027-04-05T23:59:59Z"))).toBe("registration");
    expect(tournamentPhaseOf(at("2027-04-06T00:00:00Z"))).toBe("rounds");
    expect(tournamentRoundOf(at("2027-04-06T12:00:00Z"))).toBe(1);
    expect(tournamentRoundOf(at("2027-04-11T23:59:59Z"))).toBe(TOURNAMENT_ROUNDS);
    expect(tournamentRoundStart(week, 1)).toBe(at("2027-04-06T00:00:00Z"));
    expect(tournamentRoundEnd(week, TOURNAMENT_ROUNDS)).toBe(tournamentWeekStart(week + 1));
    // A new tournament each week: the next Monday is a registration again.
    expect(tournamentRoundOf(at("2027-04-12T08:00:00Z"))).toBe(0);
  });

  it("names the rounds and their days, and halves the players each round", () => {
    expect([1, 2, 3, 4, 5, 6].map(tournamentRoundName)).toEqual(["Round of 64", "Round of 32", "Round of 16", "Quarter-final", "Semi-final", "Final"]);
    expect([1, 2, 3, 4, 5, 6].map(tournamentPlayersIn)).toEqual([64, 32, 16, 8, 4, 2]);
    expect([0, 1, 6].map(tournamentRoundDay)).toEqual(["Monday", "Tuesday", "Sunday"]);
    expect(TOURNAMENT_TILES).toBe(PUZZLE_TILES);
  });
});

describe("the Tournament's leagues", () => {
  it("groups the 23 leagues by name: nine groups", () => {
    expect(TOURNAMENT_LEAGUES).toHaveLength(9);
    expect([0, 1, 3, 4, 12, 13, 21, 22].map(tournamentLeagueGroup)).toEqual([0, 1, 1, 2, 4, 5, 7, 8]);
  });

  it("sends a group under 16 players to the group below, with those it carries", () => {
    expect(tournamentGroups([40, 20, 16, 30, 142, 0, 0, 0, 0])).toEqual([0, 1, 2, 3, 4, 4, 4, 4, 4]);
    // Master's 5 join Diamond's 9 (14, still short), and both join Emerald's 20.
    expect(tournamentGroups([40, 20, 16, 30, 142, 20, 9, 5, 0])).toEqual([0, 1, 2, 3, 4, 5, 5, 5, 5]);
    // The lowest group keeps whoever it has.
    expect(tournamentGroups([3, 2, 0, 0, 0, 0, 0, 0, 0])).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });
});

describe("the Tournament's draw", () => {
  it("spreads the empty seats: the six bits of a player's turn, reversed", () => {
    expect([0, 1, 2, 3, 4].map(tournamentSeatOf)).toEqual([0, 32, 16, 48, 8]);
    expect(new Set(Array.from({ length: 64 }, (_, i) => tournamentSeatOf(i))).size).toBe(64);
  });

  it("balances the brackets: 150 players make 3 of 50, 65 one of 33 and one of 32", () => {
    expect([1, 64, 65, 150].map(tournamentBracketCount)).toEqual([1, 1, 2, 3]);
    const sizes = (players: number) => {
      const draw = tournamentDraw(players, seeded(7));
      return Array.from({ length: tournamentBracketCount(players) }, (_, b) => draw.filter((d) => d.bracket === b).length);
    };
    expect(sizes(150)).toEqual([50, 50, 50]);
    expect(sizes(65)).toEqual([33, 32]);
    // Every player has a seat of their own.
    const draw = tournamentDraw(150, seeded(7));
    expect(new Set(draw.map((d) => d.bracket * 64 + d.seat)).size).toBe(150);
    // Another seed, another draw.
    expect(tournamentDraw(150, seeded(8))).not.toEqual(draw);
  });

  it("starts a small bracket later: with 50 players, 14 start in round 2; with 17, 2 in round 2 and 15 in round 3", () => {
    const starts = (players: number) => {
      const seats = seatsOf(tournamentDraw(players, seeded(3)));
      const count: Record<number, number> = {};
      seats.forEach((p, seat) => {
        if (p < 0) return;
        const first = tournamentFirstRound(seats, seat)!;
        count[first] = (count[first] ?? 0) + 1;
      });
      return count;
    };
    expect(starts(64)).toEqual({ 1: 64 });
    expect(starts(50)).toEqual({ 1: 36, 2: 14 });
    expect(starts(17)).toEqual({ 2: 2, 3: 15 });
    expect(tournamentFirstRound(seatsOf(tournamentDraw(1, seeded(3))), 0)).toBeNull();
  });
});

describe("who goes through", () => {
  const game = (score: number, at = 100): TournamentGame => ({ score, at });

  it("sends the higher score through, the earlier game at an equal score, and any game past no game", () => {
    expect(tournamentWinner(game(5_693), game(5_486))).toBe("a");
    expect(tournamentWinner(game(5_000), game(5_486))).toBe("b");
    expect(tournamentWinner(game(5_000, 200), game(5_000, 100))).toBe("b");
    expect(tournamentWinner(game(5_000, 100), game(5_000, 200))).toBe("a");
    expect(tournamentWinner(null, game(0))).toBe("b");
    expect(tournamentWinner(game(-50), null)).toBe("a");
    expect(tournamentWinner(null, null)).toBeNull();
  });

  it("lets a bye of the draw skip the round, and asks a game of the player facing a match nobody played", () => {
    const games = new Map<number, TournamentGame>([[1, game(900)]]);
    const read = (player: number) => games.get(player) ?? null;
    expect(tournamentDuel(0, TOURNAMENT_BYE, read)).toBe(0);
    expect(tournamentDuel(TOURNAMENT_BYE, TOURNAMENT_BYE, read)).toBe(TOURNAMENT_BYE);
    // Nobody played: the seat stays empty, and is no bye.
    expect(tournamentDuel(2, 3, read)).toBe(TOURNAMENT_VACANT);
    expect(tournamentDuel(1, TOURNAMENT_VACANT, read)).toBe(1);
    expect(tournamentDuel(TOURNAMENT_VACANT, 0, read)).toBe(TOURNAMENT_VACANT);
    expect(tournamentDuel(TOURNAMENT_VACANT, TOURNAMENT_BYE, read)).toBe(TOURNAMENT_VACANT);
    expect(tournamentPlaysIn([0, TOURNAMENT_BYE, 1, TOURNAMENT_VACANT], 0)).toBe(false);
    expect(tournamentPlaysIn([0, TOURNAMENT_BYE, 1, TOURNAMENT_VACANT], 2)).toBe(true);
  });

  it("plays a bracket of 50 to its champion in six rounds", () => {
    let seats = seatsOf(tournamentDraw(50, seeded(11)));
    // Every player plays every round; the higher number scores more.
    for (let round = 1; round <= TOURNAMENT_ROUNDS; round++) seats = tournamentNextRound(seats, (player) => game(1_000 + player));
    expect(seats).toEqual([49]);
  });
});

describe("the Tournament's rewards", () => {
  it("pays the last round reached, the champion their own, and nothing without a game", () => {
    expect([1, 2, 3, 4, 5, 6].map((r) => tournamentCobbles(r, false, true))).toEqual([...TOURNAMENT_COBBLES]);
    expect(tournamentCobbles(6, true, true)).toBe(TOURNAMENT_CHAMPION_COBBLES);
    expect(tournamentCobbles(1, false, false)).toBe(0);
    // A full bracket pays 1,250 Cobbles: 32 out in round 1, 16 in round 2, ... the finalist and the champion.
    const full = [32, 16, 8, 4, 2, 1].reduce((sum, out, i) => sum + out * TOURNAMENT_COBBLES[i]!, 0) + TOURNAMENT_CHAMPION_COBBLES;
    expect(full).toBe(1_250);
  });
});
