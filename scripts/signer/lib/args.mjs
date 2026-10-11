// Parses the signer's argv. Only the options listed per subcommand exist: there is no option for a
// key, an account or a node, so no secret can come from argv. No error message repeats a value.

import { FELT_PRIME, UsageError } from './env.mjs';

const FELT_RE = /^(0x[0-9a-fA-F]{1,64}|[0-9]{1,78})$/;
const ENTRYPOINT_RE = /^[A-Za-z_][A-Za-z0-9_]{0,250}$/;
const FLAG_RE = /^--[a-z][a-z-]{0,39}$/;
const NUMBER_RE = /^(0x[0-9a-fA-F]{1,32}|[0-9]{1,39})$/;

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
  // Six integers, comma separated: the max amount and the max price per unit of L1 gas, L1 data gas and
  // L2 gas, in that order. An amount is a u64, a price a u128 (the transaction's resource bounds).
  bounds: (value, flag) => {
    const words = value.split(',');
    const fits = (word, index) => NUMBER_RE.test(word) && BigInt(word) < 2n ** (index % 2 === 0 ? 64n : 128n);
    if (words.length !== 6 || !words.every(fits)) {
      throw new UsageError(`${flag} expects six integers: l1_amount,l1_price,l1_data_amount,l1_data_price,l2_amount,l2_price (amounts u64, prices u128)`);
    }
    const [l1, l1Price, l1Data, l1DataPrice, l2, l2Price] = words.map(BigInt);
    return {
      l1_gas: { max_amount: l1, max_price_per_unit: l1Price },
      l1_data_gas: { max_amount: l1Data, max_price_per_unit: l1DataPrice },
      l2_gas: { max_amount: l2, max_price_per_unit: l2Price },
    };
  },
  // A tip: a u64 (the transaction's tip field), or `node` (starknet.js's estimate from the latest blocks).
  tip: (value, flag) => {
    if (value === 'node') return value;
    if (!NUMBER_RE.test(value) || BigInt(value) >= 2n ** 64n) throw new UsageError(`${flag} expects a u64 (0x-hex or decimal) or 'node'`);
    return BigInt(value);
  },
  // The block tags of spec 0.9 and 0.10 for starknet_estimateFee (`pending` left the spec in 0.9).
  blockTag: (value, flag) => {
    if (!BLOCK_TAGS.includes(value)) throw new UsageError(`${flag} expects one of: ${BLOCK_TAGS.join(', ')}`);
    return value;
  },
};

export const BLOCK_TAGS = Object.freeze(['latest', 'pre_confirmed']);

// Per subcommand: flag -> [field, kind, required]. `--calldata` takes every following felt.
// `--tip` (every command that sends, and estimate): see FIXED_TIP in actions.mjs.
const TIP = { '--tip': ['tip', 'tip', false] };
export const COMMANDS = Object.freeze({
  declare: { '--sierra': ['sierra', 'path', true], '--casm': ['casm', 'path', true], ...TIP },
  deploy: {
    '--class-hash': ['classHash', 'felt', true],
    '--salt': ['salt', 'felt', false],
    '--calldata': ['calldata', 'felt', false],
    ...TIP,
  },
  invoke: {
    '--contract': ['contract', 'felt', true],
    '--function': ['entrypoint', 'entrypoint', true],
    '--calldata': ['calldata', 'felt', false],
    ...TIP,
  },
  multicall: { '--calls': ['calls', 'path', true], ...TIP },
  call: {
    '--contract': ['contract', 'felt', true],
    '--function': ['entrypoint', 'entrypoint', true],
    '--calldata': ['calldata', 'felt', false],
  },
});

// `estimate <declare|deploy|invoke> ...` takes that command's options, plus these. They are diagnostic
// only (S-1c): the default estimate is starknet.js's own request (zero resource bounds, SKIP_VALIDATE,
// block latest). `--validate` takes no value.
export const ESTIMATED = Object.freeze(['declare', 'deploy', 'invoke']);
export const ESTIMATE_OPTIONS = Object.freeze({
  '--bounds': ['bounds', 'bounds', false],
  '--validate': ['validate', 'flag', false],
  '--block-id': ['blockId', 'blockTag', false],
});

export const USAGE = `usage: signer.mjs <command> [options]
  declare   --sierra <file> --casm <file>
  deploy    --class-hash <felt> [--salt <felt>] [--calldata <felt>...]
  invoke    --contract <felt> --function <name> [--calldata <felt>...]
  multicall --calls <file>   (a JSON array of {"contract", "function", "calldata"})
  call      --contract <felt> --function <name> [--calldata <felt>...]
  estimate  <declare|deploy|invoke> <its options> [--bounds <6 integers>] [--validate] [--block-id <tag>]
            asks the node for a fee estimate only (starknet_estimateFee): nothing is sent. The three
            options are diagnostic: explicit resource bounds instead of zero, validation instead of
            SKIP_VALIDATE, a block tag (latest, pre_confirmed) instead of latest.
declare, deploy, invoke, multicall and estimate take --tip <u64|node>: the transaction's tip. Default on
sepolia, a fixed tip (0x5f5e100), with no block read; on devnet, node (starknet.js reads the latest blocks).
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
  const [command, ...tail] = argv;
  if (!command || (!Object.hasOwn(COMMANDS, command) && command !== 'estimate')) {
    const known = 'declare, deploy, invoke, multicall, call, estimate';
    throw new UsageError(command && /^[a-z]{1,20}$/.test(command)
      ? `unknown command '${command}' (${known})`
      : `a command is required (${known})`);
  }
  let spec = COMMANDS[command];
  let rest = tail;
  let name = command;
  const options = {};
  if (command === 'estimate') {
    const [kind, ...others] = tail;
    if (!ESTIMATED.includes(kind)) throw new UsageError(`estimate needs one of: ${ESTIMATED.join(', ')}`);
    spec = { ...COMMANDS[kind], ...ESTIMATE_OPTIONS };
    rest = others;
    name = `estimate ${kind}`;
    options.kind = kind;
  }
  const offset = argv.length - rest.length + 1;
  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i];
    if (!Object.hasOwn(spec, token)) {
      throw new UsageError(`${describe(token)} at position ${i + offset} is not an option of '${name}'; secrets come from the environment only`);
    }
    const [field, kind] = spec[token];
    if (Object.hasOwn(options, field)) throw new UsageError(`${token} is given twice`);
    if (kind === 'flag') {
      options[field] = true;
      continue;
    }
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
    if (required && !Object.hasOwn(options, field)) throw new UsageError(`${name} needs ${flag}`);
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
