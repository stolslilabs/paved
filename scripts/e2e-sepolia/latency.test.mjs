// bun test scripts/e2e-sepolia/latency.test.mjs: synthetic traffic and probe events only.
import { expect, test } from "bun:test";
import { createTracker, enrichSamples, faucetSample, formatFee, receiptFields, median, moveSample, observe, promptedBetween, purchaseSample, renderMarkdown, summarize, toJson, txSince } from "./latency.mjs";

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

// The shape of a receipt in Starknet JSON-RPC 0.8/0.9 (an INVOKE receipt, ACCEPTED_ON_L2): fee in FRI, `execution_resources` with the three gas fields.
const RECEIPT = {
  type: "INVOKE",
  transaction_hash: "0xab",
  actual_fee: { amount: "0x2386f26fc10000", unit: "FRI" }, // 0.01 STRK
  finality_status: "ACCEPTED_ON_L2",
  execution_status: "SUCCEEDED",
  block_hash: "0x1234",
  block_number: 4242,
  messages_sent: [],
  events: [],
  execution_resources: { l1_gas: 0, l1_data_gas: 160, l2_gas: 1234567 },
};

test("receiptFields maps block, fee (decimal string and unit) and the execution resources as given", () => {
  expect(receiptFields(RECEIPT)).toEqual({ block: 4242, fee: { amount: "10000000000000000", unit: "FRI" }, resources: RECEIPT.execution_resources });
  expect(receiptFields({ ...RECEIPT, block_number: undefined })).toMatchObject({ block: null });
  expect(receiptFields(null)).toEqual({ block: null, fee: null, resources: null });
});

// A node that answers the two reads from tables; `calls` records them (reads only).
const node = (receipts, blocks) => {
  const calls = [];
  const fetchFn = async (_url, init) => {
    const { method, params, id } = JSON.parse(init.body);
    calls.push(method);
    if (method === "starknet_getTransactionReceipt") {
      const r = receipts[params.transaction_hash];
      return { json: async () => (r ? { id, result: r } : { id, error: { code: 29, message: "Transaction hash not found" } }) };
    }
    const b = blocks[params.block_id.block_number];
    if (b === "down") throw new Error("fetch failed");
    return { json: async () => ({ id, result: b }) };
  };
  return { fetchFn, calls };
};

const sampleWith = (kind, n, hash, extra = {}) => ({ kind, n, at: "2026-10-14T10:00:00.000Z", "t1-t0": 500, "t2-t1": 2500, "t2-t0": 3000, uiFeedback: 30, accepted: null, receipt: null, prompted: false, hash, tx: hash, ...extra });

test("enrichSamples reads the receipt and the block once per block, and adds the fields to each sample", async () => {
  const samples = [sampleWith("move", 1, "0xab"), sampleWith("move", 2, "0xcd"), sampleWith("purchase", 1, "0xef")];
  const { fetchFn, calls } = node({ "0xab": RECEIPT, "0xcd": { ...RECEIPT, block_number: 4242 }, "0xef": { ...RECEIPT, block_number: 4243, actual_fee: { amount: "0x4", unit: "WEI" } } }, { 4242: { timestamp: 1760000000 }, 4243: { timestamp: 1760000012 } });
  expect(await enrichSamples(samples, "http://node", fetchFn)).toEqual([]);
  expect(samples[0]).toMatchObject({ block: 4242, blockTimestamp: 1760000000, fee: { amount: "10000000000000000", unit: "FRI" }, resources: { l1_gas: 0, l1_data_gas: 160, l2_gas: 1234567 }, hash: "0xab", tx: "0xab" });
  expect(samples[2]).toMatchObject({ block: 4243, blockTimestamp: 1760000012, fee: { amount: "4", unit: "WEI" } });
  expect(calls.filter((c) => c === "starknet_getBlockWithTxHashes")).toHaveLength(2);
  expect(calls.filter((c) => c === "starknet_getTransactionReceipt")).toHaveLength(3);
  expect(calls.every((c) => c.startsWith("starknet_get"))).toBe(true);
  await enrichSamples(samples, "http://node", fetchFn); // already read: nothing more is asked
  expect(calls).toHaveLength(5);
});

