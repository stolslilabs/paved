import { describe, expect, it } from "vitest";
import { CENTER, GUILD_RANK, JOUST_GAMES, JOUST_WIN_COBBLES, JOUST_START_RATING, OrientationType, SeededChallenge, joustEndsAt, joustOpensAt, joustWeekOf, joustWeekStart, type GuildDraft, type SeededMove } from "@paved/game-core";
import type { JoustGameRecord } from "../src/data/joust-source";
import { JOUST_FIRST_WEEK, claim, cobblesOf, historyOf, freshJoust, settleJoust, stateOf, type StoredJoust } from "../src/data/mock/joust";
import { seededGuildWorld, type GuildPeople, type StoredGuild } from "../src/data/mock/guilds";
import { MockLedger } from "../src/data/mock/ledger";
import { mockJoust, mockSocial } from "../src/data/mock/overlay";
import { memoryStore } from "./data-fakes";

// The mock's Joust (the weekly allegiance event, all on the client): the calendar's phases, the registration, the draw, the games
// (three, the week's boost, the best counted), the result with its rating and Cobbles, and a new joust each week.

const ME = "0x51a7";
const OTHER = "0x51a8";
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

describe("the mock's Joust keeps a week as it was drawn (#1156, point 1)", () => {
  const people = (() => ({ name: "A jouster" })) as unknown as GuildPeople;
  const MONDAY = joustEndsAt(WEEK) + 3_600;

  /** The seeded world and an allegiance of two accounts (ME, OTHER) registered for WEEK, OTHER's game of 1,500 points stored. */
  function drawn(): { guilds: StoredGuild[]; joust: StoredJoust; ours: StoredGuild } {
    const guilds = seededGuildWorld().guilds;
    const member = (address: string, rank: number) => ({ address, rank, joinedAt: 0, lastKick: null, rankChange: { rank, at: 0 } });
    const ours: StoredGuild = { ...structuredClone(guilds[0]!), id: 900, name: "Stone Road", createdAt: 0, members: [member(ME, GUILD_RANK.leader), member(OTHER, GUILD_RANK.member)] };
    const joust = freshJoust();
    joust.registrations[WEEK] = [ours.id];
    const end = joustOpensAt(WEEK) + 600;
    joust.games[1] = { id: 1, week: WEEK, day: Math.floor(end / 86_400), guild: ours.id, player: OTHER, seed: "0x1", moves: [], score: 1_500, over: true, start: end - 300, end };
    return { guilds: [...guilds, ours], joust, ours };
  }

  it("counts a game for the allegiance it recorded, and pays it, after its player left", () => {
    const { guilds, joust, ours } = drawn();
    expect(historyOf(joust, guilds, MONDAY).weeks.get(WEEK)!.get(ours.id)).toMatchObject({ total: 1_500 });
    ours.members = ours.members.filter((m) => m.address !== OTHER);
    expect(historyOf(joust, guilds, MONDAY).weeks.get(WEEK)!.get(ours.id)).toMatchObject({ total: 1_500 });
    expect(claim(joust, guilds, people, OTHER, WEEK, MONDAY)).toBeGreaterThan(0);
  });

  it("shows the departed jouster their earned result and its Claim in the week's state, in no allegiance or in another", () => {
    const { guilds, joust, ours } = drawn();
    const earned = stateOf(joust, guilds, people, MONDAY, OTHER).result!;
    expect(earned).toMatchObject({ week: WEEK, own: { guild: { id: ours.id }, total: 1_500 }, best: 1_500, place: 1, claimed: false });
    expect(earned.cobbles).toBeGreaterThan(0);
    settleJoust(joust, guilds, MONDAY);
    ours.members = ours.members.filter((m) => m.address !== OTHER);
    let state = stateOf(joust, guilds, people, MONDAY, OTHER);
    expect(state).toMatchObject({ guild: null, result: earned });
    // In another allegiance since: the result shown is still the one their game recorded.
    const other = guilds.find((g) => g.id !== ours.id)!;
    other.members.push({ address: OTHER, rank: GUILD_RANK.recruit, joinedAt: MONDAY - 60, lastKick: null, rankChange: { rank: GUILD_RANK.recruit, at: MONDAY - 60 } });
    state = stateOf(joust, guilds, people, MONDAY, OTHER);
    expect(state.guild?.id).toBe(other.id);
    expect(state.result).toEqual(earned);
    expect(claim(joust, guilds, people, OTHER, WEEK, MONDAY)).toBe(earned.cobbles);
    expect(stateOf(joust, guilds, people, MONDAY, OTHER).result).toMatchObject({ claimed: true });
  });

  it("leaves a completed bye's rating where it was and pays its jousters a win's Cobbles (#1156, validation)", () => {
    const { joust, ours } = drawn();
    // Alone in the draw: the forced bye.
    const entry = historyOf(joust, [ours], MONDAY).weeks.get(WEEK)!.get(ours.id)!;
    expect(entry).toMatchObject({ opponent: null, outcome: "bye", total: 1_500, before: JOUST_START_RATING, after: JOUST_START_RATING });
    expect(cobblesOf("bye")).toBe(JOUST_WIN_COBBLES);
    const result = stateOf(joust, [ours], people, MONDAY, OTHER).result!;
    expect(result).toMatchObject({ outcome: "bye", opponent: null, expected: 1, cobbles: JOUST_WIN_COBBLES });
    expect(result.ratingAfter).toBe(result.ratingBefore);
    expect(claim(joust, [ours], people, OTHER, WEEK, MONDAY)).toBe(JOUST_WIN_COBBLES);
    // ME did not joust: nothing to claim.
    expect(() => claim(joust, [ours], people, ME, WEEK, MONDAY)).toThrow("Joust: nothing to claim");
  });

  it("keeps the recorded rosters, draws and ratings when a drawn member leaves or the allegiance disbands", () => {
    const { guilds, joust, ours } = drawn();
    settleJoust(joust, guilds, MONDAY);
    const before = historyOf(joust, guilds, MONDAY);
    // A seeded allegiance's jouster with a best leaves, and ours disbands: every week drawn stays as recorded.
    const seeded = guilds.find((g) => before.weeks.get(WEEK)!.get(g.id)?.total && g.id !== ours.id)!;
    const leaver = before.weeks.get(WEEK)!.get(seeded.id)!.roster[0]!;
    seeded.members = seeded.members.filter((m) => m.address !== leaver);
    const after = historyOf(joust, guilds.filter((g) => g !== ours), MONDAY);
    expect([...after.weeks]).toEqual([...before.weeks]);
    expect(after.ratings.get(seeded.id)).toBe(before.ratings.get(seeded.id));
    expect(claim(joust, guilds.filter((g) => g !== ours), people, OTHER, WEEK, MONDAY)).toBeGreaterThan(0);
  });

  it("records the week on the ledger's writes: a member kicked after their game still counts and claims", async () => {
    const { joust, social, clock } = world();
    const gid = await social.createGuild(ME, draft);
    await social.joinGuild(OTHER, gid);
    await joust.register(ME);
    clock.now = joustOpensAt(WEEK) + 3_600;
    const record = await joust.start(OTHER);
    const engine = new SeededChallenge(BigInt(record.seed), BigInt(record.player), BigInt(record.deckSeed), record.boost);
    while (!engine.over) {
      const p = engine.rules.legalPlacements()[0];
      const move: SeededMove = p ? { kind: "build", orientation: ORIENTATIONS.indexOf(p.orientation), x: CENTER + p.x, y: CENTER + p.y } : { kind: "discard" };
      engine.play(move);
      await joust.play(OTHER, record.id, move);
    }
    clock.now += 3_600;
    await social.kick(ME, OTHER, "");
    expect((await joust.state(ME)).match!.own.total).toBe(engine.score);
    clock.now = MONDAY;
    expect((await joust.state(ME)).result!.own.total).toBe(engine.score);
    expect((await joust.claim(OTHER, WEEK)).cobbles).toBeGreaterThan(0);
  });
});
