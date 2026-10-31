import { act, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  ATTACK_SHIELD_S,
  LEAGUE_FLOORS as CHAIN_LEAGUE_FLOORS,
  NEXT_PRICE as CHAIN_NEXT_PRICE,
  STAR_PERCENTS as CHAIN_STAR_PERCENTS,
  ViewError,
  leagueName,
  prizeOf,
  seasonRewardOf,
  starsOf,
  type Attack,
  type DecodedEvent,
} from "@paved/chain";
import { AttackRun, CAMPAIGNS, CENTER } from "@paved/game-core";
import { LEAGUES, LEAGUE_FLOORS, NEXT_PRICE, SHIELD_S, STAR_PERCENTS, stakesOf, starsFor } from "../src/lib/pvp-rules";
import { MOCK_SEASON_STARTS, mockRivals } from "../src/data/mock/pvp";
import {
  applyPvpEvents,
  moveCodes,
  pvpKeys,
  useDefenceLog,
  usePvpAttack,
  usePvpScout,
  usePvpSettled,
  usePvpStatus,
  usePvpWrites,
  useSeasonSpan,
} from "../src/data/pvp";
import { useVillageReward } from "../src/data/village";
import { PLAYER_ID } from "../src/mocks/players";
import { dataOf, fakeSources, renderData } from "./data-fakes";
import { mockImplementation } from "./mock-fakes";

// The PvP flow's hooks (#647 PR 2): their values on `FakeGameViews` and the indexer's fixture, a receipt into the cache, and
// the whole flow (search, scout, attack, result, reward) on the mock ledger, whose rules are the contracts'.

const event = (name: string, fields: Record<string, unknown>): DecodedEvent => ({ name, fields }) as unknown as DecodedEvent;
const key = (address: string) => BigInt(address).toString();
const RIVAL = mockRivals()[0]!;

/** The fakes with `RIVAL`'s village founded on chain, as `Village`'s views list it. */
function rivalChain() {
  const fakes = fakeSources();
  const v = fakes.views.villagePlayer(RIVAL.address);
  v.info = { ...v.info, gameId: 4, cells: RIVAL.cells.length, tiles: RIVAL.tiles.length - 1, score: RIVAL.score };
  v.cells = RIVAL.cells.map((c) => ({ ...c }));
  v.tiles = RIVAL.tiles.map((t) => ({ ...t }));
  return fakes;
}

const openAttack = (parcels: number): Attack => ({ id: 3, status: 1, defender: RIVAL.address, npc: false, parcels, target: RIVAL.score, board: 9, placed: 0, startedAt: 1, score: 0, stars: 0 });

describe("the PvP rules are the contracts'", () => {
  it("as @paved/chain mirrors them: stars, leagues, rewards, Next, the shield", () => {
    expect(STAR_PERCENTS).toEqual(CHAIN_STAR_PERCENTS);
    expect(LEAGUE_FLOORS).toEqual(CHAIN_LEAGUE_FLOORS);
    expect(NEXT_PRICE).toBe(CHAIN_NEXT_PRICE);
    expect(SHIELD_S).toBe(ATTACK_SHIELD_S);
    expect(LEAGUES.map((l) => [l.name, l.seasonCobbles])).toEqual(LEAGUES.map((l) => [leagueName(l.index), seasonRewardOf(l.index)]));
    for (const offer of [1, 20, 30, 59]) expect(stakesOf(offer, 7).win).toEqual([1, 2, 3].map((s) => prizeOf(offer, s)));
    for (const [score, target] of [[0, 0], [5, 0], [69, 100], [70, 100], [5643, 5130], [5642, 5130]]) expect(starsFor(score!, target!)).toBe(starsOf(score!, target!));
  });
});

describe("usePvpStatus", () => {
  it("reads the match, the attack, its deck, the shield and the league", async () => {
    const { sources, views } = fakeSources();
    views.pvp.villages.set(key(PLAYER_ID), { status: 1, draws: 4 });
    views.pvp.matches.set(key(PLAYER_ID), { opponent: RIVAL.address, offer: 30, cost: 20, started: true });
    views.pvp.attacks.set(key(PLAYER_ID), openAttack(2));
    views.pvp.decks.set(`${key(PLAYER_ID)}:3`, { size: 20, drawn: 1, hand: 9, bitmap: 1n });
    views.pvp.shields.set(key(PLAYER_ID), { queue: 2, up: true, seq: 1, until: 2_000 });
    views.pvp.leagues.set(key(PLAYER_ID), { season: 1, crowns: 450, league: 1, peak: 1, attacks: 2, pending: 0 });
    const { result } = renderData(() => usePvpStatus(PLAYER_ID), sources);
    const data = await dataOf(result);
    expect(data).toMatchObject({ joined: true, match: { offer: 30, started: true }, attack: { id: 3, status: 1 }, deck: { hand: 9 }, shield: { up: true }, league: { crowns: 450 } });
  });

  it("answers null without Matchmaker or Arena, and a failed read ends the wait", async () => {
    const none = fakeSources();
    none.views.pvpFail = new ViewError("not-configured", "Matchmaker address is not configured");
    const off = renderData(() => usePvpStatus(PLAYER_ID), none.sources);
    await waitFor(() => expect(off.result.current.data).toBeNull());
    expect(off.result.current.isPending).toBe(false);
    const down = fakeSources();
    down.views.pvpFail = new Error("node down");
    const failed = renderData(() => usePvpStatus(PLAYER_ID), down.sources);
    await waitFor(() => expect(failed.result.current.error?.message).toBe("node down"));
    expect(failed.result.current.isPending).toBe(false);
    expect(failed.result.current.data).toBeUndefined();
  });
});

