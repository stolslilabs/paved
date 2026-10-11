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

// What starknet.js asks a node while it builds, estimates and sends a transaction: the steps of
// signing. A run that asks one of them got past every check.
const SIGNING_METHODS = /fake-node: asked (starknet_getBlockWithTxs|starknet_getNonce|starknet_estimateFee|starknet_getClassHashAt|starknet_addInvokeTransaction)\n/;
const DEVNET_NODE = { FAKE_CHAIN_ID: '0x534e5f5345504f4c4941', FAKE_DEVNET_CONFIG: '1' };

test('the right chain id goes on to sign, announcing each call first', () => {
  for (const [network, extra] of [['devnet', DEVNET_NODE], ['sepolia', { FAKE_CHAIN_ID: '0x534e5f5345504f4c4941' }]]) {
    const env = { ...ENV, ...extra, SIGNER_NETWORK: network };
    if (network === 'sepolia') env.STARKNET_RPC_URL = `https://rpc.example.io/rpc/${API_KEY}`;
    const result = run(INVOKE, env, ['--import', FAKE_NODE]);
    // The fake node answers no signing step, so the run fails (1, not a refusal's 2) after reaching one.
    assert.equal(result.status, 1, result.stderr);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /^signer: invoke 0x1 mint\n/);
    assert.match(result.stderr, SIGNING_METHODS);
    assertNoSecret(result, env.STARKNET_RPC_URL);
  }
});

test('devnet: a node that does not answer devnet_getConfig (a tunnel to Sepolia) is refused before signing', () => {
  const result = run(INVOKE, { ...ENV, FAKE_CHAIN_ID: '0x534e5f5345504f4c4941' }, ['--import', FAKE_NODE]);
  assert.equal(result.status, 2);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, 'fake-node: asked devnet_getConfig\n'
    + 'signer: SIGNER_NETWORK=devnet but the node does not answer devnet_getConfig (not a starknet-devnet); nothing was signed\n');
  assertNoSecret(result);
});

test('refuses NODE_DEBUG, and any node option but --max-old-space-size (and --disable-sigusr1 on the command line)', () => {
  for (const [env, nodeArgs, message] of [
    [{ NODE_DEBUG: 'fetch' }, [], /^signer: NODE_DEBUG is set/],
    [{ NODE_OPTIONS: '--report-on-signal' }, [], /^signer: NODE_OPTIONS holds an option other than --max-old-space-size=<n>/],
    [{ NODE_OPTIONS: '--max-old-space-size=448 --heapsnapshot-signal=SIGUSR2' }, [], /^signer: NODE_OPTIONS holds an option other/],
    [{ NODE_OPTIONS: `--require ${THROWER}` }, [], /^signer: NODE_OPTIONS holds an option other/],
    [{ NODE_OPTIONS: `--import=${THROWER}` }, [], /^signer: NODE_OPTIONS holds an option other/],
    [{}, ['--report-uncaught-exception'], /^signer: node was started with an option other than/],
    [{ NODE_TLS_REJECT_UNAUTHORIZED: '0' }, [], /^signer: NODE_TLS_REJECT_UNAUTHORIZED=0 turns off TLS checks/],
    [{}, ['--heapsnapshot-near-heap-limit=1'], /^signer: node was started with an option other than/],
  ]) {
    const result = run(INVOKE, { ...ENV, ...env }, nodeArgs);
    assert.equal(result.status, 2, result.stderr);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, message);
    assert.ok(!result.stderr.includes('fetch,') && !result.stderr.includes('--report-on-signal') && !result.stderr.includes('SIGUSR2'));
    assertNoSecret(result);
  }
  // What deploy.sh runs: the heap cap in NODE_OPTIONS, --disable-sigusr1 on the command line.
  const allowed = run(INVOKE, { ...ENV, ...DEVNET_NODE, NODE_OPTIONS: '--max-old-space-size=448' }, ['--disable-sigusr1', '--import', FAKE_NODE]);
  assert.equal(allowed.status, 1, allowed.stderr);
  assert.match(allowed.stderr, SIGNING_METHODS);
});

test('refuses a felt at or above the field prime, before reading the node', () => {
  const prime = 2n ** 251n + 17n * 2n ** 192n + 1n;
  for (const value of [`0x${prime.toString(16)}`, (prime + 5n).toString(10), `0x${'f'.repeat(64)}`]) {
    const result = run(['invoke', '--contract', '0x1', '--function', 'mint', '--calldata', value], { ...ENV, ...DEVNET_NODE }, ['--import', FAKE_NODE]);
    assert.equal(result.status, 2);
    assert.equal(result.stderr, 'signer: --calldata expects a felt (0x-hex or decimal, below the field prime)\n');
  }
});

