// Latency measures of the release smoke (S1, D-28): what a player feels between a click and the confirmed state.
// Shared by part-b.mjs (Sepolia, Controller) and latency-devnet.mjs (devnet, burner signer, the dry run of the same code).
// The definitions are in docs/client/f-release.md, "Latency". All times are `Date.now()` in ms (the page and the driver share the
// host's clock). Nothing is read from a page but the visible texts the client shows, the address bar and the JSON-RPC traffic's
// transaction hashes, statuses and receipts' arrival (the receipt body is not kept). What a transaction cost (block, fee, gas) is read
// from the node after the run (`enrichSamples`), never from the page's traffic.

/** Seen from inside the page, every PROBE_MS: the texts the client shows and the address, recorded when they change. */
export const PROBE_MS = 20;

/**
 * Init script (`page.addInitScript(PROBE_SOURCE)`). Pushes `{ k, t, v }` to `window.__lat` on each change of:
 *   working   the Game page's "Working..." label (a write is pending: the surrender button's text), v = true / false
 *   minting   the token panel's "Minting..." label, v = true / false
 *   tiles     the "<n> / 38" counter, v = n
 *   url       the address (path and `id` only), v = "/game?id=3"
 *   keychain  the Controller's frame is shown (a screen the player must act on), v = true / false
 */
export const PROBE_SOURCE = `(() => {
  if (window.__lat) return;
  const events = (window.__lat = []);
  const last = {};
  const push = (k, v) => { if (last[k] !== v) { last[k] = v; events.push({ k, t: Date.now(), v }); } };
  const tick = () => {
    const text = document.body ? document.body.textContent || "" : "";
    push("working", text.includes("Working..."));
    push("minting", text.includes("Minting..."));
    const m = text.match(/(\\d+)\\s*\\/\\s*38/);
    push("tiles", m ? Number(m[1]) : null);
    const f = document.querySelector('iframe[src*="x.cartridge.gg"]');
    const r = f ? f.getBoundingClientRect() : null;
    const cs = f ? getComputedStyle(f) : null;
    push("keychain", !!f && r.width > 0 && r.height > 0 && cs.display !== "none" && cs.visibility !== "hidden" && cs.opacity !== "0");
    const u = new URL(location.href);
    push("url", u.pathname + (u.searchParams.has("id") ? "?id=" + u.searchParams.get("id") : ""));
  };
  setInterval(tick, ${PROBE_MS});
})();`;

export const probeEvents = (page) => page.evaluate(() => window.__lat ?? []).catch(() => []);

/** First event of kind `k` at or after `after` that satisfies `ok`, or null. */
export const firstEvent = (events, k, after, ok = () => true) => events.find((e) => e.k === k && e.t >= after && ok(e.v)) ?? null;

// ---- JSON-RPC traffic: hashes, statuses, receipts

const norm = (h) => {
  try {
    return `0x${BigInt(h).toString(16)}`;
  } catch {
    return null;
  }
};
const paramHash = (params) => norm(Array.isArray(params) ? params[0] : (params?.transaction_hash ?? null));

/** A tracker of what the node answered about each transaction: hash first seen, first time of each finality status, receipt. */
export const createTracker = () => ({ hashes: [], byHash: new Map() });

const entry = (tr, hash, at) => {
  let e = tr.byHash.get(hash);
  if (!e) {
    e = { hash, hashAt: at, statuses: {}, receiptAt: null };
    tr.byHash.set(hash, e);
    tr.hashes.push(e);
  }
  return e;
};

/**
 * One exchange of the page with a node, request and answer bodies as text (a JSON-RPC call or a batch). Records:
 *   the hash of a new transaction (`starknet_addInvokeTransaction`, or any answer that carries a `transaction_hash`, as the paymaster's),
 *   the first time each `finality_status` of `starknet_getTransactionStatus` was answered for a hash,
 *   the first answered `starknet_getTransactionReceipt` (with a result, not an error) for a hash.
 * Returns nothing; bodies that are not JSON are ignored.
 */
