// Preloaded by test/cli.test.mjs: the first request of the signer meets a "library" that logs the
// secrets through console and straight to both streams, then throws them, as a fetch error quoting
// its URL would.
globalThis.fetch = async () => {
  const { STARKNET_PRIVATE_KEY: key, STARKNET_RPC_URL: url } = process.env;
  console.warn('library warning', key, url);
  process.stderr.write(`direct stderr ${key} ${url}\n`);
  process.stdout.write(Buffer.from(`direct stdout ${key} ${url}\n`));
  throw new Error(`boom with ${key} at ${url}`);
};
