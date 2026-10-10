// Preloaded by test/cli.test.mjs: a node that answers starknet_chainId with FAKE_CHAIN_ID and the
// spec version, and reports on stderr any other method it is asked (a nonce, a fee estimate, a
// transaction: the steps of signing).
globalThis.fetch = async (_url, init) => {
  const { id, method } = JSON.parse(init.body);
  const answers = { starknet_chainId: process.env.FAKE_CHAIN_ID, starknet_specVersion: '0.10.2' };
  if (!Object.hasOwn(answers, method)) {
    process.stderr.write(`fake-node: asked ${method}\n`);
    return new Response(JSON.stringify({ jsonrpc: '2.0', id, error: { code: -1, message: 'fake node' } }));
  }
  return new Response(JSON.stringify({ jsonrpc: '2.0', id, result: answers[method] }));
};