// estimate (S-1c): a node that answers every step of an estimate and accepts any transaction. The
// estimate asks starknet_estimateFee and never a starknet_add* method.
const ESTIMATE_NODE = fileURLToPath(new URL('./fixtures/fake-estimate-node.mjs', import.meta.url));
const TINY_SIERRA = fileURLToPath(new URL('./fixtures/tiny.contract_class.json', import.meta.url));
const TINY_CASM = fileURLToPath(new URL('./fixtures/tiny.compiled_contract_class.json', import.meta.url));
const SEPOLIA = { ...ENV, SIGNER_NETWORK: 'sepolia', STARKNET_RPC_URL: `https://rpc.example.io/rpc/${API_KEY}` };
const ESTIMATES = [
  ['estimate', 'declare', '--sierra', TINY_SIERRA, '--casm', TINY_CASM],
  ['estimate', 'deploy', '--class-hash', '0x12', '--calldata', '@account', '1'],
  ['estimate', 'invoke', '--contract', '0x1', '--function', 'mint', '--calldata', '0x2', '1', '0'],
];

function estimateLine(result) {
  const lines = result.stdout.trim().split('\n');
  assert.equal(lines.length, 1, result.stdout);
  return JSON.parse(lines[0]);
}

test('estimate asks starknet_estimateFee for declare, deploy and invoke, and no starknet_add* method', () => {
  for (const args of ESTIMATES) {
    const result = run(args, SEPOLIA, ['--import', ESTIMATE_NODE]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stderr, /fake-node: asked starknet_estimateFee\n/);
    assert.doesNotMatch(result.stderr, /fake-node: asked starknet_add/);
    assert.match(result.stderr, new RegExp(`signer: estimate ${args[1]} .*\\(nothing is sent\\)\n`));
    const line = estimateLine(result);
    assert.equal(line.ok, true);
    assert.equal(line.estimate.overall_fee, '0x2540be480');
    // starknet.js's own request: zero bounds, SKIP_VALIDATE, latest, the query version.
    assert.deepEqual(line.request.simulation_flags, ['SKIP_VALIDATE']);
    assert.equal(line.request.block_id, 'latest');
    assert.equal(line.request.version, '0x100000000000000000000000000000003');
    for (const bound of Object.values(line.request.resource_bounds)) assert.deepEqual(bound, { max_amount: '0x0', max_price_per_unit: '0x0' });
    assertNoSecret(result, SEPOLIA.STARKNET_RPC_URL);
  }
});

test('estimate diagnostics: explicit bounds, validation, a block tag', () => {
  const args = [...ESTIMATES[0], '--bounds', '1,2,3,4,0x5,6', '--validate', '--block-id', 'pre_confirmed'];
  const result = run(args, SEPOLIA, ['--import', ESTIMATE_NODE]);
  assert.equal(result.status, 0, result.stderr);
  const { request } = estimateLine(result);
  assert.deepEqual(request.simulation_flags, []);
  assert.equal(request.block_id, 'pre_confirmed');
  assert.deepEqual(request.resource_bounds, {
    l1_gas: { max_amount: '0x1', max_price_per_unit: '0x2' },
    l1_data_gas: { max_amount: '0x3', max_price_per_unit: '0x4' },
    l2_gas: { max_amount: '0x5', max_price_per_unit: '0x6' },
  });
  assert.doesNotMatch(result.stderr, /fake-node: asked starknet_add/);
});

test('a refused estimate prints the node\'s whole error, or its HTTP status and body, and exits 3', () => {
  for (const [extra, check] of [
    [{ FAKE_ESTIMATE_ERROR: '1' }, (line) => assert.deepEqual(line.error, { code: -32603, message: 'Internal error' })],
    [{ FAKE_ESTIMATE_HTML: '1' }, (line) => {
      assert.equal(line.http_status, 413);
      assert.match(line.body, /413 Request Entity Too Large/);
    }],
  ]) {
    const result = run(ESTIMATES[0], { ...SEPOLIA, ...extra }, ['--import', ESTIMATE_NODE]);
    assert.equal(result.status, 3, result.stderr);
    const line = estimateLine(result);
    assert.equal(line.ok, false);
    assert.ok(line.request.request_bytes > 0);
    check(line);
    assert.doesNotMatch(result.stderr, /fake-node: asked starknet_add/);
    assertNoSecret(result, SEPOLIA.STARKNET_RPC_URL);
  }
});

test('the other commands still send: the fake node is asked starknet_add* by invoke', () => {
  // The control for the tests above: the same node, a sending command, and the add* method shows in the log.
  const result = run(INVOKE, { ...SEPOLIA, FAKE_ESTIMATE_ERROR: '' }, ['--import', ESTIMATE_NODE]);
  assert.match(result.stderr, /fake-node: asked starknet_addInvokeTransaction\n/);
});

