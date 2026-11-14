import { beforeEach, describe, expect, it } from "vitest";
import { CONQUEST_PROVINCE, JOUST_START_RATING, conquestDayStart, conquestEndsAt, conquestFinalCobbles, conquestOf, conquestOpensAt, conquestPhaseCobbles, conquestStart, type GuildDraft } from "@paved/game-core";
import { forgetConquests } from "../src/data/mock/conquest";
import { seededGuildWorld } from "../src/data/mock/guilds";
import { MockLedger } from "../src/data/mock/ledger";
import { mockConquest, mockSocial } from "../src/data/mock/overlay";
import { memoryStore } from "./data-fakes";

// The mock's Conquest (the season's finale, all on the client): the registration, the world and its seats, a member's day (the
// Offerings, the order, the exploration), a Leader's request and the gift that builds, the tree, the community's part, the phases'
// results and the final one with their Cobbles, a refusal that leaves everything as it was, and the next Conquest after the last.

const ME = "0x51a7";
const N = conquestOf(Date.parse("2026-11-14T12:00:00Z") / 1000);
const HOUR = 3_600;
/** The second day of the registration, at noon. */
const REGISTRATION = conquestStart(N) + 86_400 + 12 * HOUR;
const at = (day: number, hour = 12): number => conquestDayStart(N, day) + hour * HOUR;
const QUARRYMEN = seededGuildWorld().guilds[0]!;
const SEEDED = seededGuildWorld().guilds.length;
const draft: GuildDraft = { name: "Stone Road", emblem: { icon: 1, primary: 2, secondary: 3 }, description: "We pave.", joinType: "open", requirements: { level: 0, crowns: 0 } };

function world(start = REGISTRATION, store = memoryStore()) {
  const clock = { now: start };
  const ledger = new MockLedger({ store: () => store, seller: "0x3", latencyMs: 0, now: () => clock.now });
  return { clock, ledger, conquest: mockConquest(ledger), social: mockSocial(ledger), store };
}

beforeEach(() => forgetConquests());

describe("the mock's Conquest: the registration and the world", () => {
  it("opens with three days of registration: the community's allegiances register by themselves, an account's by its Leader", async () => {
    const { conquest, social, clock } = world(conquestStart(N) + 60);
    let state = await conquest.state(ME);
    expect(state).toMatchObject({ conquest: N, phase: "registration", day: 0, rest: false, phaseEndsAt: conquestOpensAt(N), endsAt: conquestEndsAt(N), guild: null, leads: false, entered: false, side: 0, zones: [], allegiance: null, me: null, final: null });
    await expect(conquest.register(ME)).rejects.toThrow("Conquest: not in an allegiance");
    await social.createGuild(ME, draft);
    state = await conquest.state(ME);
    expect(state).toMatchObject({ guild: { name: "Stone Road" }, leads: true, entered: false });
    expect((await conquest.register(ME)).conquest).toBe(N);
    await expect(conquest.register(ME)).rejects.toThrow("Conquest: already registered");
    expect((await conquest.state(ME)).entered).toBe(true);
    // The community's leaders register at a time of their own, all of them before day 1.
    const early = (await conquest.state(ME)).registered.length;
    clock.now = conquestOpensAt(N) - HOUR;
    const late = (await conquest.state(ME)).registered;
    expect(late.length).toBeGreaterThan(early);
    expect(late).toHaveLength(SEEDED + 1);
    await expect(conquest.zone(ME, 0)).rejects.toThrow("Conquest: no such zone");
  });

  it("draws the world on day 1: a checkerboard, the best season's Joust rating at the centre, an allegiance the Leader forgot too", async () => {
    const { conquest, social, clock } = world();
    await social.createGuild(ME, draft);
    clock.now = at(1, 0);
    const state = await conquest.state(ME);
    expect(state).toMatchObject({ phase: "foundation", day: 1, entered: true, side: 5, phaseEndsAt: at(8, 0), nextDayAt: at(2, 0) });
    expect(state.registered).toHaveLength(SEEDED + 1);
    expect(state.zones).toHaveLength(25);
    expect(state.zones.filter((z) => z.province)).toHaveLength(13);
    expect(state.zones.filter((z) => z.guild !== null)).toHaveLength(SEEDED + 1);
    expect(state.zones[12]!.guild).toEqual(state.registered[0]);
    // A new allegiance starts from the base rating: behind every one that won a joust.
    expect(JOUST_START_RATING).toBe(1_000);
    const home = state.zones[state.home!]!;
    expect(home).toMatchObject({ mine: true, open: true, province: true, guild: { name: "Stone Road" }, tiles: 0, explored: 9 });
    expect(state.zones.filter((z) => z.open)).toEqual([home]);
    expect(state.allegiance).toMatchObject({ score: 0, knowledge: 0, tiles: 0, members: 1, orders: { given: 0, used: 0, left: 0 } });
    const zone = await conquest.zone(ME, home.index);
    expect(zone).toMatchObject({ x0: home.col * CONQUEST_PROVINCE, y0: home.row * CONQUEST_PROVINCE, size: CONQUEST_PROVINCE, canExplore: true });
    expect(zone.tiles.map((t) => t.kind).sort()).toEqual(["capital", "wonder", "wonder"]);
    expect(zone.frontier).toHaveLength(4);
    // Without an account: the world alone.
    expect(await conquest.state(null)).toMatchObject({ guild: null, me: null, allegiance: null, home: null });
  });
});

