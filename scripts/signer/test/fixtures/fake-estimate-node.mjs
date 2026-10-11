// Preloaded by test/cli.test.mjs and scripts/test-deploy-url.sh: a Sepolia node that answers what an
// estimate asks (the chain, a block, the account's nonce and class, the fee estimate) and, to catch a
// signer that would send, also accepts every starknet_add* transaction. It reports each method it is
// asked on stderr. No class is declared (starknet_getClass answers an error). FAKE_ESTIMATE_ERROR (when
// the environment reaches it) makes the estimate answer the -32603 error Cartridge gave (no `data`);
// FAKE_ESTIMATE_HTML an HTTP 413 page with no JSON. FAKE_FLAKY=<method>:<n> answers the first n calls of
// that method -32601 with HTTP 400, as dRPC did at random (S-1c). starknet_call answers a u256 of
// FAKE_STRK_BALANCE (base units, decimal; default 1,000 STRK): the deployer's STRK balance for deploy.sh.
// A lost answer (S-1d): FAKE_ADD_LOST says how every starknet_add* is answered after the node took it: `timeout`
// (dRPC's `30: Request timeout on the free plan`, HTTP 200), `drop` (a dropped connection), `502json` (HTTP 502 with a
// JSON-RPC error), `502html` (HTTP 502, an HTML page), `413html` (HTTP 413, an HTML page), `ok500` (a result under
// HTTP 500) or `refused:<code>` (that JSON-RPC error, HTTP 200). FAKE_RECEIPT=succeeded gives every transaction a
// SUCCEEDED receipt, `none` none (error 29), `rejected` none but a REJECTED status (outside spec 0.10), `hang` never
// answers a receipt read (until it is aborted); otherwise it reverts at once. A receipt names the hash it was asked for,
// or FAKE_RECEIPT_HASH. An add* that is answered names the transaction's hash, or FAKE_ADD_HASH (`none`: no hash). FAKE_ADD_LOG=<file> appends each
// starknet_add* request body to the file. FAKE_FAST_CLOCK=1 runs a fake clock: every timer fires at once and moves
// Date.now by its delay, so a 5-minute wait takes no time; FAKE_SLOW_RECEIPT_MS then also moves it by that much per
// receipt read (a slow node).
const [flakyMethod, flakyCount] = (process.env.FAKE_FLAKY ?? ':0').split(':');
let flakyLeft = Number(flakyCount);
let clockOffset = 0;
if (process.env.FAKE_FAST_CLOCK) {
  // A virtual clock: each timer set is queued with its due time; every real tick fires the earliest one and moves
  // Date.now to its due time. So timers fire in the order of their delays, at once, and a timer cleared first (a read
  // timeout) moves nothing.
  const realSetTimeout = globalThis.setTimeout;
  const realClearTimeout = globalThis.clearTimeout;
  const realNow = Date.now;
  const timers = new Set();
  const fire = () => {
    let first;
    for (const timer of timers) if (!first || timer.due < first.due) first = timer;
    if (!first) return;
    timers.delete(first);
    clockOffset = Math.max(clockOffset, first.due);
    first.run();
  };
  globalThis.setTimeout = (callback, ms, ...args) => {
    const timer = { due: clockOffset + (Number(ms) || 0), run: () => callback(...args), ref() { return this; }, unref() { return this; }, hasRef: () => true };
    timers.add(timer);
    realSetTimeout(fire, 0);
    return timer;
  };
  globalThis.clearTimeout = (timer) => (timers.has(timer) ? timers.delete(timer) : realClearTimeout(timer));
  Date.now = () => realNow() + clockOffset;
}
const { appendFileSync } = await import('node:fs');
const BLOCK = {
  status: 'ACCEPTED_ON_L2',
  block_hash: '0x1',
  parent_hash: '0x0',
  block_number: 1,
  new_root: '0x0',
  timestamp: 1,
  sequencer_address: '0x1',
  l1_gas_price: { price_in_fri: '0x1', price_in_wei: '0x1' },
  l2_gas_price: { price_in_fri: '0x1', price_in_wei: '0x1' },
  l1_data_gas_price: { price_in_fri: '0x1', price_in_wei: '0x1' },
  l1_da_mode: 'BLOB',
  starknet_version: '0.14.0',
  transactions: [],
};
const ESTIMATE = {
  l1_gas_consumed: '0x0',
  l1_gas_price: '0x1',
  l2_gas_consumed: '0x2540be400',
  l2_gas_price: '0x1',
  l1_data_gas_consumed: '0x80',
  l1_data_gas_price: '0x1',
  // FAKE_ESTIMATE_FEE: another overall fee, in FRI (decimal).
  overall_fee: process.env.FAKE_ESTIMATE_FEE ? `0x${BigInt(process.env.FAKE_ESTIMATE_FEE).toString(16)}` : '0x2540be480',
  unit: 'FRI',
};
// The account's class: a Cairo 1 contract (it has a sierra_program), so invoke calldata is Cairo 1.
const ACCOUNT_CLASS = { sierra_program: ['0x1'], contract_class_version: '0.1.0', entry_points_by_type: {}, abi: '[]' };

