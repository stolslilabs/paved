// A send whose answer is lost (S-1d): the signer computes the transaction hash before sending, prints it, never sends
// a starknet_add* twice, and reads the receipt of that hash instead.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import { ec, hash, json } from 'starknet';

import { RECOVERY_POLLS, REFUSAL_CODES, sendingFetch } from '../lib/actions.mjs';

const SIGNER = fileURLToPath(new URL('../signer.mjs', import.meta.url));
const NODE = fileURLToPath(new URL('./fixtures/fake-estimate-node.mjs', import.meta.url));
const TINY_SIERRA = fileURLToPath(new URL('./fixtures/tiny.contract_class.json', import.meta.url));
const TINY_CASM = fileURLToPath(new URL('./fixtures/tiny.compiled_contract_class.json', import.meta.url));

const KEY = '0x71d7bb07b9a64f6f78ac4c816aff4da9';
const API_KEY = 'someApiKey1234567';
const SEPOLIA = {
  STARKNET_ACCOUNT_ADDRESS: '0x1',
  STARKNET_PRIVATE_KEY: KEY,
  STARKNET_RPC_URL: `https://rpc.example.io/rpc/${API_KEY}`,
  SIGNER_NETWORK: 'sepolia',
  FAKE_FAST_CLOCK: '1',
};
const CALLS = join(mkdtempSync(join(tmpdir(), 'signer-calls-')), 'calls.json');
writeFileSync(CALLS, JSON.stringify([{ contract: '0x1', function: 'approve', calldata: ['0x2', '1', '0'] }, { contract: '0x3', function: 'mint' }]));
const SENDS = {
  declare: ['declare', '--sierra', TINY_SIERRA, '--casm', TINY_CASM],
  deploy: ['deploy', '--class-hash', '0x12', '--salt', '0x5', '--calldata', '@account', '1'],
  invoke: ['invoke', '--contract', '0x1', '--function', 'mint', '--calldata', '0x2', '1', '0'],
  multicall: ['multicall', '--calls', CALLS],
};
const ADD = {
  declare: 'starknet_addDeclareTransaction',
  deploy: 'starknet_addInvokeTransaction',
  invoke: 'starknet_addInvokeTransaction',
  multicall: 'starknet_addInvokeTransaction',
};

function run(args, env) {
  const clean = Object.fromEntries(Object.entries(process.env).filter(([name]) => !/^(STARKNET_|SIGNER_|NODE_|FAKE_)/.test(name)));
  return spawnSync(process.execPath, ['--import', NODE, SIGNER, ...args], { env: { ...clean, ...env }, encoding: 'utf8' });
}

const asked = (stderr, method) => stderr.split('\n').filter((line) => line === `fake-node: asked ${method}`).length;

function sentHash(stderr, method) {
  const match = stderr.match(new RegExp(`^signer: sending ${method}, transaction (0x[0-9a-f]+)$`, 'm'));
  assert.ok(match, stderr);
  return match[1];
}

function assertNoSecret(result) {
  for (const stream of [result.stdout, result.stderr]) {
    for (const secret of [KEY, BigInt(KEY).toString(16), BigInt(KEY).toString(10), API_KEY, SEPOLIA.STARKNET_RPC_URL]) {
      assert.ok(!stream.includes(secret), `leaked a secret: ${stream}`);
    }
  }
}

test('the hash printed before sending is the hash the account signed (declare, deploy, invoke, multicall)', () => {
  const log = join(mkdtempSync(join(tmpdir(), 'signer-recover-')), 'add.log');
  const publicKey = ec.starkCurve.getPublicKey(KEY.slice(2).padStart(64, '0'));
  for (const [name, args] of Object.entries(SENDS)) {
    const result = run(args, { ...SEPOLIA, FAKE_RECEIPT: 'succeeded', FAKE_ADD_LOG: log });
    assert.equal(result.status, 0, result.stderr);
    const printed = sentHash(result.stderr, ADD[name]);
    // Printed before the request leaves the process.
    assert.ok(result.stderr.indexOf(`transaction ${printed}`) < result.stderr.indexOf(`fake-node: asked ${ADD[name]}`));
    const body = JSON.parse(readFileSync(log, 'utf8').trim().split('\n').at(-1));
    const [transaction] = Object.values(body.params);
    const [r, s] = transaction.signature.map(BigInt);
    assert.ok(ec.starkCurve.verify(new ec.starkCurve.Signature(r, s), BigInt(printed).toString(16).padStart(64, '0'), publicKey),
      `${name}: the printed hash is not the signed one`);
    assertNoSecret(result);
  }
});

test('add* times out but the node has the receipt: success with the same output, add* asked once', () => {
  for (const [name, args] of Object.entries(SENDS)) {
    for (const lost of ['timeout', 'drop']) {
      const result = run(args, { ...SEPOLIA, FAKE_ADD_LOST: lost, FAKE_RECEIPT: 'succeeded' });
      assert.equal(result.status, 0, result.stderr);
      assert.equal(asked(result.stderr, ADD[name]), 1);
      const printed = sentHash(result.stderr, ADD[name]);
      assert.match(result.stderr, new RegExp(`signer: no answer to ${ADD[name]} \\(.*\\); not sending it again: reading the receipt of ${printed}`));
      if (lost === 'timeout') assert.match(result.stderr, /JSON-RPC error 30: Request timeout on the free plan/);
      const line = JSON.parse(result.stdout);
      assert.equal(line.transaction_hash, printed);
      // The same keys as a normal success (the fake node answers that one with its own hash).
      const normal = JSON.parse(run(args, { ...SEPOLIA, FAKE_RECEIPT: 'succeeded' }).stdout);
      assert.deepEqual(Object.keys(line).sort(), Object.keys(normal).sort());
      if (name === 'declare') {
        assert.equal(line.class_hash, hash.computeSierraContractClassHash(json.parse(readFileSync(TINY_SIERRA, 'utf8'))));
        assert.equal(line.already_declared, false);
      }
      assertNoSecret(result);
    }
  }
});