describe("usePvpScout", () => {
  it("draws the defender's village on the board's coordinates, the stakes of the draw's offer and cost", async () => {
    const { sources } = rivalChain();
    const { result } = renderData(() => usePvpScout({ opponent: RIVAL.address, offer: 30, cost: 20, started: false }), sources);
    const data = await dataOf(result);
    expect(data.stakes).toEqual({ win: [10, 20, 30], loss: 20 });
    expect(data.village.score).toBe(RIVAL.score);
    expect(data.village.cells).toHaveLength(RIVAL.cells.length);
    expect(data.village.tiles[0]).toMatchObject({ id: 1, x: CENTER, y: CENTER });
  });
});

describe("usePvpScout of an NPC village", () => {
  it("reads its Story level from Arena.npc_level, never Village: its board, deck and target", async () => {
    const fakes = fakeSources();
    fakes.views.pvp.npcLevels.set(3, { campaign: 1, level: 2 });
    const story = CAMPAIGNS.find((c) => c.id === 1)!.levels.find((l) => l.id === 2)!;
    const { result } = renderData(() => usePvpScout({ opponent: "0x3", offer: 25, cost: 15, started: false }), fakes.sources);
    const data = await dataOf(result);
    expect(data.village.score).toBe(story.target);
    expect(data.tilesToPlay).toBe(story.deck.length);
    expect(data.village.tiles).toHaveLength(1 + (story.placed?.length ?? 0));
    expect(data.village.cells.length).toBeGreaterThan(0);
    expect(data.npc).toEqual({ title: story.title });
    expect(data.shielded).toBe(false);
    expect(fakes.views.calls).toContain("npc_level 3");
    expect(fakes.views.calls.some((c) => c.startsWith("village ") || c.startsWith("tiles ") || c.startsWith("cells "))).toBe(false);
  });

  it("says when a player's village drawn is shielded since: a free search replaces it", async () => {
    const fakes = rivalChain();
    fakes.views.pvp.shields.set(key(RIVAL.address), { queue: 2, up: true, seq: 1, until: 9_999_999_999 });
    const { result } = renderData(() => usePvpScout({ opponent: RIVAL.address, offer: 30, cost: 20, started: false }), fakes.sources);
    await waitFor(() => expect(result.current.data?.shielded).toBe(true));
    expect(result.current.data!.tilesToPlay).toBe(RIVAL.tiles.length - 1);
  });
});

describe("usePvpAttack", () => {
  it("plays the moves on the snapshot's territory, the hand from the deck, and keeps its engine for the next move", async () => {
    const fakes = rivalChain();
    const run = new AttackRun({ territory: RIVAL.cells.slice(0, 11) });
    const plan = RIVAL.tiles[1]!.plan;
    const cell = run.slots(plan)[0]!;
    const first = { plan, discard: false as const, orientation: run.orientations(plan, cell)[0]!, cell };
    fakes.views.pvp.moves.set(`${key(PLAYER_ID)}:3`, [first]);
    const attack = openAttack(2);
    const deck = { size: 20, drawn: 2, hand: RIVAL.tiles[2]!.plan, bitmap: 3n };
    const { result, client } = renderData(() => usePvpAttack(PLAYER_ID, attack, deck), fakes.sources);
    const data = await dataOf(result);
    expect(data.territory).toHaveLength(11);
    expect(data.tiles).toHaveLength(2);
    expect(data.score).toBe(AttackRun.replay({ territory: RIVAL.cells.slice(0, 11) }, [moveCodes(first)]).score);
    expect(data.remaining).toBe(19);
    expect(data.hand).toBe(deck.hand);
    const engine = data.run;
    // The next move's receipt: the same engine takes one move more, never replayed from the start.
    act(() => applyPvpEvents(client, PLAYER_ID, [event("AttackPlayed", { attacker: PLAYER_ID, id: 3, index: 1, plan: deck.hand, discard: true, orientation: 0, x: 0, y: 0 })]));
    await waitFor(() => expect(result.current.data?.run.played).toHaveLength(2));
    expect(result.current.data!.run).toBe(engine);
    expect(result.current.data!.delta).toBeLessThanOrEqual(0);
  });
});

