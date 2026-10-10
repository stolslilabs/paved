// Rehearsal against a local starknet-devnet: declare MockUSDC, deploy it, mint, read the balance,
// all through the signer with a predeployed devnet account (public test keys) in the environment.
// Skipped when the node binary or the built classes are missing (build with `scarb build` in
// contracts/). Overrides: DEVNET_BIN, SIGNER_SIERRA, SIGNER_CASM.

import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';

const SIGNER = fileURLToPath(new URL('../signer.mjs', import.meta.url));
const TARGET = fileURLToPath(new URL('../../../contracts/target/dev/', import.meta.url));
const DEVNET_BIN = process.env.DEVNET_BIN ?? join(homedir(), '.asdf/installs/starknet-devnet/0.10.0/bin/starknet-devnet');
const SIERRA = process.env.SIGNER_SIERRA ?? join(TARGET, 'paved_MockUSDC.contract_class.json');
const CASM = process.env.SIGNER_CASM ?? join(TARGET, 'paved_MockUSDC.compiled_contract_class.json');

const missing = [DEVNET_BIN, SIERRA, CASM].filter((path) => !existsSync(path));
const skip = missing.length > 0 ? `missing: ${missing.join(', ')}` : false;

let node;
let rpcUrl;
let account;

async function freePort() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function rpc(method, params = {}) {
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  return (await response.json()).result;
}

function signer(...args) {
  const env = {
    PATH: process.env.PATH,
    STARKNET_ACCOUNT_ADDRESS: account.address,
    STARKNET_PRIVATE_KEY: account.private_key,
    STARKNET_RPC_URL: rpcUrl,
  };
  assert.ok(!args.some((arg) => arg.includes(account.private_key.slice(2))), 'the key reached argv');
  const result = spawnSync(process.execPath, [SIGNER, ...args], { env, encoding: 'utf8' });
  for (const stream of [result.stdout, result.stderr]) {
    assert.ok(!stream.includes(account.private_key.slice(2)), 'the key was printed');
    assert.ok(!stream.includes(rpcUrl), 'the RPC URL was printed');
  }
  assert.equal(result.status, 0, `signer ${args[0]} failed: ${result.stderr}`);
  const lines = result.stdout.trim().split('\n');
  assert.equal(lines.length, 1, 'more than one line on stdout');
  return { line: lines[0], json: JSON.parse(lines[0]) };
}

before(async () => {
  if (skip) return;
  const port = await freePort();
  rpcUrl = `http://127.0.0.1:${port}/rpc`;
  node = spawn(DEVNET_BIN, ['--host', '127.0.0.1', '--port', String(port), '--seed', '42', '--accounts', '2'], {
    stdio: 'ignore',
  });
  for (let i = 0; i < 100; i += 1) {
    try {
      if ((await rpc('starknet_specVersion')) !== undefined) break;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  [account] = await rpc('devnet_getPredeployedAccounts');
});

after(() => {
  // Stopped by its own PID, nothing else.
  if (node?.pid) process.kill(node.pid, 'SIGTERM');
});

test('declare, deploy, invoke, multicall and call MockUSDC on devnet', { skip }, (t) => {
  const declared = signer('declare', '--sierra', SIERRA, '--casm', CASM);
  t.diagnostic(`declare: ${declared.line}`);
  assert.match(declared.json.class_hash, /^0x[0-9a-f]+$/);
  assert.match(declared.json.transaction_hash, /^0x[0-9a-f]+$/);

  const again = signer('declare', '--sierra', SIERRA, '--casm', CASM);
  t.diagnostic(`declare again: ${again.line}`);
  assert.deepEqual(again.json, { class_hash: declared.json.class_hash, transaction_hash: null, already_declared: true });

  const deployed = signer('deploy', '--class-hash', declared.json.class_hash);
  t.diagnostic(`deploy: ${deployed.line}`);
  const usdc = deployed.json.contract_address;
  assert.match(usdc, /^0x[0-9a-f]+$/);

  // mint(recipient, amount: u256 = low, high): 1 USDC (6 decimals).
  const minted = signer('invoke', '--contract', usdc, '--function', 'mint', '--calldata', account.address, '1000000', '0');
  t.diagnostic(`invoke mint: ${minted.line}`);
  assert.match(minted.json.transaction_hash, /^0x[0-9a-f]+$/);

  const balance = signer('call', '--contract', usdc, '--function', 'balance_of', '--calldata', account.address);
  t.diagnostic(`call balance_of: ${balance.line}`);
  assert.deepEqual(balance.json.result, ['0xf4240', '0x0']);

  const calls = join(mkdtempSync(join(tmpdir(), 'paved-signer-')), 'calls.json');
  writeFileSync(calls, JSON.stringify([
    { contract: usdc, function: 'mint', calldata: [account.address, '2000000', '0'] },
    { contract: usdc, function: 'transfer', calldata: ['0x1234', '500000', '0'] },
  ]));
  const multi = signer('multicall', '--calls', calls);
  t.diagnostic(`multicall mint + transfer: ${multi.line}`);
  const after = signer('call', '--contract', usdc, '--function', 'balance_of', '--calldata', account.address);
  t.diagnostic(`call balance_of: ${after.line}`);
  assert.deepEqual(after.json.result, ['0x2625a0', '0x0']); // 1 + 2 - 0.5 = 2.5 USDC
});
