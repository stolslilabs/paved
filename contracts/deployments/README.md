# Deployments

`<network>.json` records one deployment of the native contracts for the client. `devnet.json` exists;
`sepolia.json` (Starknet Sepolia, public playtests, D-16) is written by phase 2 of S-1 (see "Sepolia" below). Mainnet is
the owner's act and `scripts/deploy.sh` refuses it.

## Shape

```json
{
  "network": "devnet",
  "chain_id": "0x534e5f5345504f4c4941",
  "rpc_url": "http://127.0.0.1:5050",
  "deployed_at": "<git commit sha the contracts were built from>",
  "deployed_block": 5,
  "token": { "address": "0x..", "class_hash": "0x..", "decimals": 6, "symbol": "USDC" },
  "contracts": {
    "Account":    { "address": "0x..", "class_hash": "0x.." },
    "Daily":      { "address": "0x..", "class_hash": "0x.." },
    "Tutorial":   { "address": "0x..", "class_hash": "0x.." },
    "Token":      { "address": "0x..", "class_hash": "0x.." },
    "Economy":    { "address": "0x..", "class_hash": "0x.." },
    "PavedToken": { "address": "0x..", "class_hash": "0x.." },
    "Vault":      { "address": "0x..", "class_hash": "0x.." },
    "MockUSDC":   { "address": "0x..", "class_hash": "0x.." },
    "MockRouter": { "address": "0x..", "class_hash": "0x.." }
  },
  "classes": {
    "Lobby": "0x.."
  },
  "test_paved": { "0x<predeployed account>": "1000000000000000000000" }
}
```

| Field | Meaning |
|---|---|
| `network` | `devnet` or `sepolia` |
| `chain_id` | Felt of the chain id, hex (`0x534e5f5345504f4c4941` is `SN_SEPOLIA`, the starknet-devnet default) |
| `rpc_url` | Node the script ran against. On Sepolia, the variable name `$STARKNET_RPC_URL`: the deployer's endpoint may carry an API key, so the client sets its own public Sepolia RPC |
| `deployed_at` | `git merge-base HEAD origin/main`, the main commit whose contract sources were deployed, when `git diff --quiet <that> -- contracts/src contracts/Scarb.toml contracts/Scarb.lock` holds (the working tree, which is what the build compiles) and `contracts/src` has no untracked file. Otherwise the script refuses (deploy from main-equivalent sources) |
| `deployed_block` | Block number of the first deploy transaction (`MockUSDC`). Start indexing events here; the declares are in earlier blocks |
| `token` | The ERC20 `Daily` charges: USDC (`MockUSDC` on devnet, repeated under `contracts`). `decimals` is read from the deployed token by call (6); `symbol` is `USDC` |
| `contracts.<Name>` | Address and class hash. `Economy`, `PavedToken` and `Vault` are the economy (P8, `docs/architecture/economy.md`). `Collection` (P8 E5b) is the soulbound ERC721 of the games: every spawn mints the game to its player; the indexer reads its mints. On devnet and Sepolia (P-39), `MockUSDC` and `MockRouter` stand in for USDC and the Ekubo router; the script refuses both by name on mainnet. `Token` is the old mock ERC20 (devnet only, refused elsewhere by name, absent from `sepolia.json`), no longer charged by `Daily`, kept while the client still reads it |
| `test_paved` | Devnet only (P-38), absent from `sepolia.json`. The PAVED each predeployed account other than the deployer received at deploy, in base units (18 decimals): 1,000 PAVED (`1000000000000000000000`) each. It comes from the owner's stake, which is then 200,000 - 1,000 x N PAVED (N accounts; the pool keeps its 800,000 PAVED, which set the launch rate 7.6e31). Total supply stays 1,000,000 PAVED and the deployer holds 0. There is no minting faucet: `PavedToken`'s minter is `Economy` and its admin is cleared. The script refuses this step off devnet. Mainnet is unchanged: 800k to the pool and 200k staked, both owner acts |
| `classes.<Name>` | Class hash of a class that is declared and never deployed, so it has no address. `Lobby` runs `spawn`, `claim`, `sponsor`, `discard` and `surrender` of `Daily` and `Tutorial` by library call (`docs/architecture/native-storage.md`, "Classes"); the client never calls it and has no ABI for it |

Hex strings are `0x`-prefixed and 64 digits for addresses and class hashes, as printed by sncast. ABIs are in
`contracts/abis/<Contract>.json`.