describe("applyPvpEvents", () => {
  it("sets the match drawn, the hand drawn, and the end's crowns", async () => {
    const { sources } = fakeSources();
    const { client } = renderData(() => null, sources);
    client.setQueryData(pvpKeys.deck(PLAYER_ID, 3), { size: 3, drawn: 2, hand: 0, bitmap: 3n });
    client.setQueryData(pvpKeys.attack(PLAYER_ID), openAttack(0));
    applyPvpEvents(client, PLAYER_ID, [
      event("OpponentDrawn", { attacker: PLAYER_ID, opponent: "0xb0b", offer: 30, cost: 20, drawIndex: 1, paid: false }),
      event("TileDrawn", { attacker: PLAYER_ID, id: 3, draw: 2, plan: 12 }),
    ]);
    expect(client.getQueryData(pvpKeys.match(PLAYER_ID))).toEqual({ opponent: "0xb0b", offer: 30, cost: 20, started: false });
    expect(client.getQueryData(pvpKeys.deck(PLAYER_ID, 3))).toMatchObject({ drawn: 3, hand: 12 });
    applyPvpEvents(client, PLAYER_ID, [event("AttackFinished", { attacker: PLAYER_ID, defender: "0xb0b", id: 3, gameId: 1, score: 900, stars: 2, surrendered: "0x0", gained: 20, lost: 0 })]);
    expect(client.getQueryData(pvpKeys.settled(PLAYER_ID, 3))).toEqual({ score: 900, stars: 2, surrendered: false, gained: 20, lost: 0 });
    expect(client.getQueryData(pvpKeys.attack(PLAYER_ID))).toMatchObject({ status: 2, score: 900, stars: 2 });
  });
});

describe("the indexer's lists and the season", () => {
  it("useDefenceLog: the attacks on the village, newest first; usePvpSettled: the attack's row", async () => {
    const fakes = fakeSources();
    const row = (attacker: string, id: number, at: number, stars: number) => ({ attacker, id, defender: PLAYER_ID, npc: false, target: 1000, tiles: 20, score: 800, stars, surrendered: false, gained: stars * 10, lost: 0, opened_at: at - 60, finished_at: at });
    fakes.fixture.attacks = [row(RIVAL.address, 1, 100, 1), { ...row(RIVAL.address, 2, 200, 2), attacker: RIVAL.address }, { ...row(PLAYER_ID, 5, 300, 3), defender: RIVAL.address }];
    const { result } = renderData(() => ({ log: useDefenceLog(PLAYER_ID), settled: usePvpSettled(PLAYER_ID, 5) }), fakes.sources);
    await waitFor(() => expect(result.current.log.data).toHaveLength(2));
    expect(result.current.log.data!.map((a) => a.id)).toEqual([2, 1]);
    await waitFor(() => expect(result.current.settled.data).toMatchObject({ stars: 3, gained: 30, target: 1000, defender: RIVAL.address }));
  });

  it("usePvpSettled completes a cached receipt with the row's target and defender, and tells the row's failure", async () => {
    const fakes = fakeSources();
    fakes.fixture.attacks = [{ attacker: PLAYER_ID, id: 1, defender: RIVAL.address, npc: false, target: 900, tiles: 20, score: 700, stars: 1, surrendered: false, gained: 10, lost: 0, opened_at: 1, finished_at: 2 }];
    const receipt = { score: 700, stars: 1, surrendered: false, gained: 10, lost: 0 };
    const merged = renderData(() => usePvpSettled(PLAYER_ID, 1), fakes.sources);
    merged.client.setQueryData(pvpKeys.settled(PLAYER_ID, 1), receipt);
    merged.rerender();
    await waitFor(() => expect(merged.result.current.data).toMatchObject({ ...receipt, target: 900, defender: RIVAL.address }));
    // The row's read fails: the receipt stays, the failure is told.
    const down = fakeSources();
    const failing = renderData(() => usePvpSettled(PLAYER_ID, 1), { ...down.sources, indexer: new Proxy(down.indexer, { get: (t, k) => (k === "playerAttack" ? () => Promise.reject(new Error("indexer down")) : Reflect.get(t, k, t)) }) });
    failing.client.setQueryData(pvpKeys.settled(PLAYER_ID, 1), receipt);
    failing.rerender();
    await waitFor(() => expect(failing.result.current.error?.message).toBe("indexer down"));
    expect(failing.result.current.data).toMatchObject(receipt);
  });

  it("usePvpSettled finds an attack however old: by its id, not in the latest page", async () => {
    const fakes = fakeSources();
    fakes.fixture.attacks = Array.from({ length: 30 }, (_, i) => ({ attacker: PLAYER_ID, id: i + 1, defender: RIVAL.address, npc: false, target: 900, tiles: 20, score: 100 * i, stars: i % 4, surrendered: false, gained: 0, lost: 0, opened_at: i, finished_at: 1_000 + i }));
    const { result } = renderData(() => ({ old: usePvpSettled(PLAYER_ID, 1), none: usePvpSettled(PLAYER_ID, 99) }), fakes.sources);
    await waitFor(() => expect(result.current.old.data).toMatchObject({ score: 0, target: 900 }));
    await waitFor(() => expect(result.current.none.data).toBeNull());
  });

  it("useSeasonSpan: a season's start and end, none before the clock", async () => {
    const fakes = fakeSources();
    fakes.views.pvp.seasonStarts.set(2, 1_000).set(3, 9_000);
    const { result } = renderData(() => ({ two: useSeasonSpan(2), zero: useSeasonSpan(0) }), fakes.sources);
    await waitFor(() => expect(result.current.two.data).toEqual({ start: 1_000, end: 9_000 }));
    expect(result.current.zero.data).toEqual({ start: 0, end: 0 });
  });
});

