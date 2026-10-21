import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, test } from "vitest";
import { Chain } from "./chain.ts";
import { SELECTORS, decode, padded } from "./events.ts";
import { Indexer } from "./indexer.ts";
import { SCHEMA_VERSION, SchemaMismatch, Store, deploymentHash } from "./store.ts";
import { COLLECTION, ECONOMY, CHALLENGE, FakeNode, SETUP, ev, raw, type FakeEvent } from "./testing/fake-node.ts";
import { CONFIG, indexerOf, indexerWithoutCollection, settle } from "./testing/setup.ts";

const ADA = 0xa1n;
const BO = 0xb2n;

const temp: string[] = [];
afterEach(() => {
  for (const dir of temp.splice(0)) rmSync(dir, { recursive: true, force: true });
});
const tempDb = () => {
  const dir = mkdtempSync(join(tmpdir(), "paved-indexer-test-"));
  temp.push(dir);
  return join(dir, "db.sqlite");
};

/** A chain with two players and a few games, one block each (the first block holds no event). */
function played(node = new FakeNode()) {
  node.mine([], []);
  node.mine([ev.spawned("challenge", 1, ADA), ev.built("challenge", 1)]);
  node.mine([ev.spawned("challenge", 2, BO)], [ev.spawned("challenge", 3, ADA)]);
  node.mine([ev.over("challenge", 1, ADA, 50)]);
  node.mine([ev.over("challenge", 3, ADA, 9)]);
  return node;
}

describe("following the chain", () => {
  test("applies the game events in block order and skips the known ones", async () => {
    const node = played();
    const indexer = indexerOf(node);
    await settle(indexer);
    expect(indexer.status).toBe("ok");
    expect(indexer.served?.number).toBe(node.tip);
    const dump = indexer.store.dump();
    // A player is the address, from its first GameSpawned (D-25 (E)): no name, no master.
    expect(dump.players).toEqual([
      { player_id: padded(ADA), created_block: 2, created_time: node.blocks[2]!.timestamp },
      { player_id: padded(BO), created_block: 3, created_time: node.blocks[3]!.timestamp },
    ]);
    expect(dump.games.map((g) => [g.contract, g.game_id, g.over, g.score])).toEqual([
      ["challenge", 1, 1, 50],
      ["challenge", 2, 0, null],
      ["challenge", 3, 1, 9],
    ]);
    expect(dump.events.map((e) => e.name)).toEqual([
      "GameSpawned",
      "GameSpawned",
      "GameSpawned",
      "GameOver",
      "GameOver",
    ]);
    expect(indexer.eventsApplied).toBe(5);
  });

  test("a block applied twice changes nothing", async () => {
    const node = played();
    const indexer = indexerOf(node);
    await settle(indexer);
    const before = indexer.store.dump();
    const block = indexer.store.block(3)!;
    const raws = await new Chain(node.rpc, { challenge: CHALLENGE, setup: SETUP, economy: ECONOMY, collection: COLLECTION }).events(block);
    expect(raws.length).toBeGreaterThan(0);
    const events = raws.flatMap((raw) => {
      const event = decode(raw.source, raw.keys, raw.data);
      return event ? [{ raw, event }] : [];
    });
    indexer.store.apply(block, events);
    expect(indexer.store.dump()).toEqual(before);
  });

  test("resumes from the stored tip after a restart, applying nothing twice", async () => {
    const path = tempDb();
    const node = played();
    const first = new Indexer({
      chain: new Chain(node.rpc, { challenge: CHALLENGE, setup: SETUP, economy: ECONOMY, collection: COLLECTION }),
      store: new Store(path),
      config: CONFIG,
      depth: 1000,
    });
    await settle(first);
    const applied = first.blocksApplied;
    expect(applied).toBeGreaterThan(0);
    first.store.close();

    node.mine([ev.over("challenge", 2, BO, 70)]);
    const second = new Indexer({
      chain: new Chain(node.rpc, { challenge: CHALLENGE, setup: SETUP, economy: ECONOMY, collection: COLLECTION }),
      store: new Store(path),
      config: CONFIG,
      depth: 1000,
    });
    await settle(second);
    expect(second.blocksApplied).toBe(1);
    expect(second.store.dump().games.find((g) => g.game_id === 2 && g.contract === "challenge")?.score).toBe(70);
    second.store.close();
  });
});