## Regenerate

```bash
starknet-devnet --host 127.0.0.1 --port 5050 --seed 42   # fresh node; note its PID, kill it when done
scripts/deploy.sh devnet
```

`RPC_URL` overrides the node (localhost only). Needs Scarb 2.20.1 and sncast 0.64.0 (the paths under
`~/.asdf/installs` by default; `SCARB_BIN_DIR`, `SNCAST_BIN_DIR` override). The script builds (release profile, the one
sncast declares), declares the ten classes (`Lobby` last, never deployed), deploys and wires the economy and the game
with salt 1 (the order and every argument are in the header of `scripts/deploy.sh`; `docs/architecture/economy.md`, "As
built: E3"), writes the file, then runs a smoke check and exits non-zero on any failure:

- `Account.set_collection` and `Collection.set_minters(Daily, Tutorial)` checked by read back (E5b), then `owner_of` and the decoded `token_uri` of a finished Daily and a running Tutorial game;
- the test PAVED: each predeployed account other than the deployer holds exactly 1,000 PAVED, the owner's stake in the `Vault` is 200,000 - 1,000 x N, total supply is 1,000,000 PAVED and the deployer holds 0 (P-38);
- `Account.create`, `Daily.entry_price()` read (MockUSDC, 2 USDC per stake unit);
- a paid Daily game at stake 1 (`min_out` from `Economy.quote_swap`, less 1 %): exactly 2 USDC leave the player and
  `Economy` holds nothing after; the game is surrendered and `Economy` records it;
- the Tutorial: `spawn`, one `build` (the Tutorial refuses a discard while the tile has a legal placement),
  `game(id)` read back;
- devnet's time moved to `(D + 2) x 86400`, the paid game settled.

The smoke leaves no trace in the day's figures (P-24): the prize is sponsor-only, a game of score 0 ranks nowhere and
enters no mean, so the day closes with weight 0 and the EMA does not move; the script checks all of it.

`scripts/deploy.sh devnet --unmerged` runs the same on a pull request's sources (the source check is skipped) and
writes the file to a temporary path, never here. The committed file comes from main-equivalent sources only.

## Sepolia (S-1, D-16, P-39)

Starknet Sepolia hosts the public playtests that calibrate E4 (D-16: devnet for tests, Sepolia for playtests; mainnet
stays the owner's act). It runs the devnet economy path (P-39, PM, 2026-10-10: Ekubo's quoter answers 404 on
`SN_SEPOLIA`, and public sources say Ekubo dropped its testnets):

- **Contracts.** As on devnet, less the old mock `Token` and P-38's test PAVED: `MockUSDC`, `PavedToken`, `MockRouter`
  seeded with 800,000 PAVED and 10,000 MockUSDC (5 % fee, the launch rate 7.6e31), `Vault` with the owner's whole
  200,000 PAVED staked before `Economy.set_game`, `Economy`, `set_minter(Economy)` (then `minter() == Economy` and
  `admin() == 0` are checked), `Account`, `Daily`, `Tutorial`, `Collection`. The seed is unchanged (D-13). Deploys use
  `--unique` and a fresh random salt, so the addresses depend on the deployer and no rerun collides.
- **Test USDC: `MockUSDC`'s bounded faucet.** `mint(recipient, amount)` is open to anyone, for at most
  `MINT_CAP_PER_CALL` = 10,000 USDC per call and `MINT_CAP_PER_ADDRESS` = 20,000 USDC per recipient over its life
  (`minted(account)` reads what it received). The deployer funds the pool's 10,000 USDC with one call, and the smoke's
  2 USDC with another, within both caps (`contracts/src/mocks/usdc.cairo`, tests in
  `contracts/src/tests/economy/usdc.cairo`).
- **The quote path.** `Economy.quote_swap(usdc_in)` (forwarded to `MockRouter.quote`), as on devnet; the client
  sends `min_out` = that quote less its slippage (P-35).
- **The output.** `sepolia.json`, this file's shape (`network` `sepolia`, `rpc_url` `$STARKNET_RPC_URL`, no `Token`,
  no `test_paved`).