export function observe(tr, requestBody, answerBody, at) {
  let reqs;
  let ans;
  try {
    reqs = JSON.parse(requestBody ?? "null");
    ans = JSON.parse(answerBody ?? "null");
  } catch {
    reqs = null;
    ans = null;
  }
  const calls = Array.isArray(reqs) ? reqs : reqs ? [reqs] : [];
  const answers = Array.isArray(ans) ? ans : ans ? [ans] : [];
  for (const a of answers) {
    const call = calls.find((c) => c?.id === a?.id) ?? (calls.length === 1 ? calls[0] : null);
    const result = a?.result;
    if (!result || a.error) continue;
    if (call?.method === "starknet_getTransactionStatus") {
      const h = paramHash(call.params);
      const f = result.finality_status;
      if (h && f) {
        const e = entry(tr, h, at);
        e.statuses[f] ??= at;
        if (result.execution_status) e.execution = result.execution_status;
      }
    } else if (call?.method === "starknet_getTransactionReceipt") {
      const h = paramHash(call.params);
      if (h) entry(tr, h, at).receiptAt ??= at;
    } else if (typeof result.transaction_hash === "string") {
      const h = norm(result.transaction_hash);
      if (h) entry(tr, h, at);
    }
  }
  // A paymaster or relay answers with the hash somewhere in a larger object: keep any `transaction_hash` field.
  for (const m of String(answerBody ?? "").matchAll(/"transaction_hash"\s*:\s*"(0x[0-9a-fA-F]{1,64})"/g)) {
    const h = norm(m[1]);
    if (h) entry(tr, h, at);
  }
}

/** The first transaction whose hash was first seen at or after `t0` (and before `until`, when given). */
export const txSince = (tr, t0, until = Infinity) => tr.hashes.find((e) => e.hashAt >= t0 && e.hashAt <= until) ?? null;

/** Hooks a Playwright page: every POST answer goes to `observe`. `hostOk(host)` limits it to the nodes of the run. */
export function trackPage(page, tr, hostOk = () => true) {
  page.on("response", async (res) => {
    try {
      if (res.request().method() !== "POST" || !hostOk(new URL(res.url()).host)) return;
      const at = Date.now();
      const body = await res.text().catch(() => "");
      observe(tr, res.request().postData(), body, at);
    } catch {
      // a page that closes mid-answer: nothing to record
    }
  });
}

// ---- Driving the board (shared by part-b.mjs and latency-devnet.mjs, so the devnet dry run exercises the same scan)

const bodyText = (page) => page.evaluate(() => document.body.innerText).catch(() => "");

/** Points to hover on the canvas, from its centre outwards (the board grows around the first tile). */
export function boardPoints(box) {
  const points = [];
  for (let r = 0; r <= 360; r += 45) {
    for (let a = 0; a < 360; a += r === 0 ? 360 : r < 120 ? 60 : 30) {
      points.push([box.x + box.width / 2 + r * Math.cos((a * Math.PI) / 180), box.y + box.height / 2 + r * Math.sin((a * Math.PI) / 180) * 0.7]);
    }
  }
  return points;
}

/**
 * Hovers the points and presses C (the client's own hotkey), rotating with R, until "Working..." shows: a valid slot. Returns
 * `{ placed, t0 }`, `t0` the time of the press that started the move (the move's mark t0), or `{ placed: false }`. A slow render can show
 * "Working..." after a later press than the one that started it, so t0 is the last press at or before the page's own `working` mark.
 */
export async function findAndPlace(page, points, sleep = (ms) => page.waitForTimeout(ms)) {
  const presses = [];
  const found = async () => {
    const on = (await probeEvents(page)).filter((e) => e.k === "working" && e.v === true).at(-1);
    const t0 = (on ? presses.filter((t) => t <= on.t).at(-1) : null) ?? presses.at(-1);
    return { placed: true, t0, presses };
  };
  for (const [x, y] of points) {
    await page.mouse.move(x, y);
    await sleep(120);
    for (let rot = 0; rot < 4; rot++) {
      presses.push(Date.now());
      await page.keyboard.press("c");
      await sleep(350);
      if ((await bodyText(page)).includes("Working...")) return found();
      await page.keyboard.press("r");
      await sleep(80);
    }
  }
  return { placed: false, t0: 0 };
}

// ---- Samples

/** True when the Controller's frame was shown at any time from `t0` to `until`: the wait then includes a person's approval. */
export const promptedBetween = (events, t0, until) => {
  const before = events.filter((e) => e.k === "keychain" && e.t <= t0).at(-1);
  return before?.v === true || events.some((e) => e.k === "keychain" && e.v === true && e.t >= t0 && e.t <= until);
};

const d = (a, b) => (a == null || b == null ? null : b - a);

