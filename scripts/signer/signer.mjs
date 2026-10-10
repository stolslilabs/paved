#!/usr/bin/env node
// Paved's starknet.js signer (P-40): declares, deploys, invokes and calls with an account whose
// address, key and node come from the environment only. Prints one JSON line on stdout; every
// other output (errors, library logs) goes to stderr through the sanitiser. See README.md.

import { format } from 'node:util';

import { USAGE, assertNoSecretInArgv, parseArgs } from './lib/args.mjs';
import { UsageError, assertSafeRuntime, readEnv } from './lib/env.mjs';
import { formatError, makeSanitizer } from './lib/sanitize.mjs';

// Until the environment is read, the sanitiser still strips every URL.
let sanitize = makeSanitizer();

// Nothing may print around the sanitiser: both streams sanitise every write, whoever writes.
for (const stream of [process.stdout, process.stderr]) {
  const write = stream.write.bind(stream);
  stream.write = (chunk, encoding, callback) => {
    const text = typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString(typeof encoding === 'string' ? encoding : 'utf8');
    return typeof encoding === 'function' ? write(sanitize(text), encoding) : write(sanitize(text), callback);
  };
}

// console goes to stderr, so stdout keeps its one JSON line.
for (const method of ['log', 'info', 'warn', 'error', 'debug', 'trace', 'dir']) {
  console[method] = (...args) => process.stderr.write(`${format(...args)}\n`);
}

function fail(error) {
  const usage = error instanceof UsageError;
  process.stderr.write(`signer: ${formatError(error, sanitize)}\n`);
  if (usage && /command is required|unknown command/.test(error.message)) process.stderr.write(`${USAGE}\n`);
  // Exit once stderr is flushed (pipes are asynchronous on macOS).
  process.exitCode = usage ? 2 : 1;
  process.stderr.write('', () => process.exit());
}

process.on('uncaughtException', fail);
process.on('unhandledRejection', fail);

async function main(argv) {
  assertSafeRuntime(process.env, process.execArgv);
  const { command, options } = parseArgs(argv);
  const env = readEnv(process.env);
  sanitize = makeSanitizer(env);
  assertNoSecretInArgv(argv, sanitize);
  // Imported late: a usage error never loads starknet.js.
  const actions = await import('./lib/actions.mjs');
  const result = await actions[command](await actions.connect(env), options);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

main(process.argv.slice(2)).catch(fail);
