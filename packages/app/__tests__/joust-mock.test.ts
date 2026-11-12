import { describe, expect, it } from "vitest";
import { CENTER, JOUST_GAMES, JOUST_START_RATING, OrientationType, SeededChallenge, joustEndsAt, joustOpensAt, joustWeekOf, joustWeekStart, type GuildDraft, type SeededMove } from "@paved/game-core";
import type { JoustGameRecord } from "../src/data/joust-source";
import { JOUST_FIRST_WEEK, historyOf, freshJoust } from "../src/data/mock/joust";
import { seededGuildWorld } from "../src/data/mock/guilds";
import { MockLedger } from "../src/data/mock/ledger";
import { mockJoust, mockSocial } from "../src/data/mock/overlay";
import { memoryStore } from "./data-fakes";

// The mock's Joust (the weekly allegiance event, all on the client): the calendar's phases, the registration, the draw, the games
// (three, the week's boost, the best counted), the result with its rating and Cobbles, and a new joust each week.

const ME = "0x51a7";
const ORIENTATIONS = Object.values(OrientationType);
const WEEK = joustWeekOf(Date.parse("2026-11-10T12:00:00Z") / 1000);
const TUESDAY = joustWeekStart(WEEK) + 86_400 + 43_200;
const draft: GuildDraft = { name: "Stone Road", emblem: { icon: 1, primary: 2, secondary: 3 }, description: "We pave.", joinType: "open", requirements: { level: 0, crowns: 0 } };

function world(at = TUESDAY) {
  const clock = { now: at };
  const ledger = new MockLedger({ store: () => memoryStore(), seller: "0x3", latencyMs: 0, now: () => clock.now });
  return { clock, ledger, joust: mockJoust(ledger), social: mockSocial(ledger) };
}

/** A whole game on its record, the first legal placement each turn (a discard when none), every move sent. */
async function playOut(joust: ReturnType<typeof mockJoust>, record: JoustGameRecord): Promise<number> {
  const engine = new SeededChallenge(BigInt(record.seed), BigInt(record.player), BigInt(record.deckSeed), record.boost);
  while (!engine.over) {
    const p = engine.rules.legalPlacements()[0];
    const move: SeededMove = p ? { kind: "build", orientation: ORIENTATIONS.indexOf(p.orientation), x: CENTER + p.x, y: CENTER + p.y } : { kind: "discard" };
    engine.play(move);
    await joust.play(ME, record.id, move);
  }
  return engine.score;
}