/**
 * Sample of a move. `t0` is the key press or click, `tx` the tracker's entry, `events` the probe's.
 * t1 = the hash is known; t2 = the UI treats the move as done ("Working..." gone). Extras: `uiFeedback` (t0 to "Working..." shown),
 * `accepted` (the node first answered ACCEPTED_ON_L2 or ACCEPTED_ON_L1) and `receipt` (the receipt reached the page), each since t0.
 */
export function moveSample(n, t0, tx, events) {
  const on = firstEvent(events, "working", t0, (v) => v === true);
  const off = on ? firstEvent(events, "working", on.t, (v) => v === false) : null;
  const t1 = tx?.hashAt ?? null;
  // A move with no transaction (the write was refused before sending: fee estimate, a contract assert) is not a confirmed move.
  const t2 = tx ? (off?.t ?? null) : null;
  const acc = tx ? Math.min(...["ACCEPTED_ON_L2", "ACCEPTED_ON_L1"].map((s) => tx.statuses[s] ?? Infinity)) : Infinity;
  return {
    kind: "move",
    n,
    at: new Date(t0).toISOString(),
    t0,
    t1,
    t2,
    "t1-t0": d(t0, t1),
    "t2-t1": d(t1, t2),
    "t2-t0": d(t0, t2),
    uiFeedback: d(t0, on?.t ?? null),
    accepted: Number.isFinite(acc) ? acc - t0 : null,
    receipt: d(t0, tx?.receiptAt ?? null),
    statuses: tx ? Object.fromEntries(Object.entries(tx.statuses).map(([s, t]) => [s, t - t0])) : {},
    hash: tx?.hash ?? null,
    tx: tx?.hash ?? null,
    prompted: false,
  };
}

/** Sample of a purchase: t0 click, t1 hash, t2 receipt, t3 the game address `/game?...id=<n>`; `board` = the "0 / 38" counter shown. */
export function purchaseSample(n, t0, tx, events) {
  const game = firstEvent(events, "url", t0, (v) => /^\/game\?id=\d+$/.test(v));
  const board = game ? firstEvent(events, "tiles", game.t, (v) => v !== null) : null;
  const t1 = tx?.hashAt ?? null;
  const t2 = tx?.receiptAt ?? null;
  const t3 = game?.t ?? null;
  return {
    kind: "purchase",
    n,
    at: new Date(t0).toISOString(),
    t0,
    t1,
    t2,
    t3,
    "t1-t0": d(t0, t1),
    "t2-t1": d(t1, t2),
    "t3-t2": d(t2, t3),
    "t3-t0": d(t0, t3),
    board: d(t0, board?.t ?? null),
    statuses: tx ? Object.fromEntries(Object.entries(tx.statuses).map(([s, t]) => [s, t - t0])) : {},
    hash: tx?.hash ?? null,
    tx: tx?.hash ?? null,
    gameId: game ? Number(game.v.split("=")[1]) : null,
    prompted: false,
  };
}

/** Sample of the faucet mint: t0 click, t1 hash, t2 receipt, t3 "Minting..." gone (the button is back). */
export function faucetSample(n, t0, tx, events) {
  const on = firstEvent(events, "minting", t0, (v) => v === true);
  const off = on ? firstEvent(events, "minting", on.t, (v) => v === false) : null;
  const t1 = tx?.hashAt ?? null;
  const t2 = tx?.receiptAt ?? null;
  const t3 = off?.t ?? null;
  return {
    kind: "faucet",
    n,
    at: new Date(t0).toISOString(),
    t0,
    t1,
    t2,
    t3,
    "t1-t0": d(t0, t1),
    "t2-t1": d(t1, t2),
    "t3-t2": d(t2, t3),
    "t3-t0": d(t0, t3),
    uiFeedback: d(t0, on?.t ?? null),
    statuses: tx ? Object.fromEntries(Object.entries(tx.statuses).map(([s, t]) => [s, t - t0])) : {},
    hash: tx?.hash ?? null,
    tx: tx?.hash ?? null,
    prompted: false,
  };
}

// ---- What a transaction cost, read from the node after the run (S2). Reads only: no transaction is sent.

/** A felt (hex or decimal text, or a number) as a decimal string, or null when it is not one. */
const dec = (v) => {
  try {
    return v == null ? null : BigInt(v).toString();
  } catch {
    return null;
  }
};

