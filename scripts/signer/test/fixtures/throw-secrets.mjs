// Preloaded by test/cli.test.mjs: the first request of the signer meets a "library" that logs and
// throws the secrets, as a fetch error quoting its URL would.
globalThis.fetch = async () => {
  console.warn('library warning', process.env.STARKNET_PRIVATE_KEY, process.env.STARKNET_RPC_URL);
  throw new Error(`boom with ${process.env.STARKNET_PRIVATE_KEY} at ${process.env.STARKNET_RPC_URL}`);
};
