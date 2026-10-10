// Reads the signer's account, node and network from the environment, and only from there.

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
  if (!FELT_HEX_RE.test(address)) {
    throw new UsageError(`${ENV_NAMES.address} is not a 0x-prefixed hex felt`);
  }
  if (!FELT_HEX_RE.test(privateKey) || BigInt(privateKey) === 0n) {
    throw new UsageError(`${ENV_NAMES.privateKey} is not a non-zero 0x-prefixed hex felt`);
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

// Node options that would print or expose the process's memory, requests or arguments around
// the sanitiser: debug logs (the request path holds a provider API key), reports, the inspector.
const UNSAFE_OPTION_RE = /(^|\s)--(report-[a-z-]+|inspect(-brk|-port|-wait|-publish-uid)?)(=|\s|$)/;

/**
 * Refuses to run under NODE_DEBUG, or with --report-* / --inspect in NODE_OPTIONS or in node's own
 * options. Names the variable, never its value.
 * @param {Record<string, string | undefined>} env
 * @param {string[]} execArgv
 */
export function assertSafeRuntime(env = process.env, execArgv = process.execArgv) {
  if (env.NODE_DEBUG !== undefined && env.NODE_DEBUG !== '') {
    throw new UsageError('NODE_DEBUG is set: its logs bypass the sanitiser; unset it');
  }
  if (env.NODE_OPTIONS && UNSAFE_OPTION_RE.test(env.NODE_OPTIONS)) {
    throw new UsageError('NODE_OPTIONS holds --report-* or --inspect; remove it');
  }
  if (execArgv.some((option) => UNSAFE_OPTION_RE.test(option))) {
    throw new UsageError('node was started with --report-* or --inspect; start it without');
  }
}