describe("players (D-25 (E): a player is the wallet address, seen from its first event)", () => {
  const players = (indexer: Indexer) =>
    indexer.store.dump().players.map((p) => [p.player_id, p.created_block, p.created_time]);

  test("the first GameSpawned creates the player, a later event does not change its creation", async () => {
    const node = new FakeNode();
    const first = node.mine([ev.spawned("challenge", 1, ADA)]);
    node.mine([ev.over("challenge", 1, ADA, 5)], [ev.spawned("challenge", 2, ADA)]);
    node.mine([ev.purchased(2, ADA), ev.questProgressed(ADA, 1, 1)]);
    const indexer = indexerOf(node);
    await settle(indexer);
    expect(indexer.status).toBe("ok");
    expect(players(indexer)).toEqual([[padded(ADA), first, node.blocks[first]!.timestamp]]);
    // Stored as the API names it: 0x and 64 lowercase hex digits.
    expect(String(players(indexer)[0]![0])).toMatch(/^0x[0-9a-f]{64}$/);
  });

  test("a Purchased first creates the player; its referrer is not a player", async () => {
    const node = new FakeNode();
    const first = node.mine([ev.purchased(1, ADA, { referrer: BO })]);
    node.mine([ev.spawned("challenge", 1, ADA)]);
    const indexer = indexerOf(node);
    await settle(indexer);
    expect(indexer.status).toBe("ok");
    expect(players(indexer)).toEqual([[padded(ADA), first, node.blocks[first]!.timestamp]]);
  });

  test("a quest or an achievement progress first creates the player (the tutorial claim too)", async () => {
    const node = new FakeNode();
    const quest = node.mine([ev.questProgressed(ADA, 1, 1)]);
    const claim = node.mine([ev.tutorialClaimed(BO)]);
    node.mine([ev.spawned("challenge", 1, ADA)], [ev.spawned("challenge", 2, BO)], [ev.achievementProgressed(ADA, 2, 1)]);
    const indexer = indexerOf(node);
    await settle(indexer);
    expect(indexer.status).toBe("ok");
    expect(players(indexer)).toEqual([
      [padded(ADA), quest, node.blocks[quest]!.timestamp],
      [padded(BO), claim, node.blocks[claim]!.timestamp],
    ]);
  });

  test("a past progress from Challenge (skipped) creates no player", async () => {
    const node = new FakeNode();
    node.mine([ev.questProgressed(ADA, 1, 1, "challenge"), ev.achievementProgressed(ADA, 1, 1, "challenge")]);
    const indexer = indexerOf(node);
    await settle(indexer);
    expect(indexer.status).toBe("ok");
    expect(players(indexer)).toEqual([]);
  });
});

describe("an old history (before D-25 (E))", () => {
  test("a PlayerCreated is skipped by name from a source still read, and never seen from Account's address", async () => {
    const node = new FakeNode();
    node.mine(
      // The game contract's ABI declared PlayerCreated until D-23b: from Challenge's address it is known and skipped, never a halt.
      [ev.pastCreated("challenge", ADA, 0x416461)],
      // Account's address is not a source: nothing asks the node for its events (the fake node holds them unread).
      [{ ...ev.pastCreated("challenge", BO, 0x426f), source: "account" } as unknown as FakeEvent],
      [{ ...ev.economySet(), source: "account" } as unknown as FakeEvent],
    );
    node.mine([ev.spawned("challenge", 1, ADA)]);
    node.mine([ev.over("challenge", 1, ADA, 7)]);
    const indexer = indexerOf(node);
    await settle(indexer);
    expect(indexer.status).toBe("ok");
    expect(indexer.served?.number).toBe(node.tip);
    const dump = indexer.store.dump();
    expect(dump.events.map((e) => e.name)).toEqual(["GameSpawned", "GameOver"]);
    expect(dump.players.map((p) => [p.player_id, p.created_block])).toEqual([[padded(ADA), 2]]);
  });
});