- **The smoke leaves test-sized traces, not none** (P-24 holds for the day's figures): the deployer's `Account` name
  `smoke`; one paid Daily game at stake 1 (2 test USDC from the faucet: 1.4 swapped into the pool and burned as
  PAVED, the margin to the `Vault`), surrendered with score 0, so no prize, no leader and no weight in the day's mean,
  and the EMA unchanged (checked); its settlement is left to the keeper from `(D + 2) x 86400`, since Sepolia's time
  cannot move; one Tutorial game; the two games' NFTs, owned by the deployer.

### Run (phase 2, from merged main on the VPS)

`scripts/deploy.sh sepolia` reads three variables, **by name only** (never printed, logged or written):

| Variable | What |
|---|---|
| `STARKNET_ACCOUNT_ADDRESS` | The funded deployer (and owner) account |
| `STARKNET_PRIVATE_KEY` | Its key |
| `STARKNET_RPC_URL` | A Sepolia RPC endpoint (`https://`; it may carry an API key) |

It refuses to start when one is missing, naming it. The procedure is in `docs/programme/OPERATIONS.md`, "Sepolia".

`scripts/deploy.sh sepolia --rehearse` runs the same flow on a fresh local `starknet-devnet` (started as in
"Regenerate"), with the node's first predeployed account, the working tree's sources, and the file written to a
temporary path. Its smoke also settles the paid game.

### Signing on Sepolia (open: S-1 escalation)

The key must not be written to a file, keystore or accounts file. What was checked, with `--help` and the
Starknet Foundry book only (no transaction sent), on 2026-10-10:

- **sncast 0.64.0 cannot sign from the environment alone.** Its signing commands (`declare`, `deploy`, `invoke`,
  `multicall`) take the account from `--accounts-file` with `--account` (a JSON file holding the plain key), from
  `--keystore` (an encrypted key file and a starkli account file), or from a Ledger. They have no `--private-key`
  flag and read no key variable. `sncast account import --private-key` writes the key into the accounts file
  (`--private-key-file` reads it from a file; the book warns that `--private-key` shows in the process list).
- **Other tools.** `starkli` is not installed on the VPS. `starknet.js` (`^8.1.2`, a dependency of
  `packages/chain` and `packages/app-web`) signs in memory: `new Account(provider, address, privateKey)` with the
  key from `process.env`.

So `scripts/deploy.sh sepolia` stops before building or sending anything (exit 3) until one option is chosen:

1. **sncast, with the accounts file through a pipe**: `--accounts-file <(printf ... "$STARKNET_PRIVATE_KEY")`. Bash's
   builtin `printf` puts the key in no process's arguments, and the JSON lives in a kernel pipe, never on a
   filesystem. It is still an accounts file in sncast's sense, and it is unverified that sncast 0.64.0 reads a
   pipe (it must read it once per command): one rehearsal with a devnet key settles that. Smallest change: one
   function of the script.
2. **starknet.js for the transactions**: a small script signs in memory with the key from `process.env`; scarb
   still builds and the script declares the compiled classes. New code, and a Node toolchain on the deploy path.
3. A Ledger (`sncast ledger`): no device on the VPS.
4. An encrypted keystore (`--keystore`) or an accounts file on disk, even a temporary one removed on exit: both
   write the key to a file, which the rule excludes.

Either way, `sncast --url` puts the RPC URL in sncast's arguments (visible to the VPS's other users in the process
list); sncast 0.64.0 reads it otherwise only from `snfoundry.toml`, a file. `deploy.sh`'s own `curl` calls take it
on stdin instead.

## Settlement keeper

A keeper settles each day `D` at `(D + 2) x 86400`, just after the last game of `D` has ended or expired
(`Economy.settle(game_ids)`, open to anyone; the indexer's `GET /v1/tournaments/<D>` lists the unsettled game ids).
A day's prior is the EMA at its first purchase, and day `D` enters the EMA only at its first settlement: settled on
time, day `D` is in the prior of day `D + 2` (economy.md, "Settlement and mint", E-2).

Deployer, owner and smoke player is the first predeployed account of the node, read from the node at run time (its keys are
public dev keys and are never written to a file).

## Stable addresses

With `--seed 42` the predeployed accounts are the same on every run. The class hashes depend only on the
source, and the addresses on the deployer, the class, the salt and the constructor arguments, so a seeded fresh
node gives the **same addresses and block number** on every run, for the same contract sources (measured: two
runs gave identical addresses). Without a seed the accounts, and so the addresses, change per run. A change of a
contract changes its class hash and its address, and the addresses of the contracts deployed after it: regenerate
and commit the file with it.

The node must be fresh. A second run on the same node fails at the first declare or deploy (same classes, same
addresses).