test("a failed read gives null and a note, and the run goes on; a sample with no hash is left alone", async () => {
  const samples = [sampleWith("move", 1, "0xab"), sampleWith("move", 2, "0x99"), sampleWith("move", 3, null)];
  const { fetchFn } = node({ "0xab": RECEIPT }, { 4242: "down" });
  const notes = await enrichSamples(samples, "http://node", fetchFn);
  expect(samples[0]).toMatchObject({ block: 4242, blockTimestamp: null, fee: { amount: "10000000000000000", unit: "FRI" } });
  expect(samples[1]).toMatchObject({ block: null, blockTimestamp: null, fee: null, resources: null });
  expect("blockTimestamp" in samples[2]).toBe(false);
  expect(notes).toHaveLength(2);
  expect(notes[0]).toContain("block 4242 timestamp");
  expect(notes[1]).toContain("Transaction hash not found");
  const down = async () => {
    throw new Error("ECONNREFUSED");
  };
  const s = [sampleWith("move", 1, "0xab")];
  expect(await enrichSamples(s, "http://node", down)).toHaveLength(1);
  expect(s[0]).toMatchObject({ block: null, fee: null });
});

test("formatFee: FRI in STRK with 6 decimals, rounded; n/a when there is no fee", () => {
  expect(formatFee({ amount: "10000000000000000", unit: "FRI" })).toBe("0.010000 STRK");
  expect(formatFee({ amount: "1234567890123456789", unit: "FRI" })).toBe("1.234568 STRK");
  expect(formatFee({ amount: "0", unit: "FRI" })).toBe("0.000000 STRK");
  expect(formatFee(null)).toBe("n/a");
});

test("the Markdown has block, fee and L2 gas columns and a median fee and gas line per kind; n/a for a sample not read", () => {
  const fee = (a) => ({ amount: String(a), unit: "FRI" });
  const res = (g) => ({ l1_gas: 0, l1_data_gas: 160, l2_gas: g });
  const samples = [
    sampleWith("move", 1, "0xa1", { block: 10, blockTimestamp: 1, fee: fee(1_000_000_000_000_000), resources: res(100) }),
    sampleWith("move", 2, "0xa2", { block: 11, blockTimestamp: 2, fee: fee(3_000_000_000_000_000), resources: res(300) }),
    sampleWith("move", 3, "0xa3", { block: 12, blockTimestamp: 3, fee: fee(2_000_000_000_000_000), resources: res(200) }),
    sampleWith("move", 4, "0xa4", { block: null, blockTimestamp: null, fee: null, resources: null }),
  ];
  const sum = summarize(samples).move;
  expect(sum.fee).toEqual({ amount: "2000000000000000", unit: "FRI" });
  expect(sum.l2Gas).toBe(200);
  const md = renderMarkdown(samples, { url: "u", startedAt: "s", localHour: 1, network: "sepolia", notes: [] });
  expect(md).toContain("| block | fee | L2 gas | prompt |");
  expect(md).toContain("| 10 | 0.001000 STRK | 100 | no |");
  expect(md).toContain("| n/a | n/a | n/a | no |");
  expect(md).toContain("| **median** (4 of 4) |");
  expect(md).toContain("Median fee 0.002000 STRK, median L2 gas 200 (4 of 4 samples).");
  expect(toJson(samples, {}).summary.move.l2Gas).toBe(200);
  expect(toJson(samples, {}).samples[0]).toMatchObject({ tx: "0xa1", block: 10, blockTimestamp: 1, fee: fee(1_000_000_000_000_000), resources: res(100) });
});

test("a kind with no fee read has a null median fee and gas, shown n/a", () => {
  const s = [sampleWith("faucet", 1, "0xa1", { t3: 1, "t3-t2": 1, "t3-t0": 1 })];
  expect(summarize(s).faucet).toMatchObject({ fee: null, l2Gas: null });
  expect(renderMarkdown(s, { url: "u", startedAt: "s", localHour: 1, network: "n", notes: [] })).toContain("Median fee n/a, median L2 gas n/a");
});