/**
 * The cost fields of a receipt (JSON-RPC 0.8 and later): `block` (null for a receipt not in a block yet), `fee` = `{ amount, unit }`
 * (`amount` a decimal string of the felt, `unit` `FRI` or `WEI`), `resources` = the receipt's `execution_resources` as given
 * (`l1_gas`, `l1_data_gas`, `l2_gas`, and whatever else the node adds). Anything absent is null.
 */
export function receiptFields(receipt) {
  const fee = receipt?.actual_fee;
  const amount = dec(fee?.amount);
  return {
    block: Number.isSafeInteger(receipt?.block_number) ? receipt.block_number : null,
    fee: amount === null ? null : { amount, unit: fee.unit ?? null },
    resources: receipt?.execution_resources ?? null,
  };
}

/** One JSON-RPC call; the result, or a thrown Error with the node's message. `fetchFn` is injectable for the tests. */
export async function rpc(rpcUrl, method, params, fetchFn = fetch) {
  const res = await fetchFn(rpcUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  const body = await res.json();
  if (body.error) throw new Error(`${method}: ${body.error.code} ${body.error.message}`);
  if (body.result === undefined) throw new Error(`${method}: no result`);
  return body.result;
}

const NO_CHAIN = { block: null, blockTimestamp: null, fee: null, resources: null };

/**
 * Adds `block`, `blockTimestamp`, `fee` and `resources` to every sample that has a transaction hash, from
 * `starknet_getTransactionReceipt` and `starknet_getBlockWithTxHashes` (one read per block). A read that fails leaves null for what it
 * could not give and one note in the returned list (the run never fails on it). A sample already enriched, or with no hash, is left as is.
 * Returns the notes.
 */
export async function enrichSamples(samples, rpcUrl, fetchFn = fetch) {
  const notes = [];
  const stamps = new Map();
  const timestamp = async (block) => {
    if (!stamps.has(block)) {
      stamps.set(
        block,
        rpc(rpcUrl, "starknet_getBlockWithTxHashes", { block_id: { block_number: block } }, fetchFn).then(
          (b) => (Number.isFinite(b?.timestamp) ? b.timestamp : null),
          (e) => (notes.push(`chain read: block ${block} timestamp: ${e.message}`), null),
        ),
      );
    }
    return stamps.get(block);
  };
  for (const s of samples) {
    if (!s.hash || "blockTimestamp" in s) continue;
    Object.assign(s, NO_CHAIN);
    try {
      Object.assign(s, receiptFields(await rpc(rpcUrl, "starknet_getTransactionReceipt", { transaction_hash: s.hash }, fetchFn)));
    } catch (e) {
      notes.push(`chain read: ${s.kind} ${s.n} receipt ${s.hash}: ${e.message}`);
    }
    if (s.block !== null) s.blockTimestamp = await timestamp(s.block);
    else if (!notes.some((n) => n.includes(s.hash))) notes.push(`chain read: ${s.kind} ${s.n} receipt ${s.hash}: not in a block`);
  }
  return notes;
}

const E18 = 10n ** 18n;
/** A fee `{ amount, unit }` in STRK (FRI) or ETH (WEI) with 6 decimals, rounded half up, or "n/a". */
export function formatFee(fee) {
  if (!fee || dec(fee.amount) === null) return "n/a";
  const v = (BigInt(fee.amount) * 1_000_000n + E18 / 2n) / E18;
  const unit = fee.unit === "FRI" ? "STRK" : fee.unit === "WEI" ? "ETH" : fee.unit;
  return `${v / 1_000_000n}.${String(v % 1_000_000n).padStart(6, "0")} ${unit}`;
}

const l2GasOf = (s) => {
  const g = s.resources?.l2_gas;
  return typeof g === "number" || typeof g === "string" ? Number(g) : null;
};
const gas = (g) => (g == null ? "n/a" : String(g));

/** Median of fees of one unit as a fee, or null; an even count gives the floor of the mean of the two middle ones. */
function medianFee(fees) {
  const unit = fees[0]?.unit;
  const v = fees.filter((f) => f.unit === unit).map((f) => BigInt(f.amount)).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  if (!v.length) return null;
  const m = v.length >> 1;
  return { amount: (v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2n).toString(), unit };
}

// ---- Report

/** The columns of each kind, in the order the table shows them (ms). */
export const COLUMNS = {
  move: ["t1-t0", "t2-t1", "t2-t0", "uiFeedback", "accepted", "receipt"],
  purchase: ["t1-t0", "t2-t1", "t3-t2", "t3-t0", "board"],
  faucet: ["t1-t0", "t2-t1", "t3-t2", "t3-t0", "uiFeedback"],
};

const clean = (s) => s.prompted === false && COLUMNS[s.kind].every((c) => c === "uiFeedback" || c === "board" || c === "accepted" || c === "receipt" || s[c] != null);

export function median(xs) {
  const v = xs.filter((x) => x != null).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : Math.round((v[m - 1] + v[m]) / 2);
}
export const max = (xs) => {
  const v = xs.filter((x) => x != null);
  return v.length ? Math.max(...v) : null;
};

/** Median and max per column over the samples of a kind that were not held by a keychain prompt and have all their main times. */
export function summarize(samples) {
  const out = {};
  for (const kind of Object.keys(COLUMNS)) {
    const all = samples.filter((s) => s.kind === kind);
    const used = all.filter(clean);
    out[kind] = {
      samples: all.length,
      used: used.length,
      median: Object.fromEntries(COLUMNS[kind].map((c) => [c, median(used.map((s) => s[c]))])),
      max: Object.fromEntries(COLUMNS[kind].map((c) => [c, max(used.map((s) => s[c]))])),
      // what the transactions cost, over the same samples (null when none was read)
      fee: medianFee(used.map((s) => s.fee).filter((f) => f && dec(f.amount) !== null)),
      l2Gas: median(used.map(l2GasOf)),
    };
  }
  return out;
}

const sec = (ms) => (ms == null ? "n/a" : `${(ms / 1000).toFixed(2)} s`);

/** `latency.md`: the run's header, then one table per kind (every sample, then median and max of the samples used). */
export function renderMarkdown(samples, meta) {
  const sum = summarize(samples);
  const lines = [
    "# Latency of the release smoke (S1, D-28)",
    "",
    `- Client: ${meta.url}; run started ${meta.startedAt} (UTC), local hour of the driver's host ${meta.localHour}; network ${meta.network}.`,
    `- Times are ms between the marks defined in docs/client/f-release.md ("Latency"); resolution of the page's marks is ${PROBE_MS} ms. n/a: the mark was not seen.`,
    "- block, fee, L2 gas: read from the node after the run (receipt: `block_number`, `actual_fee` shown in STRK from FRI with 6 decimals, `execution_resources.l2_gas`); `latency.json` also has the block's `timestamp` and every resource of the receipt (`l1_gas`, `l1_data_gas`, `l2_gas`). n/a: the read failed (see Notes).",
    "- A sample the Controller held with a prompt (a keychain screen opened during it) is shown but left out of median and max.",
    "",
  ];
  const names = { move: "Moves", purchase: "Purchases", faucet: "Faucet mint (control)" };
  for (const kind of Object.keys(COLUMNS)) {
    const rows = samples.filter((s) => s.kind === kind);
    if (!rows.length) continue;
    const cols = COLUMNS[kind];
    lines.push(`## ${names[kind]}`, "", `| # | at (UTC) | ${cols.join(" | ")} | block | fee | L2 gas | prompt |`, `|---|---|${cols.map(() => "---").join("|")}|---|---|---|---|`);
    for (const s of rows) lines.push(`| ${s.n} | ${s.at.slice(11, 19)} | ${cols.map((c) => sec(s[c])).join(" | ")} | ${s.block ?? "n/a"} | ${formatFee(s.fee)} | ${gas(l2GasOf(s))} | ${s.prompted ? "yes" : "no"} |`);
    const k = sum[kind];
    lines.push(`| **median** (${k.used} of ${k.samples}) | | ${cols.map((c) => sec(k.median[c])).join(" | ")} | | ${formatFee(k.fee)} | ${gas(k.l2Gas)} | |`);
    lines.push(`| **max** | | ${cols.map((c) => sec(k.max[c])).join(" | ")} | | | | |`, "");
    lines.push(`Median fee ${formatFee(k.fee)}, median L2 gas ${gas(k.l2Gas)} (${k.used} of ${k.samples} samples).`, "");
  }
  if (meta.notes?.length) lines.push("## Notes", "", ...meta.notes.map((n) => `- ${n}`), "");
  return lines.join("\n");
}

export const toJson = (samples, meta) => ({ meta, summary: summarize(samples), samples });
