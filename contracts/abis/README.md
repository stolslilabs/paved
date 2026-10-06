# Contract ABIs

`Account.json`, `Daily.json`, `Tutorial.json` and `Token.json` are the ABIs (the `abi` array
only) of the native Starknet contracts, taken from `target/dev/paved_<Contract>.contract_class.json`
and pretty-printed. The client imports them from here.

Regenerate them after any change of the contract interface (functions, events, types):

```sh
scripts/abis.sh
```

The script builds `contracts/` with the toolchain of `.tool-versions` (scarb on the `PATH`) and
rewrites the four files. CI runs it and fails on `git diff --exit-code contracts/abis` when the
committed files are stale.

A diff in this folder is an ABI change for the client: review it as such.