describe("the flow on the mock ledger", () => {
  it("searches, scouts, attacks to the end, then settles the crowns and grants a village reward", async () => {
    const mock = mockImplementation();
    const me = mock.sources.signer!.address;
    await mock.ledger.writesFor(me).foundVillage();
    const { result } = renderData(
      () => {
        const status = usePvpStatus(me);
        const s = status.data;
        return { status, scout: usePvpScout(s?.match ?? null), attack: usePvpAttack(me, s?.attack ?? null, s?.deck ?? null), writes: usePvpWrites(me), reward: useVillageReward(me), settled: usePvpSettled(me, 1) };
      },
      mock.sources,
    );
    await waitFor(() => expect(result.current.status.data?.joined).toBe(true));
    expect(result.current.status.data!.match.opponent).toBe("0x0");

    // Search: an opponent drawn, its village and the stakes scouted.
    await act(() => result.current.writes.search());
    await waitFor(() => expect(result.current.scout.data).toBeTruthy());
    const match = result.current.status.data!.match;
    expect(match.started).toBe(false);
    expect(result.current.scout.data!.stakes.loss).toBe(match.cost);
    // Next: without a Cobble it is refused, and nothing moves.
    await expect(act(() => result.current.writes.next())).rejects.toMatchObject({ reason: "not-enough-cobbles" });

    // Attack: the snapshot's tiles drawn one by one, each placed where it fits or discarded.
    await act(() => result.current.writes.start());
    await waitFor(() => expect(result.current.attack.data?.hand).toBeGreaterThan(0));
    const total = result.current.attack.data!.remaining;
    for (let i = 0; i < total; i++) {
      await waitFor(() => expect(result.current.attack.data?.run.played).toHaveLength(i));
      const { run, hand } = result.current.attack.data!;
      const cell = run.slots(hand)[0];
      await act(() => result.current.writes.play(cell ? { discard: false, orientation: run.orientations(hand, cell)[0]!, cell } : { discard: true }));
    }
    await waitFor(() => expect(result.current.status.data?.attack.status).toBe(2));
    const settled = result.current.settled.data!;
    const attack = result.current.status.data!.attack;
    expect(attack.stars).toBe(starsFor(attack.score, attack.target));
    expect(settled.stars).toBe(attack.stars);
    await waitFor(() => expect(result.current.status.data!.league.crowns).toBe(settled.gained - settled.lost));
    expect(result.current.status.data!.match.opponent).toBe("0x0");
    // The settlement granted a village reward (#642): one more waits to be opened.
    await waitFor(() => expect(result.current.reward.data?.pending).toBe(4));
    expect(mock.ledger.attacksOf(me, "attacker")).toMatchObject([{ id: 1, stars: attack.stars, gained: settled.gained }]);
    // The rival is shielded: the next search draws another.
    expect(await mock.ledger.pvpShield(attack.defender)).toMatchObject({ up: true });
  });

  it("refuses a search before the village is founded, and a play with no attack", async () => {
    const mock = mockImplementation();
    const me = mock.sources.signer!.address;
    const writes = mock.ledger.writesFor(me);
    await expect(writes.drawOpponent("search")).rejects.toMatchObject({ reason: "not-joined" });
    await expect(writes.playAttack({ discard: true })).rejects.toMatchObject({ reason: "no-attack" });
    expect(MOCK_SEASON_STARTS[0]).toBeLessThan(Date.UTC(2026, 9, 1) / 1000);
  });
});
