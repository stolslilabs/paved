// Reads the signer's account and node from the environment, and only from there.

export const ENV_NAMES = Object.freeze({
  address: 'STARKNET_ACCOUNT_ADDRESS',
  privateKey: 'STARKNET_PRIVATE_KEY',
  rpcUrl: 'STARKNET_RPC_URL',
});

export class UsageError extends Error {}

const FELT_HEX_RE = /^0x[0-9a-fA-F]{1,64}$/;

/**
 * Returns `{ address, privateKey, rpcUrl }`. Refuses, naming the variable and never its value,
 * when one is missing, empty or malformed.
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
  return { address, privateKey, rpcUrl };
}
