// The signer's subcommands, through starknet.js. Each returns the plain object printed as JSON.

import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { Account, ETransactionVersion3, RpcProvider, TransactionType, config, hash, json, stark } from 'starknet';

import { parseCalls, resolveAccount } from './args.mjs';
import { UsageError, assertChain } from './env.mjs';

// starknet.js logs warnings (an RPC version mismatch, a fee retry) with the node's details: silence it.
config.set('logLevel', 'OFF');

// The tip on Sepolia unless --tip says otherwise: 0x5f5e100 (100,000,000 FRI per L2 gas unit), what starknet.js's
// recommendedTip gave on Sepolia in S-1b. starknet.js's estimate of a tip reads the latest blocks
// (starknet_getBlockWithTxs), which a Sepolia endpoint answered -32601 at random (dRPC, S-1c): a fixed tip reads none.
export const FIXED_TIP = 0x5f5e100n;
// The Starknet version starknet.js assumes on Sepolia instead of reading it from the latest block
// (starknet_getBlockWithTxHashes) at each declare: Sepolia's, read on 2026-10-11 (block 16,413,363). It only picks the
// compiled class hash algorithm (Blake from 0.14.1, Poseidon before): a wrong one fails at the node, which refuses a
// declare whose compiled class hash is not its own, and nothing is declared.
export const SEPOLIA_STARKNET_VERSION = '0.14.4';

/**
 * The tip a command uses: its --tip, else FIXED_TIP on sepolia and the node's estimate on devnet.
 * Returns a bigint, or undefined for starknet.js's estimate.
 * @param {bigint | 'node' | undefined} option
 * @param {string} network
 */
export function chooseTip(option, network) {
  const tip = option ?? (network === 'sepolia' ? FIXED_TIP : 'node');
  return tip === 'node' ? undefined : tip;
}

/**
 * Checks the node's chain before anything is signed (on devnet, also that the node answers a
 * devnet-only method: a tunnel from a local port to Sepolia passes the URL and chain id checks, and
 * does not answer it), then builds the provider with that chain id
 * fixed, so starknet.js never takes it from the node unchecked (the account signs with the
 * provider's chain id).
 * With `readOnly`, every request goes through `readOnlyFetch`: no starknet_add* method can leave the process.
 * @param {{ address: string, privateKey: string, rpcUrl: string, network: string, chainId: string }} env
 * @param {{ readOnly?: boolean }} [mode]
 */
export async function connect({ address, privateKey, rpcUrl, network, chainId }, { readOnly = false } = {}) {
  // Every request: the read-only guard first (estimate), then the hash and recovery of a send (sendingFetch), then the
  // bounded retry of read methods.
  const sending = sendingFetch(retryingFetch(globalThis.fetch), { chainId });
  const baseFetch = readOnly ? readOnlyFetch(sending) : sending;
  const probe = new RpcProvider({ nodeUrl: rpcUrl, baseFetch });
  assertChain(await probe.channel.fetchEndpoint('starknet_chainId'), network);
  if (network === 'devnet') await assertDevnet(probe);
  const provider = new RpcProvider({ nodeUrl: rpcUrl, chainId, baseFetch });
  // Sepolia: no block is read for the Starknet version (SEPOLIA_STARKNET_VERSION).
  if (network === 'sepolia') provider.channel.getStarknetVersion = async () => SEPOLIA_STARKNET_VERSION;
  // Sepolia: the account is a Cairo 1 contract (cairoVersion 1), so starknet.js does not read its class
  // (starknet_getClassAt) at each transaction to find out.
  const account = new Account({ provider, address, signer: privateKey, ...(network === 'sepolia' ? { cairoVersion: '1' } : {}) });
  return { provider, account, rpcUrl, network, fetch: baseFetch };
}

// The read methods retried on a transient failure (S-1c: a Sepolia endpoint answered -32601 "method does not exist"
// at random, with HTTP 200 or 400). A starknet_add* method is never retried: if one fails, the transaction may or may
// not be in, and the run stops there.
export const RETRIED_METHODS = Object.freeze(new Set([
  'starknet_getNonce',
  'starknet_estimateFee',
  'starknet_getClassAt',
  'starknet_getClassHashAt',
  'starknet_getClass',
  'starknet_call',
  'starknet_getTransactionReceipt',
  'starknet_getTransactionStatus',
  'starknet_chainId',
  'starknet_specVersion',
]));
// At most 5 attempts per call: these waits between them, in milliseconds.
export const RETRY_DELAYS_MS = Object.freeze([1000, 2000, 4000, 8000]);

