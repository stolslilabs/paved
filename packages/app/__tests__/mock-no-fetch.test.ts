import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ViewError, settlesAfter, type GameKey, type IndexerClient, type KeyStorage } from "@paved/chain";
import { seededRandom } from "@paved/renderer";
import { CENTER, OrientationType, replayVrfChallenge, starterLayout } from "@paved/game-core";
import type { GameSigner } from "../src/data";
import { deploymentOf } from "../src/data/deployment";
import { mockAppSources, offlineSigner } from "../src/data/mock/app";
import { MockLedger } from "../src/data/mock/ledger";
import { MOCKED_ECONOMY_READS, MOCKED_GAME_READS, MOCKED_WRITES, mockConnector } from "../src/data/mock/overlay";
import { attackV2Board } from "../src/data/free-attack";
import { MockAccountError, mockKeyConnector } from "../src/wallet/mock-key";
import { memoryStore } from "./data-fakes";

// No request in a mock build (#927, PR 6 of 6): the mock's every read and write stays on the device. `fetch`, `XMLHttpRequest`,
// `WebSocket`, `EventSource` and `sendBeacon` are refused and recorded; starknet.js's node classes and `@paved/chain`'s
// clients (the chain's, the economy's, the indexer's) refuse to be built; the app's chain modules refuse to load. Each test
// ends with none of them touched. The build's side (no starknet.js in a mock build) is `scripts/bundle-budget.ts`'
// `starknetInMock`, run with every build.

const touched = vi.hoisted(() => [] as string[]);

vi.mock("starknet", async (importOriginal) => {
  const actual = await importOriginal<typeof import("starknet")>();
  const refused = (name: string) =>
    class {
      constructor() {
        touched.push(`starknet.${name}`);
        throw new Error(`${name} built on the mock`);
      }
    };
  return { ...actual, RpcProvider: refused("RpcProvider"), Account: refused("Account"), WebSocketChannel: refused("WebSocketChannel"), RpcChannel: refused("RpcChannel") };
});

vi.mock("@paved/chain", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@paved/chain")>();
  const refused = (name: string) => () => {
    touched.push(`@paved/chain.${name}`);
    throw new Error(`${name} built on the mock`);
  };
  return { ...actual, createPavedClient: refused("createPavedClient"), createEconomyClient: refused("createEconomyClient"), createIndexerClient: refused("createIndexerClient") };
});

// The chain source's modules: the mock never loads one.
for (const path of ["../src/data/chain-client", "../src/data/economy-client", "../src/data/settle-client", "../src/data/vault-client", "../src/wallet/connector"]) {
  vi.doMock(path, () => {
    touched.push(path);
    throw new Error(`${path} loaded on the mock`);
  });
}

const PLAYER_STORAGE = "paved:device-key";
const DAY = 86_400;
const USDC = 1_000_000n;
const PAVED = 10n ** 18n;
const ORIENTATIONS = Object.values(OrientationType);

/** Every way out of the page, refused and recorded. */
function cutNetwork() {
  const refuse = (kind: string) => (target?: unknown) => {
    touched.push(`${kind} ${String(target)}`);
    throw new Error(`${kind}: no request on the mock`);
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown) => refuse("fetch")(input)),
  );
  vi.stubGlobal(
    "XMLHttpRequest",
    class {
      open(_method: string, url: string) {
        refuse("XMLHttpRequest")(url);
      }
      send() {
        refuse("XMLHttpRequest.send")();
      }
    },
  );
  vi.stubGlobal(
    "WebSocket",
    class {
      constructor(url: string) {
        refuse("WebSocket")(url);
      }
    },
  );
  vi.stubGlobal(
    "EventSource",
    class {
      constructor(url: string) {
        refuse("EventSource")(url);
      }
    },
  );
  Object.defineProperty(navigator, "sendBeacon", { configurable: true, value: (url: string) => refuse("sendBeacon")(url) });
}

beforeEach(() => {
  touched.length = 0;
  cutNetwork();
});

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, "sendBeacon");
  expect(touched).toEqual([]);
});

function memoryStorage(): KeyStorage {
  const items = new Map<string, string>();
  return { getItem: (k) => items.get(k) ?? null, setItem: (k, v) => void items.set(k, v), removeItem: (k) => void items.delete(k) };
}

/** The app's mock as `routes/sources.ts` and `wallet/mock-connector.ts` build it, on a ledger of its own clock. */
function mockApp(clock: { now: number }, starting = { usdc: 100n * USDC, paved: 5n * PAVED }) {
  const store = memoryStore();
  const ledger = new MockLedger({ store: () => store, seller: deploymentOf("sepolia").addresses.Setup || "0x0", latencyMs: 0, now: () => clock.now, starting });
  const storage = memoryStorage();
  const connector = mockConnector(mockKeyConnector({ storage, ledger, signer: offlineSigner }), ledger, { random: seededRandom(927) });
  return { ledger, storage, connector, sources: mockAppSources(ledger, deploymentOf("sepolia")) };
}

