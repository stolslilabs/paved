/** The PvP flow's reads and writes (#647 PR 2): `Matchmaker`'s and `Arena`'s views through the codec, the fakes, the writes and their typed refusals, the crowns and the leagues. */
import { describe, expect, test, vi } from "vitest";
import matchmakerAbi from "../../../contracts/abis/Matchmaker.json";
import arenaAbi from "../../../contracts/abis/Arena.json";
import { createCodecs } from "../src/abis";
import { CONTROLLER_ENTRY_POINTS, controllerPolicies } from "../src/auth/controller";
import { AbiCodec, type Abi } from "../src/codec";
import { resolveDeployment } from "../src/deployment";
import {
  LEAGUE_STATUS_FIELDS,
  MATCHMAKER_VILLAGE_FIELDS,
  MATCH_FIELDS,
  NPC_LEVEL_FIELDS,
  SHIELD_FIELDS,
  costOf,
  hasPvpViews,
  isNpcAddress,
  groupsOf,
  leagueName,
  leagueOfCrowns,
  nextCalls,
  offerOf,
  prizeOf,
  searchCalls,
  seasonRewardOf,
} from "../src/matchmaker";
import { PavedClient, type PavedRpc } from "../src/paved-client";
import { FakeGameViews, RpcGameViews, ViewError, type CallProvider } from "../src/views";
import { vrfSalt } from "../src/vrf";
import { PvpRefusedError, WriteError } from "../src/writer";

const MATCHMAKER = "0xa";
const ARENA = "0xb";
const PLAYER = "0x5";
const CENTER = 0x7fffffff;
const hex = (n: number | bigint) => `0x${n.toString(16)}`;
const env = (extra: Record<string, string> = {}) => ({ rpcUrl: "http://x", addresses: { Challenge: "0x2", Setup: "0x3", Matchmaker: MATCHMAKER, Arena: ARENA, ...extra } });
const deployment = resolveDeployment({ network: "devnet", env: env() });
const withVrf = resolveDeployment({ network: "devnet", env: env(), file: { contracts: { MockVrfProvider: { address: "0x77" } } } });
const bare = resolveDeployment({ network: "devnet", env: { rpcUrl: "http://x", addresses: { Challenge: "0x2", Setup: "0x3" } } });
const codecs = createCodecs();

function views(answer: (entrypoint: string, calldata: string[]) => string[], dep = deployment) {
  const calls: Array<{ contractAddress: string; entrypoint: string; calldata: string[] }> = [];
  const provider: CallProvider = {
    callContract: async (call) => {
      calls.push(call);
      return answer(call.entrypoint, call.calldata);
    },
  };
  return { views: new RpcGameViews(provider, dep, codecs), calls };
}

type Receipt = { execution_status?: string; revert_reason?: string; events?: unknown[] };

function writerWith(options: { receipt?: Receipt; dep?: typeof deployment } = {}) {
  const execute = vi.fn(async (_calls: Array<{ contractAddress: string; entrypoint: string; calldata: string[] }>) => ({ transaction_hash: "0x1" }));
  const rpc = {
    callContract: async () => [],
    getEvents: async () => ({ events: [] }),
    waitForTransaction: async () => options.receipt ?? { execution_status: "SUCCEEDED", events: [] },
  } as unknown as PavedRpc;
  const writer = new PavedClient(options.dep ?? deployment, rpc, codecs, new FakeGameViews()).writer({ address: PLAYER, execute });
  return { writer, execute };
}

const sent = (execute: ReturnType<typeof writerWith>["execute"]) => execute.mock.calls[0]![0].map((c) => [BigInt(c.contractAddress), c.entrypoint]);

describe("Matchmaker's ABI", () => {
  const codec = new AbiCodec(matchmakerAbi as Abi);
  test("the view structs have the fields the decoders read, in order", () => {
    expect(codec.structFields("paved::systems::matchmaker::Match")).toEqual(MATCH_FIELDS);
    expect(codec.structFields("paved::systems::matchmaker::Village")).toEqual(MATCHMAKER_VILLAGE_FIELDS);
    expect(codec.structFields("paved::systems::matchmaker::LeagueStatus")).toEqual(LEAGUE_STATUS_FIELDS);
    expect(codec.structFields("paved::components::shieldable::Shield")).toEqual(SHIELD_FIELDS);
    expect(new AbiCodec(arenaAbi as Abi).structFields("paved::systems::arena::NpcLevel")).toEqual(NPC_LEVEL_FIELDS);
  });

  test("it has the writes and views the client uses", () => {
    for (const name of ["search", "next", "current_match", "village", "league", "shield", "season_start"]) expect(codec.hasFunction(name), name).toBe(true);
  });
});

