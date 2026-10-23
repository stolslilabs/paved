// #643, #647: the PvP attacks of `Arena` (`pvp_attacks`), the defence log of a village and the attacks of a player.
import { describe, expect, test } from "vitest";
import { padded, SELECTORS } from "./events.ts";
import { Queries } from "./queries.ts";
import { respond } from "./server.ts";
import { FakeNode, ev, raw } from "./testing/fake-node.ts";
import { indexerOf, indexerWithArena, settle } from "./testing/setup.ts";

const A = 0xa1n;
const B = 0xb2n;
const C = 0xc3n;
const PA = padded(A);
const PB = padded(B);

async function open(build: (node: FakeNode) => void) {
  const node = new FakeNode();
  build(node);
  const indexer = indexerWithArena(node);
  await settle(indexer);
  return { node, indexer, queries: new Queries(indexer.store), head: node.tip };
}

describe("the PvP attacks", () => {
  test("a finished attack is in the defender's log and the attacker's list, newest first", async () => {
    const { indexer, queries, head } = await open((node) => {
      node.mine([ev.attackOpened(A, B, 1, { offer: 30, target: 1200, tiles: 24 })]);
      node.mine([ev.attackFinished(A, B, 1, { score: 1100, stars: 2, gained: 20 })]);
      node.mine([ev.attackOpened(C, B, 1, { target: 1250 })]);
      node.mine([ev.attackFinished(C, B, 1, { score: 0, surrendered: true, lost: 20 })]);
      // Open: in no list yet
      node.mine([ev.attackOpened(A, C, 2)]);
    });
    expect(indexer.status).not.toBe("halted");
    const log = queries.playerAttacks(head, PB, "defender", 10);
    expect(log.attacks.map((a) => [a.attacker, a.id, a.stars, a.gained, a.lost, a.surrendered])).toEqual([
      [padded(C), 1, 0, 0, 20, true],
      [PA, 1, 2, 20, 0, false],
    ]);
    expect(log.attacks[1]).toMatchObject({ defender: PB, npc: false, target: 1200, tiles: 24, score: 1100 });
    expect(queries.playerAttacks(head, PA, "attacker", 10).attacks.map((a) => a.id)).toEqual([1]);
    // At an earlier head, the attack had not ended
    expect(queries.playerAttacks(1, PB, "defender", 10).attacks).toEqual([]);
    expect(queries.playerAttacks(head, PB, "defender", 1).attacks).toHaveLength(1);
  });

  test("GET /v1/players/{id}/defences and /attacks", async () => {
    const { indexer } = await open((node) => {
      node.mine([ev.attackOpened(A, B, 1)]);
      node.mine([ev.attackFinished(A, B, 1, { score: 800, stars: 1, gained: 10 })]);
    });
    const log = respond(indexer, "GET", `/v1/players/${PB}/defences?limit=5`);
    expect(log.code).toBe(200);
    expect(log.body).toMatchObject({ player_id: PB, side: "defender", attacks: [{ attacker: PA, id: 1, stars: 1, gained: 10 }] });
    expect(respond(indexer, "GET", `/v1/players/${PA}/attacks`).body).toMatchObject({ side: "attacker", attacks: [{ defender: PB }] });
    expect(respond(indexer, "GET", `/v1/players/${PB}/defences?limit=0`).code).toBe(400);
  });

  test("a skipped opponent writes an attack in no list", async () => {
    const { indexer, queries, head } = await open((node) => {
      node.mine([ev.attackSkipped(A, B, 1)]);
    });
    expect(indexer.status).not.toBe("halted");
    expect(indexer.store.dump().pvp_attacks.map((r) => [r.attacker, r.id, r.status])).toEqual([[PA, 1, 4]]);
    expect(queries.playerAttacks(head, PB, "defender", 10).attacks).toEqual([]);
  });

  test("the engine's game events of an attack's finish are skipped", async () => {
    const { indexer } = await open((node) => {
      node.mine([ev.attackOpened(A, B, 1)]);
      node.mine([raw("arena", "GameSpawned", [7, A], [1, 0, 1000, 0]), raw("arena", "AttackPlayed", [A], [1, 0, 3, 0, 1, 0, 0]), ev.attackFinished(A, B, 1, { score: 900, stars: 1, gained: 10 })]);
    });
    expect(indexer.status).not.toBe("halted");
    expect(indexer.store.dump().games).toEqual([]);
    expect(SELECTORS.AttackPlayed).toBeTruthy();
  });

  test("an end without its opening halts", async () => {
    const { indexer } = await open((node) => {
      node.mine([ev.attackFinished(A, B, 3, { stars: 1 })]);
    });
    expect(indexer.status).toBe("halted");
    expect(indexer.reason).toMatch(/AttackFinished .*no AttackOpened/);
  });

  test("a reorg takes an end back, then the opening", async () => {
    const { node, indexer, queries } = await open((node) => {
      node.mine([ev.attackOpened(A, B, 1)]);
      node.mine([ev.attackFinished(A, B, 1, { stars: 3, gained: 30 })]);
    });
    node.reorg(1, [[]]);
    await settle(indexer);
    expect(indexer.store.dump().pvp_attacks.map((r) => [r.id, r.status, r.stars])).toEqual([[1, 1, null]]);
    expect(queries.playerAttacks(node.tip, PB, "defender", 10).attacks).toEqual([]);
    node.reorg(2, [[], [], []]);
    await settle(indexer);
    expect(indexer.store.dump().pvp_attacks).toEqual([]);
  });

  test("a deployment without an Arena reads no attack", async () => {
    const node = new FakeNode();
    node.mine([ev.attackOpened(A, B, 1)]);
    const indexer = indexerOf(node);
    await settle(indexer);
    expect(indexer.status).not.toBe("halted");
    expect(indexer.store.dump().pvp_attacks).toEqual([]);
  });
});
