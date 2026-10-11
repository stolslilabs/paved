import assert from 'node:assert/strict';
import { test } from 'node:test';

import { RETRIED_METHODS, RETRY_DELAYS_MS, retryingFetch } from '../lib/actions.mjs';

const body = (method) => JSON.stringify({ jsonrpc: '2.0', id: 1, method, params: {} });
const missing = (status = 200) => new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, error: { code: -32601, message: 'no' } }), { status });
const ok = () => new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: '0x7' }));

// A node that answers each call with the next of `answers`, and a sleep that records its waits.
function harness(answers) {
  const calls = [];
  const waits = [];
  const fetch = retryingFetch(async (_url, init) => {
    calls.push(JSON.parse(init.body).method);
    return answers[Math.min(calls.length, answers.length) - 1]();
  }, { sleep: async (ms) => { waits.push(ms); } });
  return { fetch, calls, waits };
}

test('a read method answered -32601 (HTTP 200 or 400) or HTTP 5xx is retried, then succeeds', async () => {
  const { fetch, calls, waits } = harness([() => missing(400), () => missing(200), () => new Response('bad gateway', { status: 502 }), ok]);
  const response = await fetch('http://node', { body: body('starknet_getNonce') });
  assert.deepEqual(await response.json(), { jsonrpc: '2.0', id: 1, result: '0x7' });
  assert.equal(calls.length, 4);
  assert.deepEqual(waits, [1000, 2000, 4000]);
});

test('at most 5 attempts: the last answer is returned as it came', async () => {
  const { fetch, calls, waits } = harness([() => missing(400)]);
  const response = await fetch('http://node', { body: body('starknet_estimateFee') });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, -32601);
  assert.equal(calls.length, 5);
  assert.deepEqual(waits, [...RETRY_DELAYS_MS]);
  assert.deepEqual(RETRY_DELAYS_MS, [1000, 2000, 4000, 8000]);
});

test('a starknet_add* method, or any method off the list, is sent once, never retried', async () => {
  for (const method of ['starknet_addInvokeTransaction', 'starknet_addDeclareTransaction', 'starknet_addDeployAccountTransaction',
    'starknet_getBlockWithTxs', 'devnet_getConfig']) {
    assert.ok(!RETRIED_METHODS.has(method));
    const { fetch, calls, waits } = harness([() => missing(400), ok]);
    const response = await fetch('http://node', { body: body(method) });
    assert.equal((await response.json()).error.code, -32601);
    assert.deepEqual(calls, [method]);
    assert.deepEqual(waits, []);
  }
});

test('another error is not retried', async () => {
  const { fetch, calls } = harness([() => new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, error: { code: 41, message: 'x' } })), ok]);
  await fetch('http://node', { body: body('starknet_estimateFee') });
  assert.equal(calls.length, 1);
});

test('the retried methods are the read methods of S-1c', () => {
  assert.deepEqual([...RETRIED_METHODS].sort(), [
    'starknet_call', 'starknet_chainId', 'starknet_estimateFee', 'starknet_getClass', 'starknet_getClassAt',
    'starknet_getClassHashAt', 'starknet_getNonce', 'starknet_getTransactionReceipt', 'starknet_getTransactionStatus',
    'starknet_specVersion',
  ]);
  for (const method of RETRIED_METHODS) assert.ok(!method.startsWith('starknet_add'));
});