describe("the mock's Conquest: a member's day", () => {
  it("makes the Offerings that wait, gives the day's order, explores one cell, and leaves the requests to the Officers", async () => {
    const { conquest, social, clock } = world();
    await social.joinGuild(ME, QUARRYMEN.id);
    clock.now = at(1, 6);
    let state = await conquest.state(ME);
    expect(state).toMatchObject({ guild: { name: "The Quarrymen" }, leads: false, entered: true });
    expect(state.me).toMatchObject({ waiting: 3, nextAt: at(1, 8), every: 7_200, orderToday: false, exploredToday: false, days: 0 });
    const before = state.allegiance!;
    expect(await conquest.offer(ME)).toEqual({ knowledge: 3, order: true });
    await expect(conquest.offer(ME)).rejects.toThrow("Conquest: no Offering yet");
    state = await conquest.state(ME);
    expect(state.me).toMatchObject({ waiting: 0, orderToday: true, days: 1, knowledge: 3 });
    expect(state.allegiance!.knowledge).toBe(before.knowledge + 3);
    expect(state.allegiance!.orders.given).toBe(before.orders.given + 1);
    const home = await conquest.zone(ME, state.home!);
    const explored = new Set(home.explored.map((c) => `${c.x},${c.y}`));
    const cell = { x: home.x0, y: home.y0 };
    expect(explored.has(`${cell.x},${cell.y}`)).toBe(false);
    const found = await conquest.explore(ME, cell);
    expect([5, 10, 20, 40, 100]).toContain(found.knowledge);
    await expect(conquest.explore(ME, { x: home.x0 + 1, y: home.y0 })).rejects.toThrow("Conquest: already explored today");
    state = await conquest.state(ME);
    expect(state.me).toMatchObject({ exploredToday: true, explored: 1, knowledge: 3 + found.knowledge });
    expect((await conquest.zone(ME, state.home!)).canExplore).toBe(false);
    // A free zone is closed until Frontiers.
    const free = state.zones.find((z) => !z.province)!;
    clock.now = at(2, 6);
    await expect(conquest.explore(ME, { x: free.col * CONQUEST_PROVINCE, y: free.row * CONQUEST_PROVINCE })).rejects.toThrow("Conquest: the zone is closed");
    const spot = (await conquest.zone(ME, state.home!)).frontier[0];
    if (spot) {
      const fits = (await conquest.options(ME, spot.x, spot.y)).plans[0]!;
      await expect(conquest.request(ME, { ...spot, plan: fits.plan, orientation: fits.orientations[0]! })).rejects.toThrow("Conquest: only an Officer or the Leader opens a request");
    }
    await expect(conquest.research(ME, "cities")).rejects.toThrow("Conquest: only an Officer or the Leader buys a level");
    // The members' list: the viewer among the community's.
    const members = await conquest.members(ME);
    expect(members).toHaveLength(QUARRYMEN.members.length + 1);
    expect(members.find((m) => m.me)).toMatchObject({ explored: 1, days: 1, tiles: 0, rank: 0 });
  });

  it("builds a Leader's request with a tile of their own: one order, the tile out of the inventory, its Cobbles", async () => {
    const { conquest, social, clock, ledger } = world();
    await social.createGuild(ME, draft);
    await ledger.foundFreeVillage(ME);
    // An empty village: its eight tiles are spare.
    await ledger.saveLayout(ME, []);
    clock.now = at(1, 6);
    const home = (await conquest.state(ME)).home!;
    const spot = (await conquest.zone(ME, home)).frontier[0]!;
    const options = await conquest.options(ME, spot.x, spot.y);
    expect(options.plans.length).toBeGreaterThan(0);
    const held = options.plans.find((p) => p.held > 0)!;
    const missing = options.plans.find((p) => p.held === 0)!;
    expect(held).toMatchObject({ holders: 1 });
    // A tile the Leader does not hold: the request stands, the gift is refused.
    const wanted = await conquest.request(ME, { ...spot, plan: missing.plan, orientation: missing.orientations[0]! });
    await expect(conquest.give(ME, wanted.id)).rejects.toThrow("Conquest: you hold no spare tile of this plan");
    // A new request on the cell replaces it.
    const { id } = await conquest.request(ME, { ...spot, plan: held.plan, orientation: held.orientations[0]! });
    let state = await conquest.state(ME);
    expect(state.requests).toHaveLength(1);
    expect(state.requests[0]).toMatchObject({ id, x: spot.x, y: spot.y, plan: held.plan, held: held.held, holders: 1, zone: home, cobbles: held.cobbles });
    await expect(conquest.give(ME, id)).rejects.toThrow("Conquest: no order left today");
    // The refusal left the world as it was.
    expect((await conquest.state(ME)).requests).toHaveLength(1);
    await conquest.offer(ME);
    const inventory = (await ledger.inventory(ME))[held.plan - 1]!;
    const cobbles = (await ledger.account(ME)).cobbles;
    const given = await conquest.give(ME, id);
    expect(given).toMatchObject({ cobbles: held.cobbles, ordersLeft: 0 });
    expect((await ledger.inventory(ME))[held.plan - 1]).toBe(inventory - 1);
    expect((await ledger.account(ME)).cobbles).toBe(cobbles + held.cobbles);
    state = await conquest.state(ME);
    expect(state.requests).toHaveLength(0);
    expect(state.allegiance).toMatchObject({ tiles: 1, orders: { given: 1, used: 1, left: 0 } });
    expect(state.me).toMatchObject({ tiles: 1 });
    const zone = await conquest.zone(ME, home);
    expect(zone.tiles.find((t) => t.x === spot.x && t.y === spot.y)).toMatchObject({ plan: held.plan, kind: "tile", mine: true });
    expect(zone.zone).toMatchObject({ tiles: 1, own: 1 });
  });

  it("buys the tree's levels with the allegiance's Knowledge", async () => {
    const { conquest, social, clock } = world();
    await social.createGuild(ME, draft);
    clock.now = at(1, 23);
    await expect(conquest.research(ME, "cities")).rejects.toThrow("Conquest: not enough Knowledge");
    for (let day = 1; day <= 4; day++) {
      clock.now = at(day, 23);
      await conquest.offer(ME);
    }
    const before = (await conquest.state(ME)).allegiance!;
    expect(before.knowledge).toBeGreaterThanOrEqual(40);
    expect(await conquest.research(ME, "cities")).toEqual({ level: 1, cost: 40 });
    const after = (await conquest.state(ME)).allegiance!;
    expect(after.levels).toEqual({ roads: 0, cities: 1, forests: 0, wonders: 0, devotion: 0 });
    expect(after.knowledge).toBe(before.knowledge - 40);
    expect(after.earned).toBe(before.earned);
  });
});