describe("Challenge's spawn pause (G4)", () => {
  test("GuardianSet, SpawnPaused and SpawnUnpaused from Challenge replay without a halt, and index nothing", async () => {
    const node = new FakeNode();
    node.mine([ev.spawned("challenge", 1, ADA)]);
    // The pause lands between two games: the guardian is set, spawn paused, a game already bought ends while paused, then unpaused.
    node.mine([ev.guardianSet(BO), ev.spawnPaused(BO)]);
    node.mine([ev.over("challenge", 1, ADA, 7)]);
    node.mine([ev.spawnUnpaused(), ev.spawned("challenge", 2, BO)]);
    const indexer = indexerOf(node);
    await settle(indexer);
    expect(indexer.status).toBe("ok");
    expect(indexer.served?.number).toBe(node.tip);
    expect(indexer.store.dump().events.map((e) => e.name)).toEqual(["GameSpawned", "GameOver", "GameSpawned"]);
  });
});

/** A paid game of Ada: bought with its spawn, ended and recorded, its day closed and the game settled. */
function paid(node = new FakeNode()) {
  node.mine([]);
  node.mine([ev.spawned("challenge", 1, ADA), ev.purchased(1, ADA, { day: 100 })]);
  node.mine([ev.over("challenge", 1, ADA, 5000), ev.recorded(1, 5000)]);
  node.mine([ev.dayClosed(100), ev.settled(1, ADA, { day: 100, score: 5000, reward: 2n ** 70n })]);
  return node;
}

describe("Collection's mint", () => {
  test("the token id is stored with each game, the Challenge id as is; a past Tutorial token is skipped (D-21)", async () => {
    const node = new FakeNode();
    node.mine([]);
    node.mine([ev.spawned("challenge", 1, ADA), ev.purchased(1, ADA, { day: 100 }), ev.minted(ADA, 1)]);
    node.mine([ev.minted(ADA, 2 ** 32 + 1)]);
    const indexer = indexerOf(node);
    await settle(indexer);
    expect(indexer.status).toBe("ok");
    const games = indexer.store.dump().games;
    expect(games.map((g) => [g.contract, g.game_id, g.token_id])).toEqual([["challenge", 1, 1]]);
    // Only the Challenge mint is in the log: the skipped one is not an indexed event.
    expect(indexer.store.dump().events.filter((e) => e.name === "Transfer")).toHaveLength(1);
  });

  test("without a Collection address no mint is read: the games carry no token id", async () => {
    const node = new FakeNode();
    node.mine([]);
    node.mine([ev.spawned("challenge", 1, ADA), ev.minted(ADA, 1)]);
    const indexer = indexerWithoutCollection(node);
    await settle(indexer);
    expect(indexer.status).toBe("ok");
    expect(indexer.store.dump().games[0]?.token_id).toBeNull();
    expect(indexer.store.contracts()?.collection).toBeNull();
  });

  test("a mint without its game, twice, outside the spawn's block, or to another player halts the indexer", async () => {
    const reasons = async (...blocks: Parameters<FakeNode["mine"]>[]) => {
      const node = new FakeNode();
      for (const block of blocks) node.mine(...block);
      const indexer = indexerOf(node);
      await settle(indexer);
      expect(indexer.status).toBe("halted");
      return indexer.reason;
    };
    expect(await reasons([[ev.minted(ADA, 1)]])).toMatch(/no challenge game 1/);
    expect(await reasons([[ev.spawned("challenge", 1, ADA), ev.minted(ADA, 1), ev.minted(ADA, 1)]])).toMatch(/already has a token/);
    expect(await reasons([[ev.spawned("challenge", 1, ADA)]], [[ev.minted(ADA, 1)]])).toMatch(/outside the block of the spawn/);
    expect(await reasons([[ev.spawned("challenge", 1, ADA), ev.minted(BO, 1)]])).toMatch(/another player/);
  });
});

