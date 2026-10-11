import assert from 'node:assert/strict';
import { test } from 'node:test';

import { readOnlyFetch } from '../lib/actions.mjs';

const body = (method) => JSON.stringify({ jsonrpc: '2.0', id: 1, method, params: {} });

test('readOnlyFetch refuses every starknet_add* method, and any request whose method it cannot read', async () => {
  const asked = [];
  const guarded = readOnlyFetch(async (_url, init) => {
    asked.push(JSON.parse(init.body));
    return new Response('{}');
  });
  for (const method of ['starknet_addInvokeTransaction', 'starknet_addDeclareTransaction', 'starknet_addDeployAccountTransaction']) {
    await assert.rejects(guarded('http://node', { body: body(method) }), new RegExp(`refused ${method}; nothing was sent`));
  }
  // A batch with one sending method, a body that is not JSON, no method, a method of another shape.
  for (const init of [
    { body: JSON.stringify([JSON.parse(body('starknet_chainId')), JSON.parse(body('starknet_addInvokeTransaction'))]) },
    { body: 'not json' },
    { body: '{}' },
    {},
    { body: body('starknet addInvokeTransaction') },
  ]) {
    await assert.rejects(guarded('http://node', init), /refused .*nothing was sent/);
  }
  assert.deepEqual(asked, []);
  for (const method of ['starknet_chainId', 'starknet_estimateFee', 'starknet_getNonce', 'devnet_getConfig']) {
    await guarded('http://node', { body: body(method) });
  }
  assert.deepEqual(asked.map((request) => request.method), ['starknet_chainId', 'starknet_estimateFee', 'starknet_getNonce', 'devnet_getConfig']);
});