function requestMethod(init) {
  try {
    const body = JSON.parse(String(init?.body));
    return Array.isArray(body) ? undefined : body?.method;
  } catch {
    return undefined;
  }
}

// Transient: HTTP 5xx, or a JSON-RPC error -32601 (whatever the HTTP status).
function transient(status, text) {
  if (status >= 500) return true;
  try {
    return JSON.parse(text)?.error?.code === -32601;
  } catch {
    return false;
  }
}

/**
 * A fetch that retries a read method of RETRIED_METHODS, up to 5 attempts with the waits of RETRY_DELAYS_MS, while
 * the node answers HTTP 5xx or the JSON-RPC error -32601. Any other method (every starknet_add* among them) goes
 * through once, untouched. Each retry is announced on stderr. The last answer is returned as it came.
 * @param {typeof fetch} inner
 * @param {{ delays?: readonly number[], sleep?: (ms: number) => Promise<void> }} [options]
 */
export function retryingFetch(inner, { delays = RETRY_DELAYS_MS, sleep = (ms) => new Promise((done) => setTimeout(done, ms)) } = {}) {
  return async (url, init) => {
    const method = requestMethod(init);
    if (!RETRIED_METHODS.has(method)) return inner(url, init);
    for (let attempt = 1; ; attempt += 1) {
      const response = await inner(url, init);
      const text = await response.text();
      const last = attempt > delays.length;
      if (last || !transient(response.status, text)) {
        return new Response(text, { status: response.status, statusText: response.statusText, headers: response.headers });
      }
      process.stderr.write(`signer: ${method} failed (HTTP ${response.status}), attempt ${attempt} of ${delays.length + 1}; retrying\n`);
      await sleep(delays[attempt - 1]);
    }
  };
}

// A send whose answer is lost (S-1d): dRPC's free plan answered a declare that went in with `30: Request timeout on the
// free plan`. A starknet_add* method is never sent twice; the signer computes the transaction's hash before sending it,
// and when the answer is lost it reads that hash's receipt instead, RECOVERY_INTERVAL_MS apart, until
// RECOVERY_DEADLINE_MS after the first read, by the clock (a slow or flapping node does not stretch the wait).
export const RECOVERY_DEADLINE_MS = 300_000;
export const RECOVERY_INTERVAL_MS = 5000;
// The JSON-RPC errors by which a node refuses a transaction it did not take: the JSON-RPC protocol's own (parse error,
// invalid request, method not found, invalid params) and the Starknet write API's (51 class already declared, 52
// invalid nonce, 53 insufficient resources, 54 insufficient balance, 55 validation failure, 56 compilation failed, 57
// class too large, 58 not an account, 60 compiled class hash mismatch, 61 and 62 unsupported versions). Any other
// answer that is not a result (another error code, such as dRPC's 30 or -32603, an HTTP 5xx, a body that is not JSON,
// a network error) leaves the transaction's fate unknown: it is recovered, not refused.
export const REFUSAL_CODES = Object.freeze(new Set([-32700, -32600, -32601, -32602, 51, 52, 53, 54, 55, 56, 57, 58, 60, 61, 62]));
// Refusals that can also be the echo of a transaction that went in (a proxy's random -32601; 51 or 52 when the same
// transaction reached the node by another way): the receipt of the computed hash is read briefly, CHECK_INTERVAL_MS
// apart for CHECK_DEADLINE_MS (3 reads over 30 s), before the refusal is reported.
export const CHECKED_REFUSALS = Object.freeze(new Set([-32601, 51, 52]));
export const CHECK_DEADLINE_MS = 30_000;
export const CHECK_INTERVAL_MS = 15_000;
// Each receipt or status read gives up after READ_TIMEOUT_MS, or at the deadline when that comes first: a node that never
// answers cannot hold the wait past it.
export const READ_TIMEOUT_MS = 30_000;

const DA_MODES = Object.freeze({ L1: 0, L2: 1 });

function resourceBounds(bounds) {
  const out = {};
  for (const name of ['l1_gas', 'l2_gas', 'l1_data_gas']) {
    out[name] = { max_amount: BigInt(bounds[name].max_amount), max_price_per_unit: BigInt(bounds[name].max_price_per_unit) };
  }
  return out;
}

/**
 * The hash of a V3 transaction as a starknet_add* request carries it, signed: what the node will answer, computed
 * before it is sent. For a declare, also the class hash (the node's answer carries it). Throws on any other method
 * or version.
 * @param {string} method
 * @param {Record<string, any>} params
 * @param {string} chainId
 * @returns {{ transactionHash: string, classHash?: string }}
 */
