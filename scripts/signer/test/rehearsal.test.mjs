// Rehearsal against a local starknet-devnet: declare MockUSDC, deploy it, mint, read the balance,
// all through the signer with a predeployed devnet account (public test keys) in the environment;
// then a devnet started as mainnet (`--chain-id MAINNET`), which the signer refuses without signing.
// Skipped when the node binary or the built classes are missing (build with `scarb build` in
// contracts/). Overrides: DEVNET_BIN, SIGNER_SIERRA, SIGNER_CASM.

import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, test } from 'node:test';

const SIGNER = fileURLToPath(new URL('../signer.mjs', import.meta.url));
const TARGET = fileURLToPath(new URL('../../../contracts/target/dev/', import.meta.url));
const DEVNET_BIN = process.env.DEVNET_BIN ?? join(homedir(), '.asdf/installs/starknet-devnet/0.10.0/bin/starknet-devnet');
const SIERRA = process.env.SIGNER_SIERRA ?? join(TARGET, 'paved_MockUSDC.contract_class.json');
const CASM = process.env.SIGNER_CASM ?? join(TARGET, 'paved_MockUSDC.compiled_contract_class.json');

const missing = [DEVNET_BIN, SIERRA, CASM].filter((path) => !existsSync(path));
const skip = missing.length > 0 ? `missing: ${missing.join(', ')}` : false;

const nodes = [];

after(() => {
  // Each node is stopped by its own PID, nothing else.
  for (const node of nodes) if (node.pid) process.kill(node.pid, 'SIGTERM');
});

async function freePort() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function rpc(url, method, params = {}) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  return (await response.json()).result;
}