describe("Economy", () => {
  test("a purchase, its record, the day's close and the settlement are stored, the amounts as decimal text", async () => {
    const indexer = indexerOf(paid());
    await settle(indexer);
    expect(indexer.status).toBe("ok");
    const dump = indexer.store.dump();
    expect(dump.purchases).toMatchObject([
      {
        game_id: 1,
        player_id: padded(ADA),
        day: 100,
        stake: 1,
        price: "2000000",
        referrer: padded(0n),
        reference: String(107n * 10n ** 18n),
        vault_paved: String(45n * 10n ** 18n),
        score: 5000,
        expired: 0,
        reward: String(2n ** 70n),
      },
    ]);
    expect(dump.economy_days).toMatchObject([{ day: 100, mean: 4_215_689, weight: 21, prior: 3_980_000, ema_after: 3_500_000 }]);
    expect(dump.events.map((e) => [e.source, e.name])).toContainEqual(["economy", "Settled"]);
  });

  test("the owner events at Economy's deploy are skipped", async () => {
    const node = new FakeNode();
    node.mine([
      raw("economy", "EconomyConfigured", [], [7000, 0, 18130, 5, 10n ** 24n]),
      raw("economy", "PoolSet", [], [1, 2, 3, 4, 5, 6, 7]),
      raw("economy", "GameSet", [], [0x1111]),
    ]);
    const indexer = indexerOf(node);
    await settle(indexer);
    expect(indexer.status).toBe("ok");
    expect(indexer.eventsApplied).toBe(0);
  });

  test("Collection's MintersSet (the owner's set_minters) is skipped", async () => {
    const node = new FakeNode();
    node.mine([raw("collection", "MintersSet", [], [0x1111, 0x2222])]);
    const indexer = indexerOf(node);
    await settle(indexer);
    expect(indexer.status).toBe("ok");
    expect(indexer.eventsApplied).toBe(0);
  });

  describe("Setup's wiring against the deployment file (D-25 (E))", () => {
    const reason = async (events: ReturnType<typeof ev.economySet>[], make: (node: FakeNode) => Indexer = indexerOf) => {
      const node = new FakeNode();
      node.mine(events);
      const indexer = make(node);
      await settle(indexer);
      return { indexer, reason: indexer.reason };
    };

    test("a match: EconomySet and CollectionSet of the file's addresses are indexed and nothing halts", async () => {
      const { indexer } = await reason([ev.economySet(), ev.collectionSet()]);
      expect(indexer.status).toBe("ok");
      expect(indexer.store.dump().events.map((e) => [e.source, e.name])).toEqual([
        ["setup", "EconomySet"],
        ["setup", "CollectionSet"],
      ]);
    });

    test("an Economy other than the file's halts, saying both", async () => {
      const { indexer, reason: why } = await reason([ev.economySet(0x9999)]);
      expect(indexer.status).toBe("halted");
      expect(why).toContain("EconomySet");
      expect(why).toContain(padded(0x9999n));
      expect(why).toContain(padded(BigInt(ECONOMY)));
      expect(why).toContain("Setup registers the Economy");
    });

    test("a Collection other than the file's halts, saying both", async () => {
      const { indexer, reason: why } = await reason([ev.collectionSet(0x9999)]);
      expect(indexer.status).toBe("halted");
      expect(why).toContain("CollectionSet");
      expect(why).toContain(padded(0x9999n));
      expect(why).toContain(padded(BigInt(COLLECTION)));
    });

    test("no Collection in the file and none in Setup: still optional, nothing halts", async () => {
      const { indexer } = await reason([ev.economySet()], indexerWithoutCollection);
      expect(indexer.status).toBe("ok");
    });

    test("no Collection in the file but one in Setup halts: the mints would go unread", async () => {
      const { indexer, reason: why } = await reason([ev.collectionSet()], indexerWithoutCollection);
      expect(indexer.status).toBe("halted");
      expect(why).toContain("the deployment file has none");
    });
  });

  test("a rewind takes back a settlement, a close, a record and a purchase, as a fresh index of the new chain", async () => {
    const node = paid();
    const indexer = indexerOf(node);
    await settle(indexer);
    node.reorg(1, [[]]); // the close and the settlement are taken back
    await settle(indexer);
    let dump = indexer.store.dump();
    expect(dump.purchases[0]).toMatchObject({ score: 5000, reward: null, settled_block: null, threshold: null });
    expect(dump.economy_days).toEqual([]);
    node.reorg(2, [[], []]); // the record too
    await settle(indexer);
    expect(indexer.store.dump().purchases).toMatchObject([{ game_id: 1, score: null, expired: null, recorded_block: null }]);
    node.reorg(3, [[], [], []]); // and the purchase
    await settle(indexer);
    dump = indexer.store.dump();
    expect(dump.purchases).toEqual([]);
    const fresh = indexerOf(node);
    await settle(fresh);
    expect(dump).toEqual(fresh.store.dump());
  });
});

