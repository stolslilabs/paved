# Contract ABIs

`Account.json`, `Daily.json`, `Tutorial.json`, `Lobby.json`, `Token.json`, `MockUSDC.json`, `MockRouter.json`,
`PavedToken.json`, `Vault.json`, `Economy.json` and `Collection.json` are the ABIs (the `abi` array only) of the native
Starknet contracts, taken from `target/dev/paved_<Contract>.contract_class.json` and pretty-printed. The client imports
them from here. `Lobby.json` is for reference only: `Lobby` is declared, never deployed, and runs inside `Daily` and
`Tutorial` by library call, so a client never calls it. `MockUSDC.json` is the ABI of the USDC that `Daily` charges on
devnet (`token` and `contracts.MockUSDC` in `deployments/devnet.json`); `Token.json` is the old mock ERC20, not USDC.
`MockRouter.json` is the Ekubo router stand-in, devnet only. `Collection.json` is the soulbound game NFT; `deploy.sh`
does not deploy it yet, so `devnet.json` has no address for it.

Regenerate them after any change of the contract interface (functions, events, types):

```sh
scripts/abis.sh
```

The script builds `contracts/` with the toolchain of `.tool-versions` (scarb on the `PATH`) and
rewrites the eleven files. CI runs it and fails on `git diff --exit-code contracts/abis` when the
committed files are stale.

A diff in this folder is an ABI change for the client: review it as such.
