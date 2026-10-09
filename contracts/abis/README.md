# Contract ABIs

`Account.json`, `Daily.json`, `Tutorial.json`, `Lobby.json`, `Token.json`, `PavedToken.json`, `Vault.json`,
`Economy.json` and `Collection.json` are the ABIs (the `abi` array only) of the native Starknet contracts, taken from `target/dev/paved_<Contract>.contract_class.json`
and pretty-printed. The client imports them from here. `Lobby.json` is for reference only: `Lobby` is declared,
never deployed, and runs inside `Daily` and `Tutorial` by library call, so a client never calls it.

Regenerate them after any change of the contract interface (functions, events, types):

```sh
scripts/abis.sh
```

The script builds `contracts/` with the toolchain of `.tool-versions` (scarb on the `PATH`) and
rewrites the nine files. CI runs it and fails on `git diff --exit-code contracts/abis` when the
committed files are stale.

A diff in this folder is an ABI change for the client: review it as such.