describe("the mock's Conquest: the community, the results and the loop", () => {
  it("plays the community's part: Offerings, explorations, levels, requests and tiles, the same however it is read", async () => {
    const a = world(at(5));
    await a.conquest.state(null);
    a.clock.now = at(13);
    const middle = await a.conquest.ranking(null);
    expect(middle.rows).toHaveLength(SEEDED);
    a.clock.now = at(21, 1);
    const stepped = await a.conquest.ranking(null);
    forgetConquests();
    const started = Date.now();
    const direct = await world(at(21, 1)).conquest.ranking(null);
    // A whole Conquest played from its day 1, in one read.
    expect(Date.now() - started).toBeLessThan(5_000);
    expect(direct).toEqual(stepped);
    expect(direct.rows.every((r, i) => r.place === i + 1 && (i === 0 || direct.rows[i - 1]!.total >= r.total))).toBe(true);
    const state = await a.conquest.state(QUARRYMEN.members[0]!.address);
    expect(state.allegiance!.tiles).toBeGreaterThan(20);
    expect(state.allegiance!.explored).toBeGreaterThan(40);
    expect(state.allegiance!.earned).toBeGreaterThan(500);
    expect(Object.values(state.allegiance!.levels).some((level) => level > 0)).toBe(true);
    expect(direct.rows.some((r) => r.total > 0)).toBe(true);
    // In Frontiers some allegiance built outside its province.
    expect(state.zones.filter((z) => !z.province).some((z) => z.explored > 0)).toBe(true);
  });

  it("pays each phase and the final rank to a member with enough days of Offerings, once", async () => {
    const { conquest, social, clock, ledger } = world();
    await social.joinGuild(ME, QUARRYMEN.id);
    for (const day of [1, 2, 3]) {
      clock.now = at(day, 20);
      await conquest.offer(ME);
    }
    clock.now = at(6, 20);
    expect((await conquest.state(ME)).results).toEqual([]);
    await expect(conquest.claim(ME, N)).rejects.toThrow("Conquest: nothing to claim");
    // The rest day: Foundation's result is in.
    clock.now = at(7, 1);
    let state = await conquest.state(ME);
    expect(state).toMatchObject({ phase: "foundation", rest: true, day: 7 });
    expect(state.results).toHaveLength(1);
    const foundation = state.results[0]!;
    expect(foundation).toMatchObject({ phase: "foundation", of: SEEDED, days: 3, eligible: true, claimed: false, cobbles: conquestPhaseCobbles(foundation.place) });
    expect(foundation.podium).toHaveLength(3);
    expect(state.toClaim).toBe(foundation.cobbles);
    const cobbles = (await ledger.account(ME)).cobbles;
    // A part that is not in yet pays nothing; the phase's own does.
    await expect(conquest.claim(ME, N, "awakening")).rejects.toThrow("Conquest: nothing to claim");
    expect(await conquest.claim(ME, N, "foundation")).toEqual({ cobbles: foundation.cobbles });
    expect((await ledger.account(ME)).cobbles).toBe(cobbles + foundation.cobbles);
    expect(foundation.part).toEqual({ tiles: 0, explored: 0, knowledge: (await conquest.state(ME)).me!.knowledge });
    await expect(conquest.claim(ME, N)).rejects.toThrow("Conquest: nothing to claim");
    // Six more days of Offerings: nine in all, the final rank pays.
    for (const day of [8, 9, 10, 15, 16, 17]) {
      clock.now = at(day, 20);
      await conquest.offer(ME);
    }
    clock.now = at(21, 1);
    state = await conquest.state(ME);
    expect(state).toMatchObject({ phase: "results", day: 21, phaseEndsAt: conquestEndsAt(N) });
    expect(state.results.map((r) => [r.phase, r.eligible, r.claimed])).toEqual([["foundation", true, true], ["awakening", true, false], ["frontiers", true, false]]);
    const final = state.final!;
    expect(final).toMatchObject({ conquest: N, of: SEEDED, days: 9, eligible: true, claimed: false, cobbles: conquestFinalCobbles(final.place) });
    expect(final.score).toBe(final.foundation + final.awakening + final.frontiers);
    const due = final.cobbles + state.results[1]!.cobbles + state.results[2]!.cobbles;
    expect(state.toClaim).toBe(due);
    await expect(conquest.offer(ME)).rejects.toThrow("Conquest: the Offerings are over");
    // The next Conquest's registration opens when this one ends: the last result is still there, and paid.
    clock.now = conquestEndsAt(N) + HOUR;
    state = await conquest.state(ME);
    expect(state).toMatchObject({ conquest: N + 1, phase: "registration", day: 0, side: 0, final: null, toClaim: 0 });
    expect(state.previous).toMatchObject({ conquest: N, place: final.place, score: final.score, toClaim: due });
    expect(await conquest.claim(ME, N)).toEqual({ cobbles: due });
    expect((await conquest.state(ME)).previous).toMatchObject({ claimed: true, toClaim: 0 });
    await expect(conquest.claim(ME, N - 1)).rejects.toThrow("Conquest: nothing to claim");
    // And the new world is drawn three days later.
    clock.now = conquestOpensAt(N + 1) + HOUR;
    expect(await conquest.state(ME)).toMatchObject({ conquest: N + 1, phase: "foundation", day: 1, entered: true, side: 5 });
  });

  it("plays an account's stored acts again among the community's on another device's read", async () => {
    const first = world();
    await first.social.joinGuild(ME, QUARRYMEN.id);
    first.clock.now = at(1, 6);
    await first.conquest.offer(ME);
    const home = (await first.conquest.state(ME)).home!;
    const zone = await first.conquest.zone(ME, home);
    await first.conquest.explore(ME, { x: zone.x0 + 2, y: zone.y0 + 2 });
    first.clock.now = at(3);
    const seen = await first.conquest.state(ME);
    forgetConquests();
    const again = await world(at(3), first.store).conquest.state(ME);
    expect(again).toEqual(seen);
    expect(again.me).toMatchObject({ days: 1, explored: 1 });
  });
});
