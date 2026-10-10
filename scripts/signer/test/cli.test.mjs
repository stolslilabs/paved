import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const SIGNER = fileURLToPath(new URL('../signer.mjs', import.meta.url));
const THROWER = fileURLToPath(new URL('./fixtures/throw-secrets.mjs', import.meta.url));
const FAKE_NODE = fileURLToPath(new URL('./fixtures/fake-node.mjs', import.meta.url));

const KEY = '0x71d7bb07b9a64f6f78ac4c816aff4da9';
const API_KEY = 'someApiKey1234567';
const RPC_URL = `http://127.0.0.1:1/rpc/${API_KEY}`;
const ENV = { STARKNET_ACCOUNT_ADDRESS: '0x1', STARKNET_PRIVATE_KEY: KEY, STARKNET_RPC_URL: RPC_URL, SIGNER_NETWORK: 'devnet' };
const INVOKE = ['invoke', '--contract', '0x1', '--function', 'mint', '--calldata', '0x2', '1', '0'];

// A port nothing listens on: bound, then closed.
async function closedPort() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

// The parent's STARKNET_*, SIGNER_* and NODE_* variables never reach the child.
function run(args, env, nodeArgs = []) {
  const clean = Object.fromEntries(Object.entries(process.env).filter(([name]) => !/^(STARKNET_|SIGNER_|NODE_)/.test(name)));
  return spawnSync(process.execPath, [...nodeArgs, SIGNER, ...args], { env: { ...clean, ...env }, encoding: 'utf8' });
}

function assertNoSecret(result, rpcUrl = RPC_URL) {
  const bare = BigInt(KEY).toString(16);
  for (const stream of [result.stdout, result.stderr]) {
    for (const secret of [KEY, bare, BigInt(KEY).toString(10), API_KEY, rpcUrl]) {
      assert.ok(!stream.includes(secret), `leaked a secret: ${stream}`);
    }
  }
}

test('refuses to run when a variable is missing, naming it', () => {
  for (const name of Object.keys(ENV)) {
    const { [name]: _, ...env } = ENV;
    const result = run(['call', '--contract', '0x1', '--function', 'f'], env);
    assert.equal(result.status, 2);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr, `signer: missing environment variable: ${name}\n`);
    assertNoSecret(result);
  }
});

test('refuses a secret in argv without printing it', () => {
  for (const args of [
    ['invoke', '--contract', '0x1', '--function', 'f', '--calldata', KEY],
    ['deploy', '--class-hash', '0x1', '--private-key', KEY],
    ['call', '--contract', '0x1', '--function', 'f', '--url', RPC_URL],
  ]) {
    const result = run(args, ENV);
    assert.equal(result.status, 2);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /secrets come from the environment only/);
    assertNoSecret(result);
  }
});

test('library logs, direct stream writes and a thrown error holding the key and the URL print neither', () => {
  const result = run(['call', '--contract', '0x1', '--function', 'f'], ENV, ['--import', THROWER]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /library warning \[redacted key\] \[redacted url\]/);
  assert.match(result.stderr, /direct stderr \[redacted key\] \[redacted url\]/);
  assert.match(result.stderr, /signer: boom with \[redacted key\] at \[redacted url\]/);
  assert.equal(result.stdout, 'direct stdout [redacted key] [redacted url]\n');
  assertNoSecret(result);
});

test('a node that cannot be reached is reported without its URL', async () => {
  const rpcUrl = `http://127.0.0.1:${await closedPort()}/rpc/v0_10/${API_KEY}`;
  const result = run(['call', '--contract', '0x1', '--function', 'f'], { ...ENV, STARKNET_RPC_URL: rpcUrl });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /^signer: /);
  assertNoSecret(result, rpcUrl);
});

test('a node on SN_MAIN is refused before anything is signed, whatever SIGNER_NETWORK says', () => {
  for (const network of ['devnet', 'sepolia']) {
    const env = { ...ENV, SIGNER_NETWORK: network, FAKE_CHAIN_ID: '0x534e5f4d41494e' };
    if (network === 'sepolia') env.STARKNET_RPC_URL = `https://rpc.example.io/rpc/${API_KEY}`;
    const result = run(INVOKE, env, ['--import', FAKE_NODE]);
    assert.equal(result.status, 2);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /signer: the node is on Starknet mainnet \(SN_MAIN\).*nothing was signed/);
    assert.doesNotMatch(result.stderr, /fake-node: asked|signer: invoke/);
    assertNoSecret(result, env.STARKNET_RPC_URL);
  }
});

test('a chain id other than the network\'s is refused before anything is signed', () => {
  const result = run(INVOKE, { ...ENV, FAKE_CHAIN_ID: '0x534e5f4f54484552' }, ['--import', FAKE_NODE]);
  assert.equal(result.status, 2);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /is not devnet's \(0x534e5f5345504f4c4941\); nothing was signed/);
  assert.doesNotMatch(result.stderr, /fake-node: asked|signer: invoke/);
});

test('the right chain id goes on to sign, announcing each call first', () => {
  const result = run(INVOKE, { ...ENV, FAKE_CHAIN_ID: '0x534e5f5345504f4c4941' }, ['--import', FAKE_NODE]);
  assert.match(result.stderr, /^signer: invoke 0x1 mint\nfake-node: asked /);
  assertNoSecret(result);
});

test('refuses NODE_DEBUG, --report-* and --inspect, naming the variable only', () => {
  for (const [env, nodeArgs, message] of [
    [{ NODE_DEBUG: 'fetch' }, [], /^signer: NODE_DEBUG is set/],
    [{ NODE_OPTIONS: '--report-on-signal' }, [], /^signer: NODE_OPTIONS holds --report-\* or --inspect/],
    [{}, ['--report-uncaught-exception'], /^signer: node was started with --report-\* or --inspect/],
  ]) {
    const result = run(INVOKE, { ...ENV, ...env }, nodeArgs);
    assert.equal(result.status, 2);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, message);
    assert.ok(!result.stderr.includes('fetch,') && !result.stderr.includes('--report-on-signal'));
    assertNoSecret(result);
  }
});
