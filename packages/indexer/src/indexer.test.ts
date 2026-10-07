import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, test } from "vitest";
import { Chain } from "./chain.ts";
import { SELECTORS, decode, padded } from "./events.ts";
import { Indexer } from "./indexer.ts";
import { SchemaMismatch, Store } from "./store.ts";
import { ACCOUNT, DAILY, FakeNode, TUTORIAL, ev } from "./testing/fake-node.ts";
import { CONFIG, indexerOf, settle } from "./testing/setup.ts";

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

/** A chain with two players and a few games, one block each. */
function played(node = new FakeNode()) {
  node.mine([ev.created(ADA, 0x416461)], [ev.created(BO, 0x426f)]);
  node.mine([ev.spawned("daily", 1, ADA), ev.built("daily", 1)]);
  node.mine([ev.spawned("daily", 2, BO)], [ev.spawned("tutorial", 1, ADA)]);
  node.mine([ev.over("daily", 1, ADA, 50)]);
  node.mine([ev.over("tutorial", 1, ADA, 9)]);
  return node;
}

describe("following the chain", () => {
  test("applies the three events in block order and skips the known ones", async () => {
    const node = played();
    const indexer = indexerOf(node);
    await settle(indexer);
    expect(indexer.status).toBe("ok");
    expect(indexer.served?.number).toBe(node.tip);
    const dump = indexer.store.dump();
    expect(dump.players.map((p) => p.name)).toEqual([padded(0x416461n), padded(0x426fn)]);
    expect(dump.games.map((g) => [g.contract, g.game_id, g.over, g.score])).toEqual([
      ["daily", 1, 1, 50],
      ["daily", 2, 0, null],
      ["tutorial", 1, 1, 9],
    ]);
    expect(dump.events.map((e) => e.name)).toEqual([
      "PlayerCreated",
      "PlayerCreated",
      "GameSpawned",
      "GameSpawned",
      "GameSpawned",
      "GameOver",
      "GameOver",
    ]);
    expect(indexer.eventsApplied).toBe(7);
  });

  test("a block applied twice changes nothing", async () => {
    const node = played();
    const indexer = indexerOf(node);
    await settle(indexer);
    const before = indexer.store.dump();
    const block = indexer.store.block(3)!;
    const raws = await new Chain(node.rpc, { daily: DAILY, tutorial: TUTORIAL, account: ACCOUNT }).events(block);
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
      chain: new Chain(node.rpc, { daily: DAILY, tutorial: TUTORIAL, account: ACCOUNT }),
      store: new Store(path),
      config: CONFIG,
      depth: 1000,
    });
    await settle(first);
    const applied = first.blocksApplied;
    expect(applied).toBeGreaterThan(0);
    first.store.close();

    node.mine([ev.over("daily", 2, BO, 70)]);
    const second = new Indexer({
      chain: new Chain(node.rpc, { daily: DAILY, tutorial: TUTORIAL, account: ACCOUNT }),
      store: new Store(path),
      config: CONFIG,
      depth: 1000,
    });
    await settle(second);
    expect(second.blocksApplied).toBe(1);
    expect(second.store.dump().games.find((g) => g.game_id === 2 && g.contract === "daily")?.score).toBe(70);
    second.store.close();
  });
});

describe("reorgs", () => {
  test("a replaced block rewinds the tables, and the result equals a fresh index of the new chain", async () => {
    const node = played();
    const indexer = indexerOf(node);
    await settle(indexer);
    // The last two blocks (two game overs) are replaced: Ada's game 1 now ends with another score, and the tutorial game stays running.
    node.reorg(2, [[[ev.over("daily", 1, ADA, 33)]]]);
    await settle(indexer);
    expect(indexer.rewindCount).toBe(1);
    expect(indexer.status).toBe("ok");
    const games = indexer.store.dump().games;
    expect(games.find((g) => g.contract === "daily" && g.game_id === 1)?.score).toBe(33);
    expect(games.find((g) => g.contract === "tutorial")?.over).toBe(0);

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
    expect(games.map((g) => [g.contract, g.game_id, g.over])).toEqual([["daily", 1, 0]]);
    expect(indexer.store.dump().players).toHaveLength(2);
  });

  test("a devnet replacement that keeps the block hash is seen through its commitments", async () => {
    const node = played();
    const indexer = indexerOf(node);
    await settle(indexer);
    node.reorg(1, [[[ev.over("tutorial", 1, ADA, 11)]]], true);
    await settle(indexer);
    expect(indexer.rewindCount).toBe(1);
    expect(indexer.store.dump().games.find((g) => g.contract === "tutorial")?.score).toBe(11);
  });
});