/** Plays the Challenge game `key` to its end through the signer's writes: the first legal cell of each tile, else a discard. */
async function playOut(signer: GameSigner, views: ReturnType<typeof mockApp>["sources"]["views"], key: GameKey) {
  const reads = views as unknown as MockLedger;
  while (!(await reads.game(key)).over) {
    const [game, tiles, draw] = await Promise.all([reads.game(key), reads.tiles(key), reads.draw(key)]);
    const engine = replayVrfChallenge(BigInt(await reads.initialSeed(key)), tiles, game, draw);
    const [first] = engine.legalPlacements(engine.hand!.plan);
    if (first) await signer.build(key, { orientation: ORIENTATIONS.indexOf(first.orientation), x: CENTER + first.x, y: CENTER + first.y });
    else await signer.discard(key);
  }
}

describe("a mock build fetches nothing (#927)", () => {
  it("the acceptance walk in data: connect, the village, a Challenge game to its settlement, a mission, a chest, the shop, the Vault, a PvP attack, the indexer's pages, Reset", async () => {
    const start = 20_400 * DAY + 9 * 3_600;
    const clock = { now: start };
    const { ledger, storage, connector, sources } = mockApp(clock);
    const views = sources.views as unknown as MockLedger;

    // Connect: the device's key, the ledger's account; its village founded with it, the starter and its 8 tiles there.
    const account = await connector.connect();
    expect(storage.getItem(PLAYER_STORAGE)).toMatch(/^0x/);
    const me = account.address;
    const signer = connector.signer(account) as GameSigner & Record<string, (...a: unknown[]) => Promise<unknown>>;
    expect(await views.freeVillage(me)).toMatchObject({ founded: true, tiles: starterLayout(BigInt(me)) });
    expect(starterLayout(BigInt(me))).toHaveLength(8);
    expect(await connector.username()).toBeTruthy();

    // A Challenge game, bought in USDC, played to its end, settled after its day: the reward the ledger's PAVED.
    const quote = await sources.economy.quote(1);
    const bought = await sources.purchases(signer).purchase({ stake: 1, confirmedPrice: quote.price, confirmedMinOut: 1n, referrer: null });
    expect(await sources.purchases(signer).receipt(bought.transactionHash)).toBe("succeeded");
    expect(await sources.purchases(signer).referrer("game", null)).toBeNull();
    const key: GameKey = { mode: "challenge", gameId: (bought as typeof bought & { gameId: number }).gameId };
    await playOut(signer, sources.views, key);
    expect((await views.game(key)).over).toBe(true);
    const day = (await views.game(key)).dayId;
    clock.now = settlesAfter(day) + 60;
    const settled = await sources.settlements(signer).settle([key.gameId]);
    expect(settled.transactionHash).toMatch(/^0x6d6f636b/);
    expect((await sources.economy.terms(key.gameId)).settled).toBe(true);

    // A mission: the first game's achievement, counted by the mock's indexer, claimed for its Cobbles.
    const achievements = (await sources.indexer.playerAchievements(me)).data;
    expect(achievements.achievements.find((a) => a.achievementId === 2)).toMatchObject({ completed: true });
    await sources.indexer.definitions();
    await signer.claimAchievement(2);
    expect((await views.account(me)).cobbles).toBeGreaterThan(0);

    // First Stone: the tutorial's claim, on the ledger (no node asked whether it was claimed).
    expect(await sources.views.tutorialClaimed(me)).toBe(false);
    expect((await signer.claimTutorial()).events.map((e) => e.name)).toEqual(["AchievementProgressed"]);
    expect((await signer.claimTutorial()).events).toEqual([]);
    expect(await sources.views.tutorialClaimed(me)).toBe(true);
    expect((await sources.indexer.playerAchievements(me)).data.achievements.find((a) => a.achievementId === 1)).toMatchObject({ completed: true });

    // A chest: a Story level on 3 stars gives one, opened and its tile taken.
    await signer.reportStory({ campaign: 2, level: 1, stars: 3 });
    await signer.openChest(0);
    await signer.claimChest(0);
    expect((await views.chests(me)).open).toBeNull();

    // The shop: an offer bought with Cobbles when the account holds enough, else refused by the ledger.
    const today = Math.floor(clock.now / DAY);
    const offer = (await views.shop(me, today)).offers.reduce((a, b) => (b.price < a.price ? b : a));
    const cobbles = (await views.account(me)).cobbles;
    const bought2 = signer.buyTile({ day: today, slot: offer.slot, confirmedPrice: offer.price });
    if (cobbles >= offer.price) await bought2;
    else await expect(bought2).rejects.toMatchObject({ reason: "not-enough-cobbles" });

    // The Vault: a deposit and a withdrawal on the ledger's PAVED and vPAVED.
    const paved = await sources.economy.pavedBalance(me);
    await sources.vault(signer).deposit(PAVED, { confirmedAmount: PAVED });
    expect(await sources.economy.pavedBalance(me)).toBe(paved - PAVED);
    const shares = (await sources.economy.vault(me)).shares;
    expect(shares).toBeGreaterThan(0n);
    await sources.vault(signer).withdrawAll({ confirmedShares: shares });
    expect((await sources.economy.vault(me)).shares).toBe(0n);

    // A PvP attack: drawn, started, played to its end.
    await signer.drawOpponentV2("search");
    await signer.startAttackV2();
    for (;;) {
      const { attack } = await views.attackV2(me);
      if (attack!.status !== "open") break;
      const board = attackV2Board(attack!);
      const plan = attack!.view[0]!;
      const cell = board.slots(plan)[0];
      await signer.playAttackV2(cell ? { discard: false, orientation: board.orientations(plan, cell)[0]!, cell } : { discard: true });
    }
    expect(await views.matchesV2(me)).not.toEqual([]);

    // The leaderboard and a player page.
    expect((await sources.indexer.leaderboard(day)).data.entries.some((e) => BigInt(e.playerId) === BigInt(me))).toBe(true);
    expect((await sources.indexer.player(me)).data.player).not.toBeNull();

    // A reload keeps everything: a ledger on the same store reads the same account; Reset starts over with a new one.
    expect(await connector.probe()).toMatchObject({ address: me });
    const fresh = await connector.reset();
    expect(fresh.address).not.toBe(me);
    expect(ledger.knows(me)).toBe(false);
  });

  it("whatever their arguments, every read the mock answers, every indexer route and every write stay on the device", async () => {
    const clock = { now: 20_400 * DAY + 9 * 3_600 };
    const { connector, sources } = mockApp(clock);
    const account = await connector.connect();
    const me = account.address;
    const signer = connector.signer(account) as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>;
    const key: GameKey = { mode: "challenge", gameId: 1 };
    const argsOf = [[me], [key], [me, 20_400], [1], []] as const;
    const call = (target: object, name: string) => argsOf.map((args) => Promise.resolve().then(() => (target as Record<string, (...a: unknown[]) => unknown>)[name]!(...args)));
    const indexerRoutes = ["head", "tournaments", "tournament", "leaderboard", "player", "playerGames", "playerTournament", "game", "definitions", "playerQuests", "playerAchievements", "playerReferrals", "playerAttacks", "playerAttack"] satisfies (keyof IndexerClient)[];
    await Promise.allSettled([
      ...MOCKED_GAME_READS.flatMap((name) => call(sources.views, name)),
      ...MOCKED_ECONOMY_READS.flatMap((name) => call(sources.economy, name)),
      ...call(sources.events, "playerGames"),
      ...call(sources.pool, "quoteSwap"),
      ...indexerRoutes.flatMap((name) => call(sources.indexer, name)),
    ]);
    // The writes one at a time: each is atomic on the ledger, a refusal leaves it as it was.
    for (const name of MOCKED_WRITES) for (const p of call(signer, name)) await p.catch(() => undefined);
    for (const p of [...call(sources.vault(signer as unknown as GameSigner), "deposit"), ...call(sources.settlements(signer as unknown as GameSigner), "settle")]) await p.catch(() => undefined);
  });

  it("refuses, with nothing sent, a read or a write the ledger does not answer", async () => {
    const { connector, sources } = mockApp({ now: 20_400 * DAY });
    const signer = connector.signer(await connector.connect());
    await expect((sources.views as unknown as Record<string, () => Promise<unknown>>).notARead!()).rejects.toBeInstanceOf(ViewError);
    await expect((sources.views as unknown as Record<string, () => Promise<unknown>>).notARead!()).rejects.toMatchObject({ kind: "not-configured" });
    await expect(signer.sendCalls([])).rejects.toBeInstanceOf(MockAccountError);
    await expect(sources.purchases(signer).receipt("0x123")).resolves.toBe("unknown");
  });
});

describe("the app's sources on the mock (#927)", () => {
  it("are the ledger's, through `routes/sources.ts` and the mock's connector, with no chain module loaded", async () => {
    vi.resetModules();
    vi.doMock("../src/data/data-source", async (importOriginal) => ({ ...(await importOriginal<typeof import("../src/data/data-source")>()), DATA_SOURCE: "mock", MOCKED: true }));
    const { APP_SOURCES } = await import("../src/routes/sources");
    const { mockAppConnector } = await import("../src/wallet/mock-connector");
    const connector = await mockAppConnector();
    const account = await connector.connect();
    expect(await APP_SOURCES.views.freeVillage(account.address)).toMatchObject({ founded: true });
    expect(await APP_SOURCES.economy!.usdcBalance(account.address)).toBeGreaterThan(0n);
    expect((await APP_SOURCES.indexer.head()).data).toMatchObject({ state: "ok", chainId: "mock" });
    await expect(APP_SOURCES.views.tutorialClaimed(account.address)).resolves.toBe(false);
    await expect(APP_SOURCES.purchases!(connector.signer(account)).receipt("0x6d6f636b00000001")).resolves.toBe("succeeded");
    vi.doUnmock("../src/data/data-source");
    window.localStorage.clear();
  });
});