test('add* times out and no receipt arrives: failure naming the hash, add* asked once, 60 receipt reads', () => {
  for (const [name, args] of Object.entries(SENDS)) {
    const result = run(args, { ...SEPOLIA, FAKE_ADD_LOST: 'timeout', FAKE_RECEIPT: 'none' });
    assert.equal(result.status, 1, result.stderr);
    assert.equal(result.stdout, '');
    assert.equal(asked(result.stderr, ADD[name]), 1);
    assert.equal(asked(result.stderr, 'starknet_getTransactionReceipt'), RECOVERY_POLLS);
    const printed = sentHash(result.stderr, ADD[name]);
    assert.match(result.stderr, new RegExp(`signer: sent, status unknown: ${printed}; check it before any rerun\n$`));
    assertNoSecret(result);
  }
});

test('add* times out and the receipt shows REVERTED: failure with that status, add* asked once', () => {
  const result = run(SENDS.invoke, { ...SEPOLIA, FAKE_ADD_LOST: 'timeout' });
  assert.equal(result.status, 1, result.stderr);
  assert.equal(asked(result.stderr, 'starknet_addInvokeTransaction'), 1);
  assert.match(result.stderr, /did not succeed \(REVERTED\) fake node/);
});

// sendingFetch alone, on a scripted node.
const CHAIN = '0x534e5f5345504f4c4941';
function invokeBody() {
  const resource = { max_amount: '0x0', max_price_per_unit: '0x0' };
  return JSON.stringify({
    jsonrpc: '2.0',
    id: 7,
    method: 'starknet_addInvokeTransaction',
    params: {
      invoke_transaction: {
        type: 'INVOKE', version: '0x3', sender_address: '0x1', calldata: ['0x1'], signature: ['0x1', '0x2'], nonce: '0x0',
        resource_bounds: { l1_gas: resource, l2_gas: resource, l1_data_gas: resource }, tip: '0x0', paymaster_data: [],
        account_deployment_data: [], nonce_data_availability_mode: 'L1', fee_data_availability_mode: 'L1',
      },
    },
  });
}

function scripted(answers) {
  const methods = [];
  const fetch = sendingFetch(async (_url, init) => {
    const { method } = JSON.parse(init.body);
    methods.push(method);
    const answer = answers[method];
    if (answer instanceof Error) throw answer;
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, ...answer }));
  }, { chainId: CHAIN, polls: 3, intervalMs: 1, sleep: async () => {} });
  return { fetch, methods };
}

test('a refusal of the write API is returned as it came: no receipt is read', async () => {
  for (const code of [52, 54, 55, -32601]) {
    assert.ok(REFUSAL_CODES.has(code));
    const { fetch, methods } = scripted({ starknet_addInvokeTransaction: { error: { code, message: 'refused' } } });
    const answer = await (await fetch('http://node', { body: invokeBody() })).json();
    assert.equal(answer.error.code, code);
    assert.deepEqual(methods, ['starknet_addInvokeTransaction']);
  }
});

test('a lost answer whose transaction the node REJECTED fails with that status', async () => {
  const { fetch, methods } = scripted({
    starknet_addInvokeTransaction: { error: { code: -32603, message: 'Internal error' } },
    starknet_getTransactionReceipt: { error: { code: 29, message: 'not found' } },
    starknet_getTransactionStatus: { result: { finality_status: 'REJECTED' } },
  });
  await assert.rejects(fetch('http://node', { body: invokeBody() }), /was REJECTED by the node/);
  assert.equal(methods.filter((method) => method === 'starknet_addInvokeTransaction').length, 1);
});

test('a lost answer, then a receipt: the answer the node would have given, under the request id', async () => {
  const { fetch } = scripted({
    starknet_addInvokeTransaction: new TypeError('fetch failed'),
    starknet_getTransactionReceipt: { result: { execution_status: 'SUCCEEDED', finality_status: 'ACCEPTED_ON_L2' } },
  });
  const answer = await (await fetch('http://node', { body: invokeBody() })).json();
  assert.equal(answer.id, 7);
  assert.match(answer.result.transaction_hash, /^0x[0-9a-f]+$/);
});

test('a request whose hash cannot be computed is refused, unsent; other methods pass untouched', async () => {
  const { fetch, methods } = scripted({ starknet_getNonce: { result: '0x1' } });
  const body = JSON.parse(invokeBody());
  body.params.invoke_transaction.version = '0x1';
  await assert.rejects(fetch('http://node', { body: JSON.stringify(body) }), /cannot be computed before sending.*nothing was sent/);
  await assert.rejects(fetch('http://node', { body: JSON.stringify([JSON.parse(invokeBody())]) }), /refused a batch/);
  assert.deepEqual(methods, []);
  await fetch('http://node', { body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'starknet_getNonce', params: {} }) });
  assert.deepEqual(methods, ['starknet_getNonce']);
});
