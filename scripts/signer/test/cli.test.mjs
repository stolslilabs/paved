import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const SIGNER = fileURLToPath(new URL('../signer.mjs', import.meta.url));
const THROWER = fileURLToPath(new URL('./fixtures/throw-secrets.mjs', import.meta.url));

const KEY = '0x71d7bb07b9a64f6f78ac4c816aff4da9';
const API_KEY = 'someApiKey1234567';

// A port nothing listens on: bound, then closed.
async function closedPort() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

function run(args, env, nodeArgs = []) {
  const clean = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('STARKNET_')));
  return spawnSync(process.execPath, [...nodeArgs, SIGNER, ...args], { env: { ...clean, ...env }, encoding: 'utf8' });
}

function assertNoSecret(result, rpcUrl) {
  const bare = BigInt(KEY).toString(16);
  for (const stream of [result.stdout, result.stderr]) {
    for (const secret of [KEY, bare, BigInt(KEY).toString(10), API_KEY, rpcUrl]) {
      assert.ok(!stream.includes(secret), `leaked a secret: ${stream}`);
    }
  }
}

test('refuses to run when a variable is missing, naming it', () => {
  const result = run(['call', '--contract', '0x1', '--function', 'f'], {
    STARKNET_ACCOUNT_ADDRESS: '0x1',
    STARKNET_PRIVATE_KEY: KEY,
  });
  assert.equal(result.status, 2);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, 'signer: missing environment variable: STARKNET_RPC_URL\n');
  assertNoSecret(result, 'unused');
});

test('refuses a secret in argv without printing it', () => {
  const rpcUrl = `http://127.0.0.1:1/rpc/${API_KEY}`;
  const env = { STARKNET_ACCOUNT_ADDRESS: '0x1', STARKNET_PRIVATE_KEY: KEY, STARKNET_RPC_URL: rpcUrl };
  for (const args of [
    ['invoke', '--contract', '0x1', '--function', 'f', '--calldata', KEY],
    ['deploy', '--class-hash', '0x1', '--private-key', KEY],
    ['call', '--contract', '0x1', '--function', 'f', '--url', rpcUrl],
  ]) {
    const result = run(args, env);
    assert.equal(result.status, 2);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /secrets come from the environment only/);
    assertNoSecret(result, rpcUrl);
  }
});

test('a thrown error and a library log holding the key and the URL print neither', () => {
  const rpcUrl = `http://127.0.0.1:1/rpc/${API_KEY}`;
  const env = { STARKNET_ACCOUNT_ADDRESS: '0x1', STARKNET_PRIVATE_KEY: KEY, STARKNET_RPC_URL: rpcUrl };
  const result = run(['call', '--contract', '0x1', '--function', 'f'], env, ['--import', THROWER]);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /library warning \[redacted key\] \[redacted url\]/);
  assert.match(result.stderr, /signer: boom with \[redacted key\] at \[redacted url\]/);
  assertNoSecret(result, rpcUrl);
});

test('a node that cannot be reached is reported without its URL', async () => {
  const rpcUrl = `http://127.0.0.1:${await closedPort()}/rpc/v0_10/${API_KEY}`;
  const env = { STARKNET_ACCOUNT_ADDRESS: '0x1', STARKNET_PRIVATE_KEY: KEY, STARKNET_RPC_URL: rpcUrl };
  const result = run(['call', '--contract', '0x1', '--function', 'f'], env);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /^signer: /);
  assertNoSecret(result, rpcUrl);
});