describe("the deployment", () => {
  test("Matchmaker and Arena are optional addresses; the session signs their writes where the deployment has them", () => {
    expect([deployment.addresses.Matchmaker, deployment.addresses.Arena]).toEqual([MATCHMAKER, ARENA]);
    expect(bare.configured).toBe(true);
    expect(bare.addresses.Arena).toBe("");
    expect(CONTROLLER_ENTRY_POINTS.Matchmaker).toEqual(["search", "next"]);
    expect(CONTROLLER_ENTRY_POINTS.Arena).toEqual(["start", "play", "surrender"]);
    const methods = (dep: typeof deployment) => controllerPolicies(dep).map((p) => `${BigInt(p.target)}:${p.method}`);
    expect(methods(deployment)).toEqual(expect.arrayContaining(["10:search", "10:next", "11:start", "11:play", "11:surrender"]));
    expect(methods(bare).some((m) => m.startsWith("10:") || m.startsWith("11:"))).toBe(false);
  });
});

describe("RpcGameViews' PvP reads", () => {
  test("the match, the league, the shield and the season on Matchmaker; the attack, deck and moves on Arena", async () => {
    const { views: v, calls } = views((entrypoint) => {
      switch (entrypoint) {
        case "current_match":
          return ["0xb0b", "0x1e", "0x14", "0x0"];
        case "village":
          return ["0x1", "0x7"];
        case "league":
          return ["0x2", "0x4b0", "0x6", "0x7", "0x3", "0x0"];
        case "shield":
          return ["0x2", "0x1", "0x9", "0x6b49d200"];
        case "season_start":
          return ["0x69bd5d25"];
        case "attack":
          return ["0x2", "0x1", "0xb0b", "0x0", "0x3", "0x258", "0x7", "0x4", "0x6b49d200", "0x12c", "0x0"];
        case "deck":
          return ["0x14", "0x5", "0xa", "0x1f"];
        case "moves":
          return ["0x2", "0x9", "0x0", "0x2", hex(CENTER + 1), hex(CENTER), "0x3", "0x1", "0x0", "0x0", "0x0"];
        case "npc_level":
          return ["0x2", "0x5"];
        default:
          throw new Error(entrypoint);
      }
    });
    expect(hasPvpViews(v)).toBe(true);
    expect(await v.pvpMatch(PLAYER)).toEqual({ opponent: "0xb0b", offer: 30, cost: 20, started: false });
    expect(await v.pvpVillage(PLAYER)).toEqual({ status: 1, draws: 7 });
    expect(await v.pvpLeague(PLAYER)).toEqual({ season: 2, crowns: 1200, league: 6, peak: 7, attacks: 3, pending: 0 });
    expect(await v.pvpShield(PLAYER)).toEqual({ queue: 2, up: true, seq: 9, until: 0x6b49d200 });
    expect(await v.pvpSeasonStart(3)).toBe(0x69bd5d25);
    expect(await v.pvpAttack(PLAYER)).toMatchObject({ id: 2, status: 1, defender: "0xb0b", npc: false, parcels: 3, target: 600, placed: 4, score: 300 });
    expect(await v.pvpDeck(PLAYER, 2)).toEqual({ size: 20, drawn: 5, hand: 10, bitmap: 31n });
    expect(await v.pvpMoves(PLAYER, 2)).toEqual([
      { plan: 9, discard: false, orientation: 2, cell: { x: 1, y: 0 } },
      { plan: 3, discard: true },
    ]);
    expect(await v.pvpNpcLevel(4)).toEqual({ campaign: 2, level: 5 });
    expect(calls.map((c) => `${BigInt(c.contractAddress)}:${c.entrypoint}`)).toEqual([
      "10:current_match",
      "10:village",
      "10:league",
      "10:shield",
      "10:season_start",
      "11:attack",
      "11:deck",
      "11:moves",
      "11:npc_level",
    ]);
  });

  test("a deployment without them reads not-configured", async () => {
    const { views: v } = views(() => [], bare);
    await expect(v.pvpMatch(PLAYER)).rejects.toMatchObject({ kind: "not-configured" });
    await expect(v.pvpAttack(PLAYER)).rejects.toBeInstanceOf(ViewError);
  });

  test("the fake answers the chain's none, then a test's state", async () => {
    const fake = new FakeGameViews();
    expect(await fake.pvpMatch(PLAYER)).toEqual({ opponent: "0x0", offer: 0, cost: 0, started: false });
    expect((await fake.pvpAttack(PLAYER)).id).toBe(0);
    fake.pvp.leagues.set(BigInt(PLAYER).toString(), { season: 1, crowns: 900, league: 4, peak: 4, attacks: 1, pending: 0 });
    expect((await fake.pvpLeague(PLAYER)).crowns).toBe(900);
    fake.pvpFail = new Error("down");
    await expect(fake.pvpShield(PLAYER)).rejects.toThrow("down");
  });
});