export function transactionHash(method, params, chainId) {
  const transaction = params?.invoke_transaction ?? params?.declare_transaction ?? (Array.isArray(params) ? params[0] : undefined);
  if (!transaction || transaction.version !== '0x3') throw new Error('not a V3 transaction');
  const common = {
    senderAddress: transaction.sender_address,
    version: transaction.version,
    chainId,
    nonce: transaction.nonce,
    accountDeploymentData: transaction.account_deployment_data,
    nonceDataAvailabilityMode: DA_MODES[transaction.nonce_data_availability_mode],
    feeDataAvailabilityMode: DA_MODES[transaction.fee_data_availability_mode],
    resourceBounds: resourceBounds(transaction.resource_bounds),
    tip: transaction.tip,
    paymasterData: transaction.paymaster_data,
  };
  if (common.nonceDataAvailabilityMode === undefined || common.feeDataAvailabilityMode === undefined) {
    throw new Error('unknown data availability mode');
  }
  if (method === 'starknet_addInvokeTransaction' && transaction.type === 'INVOKE') {
    return {
      transactionHash: hash.calculateInvokeTransactionHash({ ...common, compiledCalldata: transaction.calldata, proofFacts: transaction.proof_facts }),
    };
  }
  if (method === 'starknet_addDeclareTransaction' && transaction.type === 'DECLARE') {
    // The request carries the ABI as a string; the class hash hashes it as starknet.js formats it.
    const { contract_class: sierra } = transaction;
    const classHash = hash.computeSierraContractClassHash({ ...sierra, abi: typeof sierra.abi === 'string' ? JSON.parse(sierra.abi) : sierra.abi });
    return {
      transactionHash: hash.calculateDeclareTransactionHash({ ...common, classHash, compiledClassHash: transaction.compiled_class_hash }),
      classHash,
    };
  }
  throw new Error(`no hash for ${method}`);
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

const FIELD_PRIME = 2n ** 251n + 17n * 2n ** 192n + 1n;

// A node-supplied hash as it may be printed: a felt in 0x-hex form, `<not a felt>` for anything else, undefined when
// there is none. A node's text never reaches an error or a status line as it came.
function shownHash(value) {
  if (value === undefined || value === null) return undefined;
  return typeof value === 'string' && /^0x[0-9a-fA-F]{1,64}$/.test(value) && BigInt(value) < FIELD_PRIME ? value : '<not a felt>';
}

function sameFelt(a, b) {
  try {
    return BigInt(a) === BigInt(b);
  } catch {
    return false;
  }
}

// One JSON-RPC read through `fetch` (the retrying one): its answer, or undefined when none could be read within
// `timeoutMs` (the request is then aborted).
async function readRpc(fetch, url, method, params, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`${method}: no answer in ${timeoutMs / 1000} s`)), timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: controller.signal,
    });
    return parseJson(await response.text());
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Reads the receipt of a sent transaction until `deadlineMs` after the first read, by `now()`: SUCCEEDED or REVERTED
 * is returned (confirm then judges it as for any send), REJECTED (a node outside spec 0.10, which has no such status)
 * throws, and the end of the wait returns undefined. A receipt for another hash than the one asked is ignored.
 */
async function recoverReceipt(fetch, url, transactionHash, { deadlineMs, intervalMs, sleep, now, readTimeoutMs }) {
  const end = now() + deadlineMs;
  const timeout = () => Math.max(1, Math.min(readTimeoutMs, end - now()));
  for (;;) {
    const receipt = (await readRpc(fetch, url, 'starknet_getTransactionReceipt', { transaction_hash: transactionHash }, timeout()))?.result;
    if (receipt && !sameFelt(receipt.transaction_hash, transactionHash)) {
      const named = shownHash(receipt.transaction_hash);
      process.stderr.write(`signer: the receipt read for ${transactionHash} ${named ? `names transaction ${named}` : 'names no transaction hash'}; ignored\n`);
    } else {
      const execution = receipt?.execution_status;
      if (execution === 'SUCCEEDED' || execution === 'REVERTED') return execution;
      const finality = receipt?.finality_status
        ?? (await readRpc(fetch, url, 'starknet_getTransactionStatus', { transaction_hash: transactionHash }, timeout()))?.result?.finality_status;
      if (finality === 'REJECTED') throw new Error(`transaction ${transactionHash} was REJECTED by the node`);
    }
    const left = end - now();
    if (left <= 0) return undefined;
    await sleep(Math.min(intervalMs, left));
  }
}