describe("reorgs", () => {
  test("a replaced block rewinds the tables, and the result equals a fresh index of the new chain", async () => {
    const node = played();
    const indexer = indexerOf(node);
    await settle(indexer);
    // The last two blocks (two game overs) are replaced: Ada's game 1 now ends with another score, and her game 3 stays running.
    node.reorg(2, [[[ev.over("challenge", 1, ADA, 33)]]]);
    await settle(indexer);
    expect(indexer.rewindCount).toBe(1);
    expect(indexer.status).toBe("ok");
    const games = indexer.store.dump().games;
    expect(games.find((g) => g.contract === "challenge" && g.game_id === 1)?.score).toBe(33);
    expect(games.find((g) => g.game_id === 3)?.over).toBe(0);

    const fresh = indexerOf(node);
    await settle(fresh);
    expect(indexer.store.dump()).toEqual(fresh.store.dump());
  });

  test("a spawn that the chain took back is deleted, and a game over that it took back reopens the game", async () => {
    const node = played();
    const indexer = indexerOf(node);
    await settle(indexer);
    node.reorg(3, [[], [], []]); // the last three blocks replaced by empty ones
    await settle(indexer);
    const games = indexer.store.dump().games;
    expect(games.map((g) => [g.contract, g.game_id, g.over])).toEqual([["challenge", 1, 0]]);
    // Bo's only event was taken back: so is Bo. Ada's first event stays, and so does her creation.
    expect(indexer.store.dump().players.map((p) => [p.player_id, p.created_block])).toEqual([[padded(ADA), 2]]);
  });

  test("a devnet replacement that keeps the block hash is seen through its commitments", async () => {
    const node = played();
    const indexer = indexerOf(node);
    await settle(indexer);
    node.reorg(1, [[[ev.over("challenge", 3, ADA, 11)]]], true);
    await settle(indexer);
    expect(indexer.rewindCount).toBe(1);
    expect(indexer.store.dump().games.find((g) => g.game_id === 3)?.score).toBe(11);
  });
});

