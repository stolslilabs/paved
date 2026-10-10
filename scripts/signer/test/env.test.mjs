import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ENV_NAMES, SN_MAIN, SN_SEPOLIA, UsageError, assertChain, assertSafeRuntime, readEnv } from '../lib/env.mjs';

const GOOD = {
  STARKNET_ACCOUNT_ADDRESS: '0x064b48806902a367c8598f4f95c305e8c1a1acba5f082d294a43793113115691',
  STARKNET_PRIVATE_KEY: '0x0000000000000000000000000000000071d7bb07b9a64f6f78ac4c816aff4da9',
  STARKNET_RPC_URL: 'https://rpc.example.io/v0_10/someApiKey123',
  SIGNER_NETWORK: 'sepolia',
};
const DEVNET = { ...GOOD, STARKNET_RPC_URL: 'http://127.0.0.1:5050/rpc', SIGNER_NETWORK: 'devnet' };

function refusal(fn, values) {
  try {
    fn();
  } catch (error) {
    assert.ok(error instanceof UsageError, `not a UsageError: ${error}`);
    for (const value of values) if (value) assert.ok(!error.message.includes(value), `echoed a value: ${error.message}`);
    return error.message;
  }
  assert.fail('accepted');
}

const refuseEnv = (env) => refusal(() => readEnv(env), Object.values(env).filter((v) => v && v.length > 8));

test('reads the four variables', () => {
  assert.deepEqual(readEnv(GOOD), {
    address: GOOD.STARKNET_ACCOUNT_ADDRESS,
    privateKey: GOOD.STARKNET_PRIVATE_KEY,
    rpcUrl: GOOD.STARKNET_RPC_URL,
    network: 'sepolia',
    chainId: SN_SEPOLIA,
  });
  assert.equal(readEnv(DEVNET).chainId, SN_SEPOLIA);
});

test('refuses each missing or empty variable, naming it', () => {
  for (const name of Object.values(ENV_NAMES)) {
    for (const value of [undefined, '', '   ']) {
      assert.equal(refuseEnv({ ...GOOD, [name]: value }), `missing environment variable: ${name}`);
    }
  }
  assert.equal(refuseEnv({}), `missing environment variables: ${Object.values(ENV_NAMES).join(', ')}`);
});

test('a missing network refuses', () => {
  const { SIGNER_NETWORK, ...rest } = GOOD;
  assert.equal(refuseEnv(rest), 'missing environment variable: SIGNER_NETWORK');
});

test('mainnet, or any other network, is refused as SIGNER_NETWORK', () => {
  for (const network of ['mainnet', 'SN_MAIN', 'main', 'Sepolia', 'testnet']) {
    assert.match(refuseEnv({ ...GOOD, SIGNER_NETWORK: network }), /^SIGNER_NETWORK must be one of: sepolia, devnet \(mainnet is refused\)$/);
  }
});

test('the network binds the URL: devnet is local http, sepolia remote https', () => {
  assert.match(refuseEnv({ ...GOOD, SIGNER_NETWORK: 'devnet' }), /^STARKNET_RPC_URL is not a local http URL/);
  assert.match(refuseEnv({ ...DEVNET, SIGNER_NETWORK: 'sepolia' }), /^STARKNET_RPC_URL is not a remote https URL/);
  assert.match(refuseEnv({ ...GOOD, STARKNET_RPC_URL: 'http://rpc.example.io/v0_10/someApiKey123' }), /not a remote https URL/);
});

test('refuses malformed values, naming the variable only', () => {
  assert.match(refuseEnv({ ...GOOD, STARKNET_PRIVATE_KEY: 'not-a-key-but-secret' }), /^STARKNET_PRIVATE_KEY is not/);
  assert.match(refuseEnv({ ...GOOD, STARKNET_PRIVATE_KEY: '0x0' }), /^STARKNET_PRIVATE_KEY is not/);
  assert.match(refuseEnv({ ...GOOD, STARKNET_ACCOUNT_ADDRESS: 'abc' }), /^STARKNET_ACCOUNT_ADDRESS is not/);
  assert.match(refuseEnv({ ...GOOD, STARKNET_RPC_URL: 'wss://rpc.example.io/someApiKey123' }), /^STARKNET_RPC_URL is not an http/);
  assert.match(refuseEnv({ ...GOOD, STARKNET_RPC_URL: 'someApiKey123' }), /^STARKNET_RPC_URL is not a URL/);
});

test('the node chain id must be the network\'s; SN_MAIN is always refused', () => {
  assertChain(SN_SEPOLIA, 'sepolia');
  assertChain(SN_SEPOLIA.toUpperCase().replace('0X', '0x'), 'devnet');
  for (const network of ['sepolia', 'devnet']) {
    assert.match(refusal(() => assertChain(SN_MAIN, network), []), /mainnet.*refused; nothing was signed/);
    assert.match(refusal(() => assertChain('0x534e5f4f54484552', network), []), /is not .*'s \(0x534e5f5345504f4c4941\); nothing was signed/);
    assert.match(refusal(() => assertChain(undefined, network), []), /no valid chain id/);
    assert.match(refusal(() => assertChain('', network), []), /no valid chain id/);
    assert.match(refusal(() => assertChain('SN_SEPOLIA', network), []), /no valid chain id/);
  }
});

test('refuses NODE_DEBUG, --report-* and --inspect, naming the variable only', () => {
  assertSafeRuntime({ NODE_OPTIONS: '--max-old-space-size=448' }, ['--import', 'x.mjs']);
  assert.match(refusal(() => assertSafeRuntime({ NODE_DEBUG: 'fetch,undici' }, []), ['fetch,undici']), /^NODE_DEBUG is set/);
  for (const options of ['--report-on-signal', '--max-old-space-size=448 --report-uncaught-exception', '--inspect', '--inspect=127.0.0.1:9229', '--inspect-brk']) {
    assert.match(refusal(() => assertSafeRuntime({ NODE_OPTIONS: options }, []), ['127.0.0.1:9229', 'max-old-space', 'on-signal', 'uncaught']), /^NODE_OPTIONS holds/);
  }
  assert.match(refusal(() => assertSafeRuntime({}, ['--inspect-wait']), []), /^node was started with/);
});