/**
 * A fetch that, for a starknet_add* method, computes the transaction's hash from the signed request and prints it on
 * stderr before sending, then sends it once. A result under HTTP 5xx is not trusted; a result naming another hash than
 * the computed one stops the command. A refusal of REFUSAL_CODES is
 * returned as it came, but one of CHECKED_REFUSALS only once the computed hash has no receipt after CHECK_DEADLINE_MS
 * (the command then fails naming the code and the hash). Any other answer (another error, HTTP 5xx, no JSON, a network
 * failure) is a lost answer: the request is not sent again, and the receipt is read until RECOVERY_DEADLINE_MS. Once a
 * receipt shows SUCCEEDED or REVERTED, the answer the node would have given is returned, so the command goes on as
 * after a normal send. Other methods go through untouched. A request whose hash cannot be computed is refused, unsent.
 * @param {typeof fetch} inner
 * @param {{ chainId: string, deadlineMs?: number, intervalMs?: number, checkDeadlineMs?: number,
 *   checkIntervalMs?: number, readTimeoutMs?: number, sleep?: (ms: number) => Promise<void>, now?: () => number }} options
 */
export function sendingFetch(inner, {
  chainId,
  deadlineMs = RECOVERY_DEADLINE_MS,
  intervalMs = RECOVERY_INTERVAL_MS,
  checkDeadlineMs = CHECK_DEADLINE_MS,
  checkIntervalMs = CHECK_INTERVAL_MS,
  readTimeoutMs = READ_TIMEOUT_MS,
  sleep = (ms) => new Promise((done) => setTimeout(done, ms)),
  now = () => Date.now(),
}) {
  return async (url, init) => {
    const request = parseJson(String(init?.body));
    const method = request && !Array.isArray(request) ? request.method : undefined;
    if (typeof method !== 'string' || !method.startsWith('starknet_add')) {
      if (Array.isArray(request) && request.some((entry) => String(entry?.method).startsWith('starknet_add'))) {
        throw new Error('refused a batch holding a starknet_add* method; nothing was sent');
      }
      return inner(url, init);
    }
    let computed;
    try {
      computed = transactionHash(method, request.params, chainId);
    } catch (error) {
      throw new Error(`${method}: the transaction hash cannot be computed before sending (${error.message}); nothing was sent`);
    }
    const { transactionHash: txHash, classHash } = computed;
    process.stderr.write(`signer: sending ${method}, transaction ${txHash}\n`);
    let lost;
    let refused;
    let other;
    try {
      const response = await inner(url, init);
      const text = await response.text();
      const answer = parseJson(text);
      const ok = answer && typeof answer === 'object' && 'result' in answer && !('error' in answer);
      const code = answer?.error?.code;
      if ((ok && response.status < 500) || (REFUSAL_CODES.has(code) && !CHECKED_REFUSALS.has(code))) {
        // A node that names another transaction than the one signed: neither can be trusted to be the one sent.
        if (ok && !sameFelt(answer.result?.transaction_hash, txHash)) {
          other = { hash: shownHash(answer.result?.transaction_hash) };
        } else {
          return new Response(text, { status: response.status, statusText: response.statusText, headers: response.headers });
        }
      }
      if (CHECKED_REFUSALS.has(code)) refused = code;
      lost = answer?.error
        ? `HTTP ${response.status}, JSON-RPC error ${code}: ${String(answer.error.message).slice(0, 200)}`
        : `HTTP ${response.status}${answer ? '' : ', no JSON'}`;
    } catch (error) {
      lost = describeCause(error);
    }
    if (other) {
      throw new Error(`${other.hash ? `node returned ${other.hash}` : 'node returned no transaction hash'}, signed ${txHash}; check both before any rerun`);
    }
    const wait = refused === undefined ? { deadlineMs, intervalMs } : { deadlineMs: checkDeadlineMs, intervalMs: checkIntervalMs };
    process.stderr.write(`signer: ${refused === undefined ? 'no answer to' : 'refused'} ${method} (${lost}); not sending it again: `
      + `reading the receipt of ${txHash} for ${wait.deadlineMs / 1000} s, every ${wait.intervalMs / 1000} s\n`);
    const status = await recoverReceipt(inner, url, txHash, { ...wait, sleep, now, readTimeoutMs });
    if (status === undefined) {
      throw new Error(refused === undefined
        ? `sent, status unknown: ${txHash}; check it before any rerun`
        : `refused (${refused}); no receipt for ${txHash} after ${checkDeadlineMs / 1000} s; check it before any rerun`);
    }
    process.stderr.write(`signer: transaction ${txHash} is on the node (${status})\n`);
    const result = classHash ? { transaction_hash: txHash, class_hash: classHash } : { transaction_hash: txHash };
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
}

/**
 * The account's nonce, read once (with the retry): an explicit nonce in the details keeps starknet.js from its
 * fallback to 0 when the read fails (`getNonceSafe`). A failed read fails the command, before anything is signed.
 */
async function readNonce(account) {
  return account.getNonce();
}

/**
 * A fetch that refuses, before anything leaves the process, a JSON-RPC request whose method sends a
 * transaction (starknet_add*), or whose method it cannot read. `estimate` runs on it alone.
 * @param {typeof fetch} [inner]
 */
export function readOnlyFetch(inner = globalThis.fetch) {
  return async (url, init) => {
    let method;
    try {
      const body = JSON.parse(String(init?.body));
      method = [body].flat().map((request) => request?.method);
    } catch {
      method = [];
    }
    if (method.length === 0 || !method.every((name) => typeof name === 'string' && /^[a-z]+_[A-Za-z]+$/.test(name))) {
      throw new Error('estimate: refused a request whose method cannot be read; nothing was sent');
    }
    const sending = method.find((name) => /^starknet_add/.test(name));
    if (sending) throw new Error(`estimate: refused ${sending}; nothing was sent`);
    return inner(url, init);
  };
}

async function assertDevnet(probe) {
  let config;
  try {
    config = await probe.channel.fetchEndpoint('devnet_getConfig');
  } catch {
    config = undefined;
  }
  if (typeof config !== 'object' || config === null || Array.isArray(config)) {
    throw new UsageError('SIGNER_NETWORK=devnet but the node does not answer devnet_getConfig (not a starknet-devnet); nothing was signed');
  }
}

// One line per call on stderr, before it is signed: what the account is about to touch.
function announce(...words) {
  process.stderr.write(`signer: ${words.join(' ')}\n`);
}

async function confirm(provider, transactionHash) {
  let receipt;
  try {
    receipt = await provider.waitForTransaction(transactionHash);
  } catch (error) {
    // The transaction was sent: its hash is what lets a person find out whether it is in.
    throw new Error(`transaction ${transactionHash} was sent, but its status could not be read; check it before any rerun`, { cause: error });
  }
  const status = receipt.execution_status ?? receipt.value?.execution_status;
  if (status !== 'SUCCEEDED') {
    const reason = receipt.revert_reason ?? receipt.value?.revert_reason ?? '';
    throw new Error(`transaction ${transactionHash} did not succeed (${status ?? 'unknown status'}) ${reason}`.trim());
  }
}

async function readJson(path) {
  return json.parse(await readFile(path, 'utf8'));
}

// The transaction details that fix the tip (chooseTip), or none for starknet.js's estimate of it.
function tipDetails(tip, network) {
  const chosen = chooseTip(tip, network);
  return chosen === undefined ? {} : { tip: chosen };
}

// The details of a transaction: its tip, and the nonce read once (readNonce).
async function sendDetails(account, tip, network) {
  return { ...tipDetails(tip, network), nonce: await readNonce(account) };
}

export async function declare({ account, network }, { sierra, casm, tip }) {
  const contract = await readJson(sierra);
  const compiled = await readJson(casm);
  announce('declare', basename(sierra));
  const { class_hash, transaction_hash } = await account.declareIfNot({ contract, casm: compiled }, await sendDetails(account, tip, network));
  if (transaction_hash) await confirm(account.provider, transaction_hash);
  return { class_hash, transaction_hash: transaction_hash || null, already_declared: !transaction_hash };
}

export async function deploy({ account, network }, { classHash, salt, calldata, tip }) {
  const chosenSalt = salt ?? stark.randomAddress();
  announce('deploy class', classHash, 'through the universal deployer');
  // The address is computed from the deployer, the salt, the class and the calldata (unique); the receipt is waited
  // for by confirm, which names the transaction if its status cannot be read.
  const { transaction_hash, contract_address: [contractAddress] } = await account.deploy({
    classHash,
    salt: chosenSalt,
    unique: true,
    constructorCalldata: calldata,
  }, await sendDetails(account, tip, network));
  await confirm(account.provider, transaction_hash);
  return {
    contract_address: contractAddress,
    transaction_hash,
    class_hash: classHash,
    salt: chosenSalt,
  };
}

async function execute(account, calls, tip, network) {
  for (const { contractAddress, entrypoint } of calls) announce('invoke', contractAddress, entrypoint);
  const { transaction_hash } = await account.execute(calls, await sendDetails(account, tip, network));
  await confirm(account.provider, transaction_hash);
  return { transaction_hash };
}

export async function invoke({ account, network }, { contract, entrypoint, calldata, tip }) {
  return execute(account, [{ contractAddress: contract, entrypoint, calldata }], tip, network);
}

export async function multicall({ account, network }, { calls, tip }) {
  const parsed = parseCalls(await readJson(calls));
  return execute(account, parsed.map((call) => ({ ...call, calldata: resolveAccount(call.calldata, account.address) })), tip, network);
}

export async function call({ provider }, { contract, entrypoint, calldata }) {
  const result = await provider.callContract({ contractAddress: contract, entrypoint, calldata });
  return { result };
}

// A node's answer is kept whole up to this many characters (an HTML page from a proxy is cut).
const BODY_LIMIT = 4000;

/**
 * Asks the node for a fee estimate of what `declare`, `deploy` or `invoke` would send, and sends nothing.
 * The request is built as starknet.js builds its own (the account's nonce, a tip from the node, the
 * query version), with zero resource bounds, SKIP_VALIDATE and block latest unless a diagnostic option
 * says otherwise; it then goes to the node with a plain fetch, so the node's answer is kept whole: the
 * JSON-RPC error object (code, message, data), or the HTTP status and body when there is no JSON.
 * Returns `{ ok, ... }`: `ok: false` is the node's refusal, printed as the JSON line too.
 */
export async function estimate({ account, provider, rpcUrl, network, fetch }, options) {
  const { kind, bounds, validate = false, blockId = 'latest' } = options;
  let invocation;
  let label;
  if (kind === 'declare') {
    invocation = { type: TransactionType.DECLARE, payload: { contract: await readJson(options.sierra), casm: await readJson(options.casm) } };
    label = basename(options.sierra);
  } else if (kind === 'deploy') {
    invocation = {
      type: TransactionType.DEPLOY,
      payload: { classHash: options.classHash, salt: options.salt ?? stark.randomAddress(), unique: true, constructorCalldata: options.calldata },
    };
    label = `class ${options.classHash}`;
  } else {
    invocation = { type: TransactionType.INVOKE, payload: [{ contractAddress: options.contract, entrypoint: options.entrypoint, calldata: options.calldata }] };
    label = `${options.contract} ${options.entrypoint}`;
  }
  announce('estimate', kind, label, '(nothing is sent)');
  const { tip } = await account.resolveDetailsWithTip(tipDetails(options.tip, network));
  const [built] = await account.accountInvocationsFactory([invocation], {
    tip,
    nonce: await readNonce(account),
    ...(bounds ? { resourceBounds: bounds } : {}),
    versions: [ETransactionVersion3.F3],
    skipValidate: !validate,
  });
  const transaction = await provider.channel.buildTransaction(built, 'fee');
  const params = { request: [transaction], block_id: blockId, simulation_flags: validate ? [] : ['SKIP_VALIDATE'] };
  const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'starknet_estimateFee', params });
  const request = {
    kind,
    block_id: blockId,
    simulation_flags: params.simulation_flags,
    resource_bounds: transaction.resource_bounds,
    tip: transaction.tip,
    version: transaction.version,
    request_bytes: Buffer.byteLength(body),
  };
  let response;
  try {
    response = await fetch(rpcUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
  } catch (error) {
    return { ok: false, request, transport: describeCause(error) };
  }
  const text = await response.text();
  let answer;
  try {
    answer = JSON.parse(text);
  } catch {
    return { ok: false, request, http_status: response.status, body: text.slice(0, BODY_LIMIT), body_bytes: text.length };
  }
  if (answer && typeof answer === 'object' && 'result' in answer && !('error' in answer)) {
    const [fee] = [answer.result].flat();
    return { ok: true, request, http_status: response.status, estimate: fee };
  }
  return { ok: false, request, http_status: response.status, error: answer?.error ?? answer };
}

// A network failure's message and its cause's (undici puts the reason there), as plain text.
function describeCause(error) {
  const parts = [];
  for (let current = error, depth = 0; current && depth < 4; current = current.cause, depth += 1) {
    parts.push([current.code, current.message].filter(Boolean).join(' '));
  }
  return parts.join(': ');
}
