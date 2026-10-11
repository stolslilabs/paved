// The signer's subcommands, through starknet.js. Each returns the plain object printed as JSON.

import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { Account, ETransactionVersion3, RpcProvider, TransactionType, config, json, stark } from 'starknet';

import { parseCalls, resolveAccount } from './args.mjs';
import { UsageError, assertChain } from './env.mjs';

// starknet.js logs warnings (an RPC version mismatch, a fee retry) with the node's details: silence it.
config.set('logLevel', 'OFF');

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
  const baseFetch = readOnly ? readOnlyFetch() : undefined;
  const probe = new RpcProvider({ nodeUrl: rpcUrl, baseFetch });
  assertChain(await probe.channel.fetchEndpoint('starknet_chainId'), network);
  if (network === 'devnet') await assertDevnet(probe);
  const provider = new RpcProvider({ nodeUrl: rpcUrl, chainId, baseFetch });
  const account = new Account({ provider, address, signer: privateKey });
  return { provider, account, rpcUrl, fetch: baseFetch ?? globalThis.fetch };
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
  const receipt = await provider.waitForTransaction(transactionHash);
  const status = receipt.execution_status ?? receipt.value?.execution_status;
  if (status !== 'SUCCEEDED') {
    const reason = receipt.revert_reason ?? receipt.value?.revert_reason ?? '';
    throw new Error(`transaction ${transactionHash} did not succeed (${status ?? 'unknown status'}) ${reason}`.trim());
  }
}

async function readJson(path) {
  return json.parse(await readFile(path, 'utf8'));
}

export async function declare({ account }, { sierra, casm }) {
  const contract = await readJson(sierra);
  const compiled = await readJson(casm);
  announce('declare', basename(sierra));
  const { class_hash, transaction_hash } = await account.declareIfNot({ contract, casm: compiled });
  if (transaction_hash) await confirm(account.provider, transaction_hash);
  return { class_hash, transaction_hash: transaction_hash || null, already_declared: !transaction_hash };
}

export async function deploy({ account }, { classHash, salt, calldata }) {
  const chosenSalt = salt ?? stark.randomAddress();
  announce('deploy class', classHash, 'through the universal deployer');
  // deployContract waits for the receipt and reads the address from the deployer's event.
  const result = await account.deployContract({
    classHash,
    salt: chosenSalt,
    unique: true,
    constructorCalldata: calldata,
  });
  return {
    contract_address: result.contract_address,
    transaction_hash: result.transaction_hash,
    class_hash: classHash,
    salt: chosenSalt,
  };
}

async function execute(account, calls) {
  for (const { contractAddress, entrypoint } of calls) announce('invoke', contractAddress, entrypoint);
  const { transaction_hash } = await account.execute(calls);
  await confirm(account.provider, transaction_hash);
  return { transaction_hash };
}

export async function invoke({ account }, { contract, entrypoint, calldata }) {
  return execute(account, [{ contractAddress: contract, entrypoint, calldata }]);
}

export async function multicall({ account }, { calls }) {
  const parsed = parseCalls(await readJson(calls));
  return execute(account, parsed.map((call) => ({ ...call, calldata: resolveAccount(call.calldata, account.address) })));
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
export async function estimate({ account, provider, rpcUrl, fetch }, options) {
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
  const { tip } = await account.resolveDetailsWithTip({});
  const [built] = await account.accountInvocationsFactory([invocation], {
    tip,
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
