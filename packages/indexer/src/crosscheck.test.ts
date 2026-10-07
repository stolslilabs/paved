import { hash } from "starknet";
import { describe, expect, test } from "vitest";
import { Chain } from "./chain.ts";
import { CrossCheck } from "./crosscheck.ts";
import { canonical, padded } from "./events.ts";
import { Queries } from "./queries.ts";
import { respond } from "./server.ts";
import { DAILY, FakeNode, TUTORIAL, ACCOUNT, ev } from "./testing/fake-node.ts";
import { indexerOf, settle } from "./testing/setup.ts";

const A = 0xa1n;
const B = 0xb2n;
const DAY = 100;
const SELECTOR = canonical(hash.getSelectorFromName("tournament"));

/** The felts of a `TournamentView`: id, start, end, over, prize (u256), then player, score, claimed per rank. */
const view = (slots: [bigint, number][]) => {
  const top = [0, 1, 2].flatMap((rank) => {
    const [player, score] = slots[rank] ?? [0n, 0];
    return [`0x${player.toString(16)}`, `0x${score.toString(16)}`, "0x0"];
  });
  return ["0x64", "0x0", "0x0", "0x1", "0x0", "0x0", ...top];
};

async function scenario(slots: [bigint, number][]) {
  const node = new FakeNode();
  node.mine([ev.created(A, 0x41)], [ev.created(B, 0x42)]);
  node.mine([ev.spawned("daily", 1, A, { tournament: DAY })], [ev.spawned("daily", 2, B, { tournament: DAY })]);
  node.mine([ev.over("daily", 1, A, 50, { tournament: DAY })]);
  node.mine([ev.over("daily", 2, B, 40, { tournament: DAY })]);
  const calls: { address: string; calldata: string[]; blockHash: string }[] = [];
  node.views = (address, selector, calldata, blockHash) => {
    expect(selector).toBe(SELECTOR);
    calls.push({ address, calldata, blockHash });
    return view(slots);
  };
  node.time = (DAY + 1) * 86400 + 5; // the next block is after the end of the day
  node.mine();
  const indexer = indexerOf(node);
  await settle(indexer);
  const chain = new Chain(node.rpc, { daily: DAILY, tutorial: TUTORIAL, account: ACCOUNT });
  const check = new CrossCheck(chain, new Queries(indexer.store));
  return { node, indexer, check, calls };
}

describe("the cross-check against the tournament view", () => {
  test("a closed day that matches the view is checked once, with no mismatch", async () => {
    const { indexer, check, calls } = await scenario([[A, 50], [B, 40]]);
    await check.run(indexer.served!);
    await check.run(indexer.served!);
    expect(check.lastMismatch).toBeNull();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ address: DAILY, calldata: ["0x64"], blockHash: indexer.served!.hash });
    expect([...check.checked]).toEqual([DAY]);
  });

  test("a difference is reported, never acted on", async () => {
    const { indexer, check } = await scenario([[B, 40], [A, 50]]);
    await check.run(indexer.served!);
    expect(check.lastMismatch).toEqual({
      tournament_id: DAY,
      head_number: indexer.served!.number,
      view: [
        { player_id: padded(B), score: 40 },
        { player_id: padded(A), score: 50 },
        { player_id: padded(0n), score: 0 },
      ],
      indexed: [
        { player_id: padded(A), score: 50 },
        { player_id: padded(B), score: 40 },
        { player_id: padded(0n), score: 0 },
      ],
    });
    expect(indexer.status).toBe("ok");
    const head = respond(indexer, "GET", "/v1/head", { chainId: "0x1", fromBlock: 1, contracts: { daily: DAILY, tutorial: TUTORIAL, account: ACCOUNT }, checks: check });
    expect(head.body).toMatchObject({ checks: { last_mismatch: { tournament_id: DAY } } });
  });

  test("a day still open is not checked, and a failed call is retried", async () => {
    const node = new FakeNode();
    node.mine([ev.created(A, 0x41)]);
    node.mine([ev.spawned("daily", 1, A, { tournament: DAY })]);
    node.time = DAY * 86400 + 10; // inside the day
    node.mine();
    const indexer = indexerOf(node);
    await settle(indexer);
    let calls = 0;
    node.views = () => {
      calls++;
      throw new Error("down");
    };
    const check = new CrossCheck(new Chain(node.rpc, { daily: DAILY, tutorial: TUTORIAL, account: ACCOUNT }), new Queries(indexer.store));
    await check.run(indexer.served!);
    expect(calls).toBe(0);
    node.time = (DAY + 1) * 86400;
    node.mine();
    await settle(indexer);
    await check.run(indexer.served!); // the call fails: nothing recorded
    expect(calls).toBe(1);
    expect(check.checked.size).toBe(0);
    node.views = () => view([]);
    await check.run(indexer.served!);
    expect(check.checked.has(DAY)).toBe(true);
    check.reset();
    expect(check.checked.size).toBe(0);
  });

  test("it runs as the hook after a block is served", async () => {
    const node = new FakeNode();
    node.mine([ev.created(A, 0x41)]);
    node.mine([ev.spawned("daily", 1, A, { tournament: DAY })]);
    node.mine([ev.over("daily", 1, A, 50, { tournament: DAY })]);
    node.views = () => view([[A, 50]]);
    node.time = (DAY + 1) * 86400;
    node.mine();
    let check: CrossCheck | undefined;
    const indexer = indexerOf(node, 1000, undefined, async (served) => {
      await check?.run(served);
    });
    check = new CrossCheck(new Chain(node.rpc, { daily: DAILY, tutorial: TUTORIAL, account: ACCOUNT }), new Queries(indexer.store));
    await settle(indexer);
    expect(check.checked.has(DAY)).toBe(true);
    expect(check.lastMismatch).toBeNull();
  });
});
