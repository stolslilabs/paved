import assert from 'node:assert/strict';
import { test } from 'node:test';

import { COMMANDS, assertNoSecretInArgv, parseArgs, parseCalls, resolveAccount } from '../lib/args.mjs';
import { UsageError } from '../lib/env.mjs';
import { makeSanitizer } from '../lib/sanitize.mjs';

const KEY = '0x71d7bb07b9a64f6f78ac4c816aff4da9';
const RPC_URL = 'https://rpc.example.io/v0_10/someApiKey123';

function refused(fn, ...secrets) {
  assert.throws(fn, (error) => {
    assert.ok(error instanceof UsageError);
    for (const secret of secrets) assert.ok(!error.message.includes(secret), `echoed a value: ${error.message}`);
    return true;
  });
}

test('parses each subcommand', () => {
  assert.deepEqual(parseArgs(['declare', '--sierra', 'a.json', '--casm', 'b.json']), {
    command: 'declare',
    options: { sierra: 'a.json', casm: 'b.json' },
  });
  assert.deepEqual(parseArgs(['deploy', '--class-hash', '0x12', '--calldata', '1', '0x2']).options, {
    classHash: '0x12',
    calldata: ['1', '0x2'],
  });
  assert.deepEqual(parseArgs(['invoke', '--function', 'mint', '--contract', '0x1', '--calldata']).options, {
    entrypoint: 'mint',
    contract: '0x1',
    calldata: [],
  });
  assert.deepEqual(parseArgs(['call', '--contract', '0x1', '--function', 'balance_of']).options.calldata, []);
  assert.deepEqual(parseArgs(['multicall', '--calls', 'calls.json']).options, { calls: 'calls.json' });
});

test('no subcommand has an option for a key, an account or a node', () => {
  for (const flags of Object.values(COMMANDS)) {
    for (const flag of Object.keys(flags)) {
      assert.ok(!/key|private|secret|account|url|rpc|node|keystore|signer/.test(flag), `secret-shaped flag ${flag}`);
    }
  }
});

test('refuses secret-carrying options, without echoing their values', () => {
  const attempts = [
    ['deploy', '--class-hash', '0x1', '--private-key', KEY],
    ['deploy', '--class-hash', '0x1', `--private-key=${KEY}`],
    ['invoke', '--url', RPC_URL, '--contract', '0x1', '--function', 'f'],
    ['call', `--rpc=${RPC_URL}`, '--contract', '0x1', '--function', 'f'],
    ['declare', '--keystore', 'k.json', '--sierra', 'a', '--casm', 'b'],
    ['declare', '--account', '0x1', '--sierra', 'a', '--casm', 'b'],
    ['call', KEY],
    [KEY],
    [RPC_URL],
  ];
  for (const argv of attempts) refused(() => parseArgs(argv), KEY, RPC_URL);
});

test('refuses malformed values and missing options, without echoing them', () => {
  refused(() => parseArgs(['deploy', '--class-hash', 'zz-secret']), 'zz-secret');
  refused(() => parseArgs(['invoke', '--contract', '0x1', '--function', 'bad name']), 'bad name');
  refused(() => parseArgs(['declare', '--sierra', RPC_URL, '--casm', 'b']), RPC_URL);
  refused(() => parseArgs(['declare', '--sierra', 'a']));
  refused(() => parseArgs(['declare', '--sierra', 'a', '--sierra', 'b', '--casm', 'c']));
  refused(() => parseArgs(['deploy', '--class-hash']));
});

test('refuses a secret value inside an allowed option', () => {
  const sanitize = makeSanitizer({ privateKey: KEY, rpcUrl: RPC_URL });
  const decimal = BigInt(KEY).toString(10);
  for (const argv of [
    ['invoke', '--contract', '0x1', '--function', 'f', '--calldata', KEY],
    ['invoke', '--contract', '0x1', '--function', 'f', '--calldata', decimal],
    ['deploy', '--class-hash', `0x000${KEY.slice(2)}`],
    ['declare', '--sierra', 'someApiKey123.json', '--casm', 'b'],
    ['declare', '--sierra', 'file://x', '--casm', 'b'],
  ]) {
    refused(() => assertNoSecretInArgv(argv, sanitize), KEY, decimal, 'someApiKey123');
  }
  assertNoSecretInArgv(['invoke', '--contract', '0x1', '--function', 'mint', '--calldata', '0x1', '1000000', '0'], sanitize);
});

test('validates multicall entries', () => {
  assert.deepEqual(parseCalls([{ contract: '0x1', function: 'mint', calldata: ['0x2', 3] }]), [
    { contractAddress: '0x1', entrypoint: 'mint', calldata: ['0x2', '3'] },
  ]);
  refused(() => parseCalls([]));
  refused(() => parseCalls([{ contract: '0x1' }]));
  refused(() => parseCalls([{ contract: '0x1', function: 'f', calldata: 'x' }]));
});

test('every felt argument is below the field prime', () => {
  const prime = 2n ** 251n + 17n * 2n ** 192n + 1n;
  const top = prime - 1n;
  assert.deepEqual(parseArgs(['call', '--contract', `0x${top.toString(16)}`, '--function', 'f', '--calldata', top.toString(10)]).options.calldata, [top.toString(10)]);
  for (const value of [`0x${prime.toString(16)}`, prime.toString(10), `0x${'f'.repeat(64)}`, '9'.repeat(78)]) {
    refused(() => parseArgs(['deploy', '--class-hash', value]), value);
    refused(() => parseArgs(['deploy', '--class-hash', '0x1', '--salt', value]), value);
    refused(() => parseArgs(['invoke', '--contract', value, '--function', 'f']), value);
    refused(() => parseArgs(['call', '--contract', '0x1', '--function', 'f', '--calldata', '1', value]), value);
    refused(() => parseCalls([{ contract: '0x1', function: 'f', calldata: [value] }]), value);
    refused(() => parseCalls([{ contract: value, function: 'f' }]), value);
  }
});

test('@account stands for the account address in calldata, and only there', () => {
  assert.deepEqual(parseArgs(['invoke', '--contract', '0x1', '--function', 'mint', '--calldata', '@account', '5', '0']).options.calldata, ['@account', '5', '0']);
  assert.deepEqual(resolveAccount(['@account', '5', '@account'], '0xabc'), ['0xabc', '5', '0xabc']);
  assert.deepEqual(parseCalls([{ contract: '0x1', function: 'f', calldata: ['@account'] }])[0].calldata, ['@account']);
  refused(() => parseArgs(['invoke', '--contract', '@account', '--function', 'f']));
  refused(() => parseArgs(['deploy', '--class-hash', '@account']));
  refused(() => parseArgs(['call', '--contract', '0x1', '--function', 'f', '--calldata', '@other']));
  refused(() => parseCalls([{ contract: '@account', function: 'f' }]));
});
