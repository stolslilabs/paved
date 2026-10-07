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
  "token": { "address": "0x..", "class_hash": "0x..", "decimals": 18, "symbol": "LORDS" },
  "contracts": {
    "Account":  { "address": "0x..", "class_hash": "0x.." },
    "Daily":    { "address": "0x..", "class_hash": "0x.." },
    "Tutorial": { "address": "0x..", "class_hash": "0x.." },
    "Token":    { "address": "0x..", "class_hash": "0x.." }
  }
}
```

| Field | Meaning |
|---|---|
| `network` | `devnet` |
| `chain_id` | Felt of the chain id, hex (`0x534e5f5345504f4c4941` is `SN_SEPOLIA`, the starknet-devnet default) |
| `rpc_url` | Node the script ran against |
| `deployed_at` | `git merge-base HEAD origin/main`, the main commit whose contract sources were deployed, when `git diff --quiet <that> -- contracts/src contracts/Scarb.toml contracts/Scarb.lock` holds (the working tree, which is what the build compiles) and `contracts/src` has no untracked file. Otherwise the script refuses (deploy from main-equivalent sources) |
| `deployed_block` | Block number of the first deploy transaction (`Token`). Start indexing events here; the declares are in earlier blocks |
| `token` | The ERC20 `Daily` charges. `decimals` and `symbol` are read from the deployed token by call (`symbol` decoded from its short string) |
| `contracts.<Name>` | Address and class hash. `Token` is the mock ERC20 (test and devnet only); it is repeated under `token` |

Hex strings are `0x`-prefixed and 64 digits for addresses and class hashes, as printed by sncast. ABIs are in
`contracts/abis/<Contract>.json`.

## Regenerate

```bash
starknet-devnet --host 127.0.0.1 --port 5050 --seed 42   # fresh node; note its PID, kill it when done
scripts/deploy.sh devnet
```

`RPC_URL` overrides the node (localhost only). Needs Scarb 2.20.1 and sncast 0.64.0 (the paths under
`~/.asdf/installs` by default; `SCARB_BIN_DIR`, `SNCAST_BIN_DIR` override). The script builds (release profile, the one
sncast declares), declares the four classes, deploys `Token`, `Account`, `Daily(owner, account, token)` and
`Tutorial(owner, account)` with salt 1, writes the file, then runs a smoke check (mint, `Account.create`, `Daily.entry_price()` read and
printed, `Tutorial.spawn`, one `Tutorial.build` (the Tutorial refuses a discard while the tile has a legal placement), `Tutorial.game(id)` read back) and exits non-zero on any failure. The smoke plays the
Tutorial, never a Daily game: even an ended Daily game leaves its entry price in the day's prize, and the smoke must leave no
trace in the day's figures.

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