describe("the crowns and the leagues", () => {
  test("the curves of crowns.cairo at the anchors the note pins", () => {
    expect([offerOf(1000, 1000), costOf(1000, 1000)]).toEqual([30, 20]);
    expect([offerOf(1000, 1600), costOf(1000, 1600)]).toEqual([58, 1]);
    expect([offerOf(1000, 3000), costOf(1000, 3000)]).toEqual([59, 0]);
    expect([offerOf(3000, 1000), costOf(3000, 1000)]).toEqual([1, 39]);
    expect([1, 2, 3].map((s) => prizeOf(30, s))).toEqual([10, 20, 30]);
    expect([1, 2, 3].map((s) => prizeOf(59, s))).toEqual([20, 40, 59]);
  });

  test("the 23 leagues of leagues.cairo: their floors, names, groups and rewards", () => {
    expect([0, 399, 400, 599, 600, 800, 4999, 5000, 9000].map(leagueOfCrowns)).toEqual([0, 0, 1, 2, 3, 4, 21, 22, 22]);
    expect([0, 1, 3, 4, 21, 22].map(leagueName)).toEqual(["Wood", "Iron III", "Iron I", "Bronze III", "Master I", "Grand Master"]);
    expect([0, 1, 3, 4, 7, 21, 22].map(groupsOf)).toEqual([0, 1, 1, 2, 3, 7, 8]);
    expect([0, 1, 7, 22].map(seasonRewardOf)).toEqual([0, 10, 35, 250]);
    expect([isNpcAddress("0x0"), isNpcAddress("0xff"), isNpcAddress("0x100")]).toEqual([false, true, false]);
  });
});

