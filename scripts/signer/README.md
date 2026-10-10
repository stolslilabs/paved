# Signer (S-1b, P-40)

A starknet.js signer for the Sepolia deployment. It declares, deploys, invokes and calls with one
account whose address, private key and node come **from the environment only**, so the key and the
RPC URL (which often holds a provider API key) never reach argv, a file or a log. It signs for
Sepolia or a local devnet only, checked against the node's chain id; **mainnet is always refused**.

Why not sncast: sncast 0.64.0 cannot sign from an environment variable (it needs an accounts file, a
keystore or a Ledger), and `sncast --url` puts the RPC URL in the process list.

Part 1 (this folder) is the signer and its tests. `scripts/deploy.sh` does not call it yet; it is
wired in part 2, with the allowlist of deployed addresses.

## Install

Node 24 and npm. starknet.js is pinned to **10.8.0**, the version the repository's `bun.lock` already
resolves for `@paved/indexer`; `package-lock.json` pins it with the same integrity hash. Not 8.9.2
(the version `@paved/chain` resolves): 8.x refuses RPC spec 0.10, which starknet-devnet 0.10.0
serves (0.10.2) and sncast 0.64.0 uses.

```bash
cd scripts/signer
npm ci
```

Inside the worktree only: `node_modules/` stays in `scripts/signer/` (ignored by git). Never
`npm install -g`. Without the lockfile, `npm install --no-save starknet@10.8.0` in this folder is the
fallback.

## Variables

| Name | Holds |
| --- | --- |
| `STARKNET_ACCOUNT_ADDRESS` | the account contract address, 0x-hex |
| `STARKNET_PRIVATE_KEY` | its private key, 0x-hex (secret) |
| `STARKNET_RPC_URL` | the node's JSON-RPC URL, RPC spec 0.10 (secret: may hold an API key) |
| `SIGNER_NETWORK` | `sepolia` or `devnet` (not secret) |

All four are required by every subcommand. A missing, empty or malformed one stops the signer
(exit 2) with the variable's **name**, never its value:

```
signer: missing environment variable: SIGNER_NETWORK
```

## Network check

