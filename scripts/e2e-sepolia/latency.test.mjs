// bun test scripts/e2e-sepolia/latency.test.mjs: synthetic traffic and probe events only.
import { expect, test } from "bun:test";
import { createTracker, faucetSample, median, moveSample, observe, promptedBetween, purchaseSample, renderMarkdown, summarize, toJson, txSince } from "./latency.mjs";

const HASH = "0x00ab";
const call = (id, method, params) => JSON.stringify({ jsonrpc: "2.0", id, method, params });
const answer = (id, result) => JSON.stringify({ jsonrpc: "2.0", id, result });

function traffic(tr, t0) {
  observe(tr, call(1, "starknet_addInvokeTransaction", { invoke_transaction: {} }), answer(1, { transaction_hash: HASH }), t0 + 900);
  observe(tr, call(2, "starknet_getTransactionStatus", { transaction_hash: "0xab" }), answer(2, { finality_status: "RECEIVED" }), t0 + 1100);
  observe(tr, call(3, "starknet_getTransactionStatus", { transaction_hash: "0xab" }), answer(3, { finality_status: "ACCEPTED_ON_L2", execution_status: "SUCCEEDED" }), t0 + 3000);
  observe(tr, call(4, "starknet_getTransactionStatus", { transaction_hash: "0xab" }), answer(4, { finality_status: "ACCEPTED_ON_L2" }), t0 + 3300);
  observe(tr, call(5, "starknet_getTransactionReceipt", ["0xab"]), answer(5, { transaction_hash: HASH, events: [] }), t0 + 3400);
}

test("observe keeps the hash, the first time of each status and the first receipt, whatever the hash's spelling", () => {
  const tr = createTracker();
  traffic(tr, 1000);
  expect(tr.hashes).toHaveLength(1);
  const e = tr.hashes[0];
  expect(e.hash).toBe("0xab");
  expect(e.hashAt).toBe(1900);
  expect(e.statuses).toEqual({ RECEIVED: 2100, ACCEPTED_ON_L2: 4000 });
  expect(e.receiptAt).toBe(4400);
  expect(txSince(tr, 1000)).toBe(e);
  expect(txSince(tr, 2000)).toBeNull();
});

test("observe ignores errors, a batch is read per id, bodies that are not JSON are ignored", () => {
  const tr = createTracker();
  observe(tr, call(1, "starknet_getTransactionReceipt", ["0xab"]), JSON.stringify({ jsonrpc: "2.0", id: 1, error: { code: 29, message: "Transaction hash not found" } }), 10);
  observe(tr, "not json", "<html>", 11);
  expect(tr.hashes).toHaveLength(0);
  observe(
    tr,
    JSON.stringify([call(1, "starknet_getTransactionStatus", ["0xcd"]), call(2, "starknet_getTransactionReceipt", ["0xcd"])].map((c) => JSON.parse(c))),
    JSON.stringify([JSON.parse(answer(2, { transaction_hash: "0xcd" })), JSON.parse(answer(1, { finality_status: "PRE_CONFIRMED" }))]),
    20,
  );
  expect(tr.byHash.get("0xcd")).toMatchObject({ statuses: { PRE_CONFIRMED: 20 }, receiptAt: 20 });
});

test("a move: t1-t0, t2-t1 and t2-t0 from the hash and the end of 'Working...'", () => {
  const tr = createTracker();
  traffic(tr, 1000);
  const events = [
    { k: "working", t: 1040, v: true },
    { k: "working", t: 4600, v: false },
  ];
  const s = moveSample(1, 1000, txSince(tr, 1000), events);
  expect(s).toMatchObject({ "t1-t0": 900, "t2-t1": 2700, "t2-t0": 3600, uiFeedback: 40, accepted: 3000, receipt: 3400, hash: "0xab", prompted: false });
  expect(s.statuses).toEqual({ RECEIVED: 1100, ACCEPTED_ON_L2: 3000 });
});

test("a move whose end was not seen keeps null, and is left out of the summary", () => {
  const tr = createTracker();
  traffic(tr, 0);
  const s = moveSample(1, 0, txSince(tr, 0), [{ k: "working", t: 30, v: true }]);
  expect(s["t2-t0"]).toBeNull();
  expect(summarize([s]).move.used).toBe(0);
});

test("a purchase: the receipt, then the game address, then the board", () => {
  const tr = createTracker();
  traffic(tr, 0);
  const events = [
    { k: "url", t: 0, v: "/" },
    { k: "url", t: 4000, v: "/game?id=7" },
    { k: "tiles", t: 4000, v: null },
    { k: "tiles", t: 4800, v: 0 },
  ];
  const s = purchaseSample(1, 0, txSince(tr, 0), events);
  expect(s).toMatchObject({ "t1-t0": 900, "t2-t1": 2500, "t3-t2": 600, "t3-t0": 4000, board: 4800, gameId: 7 });
});

test("the faucet: the button's 'Minting...' label brackets the mint", () => {
  const tr = createTracker();
  traffic(tr, 0);
  const s = faucetSample(1, 0, txSince(tr, 0), [
    { k: "minting", t: 30, v: true },
    { k: "minting", t: 5000, v: false },
  ]);
  expect(s).toMatchObject({ "t1-t0": 900, "t2-t1": 2500, "t3-t2": 1600, "t3-t0": 5000, uiFeedback: 30 });
});

test("median and max leave out prompted samples; the table and the JSON carry every sample", () => {
  const mk = (n, t2, prompted) => ({ kind: "move", n, at: "2026-10-14T10:00:00.000Z", "t1-t0": 500, "t2-t1": t2 - 500, "t2-t0": t2, uiFeedback: 30, accepted: null, receipt: null, prompted });
  const samples = [mk(1, 3000, false), mk(2, 5000, false), mk(3, 4000, false), mk(4, 90000, true)];
  const sum = summarize(samples).move;
  expect(sum).toMatchObject({ samples: 4, used: 3 });
  expect(sum.median["t2-t0"]).toBe(4000);
  expect(sum.max["t2-t0"]).toBe(5000);
  expect(median([1, 2, 3, 4])).toBe(3);
  const meta = { url: "https://example.test", startedAt: "2026-10-14T10:00:00Z", localHour: 12, network: "sepolia", notes: [] };
  const md = renderMarkdown(samples, meta);
  expect(md).toContain("| **median** (3 of 4) |");
  expect(md).toContain("| 4 | 10:00:00 | 0.50 s | 89.50 s | 90.00 s |");
  expect(toJson(samples, meta).samples).toHaveLength(4);
});

test("a prompt is a Controller frame shown from t0 on, or already shown at t0", () => {
  const ev = [{ k: "keychain", t: 100, v: false }, { k: "keychain", t: 500, v: true }, { k: "keychain", t: 800, v: false }];
  expect(promptedBetween(ev, 200, 400)).toBe(false);
  expect(promptedBetween(ev, 200, 600)).toBe(true);
  expect(promptedBetween(ev, 600, 700)).toBe(true);
  expect(promptedBetween(ev, 900, 1000)).toBe(false);
});

test("a move with no transaction has no t2: the write was refused, nothing was confirmed", () => {
  const s = moveSample(1, 0, null, [{ k: "working", t: 30, v: true }, { k: "working", t: 300, v: false }]);
  expect(s).toMatchObject({ t1: null, t2: null, "t2-t0": null, uiFeedback: 30 });
});
