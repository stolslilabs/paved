# Signer (S-1b, P-40)

A starknet.js signer for the Sepolia deployment. It declares, deploys, invokes and calls with one
account whose address, private key and node come **from the environment only**, so the key and the
RPC URL (which often holds a provider API key) never reach argv, a file or a log.

Why not sncast: sncast 0.64.0 cannot sign from an environment variable (it needs an accounts file, a
keystore or a Ledger), and `sncast --url` puts the RPC URL in the process list.

Part 1 (this folder) is the signer and its tests. `scripts/deploy.sh` does not call it yet; it is
wired in part 2.

## Install

Node 24 and npm. starknet.js is pinned to **10.8.0**, the version the repository's `bun.lock` already
resolves (for `@paved/indexer`); `package-lock.json` pins it with the same integrity hash.

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
| `STARKNET_RPC_URL` | the node's JSON-RPC URL, http(s), RPC spec 0.10 (secret: may hold an API key) |

All three are required by every subcommand. A missing, empty or malformed one stops the signer
(exit 2) with the variable's **name**, never its value:

```
signer: missing environment variable: STARKNET_RPC_URL
```

## Subcommands

Each prints exactly **one JSON line** on stdout and exits 0, or prints `signer: <message>` on stderr
and exits 1 (a failed transaction or node) or 2 (usage). Transactions are waited for; a reverted one
is a failure.

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
node scripts/signer/signer.mjs declare --sierra contracts/target/dev/paved_MockUSDC.contract_class.json \
  --casm contracts/target/dev/paved_MockUSDC.compiled_contract_class.json
node scripts/signer/signer.mjs invoke --contract 0x... --function mint --calldata 0x... 1000000 0
```

## Secrets

- **No secret from argv, ever.** Each subcommand accepts only the options above; there is no option for
  a key, an account or a node. An unknown option is refused without echoing what followed it, and any
  argument that holds the key (in any hex or decimal spelling), a part of the RPC URL, or any URL is
  refused too, by position only.
- **Never prints, logs or writes the key or the RPC URL.** The signer writes no file. Everything that
  reaches stdout or stderr goes through a sanitiser (`lib/sanitize.mjs`) that strips the key in any
  spelling (with or without `0x`, padded or not, upper or lower case, decimal), the RPC URL and each of
  its longer parts (host, path segments, query values: a bare API key in a provider's message), and
  every URL whatever its host. Errors print their messages and causes, sanitised, never a stack.
  `console.*` is redirected through the same sanitiser to stderr, and starknet.js's own logger is off.
- On Sepolia, run it from a shell where the variables are already set (exported by the caller), never
  `STARKNET_PRIVATE_KEY=... node ...` typed on the command line, which would put the key in the shell
  history.

## Tests

```bash
cd scripts/signer && npm ci && npm test
```

`node --test`, no other runner: the sanitiser, the missing-variable refusal, the argv checks (unit and
through the real script), a preloaded fake `fetch` that logs and throws the key and the URL (neither is
printed), an unreachable node, and a rehearsal against a local starknet-devnet 0.10.0 (free port,
seed 42, stopped by its PID) that declares MockUSDC, deploys it, mints, multicalls and reads
`balance_of` through the signer with a predeployed devnet account (public test keys).

The rehearsal needs `contracts/target/dev/paved_MockUSDC.*` (`scarb build` in `contracts/`) and the
devnet binary (`~/.asdf/installs/starknet-devnet/0.10.0/bin/starknet-devnet`); it is skipped when
either is missing. Overrides: `DEVNET_BIN`, `SIGNER_SIERRA`, `SIGNER_CASM`.

Memory: peak RSS 274,595,840 bytes (Mac, `/usr/bin/time -l`, whole `node --test` run with devnet);
heap cap `NODE_OPTIONS=--max-old-space-size=448` (1.5x, rounded up to 64 MB).