| `SIGNER_NETWORK` | Chain id the node must report | `STARKNET_RPC_URL` must be |
| --- | --- | --- |
| `sepolia` | `SN_SEPOLIA` = `0x534e5f5345504f4c4941` | https, not a local host |
| `devnet` | `0x534e5f5345504f4c4941` (starknet-devnet 0.10.0's default, `--chain-id TESTNET`) | http on 127.0.0.1, localhost or [::1] |

Devnet and Sepolia report the same chain id, so the URL rule keeps one from standing for the other.
Before anything is signed (and before any read), the signer asks the node for `starknet_chainId` and
refuses (exit 2, "nothing was signed") a chain id other than the network's. **`SN_MAIN`
(`0x534e5f4d41494e`) is always refused**, whatever the variable says, and `mainnet` is not a value
`SIGNER_NETWORK` accepts: mainnet is the owner's act. The provider is then built with the expected
chain id fixed (`RpcProvider({ chainId })`), and the account signs with the provider's chain id, so
starknet.js never takes it from the node unchecked.

## Subcommands

Each prints exactly **one JSON line** on stdout and exits 0, or prints `signer: <message>` on stderr
and exits 1 (a failed transaction or node) or 2 (usage, environment, network). Transactions are
waited for; a reverted one is a failure. Before signing, each target is printed on stderr, one line
per call: `signer: declare <sierra file>`, `signer: deploy class <hash> through the universal
deployer`, `signer: invoke <contract> <entry point>`.

| Command | Options | stdout |
| --- | --- | --- |
| `declare` | `--sierra <file> --casm <file>` | `{"class_hash","transaction_hash","already_declared"}` (`transaction_hash` is `null` when the class was already declared) |
| `deploy` | `--class-hash <felt> [--salt <felt>] [--calldata <felt>...]` | `{"contract_address","transaction_hash","class_hash","salt"}` |
| `invoke` | `--contract <felt> --function <name> [--calldata <felt>...]` | `{"transaction_hash"}` |
| `multicall` | `--calls <file>` | `{"transaction_hash"}` |
| `call` | `--contract <felt> --function <name> [--calldata <felt>...]` | `{"result":[felt...]}` |

- `deploy` goes through the Universal Deployer with `unique: true` (the address depends on the
  deployer account) and a random salt unless `--salt` is given; the salt used is printed.
- Calldata is raw felts (0x-hex or decimal), already serialised: a `u256` is two felts, low then high.
- The `--calls` file is a JSON array of `{"contract": <felt>, "function": <name>, "calldata": [<felt>...]}`,
  sent as one transaction.

```bash
SIGNER_NETWORK=devnet node scripts/signer/signer.mjs declare \
  --sierra contracts/target/dev/paved_MockUSDC.contract_class.json \
  --casm contracts/target/dev/paved_MockUSDC.compiled_contract_class.json
```

## Secrets

What holds:

- **No secret from argv.** Each subcommand accepts only the options above; there is no option for a
  key, an account or a node. An unknown option is refused without echoing what followed it, and any
  argument that holds the key (in any spelling below), a part of the RPC URL, or any URL is refused
  too, by position only.
- **The signer writes no file.**
- **Every write to stdout and stderr is sanitised**: `process.stdout.write` and
  `process.stderr.write` themselves are wrapped, so console calls, libraries and direct writes all go
  through `lib/sanitize.mjs`. `console.*` goes to stderr, so stdout keeps its one JSON line.
  starknet.js's own logger is off. Errors print their messages and causes, never a stack.
- The sanitiser strips:
  - the key as 0x-hex or bare hex, padded or not, in any case, as decimal, as base64 and base64url
    (32 bytes wide or minimal, padded or not, raw or percent-encoded), and each of its u128 halves
    (hex or decimal) when that half is at least 2^64;
  - the RPC URL and each of its parts of 8 characters or more (host, user, password, path segments,
    query names and values), as given or percent-encoded, in any case;
  - every URL, whatever its host.
- **It refuses to run** (exit 2, naming the variable, never its value) when `NODE_DEBUG` is set (its
  debug logs of fetch, undici, http or net print the request path, which holds a provider API key), or
  when `NODE_OPTIONS` or node's own options hold `--report-*` or `--inspect*`.

What does not hold (not covered):

- A secret split across two writes (a library writing the key in pieces) is not matched.
- Other encodings: the key or URL as hex of its text bytes, base64 of the key's text (as opposed to
  its bytes), a u128 half below 2^64 (it would also hide common small values), RPC URL parts shorter
  than 8 characters.
- Anything outside this process: a shell history, `ps` of the parent, a core dump, a debugger
  attached from outside, the provider's own logs.

On Sepolia, run it from a shell where the variables are already exported by the caller, never
`STARKNET_PRIVATE_KEY=... node ...` typed on the command line, which would put the key in the shell
history.

## Tests

```bash
cd scripts/signer && npm ci && npm test
```

`node --test`, no other runner, 33 tests:
- the sanitiser's spellings;
- the variables: refusal of a missing or empty one (`SIGNER_NETWORK` included), mainnet refused as a
  value, the URL bound to the network;
- the chain check: `SN_MAIN` and any other chain id refused, unit and through the script against a
  preloaded fake node that reports any signing step it is asked (none happens);
- the runtime refusal of `NODE_DEBUG`, `--report-*` and `--inspect`;
- argv parsing, unit and through the real script;
- a preloaded fake `fetch` that logs the key and the URL through console and both streams, then
  throws them (neither is printed);
- an unreachable node;
- a rehearsal against a local starknet-devnet 0.10.0 (free port, seed 42, `PATH` as its only
  variable, stopped by its PID). It declares MockUSDC, deploys it, mints, multicalls and reads
  `balance_of` through the signer, with a predeployed devnet account (public test keys).
- a devnet started as mainnet (`--chain-id MAINNET`): declare and invoke are refused, and the
  account's nonce and the block number are unchanged.

The rehearsal needs `contracts/target/dev/paved_MockUSDC.*` (`scarb build` in `contracts/`) and the
devnet binary (`~/.asdf/installs/starknet-devnet/0.10.0/bin/starknet-devnet`); it is skipped when
either is missing. Overrides: `DEVNET_BIN`, `SIGNER_SIERRA`, `SIGNER_CASM`.

Memory: see the pull request for the measured peak; heap cap `NODE_OPTIONS=--max-old-space-size=448`.