describe("halts", () => {
  const halted = async (...blocks: Parameters<FakeNode["mine"]>[]) => {
    const node = new FakeNode();
    node.mine([ev.created(ADA, 0x416461)]);
    for (const transactions of blocks) node.mine(...transactions);
    const indexer = indexerOf(node);
    await settle(indexer);
    return indexer;
  };

  test("a GameOver with no GameSpawned", async () => {
    const indexer = await halted([[ev.over("daily", 9, ADA, 5)]]);
    expect(indexer.status).toBe("halted");
    expect(indexer.reason).toMatch(/no GameSpawned/);
  });

  test("a second GameOver of one game", async () => {
    const indexer = await halted([[ev.spawned("daily", 1, ADA)]], [[ev.over("daily", 1, ADA, 5)]], [[ev.over("daily", 1, ADA, 6)]]);
    expect(indexer.status).toBe("halted");
    expect(indexer.reason).toMatch(/already over/);
  });

  test("a GameSpawned for an existing id, and a second PlayerCreated", async () => {
    const twice = await halted([[ev.spawned("daily", 1, ADA)]], [[ev.spawned("daily", 1, BO)]]);
    expect(twice.status).toBe("halted");
    expect(twice.reason).toMatch(/already exists/);
    const player = await halted([[ev.created(ADA, 0x41)]]);
    expect(player.status).toBe("halted");
    expect(player.reason).toMatch(/player already exists/);
  });

  test("a mode that does not match its contract", async () => {
    const indexer = await halted([[ev.spawned("tutorial", 1, ADA, { mode: 1 })]]);
    expect(indexer.status).toBe("halted");
    expect(indexer.reason).toMatch(/expected mode 3/);
  });

  test("a GameOver of another player than the one that spawned the game", async () => {
    const indexer = await halted([[ev.spawned("daily", 1, ADA)]], [[ev.over("daily", 1, BO, 5)]]);
    expect(indexer.status).toBe("halted");
    expect(indexer.reason).toMatch(/another player/);
  });

  test("an event of no known selector, an event of the wrong contract, and a wrong shape", async () => {
    const unknown = await halted([[{ source: "daily", keys: ["0x1234"], data: [] }]]);
    expect(unknown.status).toBe("halted");
    expect(unknown.reason).toMatch(/undecodable event of daily/);
    const wrong = await halted([[{ ...ev.spawned("daily", 1, ADA), source: "account" }]]);
    expect(wrong.status).toBe("halted");
    const shape = await halted([[{ source: "daily", keys: [SELECTORS.GameOver, "0x1"], data: [] }]]);
    expect(shape.status).toBe("halted");
  });

  test("a halt rolls the whole block back and stays halted", async () => {
    const indexer = await halted([[ev.spawned("daily", 1, ADA), ev.over("daily", 7, ADA, 5)]]);
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
    expect(store.meta("schema")).toBe("1");
    store.close();
  });

  test("a database is never reused for another deployment, another start or another chain", () => {
    const path = tempDb();
    const first = new Store(path);
    first.open(CONFIG);
    first.close();
    const again = new Store(path);
    expect(() => again.open({ ...CONFIG, daily: "0x9999" })).toThrow(/another deployment/);
    expect(() => again.open({ ...CONFIG, from: 5 })).toThrow(/built from block 1/);
    expect(() => again.open({ ...CONFIG, chainId: "0x1" })).toThrow(/chain/);
    expect(() => again.open(CONFIG)).not.toThrow();
    again.close();
    expect(Store.peek(path)).toMatchObject({ schema: "1", from: 1 });
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