// The tip on Sepolia (S-1c): a Sepolia endpoint answered -32601 at random to the block reads of starknet.js's tip
// estimate. On sepolia the signer's default tip is fixed and its Starknet version pinned, so declare, deploy and
// invoke reach the node's estimate and the add* method without reading a block.
const SENDS = [
  ['declare', '--sierra', TINY_SIERRA, '--casm', TINY_CASM],
  ['deploy', '--class-hash', '0x12', '--calldata', '1'],
  INVOKE,
];
const BLOCK_READ = /fake-node: asked starknet_getBlockWith/;

test('sepolia: declare, deploy, invoke and estimate read no block and no account class (fixed tip, pinned versions)', () => {
  for (const args of [...SENDS, ...ESTIMATES]) {
    const result = run(args, SEPOLIA, ['--import', ESTIMATE_NODE]);
    assert.match(result.stderr, /fake-node: asked starknet_estimateFee\n/, result.stderr);
    if (args[0] !== 'estimate') assert.match(result.stderr, /fake-node: asked starknet_add(Declare|Invoke)Transaction\n/, result.stderr);
    assert.doesNotMatch(result.stderr, BLOCK_READ, `${args[0]} read a block`);
    // The account's Cairo version is pinned on sepolia: its class is never read.
    assert.doesNotMatch(result.stderr, /fake-node: asked starknet_getClassAt\n/, `${args[0]} read the account's class`);
    if (args[0] === 'estimate') assert.equal(estimateLine(result).request.tip, '0x5f5e100');
    assertNoSecret(result, SEPOLIA.STARKNET_RPC_URL);
  }
});

test('--tip sets the tip; --tip node reads the latest blocks for it (the control)', () => {
  const fixed = run([...ESTIMATES[2], '--tip', '7'], SEPOLIA, ['--import', ESTIMATE_NODE]);
  assert.equal(estimateLine(fixed).request.tip, '0x7');
  assert.doesNotMatch(fixed.stderr, BLOCK_READ);
  for (const args of [[...SENDS[2], '--tip', 'node'], [...ESTIMATES[2], '--tip', 'node']]) {
    const result = run(args, SEPOLIA, ['--import', ESTIMATE_NODE]);
    assert.match(result.stderr, /fake-node: asked starknet_getBlockWithTxs\n/);
  }
  // devnet keeps starknet.js's estimate by default.
  const devnet = run(ESTIMATES[2], { ...ENV, ...DEVNET_NODE }, ['--import', ESTIMATE_NODE]);
  assert.match(devnet.stderr, /fake-node: asked starknet_getBlockWithTxs\n/);
});

// The retry (S-1c): read methods only, at most 5 attempts (waits 1, 2, 4, 8 s); never a starknet_add* method.
const asked = (stderr, method) => stderr.split('\n').filter((line) => line === `fake-node: asked ${method}`).length;

test('a read answered -32601 is retried and the command goes on; the account class is read on devnet (control)', () => {
  const result = run(ESTIMATES[2], { ...SEPOLIA, FAKE_FLAKY: 'starknet_getNonce:1' }, ['--import', ESTIMATE_NODE]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(asked(result.stderr, 'starknet_getNonce'), 2);
  assert.match(result.stderr, /signer: starknet_getNonce failed \(HTTP 400\), attempt 1 of 5; retrying\n/);
  assert.equal(estimateLine(result).ok, true);
  const devnet = run(ESTIMATES[2], { ...ENV, ...DEVNET_NODE }, ['--import', ESTIMATE_NODE]);
  assert.match(devnet.stderr, /fake-node: asked starknet_getClassAt\n/);
});

test('a starknet_add* method answered -32601 is never retried: the command stops', () => {
  const result = run(INVOKE, { ...SEPOLIA, FAKE_FLAKY: 'starknet_addInvokeTransaction:5' }, ['--import', ESTIMATE_NODE]);
  assert.equal(result.status, 1, result.stderr);
  assert.equal(asked(result.stderr, 'starknet_addInvokeTransaction'), 1);
  assert.doesNotMatch(result.stderr, /addInvokeTransaction failed .* retrying/);
  assert.match(result.stderr, /-32601/);
});

test('a nonce that cannot be read after 5 attempts fails the command; nonce 0 is never used', () => {
  const result = run(INVOKE, { ...SEPOLIA, FAKE_FLAKY: 'starknet_getNonce:5' }, ['--import', ESTIMATE_NODE]);
  assert.equal(result.status, 1, result.stderr);
  assert.equal(asked(result.stderr, 'starknet_getNonce'), 5);
  assert.match(result.stderr, /signer: .*starknet_getNonce.*-32601/s);
  assert.equal(asked(result.stderr, 'starknet_estimateFee'), 0);
  assert.equal(asked(result.stderr, 'starknet_addInvokeTransaction'), 0);
});
