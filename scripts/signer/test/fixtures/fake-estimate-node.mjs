// Preloaded by test/cli.test.mjs and scripts/test-deploy-url.sh: a Sepolia node that answers what an
// estimate asks (the chain, a block, the account's nonce and class, the fee estimate) and, to catch a
// signer that would send, also accepts every starknet_add* transaction. It reports each method it is
// asked on stderr. No class is declared (starknet_getClass answers an error). FAKE_ESTIMATE_ERROR (when
// the environment reaches it) makes the estimate answer the -32603 error Cartridge gave (no `data`);
// FAKE_ESTIMATE_HTML an HTTP 413 page with no JSON. FAKE_FLAKY=<method>:<n> answers the first n calls of
// that method -32601 with HTTP 400, as dRPC did at random (S-1c). starknet_call answers a u256 of
// FAKE_STRK_BALANCE (base units, decimal; default 1,000 STRK): the deployer's STRK balance for deploy.sh.
const [flakyMethod, flakyCount] = (process.env.FAKE_FLAKY ?? ':0').split(':');
let flakyLeft = Number(flakyCount);
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
  overall_fee: '0x2540be480',
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
    starknet_addDeclareTransaction: { transaction_hash: '0xadd', class_hash: '0x1' },
    starknet_addInvokeTransaction: { transaction_hash: '0xadd' },
    starknet_addDeployAccountTransaction: { transaction_hash: '0xadd', contract_address: '0x1' },
    // A sent transaction reverts at once, so a sending command ends instead of waiting.
    starknet_getTransactionStatus: { finality_status: 'ACCEPTED_ON_L2', execution_status: 'REVERTED' },
    starknet_getTransactionReceipt: {
      type: 'INVOKE',
      transaction_hash: '0xadd',
      actual_fee: { amount: '0x0', unit: 'FRI' },
      execution_status: 'REVERTED',
      finality_status: 'ACCEPTED_ON_L2',
      revert_reason: 'fake node',
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
