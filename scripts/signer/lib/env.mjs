// Reads the signer's account, node and network from the environment, and only from there.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ENV_NAMES = Object.freeze({
  address: 'STARKNET_ACCOUNT_ADDRESS',
  privateKey: 'STARKNET_PRIVATE_KEY',
  rpcUrl: 'STARKNET_RPC_URL',
  network: 'SIGNER_NETWORK',
});

export class UsageError extends Error {}

export const SN_MAIN = '0x534e5f4d41494e';
export const SN_SEPOLIA = '0x534e5f5345504f4c4941';

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

// The networks the signer may sign for: the chain id the node must report, and the URLs allowed.
// starknet-devnet 0.10.0 reports SN_SEPOLIA by default (`--chain-id TESTNET`), so devnet is also
// bound to a local URL, and sepolia to a remote https one: neither can stand for the other.
// Mainnet is not here and never will be: it is the owner's act.
export const NETWORKS = Object.freeze({
  sepolia: { chainId: SN_SEPOLIA, url: (url) => url.protocol === 'https:' && !LOCAL_HOSTS.has(url.hostname) },
  devnet: { chainId: SN_SEPOLIA, url: (url) => url.protocol === 'http:' && LOCAL_HOSTS.has(url.hostname) },
});

const FELT_HEX_RE = /^0x[0-9a-fA-F]{1,64}$/;

// The field prime of Starknet: a felt is below it (64 hex digits alone reach 2^256 - 1).
export const FELT_PRIME = 2n ** 251n + 17n * 2n ** 192n + 1n;

/**
 * Returns `{ address, privateKey, rpcUrl, network, chainId }`. Refuses, naming the variable and never
 * its value, when one is missing, empty or malformed.
 * @param {Record<string, string | undefined>} env
 */
export function readEnv(env = process.env) {
  const missing = Object.values(ENV_NAMES).filter((name) => !env[name] || env[name].trim() === '');
  if (missing.length > 0) {
    throw new UsageError(`missing environment variable${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`);
  }
  const address = env[ENV_NAMES.address].trim();
  const privateKey = env[ENV_NAMES.privateKey].trim();
  const rpcUrl = env[ENV_NAMES.rpcUrl].trim();
  const network = env[ENV_NAMES.network].trim();
  if (!Object.hasOwn(NETWORKS, network)) {
    throw new UsageError(`${ENV_NAMES.network} must be one of: ${Object.keys(NETWORKS).join(', ')} (mainnet is refused)`);
  }
  if (!FELT_HEX_RE.test(address) || BigInt(address) >= FELT_PRIME) {
    throw new UsageError(`${ENV_NAMES.address} is not a 0x-prefixed hex felt (below the field prime)`);
  }
  if (!FELT_HEX_RE.test(privateKey) || BigInt(privateKey) === 0n || BigInt(privateKey) >= FELT_PRIME) {
    throw new UsageError(`${ENV_NAMES.privateKey} is not a non-zero 0x-prefixed hex felt (below the field prime)`);
  }
  let url;
  try {
    url = new URL(rpcUrl);
  } catch {
    throw new UsageError(`${ENV_NAMES.rpcUrl} is not a URL`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new UsageError(`${ENV_NAMES.rpcUrl} is not an http(s) URL`);
  }
  if (!NETWORKS[network].url(url)) {
    const expected = network === 'devnet' ? 'a local http URL' : 'a remote https URL';
    throw new UsageError(`${ENV_NAMES.rpcUrl} is not ${expected}, as ${ENV_NAMES.network}=${network} needs`);
  }
  return { address, privateKey, rpcUrl, network, chainId: NETWORKS[network].chainId };
}

/**
 * Refuses the node chain id unless it is the expected network's. SN_MAIN is always refused.
 * @param {string} nodeChainId what the node reports for starknet_chainId
 * @param {string} network
 */
export function assertChain(nodeChainId, network) {
  const reported = typeof nodeChainId === 'string' ? nodeChainId.toLowerCase() : '';
  if (!/^0x[0-9a-f]{1,64}$/.test(reported)) {
    throw new UsageError('the node reported no valid chain id; nothing was signed');
  }
  const value = BigInt(reported);
  if (value === BigInt(SN_MAIN)) {
    throw new UsageError('the node is on Starknet mainnet (SN_MAIN): mainnet is the owner\'s act, refused; nothing was signed');
  }
  if (value !== BigInt(NETWORKS[network].chainId)) {
    throw new UsageError(`the node's chain id ${reported} is not ${network}'s (${NETWORKS[network].chainId}); nothing was signed`);
  }
}

// Node options, as an allowlist. NODE_OPTIONS is inherited, unseen, by every child of a shell, so it
// may hold one option only: `--max-old-space-size=<n>` (the heap cap of the VPS rule). Anything else
// is refused: debug logs (the request path holds a provider API key), reports, heap snapshots, the
// inspector, a preload (`--require`, `--import`) that could print around the sanitiser, a quoted
// option. node's own options (its command line, set by whoever starts it) may also hold
// `--disable-sigusr1` (deploy.sh starts the signer with it: README, "What does not hold") and the
// tests' preloads, an `--import` of a file of this folder's test/fixtures/ only.
const HEAP_RE = /^--max-old-space-size=[0-9]{1,7}$/;
const FIXTURES = fileURLToPath(new URL('../test/fixtures/', import.meta.url));

function isFixture(path) {
  return typeof path === 'string' && path.endsWith('.mjs') && resolve(path).startsWith(FIXTURES);
}

/**
 * Refuses to run under NODE_DEBUG, with any NODE_OPTIONS other than `--max-old-space-size=<n>`, or with
 * a node option outside the allowlist above. Names the variable, never its value.
 * @param {Record<string, string | undefined>} env
 * @param {string[]} execArgv
 */
export function assertSafeRuntime(env = process.env, execArgv = process.execArgv) {
  if (env.NODE_DEBUG !== undefined && env.NODE_DEBUG !== '') {
    throw new UsageError('NODE_DEBUG is set: its logs bypass the sanitiser; unset it');
  }
  if (env.NODE_TLS_REJECT_UNAUTHORIZED === '0') {
    throw new UsageError('NODE_TLS_REJECT_UNAUTHORIZED=0 turns off TLS checks of the node; unset it');
  }
  const options = (env.NODE_OPTIONS ?? '').split(/\s+/).filter(Boolean);
  if (!options.every((option) => HEAP_RE.test(option))) {
    throw new UsageError('NODE_OPTIONS holds an option other than --max-old-space-size=<n>; remove it');
  }
  for (let i = 0; i < execArgv.length; i += 1) {
    const option = execArgv[i];
    if (HEAP_RE.test(option) || option === '--disable-sigusr1') continue;
    if (option.startsWith('--import=') && isFixture(option.slice('--import='.length))) continue;
    if (option === '--import' && isFixture(execArgv[i + 1])) {
      i += 1;
      continue;
    }
    throw new UsageError('node was started with an option other than --max-old-space-size=<n> or --disable-sigusr1; start it without');
  }
}