describe("halts", () => {
  const halted = async (...blocks: Parameters<FakeNode["mine"]>[]) => {
    const node = new FakeNode();
    node.mine([]);
    for (const transactions of blocks) node.mine(...transactions);
    const indexer = indexerOf(node);
    await settle(indexer);
    return indexer;
  };

  test("a GameOver with no GameSpawned", async () => {
    const indexer = await halted([[ev.over("challenge", 9, ADA, 5)]]);
    expect(indexer.status).toBe("halted");
    expect(indexer.reason).toMatch(/no GameSpawned/);
  });

  test("a second GameOver of one game", async () => {
    const indexer = await halted([[ev.spawned("challenge", 1, ADA)]], [[ev.over("challenge", 1, ADA, 5)]], [[ev.over("challenge", 1, ADA, 6)]]);
    expect(indexer.status).toBe("halted");
    expect(indexer.reason).toMatch(/already over/);
  });

  test("a GameSpawned for an existing id", async () => {
    const twice = await halted([[ev.spawned("challenge", 1, ADA)]], [[ev.spawned("challenge", 1, BO)]]);
    expect(twice.status).toBe("halted");
    expect(twice.reason).toMatch(/already exists/);
  });

  test("a mode that does not match its contract", async () => {
    // 3 was the on-chain Tutorial's mode (D-21): never Challenge's.
    const indexer = await halted([[ev.spawned("challenge", 1, ADA, { mode: 3 })]]);
    expect(indexer.status).toBe("halted");
    expect(indexer.reason).toMatch(/expected mode 1/);
  });

  test("a GameOver of another player than the one that spawned the game", async () => {
    const indexer = await halted([[ev.spawned("challenge", 1, ADA)]], [[ev.over("challenge", 1, BO, 5)]]);
    expect(indexer.status).toBe("halted");
    expect(indexer.reason).toMatch(/another player/);
  });

  test("an event of no known selector, an event of the wrong contract, and a wrong shape", async () => {
    const unknown = await halted([[{ source: "challenge", keys: ["0x1234"], data: [] }]]);
    expect(unknown.status).toBe("halted");
    expect(unknown.reason).toMatch(/undecodable event of challenge/);
    const wrong = await halted([[{ ...ev.spawned("challenge", 1, ADA), source: "economy" }]]);
    expect(wrong.status).toBe("halted");
    const shape = await halted([[{ source: "challenge", keys: [SELECTORS.GameOver, "0x1"], data: [] }]]);
    expect(shape.status).toBe("halted");
  });

  test("Economy: a second purchase, a record or a settlement out of order, a settlement that differs, a second close", async () => {
    const reasons = async (...blocks: Parameters<FakeNode["mine"]>[]) => {
      const indexer = await halted(...blocks);
      expect(indexer.status).toBe("halted");
      return indexer.reason;
    };
    expect(await reasons([[ev.purchased(1, ADA)]], [[ev.purchased(1, ADA)]])).toMatch(/already purchased/);
    expect(await reasons([[ev.recorded(1, 5)]])).toMatch(/Recorded of game 1 .*no Purchased/);
    expect(await reasons([[ev.purchased(1, ADA), ev.recorded(1, 5), ev.recorded(1, 6)]])).toMatch(/already recorded/);
    expect(await reasons([[ev.settled(1, ADA)]])).toMatch(/Settled of game 1 .*no Purchased/);
    expect(await reasons([[ev.purchased(1, ADA), ev.settled(1, ADA)]])).toMatch(/not recorded/);
    const settled = [ev.purchased(1, ADA), ev.recorded(1, 5000), ev.settled(1, ADA)];
    expect(await reasons([[...settled, ev.settled(1, ADA)]])).toMatch(/already settled/);
    expect(await reasons([[ev.purchased(1, ADA), ev.recorded(1, 5000), ev.settled(1, BO)]])).toMatch(/another player/);
    expect(await reasons([[ev.purchased(1, ADA), ev.recorded(1, 5000), ev.settled(1, ADA, { day: 101 })]])).toMatch(/another day/);
    expect(await reasons([[ev.purchased(1, ADA), ev.recorded(1, 5000), ev.settled(1, ADA, { score: 1 })]])).toMatch(/another score/);
    expect(await reasons([[ev.dayClosed(100)]], [[ev.dayClosed(100)]])).toMatch(/already closed/);
    expect(await reasons([[{ ...ev.purchased(1, ADA), source: "challenge" }]])).toMatch(/undecodable event of challenge/);
  });

  test("a halt rolls the whole block back and stays halted", async () => {
    const indexer = await halted([[ev.spawned("challenge", 1, ADA), ev.over("challenge", 7, ADA, 5)]]);
    expect(indexer.status).toBe("halted");
    expect(indexer.store.dump().games).toEqual([]);
    expect(await indexer.step()).toBe(false);
  });
});

