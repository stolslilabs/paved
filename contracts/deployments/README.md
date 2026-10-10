# Deployments

`<network>.json` records one deployment of the native contracts for the client. Only `devnet.json`
exists; a public network is the owner's decision and `scripts/deploy.sh` refuses it.

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
  }
}
```

| Field | Meaning |
|---|---|
| `network` | `devnet` |
| `chain_id` | Felt of the chain id, hex (`0x534e5f5345504f4c4941` is `SN_SEPOLIA`, the starknet-devnet default) |
| `rpc_url` | Node the script ran against |
| `deployed_at` | `git merge-base HEAD origin/main`, the main commit whose contract sources were deployed, when `git diff --quiet <that> -- contracts/src contracts/Scarb.toml contracts/Scarb.lock` holds (the working tree, which is what the build compiles) and `contracts/src` has no untracked file. Otherwise the script refuses (deploy from main-equivalent sources) |
| `deployed_block` | Block number of the first deploy transaction (`MockUSDC`). Start indexing events here; the declares are in earlier blocks |
| `token` | The ERC20 `Daily` charges: USDC (`MockUSDC` on devnet, repeated under `contracts`). `decimals` is read from the deployed token by call (6); `symbol` is `USDC` |
| `contracts.<Name>` | Address and class hash. `Economy`, `PavedToken` and `Vault` are the economy (P8, `docs/architecture/economy.md`). `Collection` (P8 E5b) is the soulbound ERC721 of the games: every spawn mints the game to its player; the indexer reads its mints. On devnet, `MockUSDC` and `MockRouter` stand in for USDC and the Ekubo router; off devnet the real USDC goes under `USDC` and no mock is deployed (the script refuses `MockUSDC`, `MockRouter` and `Token` by name there). `Token` is the old mock ERC20 (test and devnet only), no longer charged by `Daily`, kept while the client still reads it |
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
