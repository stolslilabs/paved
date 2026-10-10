import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ENV_NAMES, UsageError, readEnv } from '../lib/env.mjs';

const GOOD = {
  STARKNET_ACCOUNT_ADDRESS: '0x064b48806902a367c8598f4f95c305e8c1a1acba5f082d294a43793113115691',
  STARKNET_PRIVATE_KEY: '0x0000000000000000000000000000000071d7bb07b9a64f6f78ac4c816aff4da9',
  STARKNET_RPC_URL: 'https://rpc.example.io/v0_10/someApiKey123',
};

function refusal(env) {
  try {
    readEnv(env);
  } catch (error) {
    assert.ok(error instanceof UsageError);
    for (const value of Object.values(env)) if (value) assert.ok(!error.message.includes(value), 'echoed a value');
    return error.message;
  }
  assert.fail('readEnv accepted the environment');
}

test('reads the three variables', () => {
  assert.deepEqual(readEnv(GOOD), {
    address: GOOD.STARKNET_ACCOUNT_ADDRESS,
    privateKey: GOOD.STARKNET_PRIVATE_KEY,
    rpcUrl: GOOD.STARKNET_RPC_URL,
  });
});

test('refuses each missing or empty variable, naming it', () => {
  for (const name of Object.values(ENV_NAMES)) {
    for (const value of [undefined, '', '   ']) {
      const message = refusal({ ...GOOD, [name]: value });
      assert.equal(message, `missing environment variable: ${name}`);
    }
  }
  assert.equal(refusal({}), `missing environment variables: ${Object.values(ENV_NAMES).join(', ')}`);
});

test('refuses malformed values, naming the variable only', () => {
  assert.match(refusal({ ...GOOD, STARKNET_PRIVATE_KEY: 'not-a-key-but-secret' }), /^STARKNET_PRIVATE_KEY is not/);
  assert.match(refusal({ ...GOOD, STARKNET_PRIVATE_KEY: '0x0' }), /^STARKNET_PRIVATE_KEY is not/);
  assert.match(refusal({ ...GOOD, STARKNET_ACCOUNT_ADDRESS: 'abc' }), /^STARKNET_ACCOUNT_ADDRESS is not/);
  assert.match(refusal({ ...GOOD, STARKNET_RPC_URL: 'wss://rpc.example.io/someApiKey123' }), /^STARKNET_RPC_URL is not an http/);
  assert.match(refusal({ ...GOOD, STARKNET_RPC_URL: 'someApiKey123' }), /^STARKNET_RPC_URL is not a URL/);
});
