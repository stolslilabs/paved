// Parses the signer's argv. Only the options listed per subcommand exist: there is no option for a
// key, an account or a node, so no secret can come from argv. No error message repeats a value.

import { FELT_PRIME, UsageError } from './env.mjs';

const FELT_RE = /^(0x[0-9a-fA-F]{1,64}|[0-9]{1,78})$/;
const ENTRYPOINT_RE = /^[A-Za-z_][A-Za-z0-9_]{0,250}$/;
const FLAG_RE = /^--[a-z][a-z-]{0,39}$/;

// A calldata word that stands for the account's own address (STARKNET_ACCOUNT_ADDRESS), so a caller
// never has to put that value in argv or in a calls file.
export const ACCOUNT_TOKEN = '@account';

const kinds = {
  felt: (value, flag) => {
    // The pattern bounds the digits; the value must also be below the field prime.
    if (!FELT_RE.test(value) || BigInt(value) >= FELT_PRIME) {
      throw new UsageError(`${flag} expects a felt (0x-hex or decimal, below the field prime)`);
    }
    return value;
  },
  entrypoint: (value, flag) => {
    if (!ENTRYPOINT_RE.test(value)) throw new UsageError(`${flag} expects an entry point name`);
    return value;
  },
  path: (value, flag) => {
    if (value === '' || value.includes('://')) throw new UsageError(`${flag} expects a file path`);
    return value;
  },
};

// Per subcommand: flag -> [field, kind, required]. `--calldata` takes every following felt.
export const COMMANDS = Object.freeze({
  declare: { '--sierra': ['sierra', 'path', true], '--casm': ['casm', 'path', true] },
  deploy: {
    '--class-hash': ['classHash', 'felt', true],
    '--salt': ['salt', 'felt', false],
    '--calldata': ['calldata', 'felt', false],
  },
  invoke: {
    '--contract': ['contract', 'felt', true],
    '--function': ['entrypoint', 'entrypoint', true],
    '--calldata': ['calldata', 'felt', false],
  },
  multicall: { '--calls': ['calls', 'path', true] },
  call: {
    '--contract': ['contract', 'felt', true],
    '--function': ['entrypoint', 'entrypoint', true],
    '--calldata': ['calldata', 'felt', false],
  },
});

export const USAGE = `usage: signer.mjs <command> [options]
  declare   --sierra <file> --casm <file>
  deploy    --class-hash <felt> [--salt <felt>] [--calldata <felt>...]
  invoke    --contract <felt> --function <name> [--calldata <felt>...]
  multicall --calls <file>   (a JSON array of {"contract", "function", "calldata"})
  call      --contract <felt> --function <name> [--calldata <felt>...]
A calldata word may be @account: the account's address, read from the environment.
The account, the node and the network come from STARKNET_ACCOUNT_ADDRESS, STARKNET_PRIVATE_KEY,
STARKNET_RPC_URL and SIGNER_NETWORK (sepolia or devnet; mainnet is refused).`;

function describe(token) {
  return FLAG_RE.test(token) ? `'${token}'` : 'an argument';
}

/**
 * @param {string[]} argv the arguments after the script path
 * @returns {{ command: string, options: Record<string, string | string[]> }}
 */
export function parseArgs(argv) {
  const [command, ...rest] = argv;
  if (!command || !Object.hasOwn(COMMANDS, command)) {
    const known = 'declare, deploy, invoke, multicall, call';
    throw new UsageError(command && /^[a-z]{1,20}$/.test(command)
      ? `unknown command '${command}' (${known})`
      : `a command is required (${known})`);
  }
  const spec = COMMANDS[command];
  const options = {};
  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i];
    if (!Object.hasOwn(spec, token)) {
      throw new UsageError(`${describe(token)} at position ${i + 2} is not an option of '${command}'; secrets come from the environment only`);
    }
    const [field, kind] = spec[token];
    if (Object.hasOwn(options, field)) throw new UsageError(`${token} is given twice`);
    if (field === 'calldata') {
      const values = [];
      while (i + 1 < rest.length && !rest[i + 1].startsWith('--')) {
        i += 1;
        values.push(rest[i] === ACCOUNT_TOKEN ? ACCOUNT_TOKEN : kinds.felt(rest[i], token));
      }
      options.calldata = values;
      continue;
    }
    if (i + 1 >= rest.length || rest[i + 1].startsWith('--')) throw new UsageError(`${token} needs a value`);
    i += 1;
    options[field] = kinds[kind](rest[i], token);
  }
  for (const [flag, [field, , required]] of Object.entries(spec)) {
    if (required && !Object.hasOwn(options, field)) throw new UsageError(`${command} needs ${flag}`);
  }
  if (Object.hasOwn(spec, '--calldata') && !options.calldata) options.calldata = [];
  return { command, options };
}

/**
 * Refuses argv that carries a secret value, even inside an allowed option (a key pasted as
 * calldata, a URL as a path). `sanitize` is the sanitiser built from the environment's secrets.
 * @param {string[]} argv
 * @param {(text: string) => string} sanitize
 */
export function assertNoSecretInArgv(argv, sanitize) {
  argv.forEach((token, index) => {
    if (token.includes('://') || sanitize(token) !== token) {
      throw new UsageError(`argument at position ${index + 1} carries a secret or a URL; secrets come from the environment only`);
    }
  });
}

/**
 * Replaces each `@account` of a calldata list by the account's address.
 * @param {string[]} calldata
 * @param {string} address
 */
export function resolveAccount(calldata, address) {
  return calldata.map((value) => (value === ACCOUNT_TOKEN ? address : value));
}

/**
 * Validates a multicall file's parsed JSON: [{ contract, function, calldata? }, ...].
 * @param {unknown} calls
 */
export function parseCalls(calls) {
  if (!Array.isArray(calls) || calls.length === 0) throw new UsageError('--calls expects a non-empty JSON array');
  return calls.map((call, index) => {
    const where = `--calls entry ${index}`;
    if (typeof call !== 'object' || call === null) throw new UsageError(`${where} is not an object`);
    const calldata = call.calldata ?? [];
    if (!Array.isArray(calldata)) throw new UsageError(`${where}: calldata is not an array`);
    return {
      contractAddress: kinds.felt(String(call.contract ?? ''), `${where}: contract`),
      entrypoint: kinds.entrypoint(String(call.function ?? ''), `${where}: function`),
      calldata: calldata.map((value) => (value === ACCOUNT_TOKEN ? ACCOUNT_TOKEN : kinds.felt(String(value), `${where}: calldata`))),
    };
  });
}
