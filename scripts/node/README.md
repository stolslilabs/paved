# Local node for Paved tests and MVP

Measured choice: **starknet-devnet 0.10.0** (see `docs/measures/node-choice.md`).
Katana (1.7.1 and 1.8.0-rc.9) refuses Sierra 1.9.3, which Scarb 2.20.1 produces.

`sample/` is a native Starknet contract (no Dojo): one storage write, one read view, one event.

## Reproduce the winner's run

Prerequisites (versions as measured): Scarb 2.20.1, sncast 0.64.0, starknet-devnet 0.10.0, `curl`, `python3`.
On this machine they live under `~/.asdf/installs/`; the script uses these paths by default.

```bash
scripts/node/run-sample.sh devnet
```

The script starts devnet on `127.0.0.1:5051` (seed 42), builds, declares, deploys, invokes
`set_value(42)`, calls `get_value`, prints the receipt, and stops the node by PID on exit.
Dev-account keys come from the node at run time and are never written to a file.

Overrides: `DEVNET_BIN`, `KATANA_BIN`, `SCARB_BIN_DIR`, `SNCAST_BIN_DIR`, `PORT`.

## Reproduce the Katana refusal

```bash
PORT=5050 scripts/node/run-sample.sh katana
```

Declare fails and the script prints the node log tail with `UnsupportedSierraVersion`.
With Scarb 2.13.1 (`starknet = "2.13.1"` in `sample/Scarb.toml`, Sierra 1.7.0) Katana 1.8.0-rc.9 works.

## Manual commands

```bash
starknet-devnet --host 127.0.0.1 --port 5051 --seed 42 &   # note the PID, kill it when done
cd scripts/node/sample && scarb build
sncast --accounts-file "$ACCOUNTS" account import --url http://127.0.0.1:5051 --name dev \
  --address "$ADDR" --private-key "$KEY" --type oz --silent
sncast --accounts-file "$ACCOUNTS" --account dev declare --url http://127.0.0.1:5051 --contract-name Sample
sncast --accounts-file "$ACCOUNTS" --account dev deploy --url http://127.0.0.1:5051 --class-hash "$CLASS" --salt 1
sncast --accounts-file "$ACCOUNTS" --account dev invoke --url http://127.0.0.1:5051 \
  --contract-address "$C" --function set_value --calldata 42
sncast call --url http://127.0.0.1:5051 --contract-address "$C" --function get_value
```