// Starts a seeded devnet on a free port; returns its URL and first predeployed account.
async function startDevnet(extraArgs = []) {
  const port = await freePort();
  const url = `http://127.0.0.1:${port}/rpc`;
  // PATH only: a shell holding a real key must not hand it to the node.
  const node = spawn(DEVNET_BIN, ['--host', '127.0.0.1', '--port', String(port), '--seed', '42', '--accounts', '2', ...extraArgs], {
    stdio: 'ignore',
    env: { PATH: process.env.PATH },
  });
  nodes.push(node);
  for (let i = 0; i < 100; i += 1) {
    try {
      if ((await rpc(url, 'starknet_specVersion')) !== undefined) break;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const [account] = await rpc(url, 'devnet_getPredeployedAccounts');
  return { url, account };
}

function runSigner({ url, account }, args) {
  const env = {
    PATH: process.env.PATH,
    STARKNET_ACCOUNT_ADDRESS: account.address,
    STARKNET_PRIVATE_KEY: account.private_key,
    STARKNET_RPC_URL: url,
    SIGNER_NETWORK: 'devnet',
  };
  assert.ok(!args.some((arg) => arg.includes(account.private_key.slice(2))), 'the key reached argv');
  const result = spawnSync(process.execPath, [SIGNER, ...args], { env, encoding: 'utf8' });
  for (const stream of [result.stdout, result.stderr]) {
    assert.ok(!stream.includes(account.private_key.slice(2)), 'the key was printed');
    assert.ok(!stream.includes(url), 'the RPC URL was printed');
  }
  return result;
}

test('declare, deploy, invoke, multicall and call MockUSDC on devnet', { skip }, async (t) => {
  const devnet = await startDevnet();
  const { account } = devnet;
  const signer = (...args) => {
    const result = runSigner(devnet, args);
    assert.equal(result.status, 0, `signer ${args[0]} failed: ${result.stderr}`);
    const lines = result.stdout.trim().split('\n');
    assert.equal(lines.length, 1, 'more than one line on stdout');
    if (result.stderr) t.diagnostic(`  stderr: ${result.stderr.trim().replaceAll('\n', ' | ')}`);
    return { line: lines[0], json: JSON.parse(lines[0]), stderr: result.stderr };
  };

  const declared = signer('declare', '--sierra', SIERRA, '--casm', CASM);
  t.diagnostic(`declare: ${declared.line}`);
  assert.match(declared.json.class_hash, /^0x[0-9a-f]+$/);
  assert.match(declared.json.transaction_hash, /^0x[0-9a-f]+$/);
  assert.equal(declared.stderr, 'signer: declare paved_MockUSDC.contract_class.json\n');

  const again = signer('declare', '--sierra', SIERRA, '--casm', CASM);
  t.diagnostic(`declare again: ${again.line}`);
  assert.deepEqual(again.json, { class_hash: declared.json.class_hash, transaction_hash: null, already_declared: true });

  const deployed = signer('deploy', '--class-hash', declared.json.class_hash);
  t.diagnostic(`deploy: ${deployed.line}`);
  const usdc = deployed.json.contract_address;
  assert.match(usdc, /^0x[0-9a-f]+$/);

  // MockUSDC's constructor premints 10,000 USDC to the deployer (S-1): the balances below are read as
  // changes from it. A u256 balance is two felts, low then high.
  const balanceOf = () => {
    const { json } = signer('call', '--contract', usdc, '--function', 'balance_of', '--calldata', account.address);
    t.diagnostic(`call balance_of: ${JSON.stringify(json)}`);
    assert.equal(json.result.length, 2);
    return BigInt(json.result[0]) + (BigInt(json.result[1]) << 128n);
  };
  const premint = balanceOf();
  assert.equal(premint, 10_000_000_000n);

  // mint(recipient, amount: u256 = low, high): 1 USDC (6 decimals).
  const minted = signer('invoke', '--contract', usdc, '--function', 'mint', '--calldata', account.address, '1000000', '0');
  t.diagnostic(`invoke mint: ${minted.line}`);
  assert.match(minted.json.transaction_hash, /^0x[0-9a-f]+$/);
  assert.equal(minted.stderr, `signer: invoke ${usdc} mint\n`);

  assert.equal(balanceOf() - premint, 1_000_000n);

  const calls = join(mkdtempSync(join(tmpdir(), 'paved-signer-')), 'calls.json');
  writeFileSync(calls, JSON.stringify([
    { contract: usdc, function: 'mint', calldata: [account.address, '2000000', '0'] },
    { contract: usdc, function: 'transfer', calldata: ['0x1234', '500000', '0'] },
  ]));
  const multi = signer('multicall', '--calls', calls);
  t.diagnostic(`multicall mint + transfer: ${multi.line}`);
  assert.equal(multi.stderr, `signer: invoke ${usdc} mint\nsigner: invoke ${usdc} transfer\n`);
  assert.equal(balanceOf() - premint, 2_500_000n); // 1 + 2 - 0.5 = 2.5 USDC
});

test('a devnet started as mainnet is refused and nothing is signed', { skip }, async (t) => {
  const devnet = await startDevnet(['--chain-id', 'MAINNET']);
  assert.equal(await rpc(devnet.url, 'starknet_chainId'), '0x534e5f4d41494e');
  const nonceBefore = await rpc(devnet.url, 'starknet_getNonce', { block_id: 'latest', contract_address: devnet.account.address });
  const blockBefore = await rpc(devnet.url, 'starknet_blockNumber');
  for (const args of [
    ['declare', '--sierra', SIERRA, '--casm', CASM],
    ['invoke', '--contract', devnet.account.address, '--function', 'f'],
  ]) {
    const result = runSigner(devnet, args);
    t.diagnostic(`${args[0]} on SN_MAIN: exit ${result.status}, stderr: ${result.stderr.trim()}`);
    assert.equal(result.status, 2);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /^signer: the node is on Starknet mainnet \(SN_MAIN\)/);
  }
  assert.equal(await rpc(devnet.url, 'starknet_getNonce', { block_id: 'latest', contract_address: devnet.account.address }), nonceBefore);
  assert.equal(await rpc(devnet.url, 'starknet_blockNumber'), blockBefore);
});