globalThis.fetch = async (_url, init) => {
  const { id, method } = JSON.parse(init.body);
  process.stderr.write(`fake-node: asked ${method}\n`);
  if (method === flakyMethod && flakyLeft > 0) {
    flakyLeft -= 1;
    const error = { code: -32601, message: `the method ${method} does not exist/is not available` };
    return new Response(JSON.stringify({ jsonrpc: '2.0', id, error }), { status: 400 });
  }
  if (method.startsWith('starknet_add') && process.env.FAKE_ADD_LOG) appendFileSync(process.env.FAKE_ADD_LOG, `${init.body}\n`);
  const lost = method.startsWith('starknet_add') ? process.env.FAKE_ADD_LOST : undefined;
  const html = (status) => new Response(`<html><body>${status}</body></html>`, { status, headers: { 'content-type': 'text/html' } });
  if (lost === 'timeout') {
    const error = { code: 30, message: 'Request timeout on the free plan, please upgrade to paid plan' };
    return new Response(JSON.stringify({ jsonrpc: '2.0', id, error }));
  }
  if (lost === 'drop') {
    throw new TypeError('fetch failed', { cause: Object.assign(new Error('other side closed'), { code: 'UND_ERR_SOCKET' }) });
  }
  if (lost === '502json') return new Response(JSON.stringify({ jsonrpc: '2.0', id, error: { code: -32603, message: 'Bad gateway' } }), { status: 502 });
  if (lost === '502html') return html(502);
  if (lost === '413html') return html(413);
  if (lost === 'ok500') return new Response(JSON.stringify({ jsonrpc: '2.0', id, result: { transaction_hash: '0xadd' } }), { status: 500 });
  if (lost?.startsWith('refused:')) {
    return new Response(JSON.stringify({ jsonrpc: '2.0', id, error: { code: Number(lost.slice(8)), message: 'refused by the fake node' } }));
  }
  const asked = JSON.parse(init.body).params?.transaction_hash;
  if (method === 'starknet_getTransactionReceipt' && process.env.FAKE_RECEIPT === 'hang') {
    return new Promise((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(init.signal.reason)));
  }
  // The hash of a sent transaction, as a node computes it.
  let sentHash = '0xadd';
  let sentClass = '0x1';
  if (method.startsWith('starknet_add')) {
    const { transactionHash } = await import('../../lib/actions.mjs');
    const computed = transactionHash(method, JSON.parse(init.body).params, '0x534e5f5345504f4c4941');
    sentHash = process.env.FAKE_ADD_HASH === 'none' ? undefined : process.env.FAKE_ADD_HASH ?? computed.transactionHash;
    sentClass = computed.classHash ?? sentClass;
  }
  if (method === 'starknet_getTransactionReceipt' && process.env.FAKE_SLOW_RECEIPT_MS) clockOffset += Number(process.env.FAKE_SLOW_RECEIPT_MS);
  const notFound = { code: 29, message: 'Transaction hash not found' };
  if (method === 'starknet_getTransactionStatus' && process.env.FAKE_RECEIPT === 'rejected') {
    return new Response(JSON.stringify({ jsonrpc: '2.0', id, result: { finality_status: 'REJECTED', failure_reason: 'fake node' } }));
  }
  if (/^starknet_getTransaction(Receipt|Status)$/.test(method) && /^(none|rejected)$/.test(process.env.FAKE_RECEIPT ?? '')) {
    return new Response(JSON.stringify({ jsonrpc: '2.0', id, error: notFound }));
  }
  const execution = process.env.FAKE_RECEIPT === 'succeeded' ? 'SUCCEEDED' : 'REVERTED';
  if (method === 'starknet_estimateFee' && process.env.FAKE_ESTIMATE_HTML) {
    return new Response('<html><body>413 Request Entity Too Large</body></html>', { status: 413, headers: { 'content-type': 'text/html' } });
  }
  if (method === 'starknet_estimateFee' && process.env.FAKE_ESTIMATE_ERROR) {
    return new Response(JSON.stringify({ jsonrpc: '2.0', id, error: { code: -32603, message: 'Internal error' } }));
  }
  const answers = {
    starknet_chainId: '0x534e5f5345504f4c4941',
    starknet_specVersion: '0.10.2',
    devnet_getConfig: { seed: 42 },
    starknet_blockNumber: 1,
    starknet_getBlockWithTxHashes: BLOCK,
    starknet_getBlockWithTxs: BLOCK,
    starknet_getNonce: '0x0',
    starknet_getClassHashAt: '0x1',
    starknet_getClassAt: ACCOUNT_CLASS,
    starknet_estimateFee: [ESTIMATE],
    starknet_call: [`0x${BigInt(process.env.FAKE_STRK_BALANCE ?? 1000n * 10n ** 18n).toString(16)}`, '0x0'],
    starknet_addDeclareTransaction: { transaction_hash: sentHash, class_hash: sentClass },
    starknet_addInvokeTransaction: { transaction_hash: sentHash },
    starknet_addDeployAccountTransaction: { transaction_hash: sentHash, contract_address: '0x1' },
    // A sent transaction reverts at once (unless FAKE_RECEIPT says otherwise), so a sending command ends instead of waiting.
    starknet_getTransactionStatus: { finality_status: 'ACCEPTED_ON_L2', execution_status: execution },
    starknet_getTransactionReceipt: {
      type: 'INVOKE',
      transaction_hash: process.env.FAKE_RECEIPT_HASH === 'none' ? undefined : process.env.FAKE_RECEIPT_HASH ?? asked ?? '0xadd',
      actual_fee: { amount: '0x0', unit: 'FRI' },
      execution_status: execution,
      finality_status: 'ACCEPTED_ON_L2',
      ...(execution === 'REVERTED' ? { revert_reason: 'fake node' } : {}),
      block_hash: '0x1',
      block_number: 1,
      messages_sent: [],
      events: [],
      execution_resources: { l1_gas: 0, l1_data_gas: 0, l2_gas: 0 },
    },
  };
  if (!Object.hasOwn(answers, method)) {
    return new Response(JSON.stringify({ jsonrpc: '2.0', id, error: { code: -1, message: 'fake node' } }));
  }
  return new Response(JSON.stringify({ jsonrpc: '2.0', id, result: answers[method] }));
};
