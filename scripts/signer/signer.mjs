#!/usr/bin/env node
// Paved's starknet.js signer (P-40): declares, deploys, invokes and calls with an account whose
// address, key and node come from the environment only. Prints one JSON line on stdout; every
// other output (errors, library logs) goes to stderr through the sanitiser. See README.md.

import { format } from 'node:util';

import { USAGE, assertNoSecretInArgv, parseArgs } from './lib/args.mjs';
import { UsageError, readEnv } from './lib/env.mjs';
import { formatError, makeSanitizer } from './lib/sanitize.mjs';

// Until the environment is read, the sanitiser still strips every URL.
let sanitize = makeSanitizer();

// No library may print around the sanitiser: console goes to stderr, sanitised.
for (const method of ['log', 'info', 'warn', 'error', 'debug', 'trace', 'dir']) {
  console[method] = (...args) => process.stderr.write(`${sanitize(format(...args))}\n`);
}

function fail(error) {
  const usage = error instanceof UsageError;
  process.stderr.write(`signer: ${formatError(error, sanitize)}\n`);
  if (usage && /command is required|unknown command/.test(error.message)) process.stderr.write(`${USAGE}\n`);
  process.exit(usage ? 2 : 1);
}

process.on('uncaughtException', fail);
process.on('unhandledRejection', fail);

async function main(argv) {
  const { command, options } = parseArgs(argv);
  const env = readEnv(process.env);
  sanitize = makeSanitizer(env);
  assertNoSecretInArgv(argv, sanitize);
  // Imported late: a usage error never loads starknet.js.
  const actions = await import('./lib/actions.mjs');
  const result = await actions[command](actions.connect(env), options);
  process.stdout.write(`${sanitize(JSON.stringify(result))}\n`);
}

main(process.argv.slice(2)).catch(fail);
