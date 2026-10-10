import assert from 'node:assert/strict';
import { test } from 'node:test';

import { formatError, makeSanitizer } from '../lib/sanitize.mjs';

// Throw-away values, shaped like the real ones.
const KEY = '0x00c1cf1490de1352865301bb8705143f3ef938f97fdf892f1090dcb5ac7bcd1d';
const API_KEY = 'aB3dE5gH7jK9mN1pQ3sT';
const RPC_URL = `https://starknet-sepolia.example-rpc.io/v0_10/${API_KEY}?team=paved`;

const sanitize = makeSanitizer({ privateKey: KEY, rpcUrl: RPC_URL });

function assertClean(text) {
  const bare = BigInt(KEY).toString(16);
  for (const secret of [KEY, bare, bare.toUpperCase(), BigInt(KEY).toString(10), RPC_URL, API_KEY]) {
    assert.ok(!text.includes(secret), `leaked a secret spelling in: ${text}`);
  }
  assert.ok(!/https?:\/\//.test(text), `leaked a URL in: ${text}`);
}

test('redacts the key in every spelling', () => {
  const bare = BigInt(KEY).toString(16);
  const spellings = [KEY, KEY.toUpperCase().replace('0X', '0x'), `0x${bare}`, bare, bare.padStart(64, '0'), BigInt(KEY).toString(10)];
  for (const spelling of spellings) {
    const out = sanitize(`signing with ${spelling} now`);
    assertClean(out);
    assert.match(out, /signing with \[redacted key\] now/);
  }
});

test('redacts the RPC URL, its API key alone, and any other URL', () => {
  assertClean(sanitize(`request to ${RPC_URL} failed`));
  assertClean(sanitize(`provider says: invalid key ${API_KEY}`));
  assertClean(sanitize(`provider says: invalid key ${encodeURIComponent(API_KEY)}`));
  assert.equal(sanitize('see http://other.host:9/x?k=v.'), 'see [redacted url]');
});

test('leaves hashes, addresses and plain text alone', () => {
  const line = '{"transaction_hash":"0x25812dcb1154a17e24d8490484a1e1980d16b137e766a07819a7c51db04e139","result":["0xf4240","0x0"]}';
  assert.equal(sanitize(line), line);
});

test('a thrown error holding the key and the URL prints neither', () => {
  const cause = new Error(`fetch failed for ${RPC_URL} (key ${API_KEY})`);
  const error = new Error(`could not sign with ${KEY} via ${RPC_URL}`, { cause });
  error.stack = `Error: ${KEY} ${RPC_URL}\n    at somewhere`;
  const out = formatError(error, sanitize);
  assertClean(out);
  assert.match(out, /could not sign with \[redacted key\] via \[redacted url\]: fetch failed for \[redacted url\]/);
  assert.ok(!out.includes('at somewhere'), 'printed a stack');
});

test('non-Error throws are sanitised too', () => {
  assertClean(formatError({ message: KEY, url: RPC_URL }, sanitize));
  assertClean(formatError(`${KEY} ${RPC_URL}`, sanitize));
});

test('without secrets, it still strips URLs', () => {
  assert.equal(makeSanitizer()(`at ${RPC_URL}`), 'at [redacted url]');
});

test('redacts the key as base64, base64url, percent-encoded base64 and u128 halves', () => {
  const value = BigInt(KEY);
  const bytes = Buffer.from(value.toString(16).padStart(64, '0'), 'hex');
  const low = value & ((1n << 128n) - 1n);
  const high = value >> 128n;
  const spellings = [
    bytes.toString('base64'),
    bytes.toString('base64').replace(/=+$/, ''),
    bytes.toString('base64url'),
    encodeURIComponent(bytes.toString('base64')),
    encodeURIComponent(bytes.toString('base64')).toLowerCase(),
    `0x${low.toString(16)}`,
    low.toString(10),
    `0x${high.toString(16)}`,
    high.toString(10),
  ];
  for (const spelling of spellings) {
    const out = sanitize(`key=${spelling};`);
    assert.equal(out, 'key=[redacted key];', `kept ${spelling}`);
  }
});

test('a small u128 half is not redacted on its own (it would hide common values)', () => {
  const small = makeSanitizer({ privateKey: '0x71d7bb07b9a64f6f78ac4c816aff4da9' });
  assert.equal(small('["0x0","0x1"]'), '["0x0","0x1"]');
  assert.equal(small('0x71d7bb07b9a64f6f78ac4c816aff4da9'), '[redacted key]');
});

test('redacts the RPC URL and its API key percent-encoded, in either case', () => {
  for (const text of [encodeURIComponent(RPC_URL), encodeURIComponent(RPC_URL).toLowerCase(), encodeURIComponent(`?k=${API_KEY}&x`)]) {
    const out = sanitize(`at ${text}`);
    assert.ok(!out.toLowerCase().includes(API_KEY.toLowerCase()), `kept the API key: ${out}`);
    assert.ok(!out.toLowerCase().includes('example-rpc'), `kept the host: ${out}`);
  }
});