describe("the PvP writes", () => {
  test("search and next request the draw of the attacker's draw counter first", () => {
    expect(searchCalls(MATCHMAKER, "0x77", PLAYER, 7)).toEqual([
      { contractAddress: "0x77", entrypoint: "request_random", calldata: [MATCHMAKER, "0x1", vrfSalt("MATCH", PLAYER, 7)] },
      { contractAddress: MATCHMAKER, entrypoint: "search", calldata: [] },
    ]);
    expect(nextCalls(MATCHMAKER, "0x77", PLAYER, 8)[1]!.entrypoint).toBe("next");
  });

  test("the writer reads the draw counter and the attack inside its send, with a provider", async () => {
    const fake = new FakeGameViews();
    fake.pvp.villages.set(BigInt(PLAYER).toString(), { status: 1, draws: 4 });
    fake.pvp.attacks.set(BigInt(PLAYER).toString(), { id: 2, status: 1, defender: "0xb0b", npc: false, parcels: 0, target: 600, board: 1, placed: 1, startedAt: 0, score: 0, stars: 0 });
    fake.pvp.decks.set(`${BigInt(PLAYER)}:2`, { size: 3, drawn: 2, hand: 9, bitmap: 3n });
    const { writer, execute } = writerWith({ dep: withVrf });
    await writer.drawOpponent("search", fake);
    expect(execute.mock.calls[0]![0][0]!.calldata[2]).toBe(vrfSalt("MATCH", PLAYER, 4));
    await writer.playAttack({ discard: false, orientation: 1, cell: { x: 1, y: 0 } }, fake);
    expect(execute.mock.calls[1]![0].map((c) => c.entrypoint)).toEqual(["request_random", "play"]);
    expect(execute.mock.calls[1]![0][0]!.calldata[2]).toBe(vrfSalt("ATTACK", PLAYER, 2 * 128 + 2));
    fake.pvp.decks.set(`${BigInt(PLAYER)}:2`, { size: 3, drawn: 3, hand: 9, bitmap: 7n });
    await writer.playAttack({ discard: true }, fake);
    expect(execute.mock.calls[2]![0].map((c) => c.entrypoint)).toEqual(["play"]);
    await writer.startAttack(fake);
    expect(execute.mock.calls[3]![0][0]!.calldata[2]).toBe(vrfSalt("ATTACK", PLAYER, 3 * 128));
  });

  test("without a provider (the devnet's mock) each call goes alone; without the contracts nothing is sent", async () => {
    const { writer, execute } = writerWith();
    await writer.drawOpponent("next", new FakeGameViews());
    expect(sent(execute)).toEqual([[10n, "next"]]);
    const none = writerWith({ dep: bare });
    await expect(none.writer.startAttack(new FakeGameViews())).rejects.toThrow(/No Arena/);
    await expect(none.writer.drawOpponent("search", new FakeGameViews())).rejects.toThrow(/No Matchmaker/);
    expect(none.execute).not.toHaveBeenCalled();
    await expect(writer.playAttack({ discard: false, orientation: 5, cell: { x: 0, y: 1 } }, new FakeGameViews())).rejects.toBeInstanceOf(WriteError);
  });

  test.each([
    ["Matchmaker: not joined", "not-joined"],
    ["Matchmaker: no opponent", "no-opponent"],
    ["Matchmaker: opponent shielded", "opponent-shielded"],
    ["Setup: not enough cobbles", "not-enough-cobbles"],
    ["Arena: attack open", "attack-open"],
    ["Arena: outside territory", "outside-territory"],
    ["Tile: cannot place", "cannot-place"],
  ])("the revert %s is the refusal %s", async (reason, refusal) => {
    const { writer } = writerWith({ receipt: { execution_status: "REVERTED", revert_reason: `Failure reason: '${reason}'.` } });
    const error = await writer.surrenderAttack().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PvpRefusedError);
    expect(error).toMatchObject({ reason: refusal, transactionHash: "0x1", reverted: true });
  });
});

describe("the indexer's attacks", () => {
  test("/defences and /attacks: each side's ended attacks, newest first", async () => {
    const { FIXTURE_ADA, FIXTURE_BO, FixtureIndexer } = await import("../src/testing");
    const { IndexerClient } = await import("../src/indexer");
    const fixture = new FixtureIndexer();
    const row = (attacker: string, id: number, finished: number, stars: number) => ({
      attacker,
      id,
      defender: FIXTURE_ADA,
      npc: false,
      target: 1000,
      tiles: 20,
      score: 900,
      stars,
      surrendered: false,
      gained: stars * 10,
      lost: stars ? 0 : 20,
      opened_at: finished - 600,
      finished_at: finished,
    });
    fixture.attacks = [row(FIXTURE_BO, 1, 1000, 1), row(FIXTURE_BO, 2, 2000, 0)];
    const client = new IndexerClient({ url: "http://indexer.test/", fetch: fixture.fetch as typeof fetch });
    const { data } = await client.playerAttacks(FIXTURE_ADA, "defender", { limit: 5 });
    expect(data.map((a) => [a.id, a.stars, a.gained, a.lost, a.finishedAt])).toEqual([
      [2, 0, 0, 20, 2000],
      [1, 1, 10, 0, 1000],
    ]);
    expect((await client.playerAttacks(FIXTURE_BO, "attacker")).data).toHaveLength(2);
    expect((await client.playerAttack(FIXTURE_BO, 1)).data).toMatchObject({ id: 1, stars: 1, defender: FIXTURE_ADA });
    await expect(client.playerAttack(FIXTURE_BO, 9)).rejects.toMatchObject({ kind: "not-found" });
    expect(fixture.requests.slice(0, 2)).toEqual([`/v1/players/${FIXTURE_ADA}/defences?limit=5`, `/v1/players/${FIXTURE_BO}/attacks`]);
  });
});