describe("the database", () => {
  test("a database of another schema version is refused, and rebuilt on request", () => {
    const path = tempDb();
    const raw = new DatabaseSync(path);
    raw.exec("CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL); INSERT INTO meta VALUES ('schema', '0')");
    raw.close();
    expect(() => new Store(path)).toThrow(SchemaMismatch);
    const store = new Store(path, { rebuild: true });
    store.open(CONFIG);
    expect(store.meta("schema")).toBe(SCHEMA_VERSION);
    store.close();
  });

  test("IX-XP: schema 17 (the XP gains, #641; 16 was the skin prices, purchases and active sets; 15 was the packs, the sales and the pack purchases; 14 was the Cobbles ledger; 13 was the same ledger under its first names; 12 added purchases.vault_paved, P-56; 11 renamed Daily Challenge, D-23b; 10 added the names cache, N1), and a database of schema 16, 15, 14, 13, 12, 11, 10, 9, 8 or 7 is refused, naming rebuild", () => {
    expect(SCHEMA_VERSION).toBe("17");
    for (const old of ["16", "15", "14", "13", "12", "11", "10", "9", "8", "7"]) {
      const path = tempDb();
      const raw = new DatabaseSync(path);
      raw.exec(`CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL); INSERT INTO meta VALUES ('schema', '${old}')`);
      raw.close();
      expect(() => new Store(path)).toThrow(SchemaMismatch);
      expect(() => new Store(path)).toThrow(new RegExp(`schema ${old}, this indexer 17: rebuild it`));
      // `rebuild` drops it whatever it held and starts it again at 17.
      const rebuilt = new Store(path, { rebuild: true });
      rebuilt.open(CONFIG);
      expect(rebuilt.meta("schema")).toBe("17");
      rebuilt.close();
    }
  });

  test("a schema 8 database with its tables (players with a name and a master) is refused as it is, and rebuilt on request", () => {
    const path = tempDb();
    const raw = new DatabaseSync(path);
    raw.exec(`CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      INSERT INTO meta VALUES ('schema', '8');
      CREATE TABLE players (player_id TEXT PRIMARY KEY, name TEXT NOT NULL, master TEXT NOT NULL,
        created_block INTEGER NOT NULL, created_time INTEGER NOT NULL);
      INSERT INTO players VALUES ('${padded(ADA)}', '${padded(0x416461n)}', '${padded(0xabcn)}', 2, 1000)`);
    raw.close();
    expect(() => new Store(path)).toThrow(SchemaMismatch);
    expect(Store.peek(path)).toMatchObject({ schema: "8" });
    const rebuilt = new Store(path, { rebuild: true });
    rebuilt.open(CONFIG);
    expect(rebuilt.dump().players).toEqual([]);
    rebuilt.close();
  });

  test("the deployment hash covers Challenge, Setup, Economy and Collection, in that order, and no Account", () => {
    const sha = (text: string) => createHash("sha256").update(text).digest("hex");
    expect(deploymentHash(CONFIG)).toBe(sha([CHALLENGE, SETUP, ECONOMY, COLLECTION].join(",")));
    expect(deploymentHash({ ...CONFIG, collection: undefined })).toBe(sha([CHALLENGE, SETUP, ECONOMY].join(",")));
  });

  test("a database is never reused for another deployment, another start or another chain", () => {
    const path = tempDb();
    const first = new Store(path);
    first.open(CONFIG);
    first.close();
    const again = new Store(path);
    expect(() => again.open({ ...CONFIG, challenge: "0x9999" })).toThrow(/another deployment/);
    expect(() => again.open({ ...CONFIG, economy: "0x9999" })).toThrow(/another deployment/);
    expect(() => again.open({ ...CONFIG, setup: "0x9999" })).toThrow(/another deployment/);
    expect(() => again.open({ ...CONFIG, from: 5 })).toThrow(/built from block 1/);
    expect(() => again.open({ ...CONFIG, chainId: "0x1" })).toThrow(/chain/);
    expect(() => again.open(CONFIG)).not.toThrow();
    again.close();
    expect(Store.peek(path)).toMatchObject({ schema: SCHEMA_VERSION, from: 1 });
    expect(Store.peek(join(tempDb(), "missing"))).toEqual({});
  });

  test("the history below the kept depth is forgotten, the rows are not", async () => {
    const node = played();
    for (let i = 0; i < 8; i++) node.mine();
    const indexer = indexerOf(node, 3);
    await settle(indexer);
    expect(indexer.store.lowest()!.number).toBeGreaterThan(1);
    expect(indexer.store.dump().games).toHaveLength(3);
  });
});