describe("the mock's Joust: a week on the client", () => {
  it("shows the week to a player without an allegiance, and refuses their game", async () => {
    const { joust, clock } = world();
    const state = await joust.state(ME);
    expect(state).toMatchObject({ week: WEEK, phase: "registration", opensAt: joustOpensAt(WEEK), endsAt: joustEndsAt(WEEK), guild: null, registered: false, match: null, result: null });
    clock.now = joustOpensAt(WEEK) + 60;
    await expect(joust.start(ME)).rejects.toThrow("Joust: not in an allegiance");
  });

  it("has the seeded allegiances register and joust each week: ratings move from 1,000 and a ranking follows", async () => {
    const { joust } = world();
    const ranking = await joust.ranking(null);
    expect(ranking.jousts).toBe(WEEK - JOUST_FIRST_WEEK);
    expect(ranking.entries.length).toBeGreaterThan(3);
    expect(ranking.entries.map((e) => e.rating)).toEqual([...ranking.entries.map((e) => e.rating)].sort((a, b) => b - a));
    expect(ranking.entries.some((e) => e.rating !== JOUST_START_RATING)).toBe(true);
    // A joust's moves cancel out to the rounding: a point each at most.
    const history = historyOf(freshJoust(), seededGuildWorld().guilds, TUESDAY);
    for (const entries of history.weeks.values()) {
      const moves = [...entries.values()].reduce((sum, e) => sum + (e.after! - e.before), 0);
      expect(Math.abs(moves)).toBeLessThanOrEqual(entries.size / 2);
    }
  });

  it("runs the Leader's week: register, the draw, three games with the boost, the best counted, then the result and its Cobbles", async () => {
    const { joust, social, clock, ledger } = world();
    await social.createGuild(ME, draft);
    let state = await joust.state(ME);
    expect(state.guild).toMatchObject({ name: "Stone Road", rating: JOUST_START_RATING, members: 1, canRegister: true });
    expect(state.registered).toBe(false);
    await expect(joust.start(ME)).rejects.toThrow("Joust: the joust has not begun");
    await joust.register(ME);
    await expect(joust.register(ME)).rejects.toThrow("Joust: already registered");
    expect((await joust.state(ME)).registered).toBe(true);

    // Friday: the registration is closed, an opponent of the band is drawn (or a bye), the games open.
    clock.now = joustOpensAt(WEEK) + 3_600;
    await expect(joust.register(ME)).rejects.toThrow("Joust: the registration is closed");
    state = await joust.state(ME);
    expect(state.phase).toBe("live");
    expect(state.match?.own).toMatchObject({ total: 0, jousters: 0, gamesLeft: JOUST_GAMES });
    expect(state.me).toMatchObject({ eligible: true, played: 0, left: JOUST_GAMES, best: null, open: null });

    const scores: number[] = [];
    for (let n = 1; n <= JOUST_GAMES; n++) {
      const record = await joust.start(ME);
      expect(record).toMatchObject({ week: WEEK, game: n, boost: state.boost, endsAt: joustEndsAt(WEEK), over: false });
      await expect(joust.start(ME)).rejects.toThrow("Joust: a game is open");
      expect((await joust.state(ME)).me?.open).toMatchObject({ id: record.id });
      scores.push(await playOut(joust, record));
      const result = await joust.result(record.id);
      expect(result).toMatchObject({ score: scores[n - 1], game: n, left: JOUST_GAMES - n, late: false, bestAfter: Math.max(...scores) });
      expect(result.totalAfter).toBe(Math.max(...scores));
      clock.now += 600;
    }
    await expect(joust.start(ME)).rejects.toThrow("Joust: no game left");
    state = await joust.state(ME);
    expect(state.me).toMatchObject({ played: JOUST_GAMES, left: 0, best: Math.max(...scores), place: 1 });
    expect(state.match!.own.total).toBe(Math.max(...scores));
    expect(state.match!.own.top).toHaveLength(1);
    await expect(joust.claim(ME, WEEK)).rejects.toThrow("Joust: the joust is not over");

    // Monday: a new joust's registration is open, last week's result is out, its Cobbles claimed once.
    clock.now = joustEndsAt(WEEK) + 3_600;
    state = await joust.state(ME);
    expect(state).toMatchObject({ week: WEEK + 1, phase: "registration", registered: false, match: null });
    const result = state.result!;
    expect(result).toMatchObject({ week: WEEK, best: Math.max(...scores), place: 1, claimed: false, ratingBefore: JOUST_START_RATING });
    expect(result.own.total).toBe(Math.max(...scores));
    const won = result.outcome === "win" || result.outcome === "bye";
    expect(result.cobbles).toBe(won ? 50 : 15);
    if (result.opponent) expect(Math.sign(result.ratingAfter - result.ratingBefore)).toBe(won ? 1 : -1);
    const before = (await ledger.account(ME)).cobbles;
    expect(await joust.claim(ME, WEEK)).toEqual({ cobbles: result.cobbles });
    expect((await ledger.account(ME)).cobbles).toBe(before + result.cobbles);
    await expect(joust.claim(ME, WEEK)).rejects.toThrow("Joust: already claimed");
    expect((await joust.state(ME)).result?.claimed).toBe(true);
    expect((await joust.ranking(ME)).own).toBe(state.guild!.id);
  });

  it("keeps a member who joined after Friday 00:00 out of the joust, and an unregistered allegiance too", async () => {
    const { joust, social, clock } = world();
    // Created on Friday: not registered, the week is sat out.
    clock.now = joustOpensAt(WEEK) + 60;
    await social.createGuild(ME, draft);
    const state = await joust.state(ME);
    expect(state).toMatchObject({ phase: "live", registered: false, match: null, me: null });
    await expect(joust.start(ME)).rejects.toThrow("Joust: the allegiance is not registered");
  });

  it("refuses a move past the joust's end but a surrender, and counts that game nowhere", async () => {
    const { joust, social, clock } = world();
    await social.createGuild(ME, draft);
    await joust.register(ME);
    clock.now = joustEndsAt(WEEK) - 60;
    const record = await joust.start(ME);
    clock.now = joustEndsAt(WEEK) + 1;
    await expect(joust.play(ME, record.id, { kind: "discard" })).rejects.toThrow("Joust: the joust is over");
    await joust.play(ME, record.id, { kind: "surrender" });
    expect(await joust.result(record.id)).toMatchObject({ late: true, bestAfter: null });
    expect((await joust.state(ME)).result).toMatchObject({ best: null, cobbles: 0 });
  });
});
