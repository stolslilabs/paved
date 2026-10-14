# Contract ABIs

`Daily.json`, `Setup.json`, `Token.json`, `Faucet.json`, `MockRouter.json`, `PavedToken.json`, `Vault.json`,
`Economy.json` and `Collection.json` are the ABIs (the `abi` array only) of the native Starknet contracts,
taken from `target/dev/paved_<Contract>.contract_class.json` and pretty-printed. The client imports them from here.
`Setup.json` is the quests and achievements system (D-24): the definitions, the reporter allowlist, the report `Daily`
makes at each game over, the tutorial claim, and every quiver event (`docs/architecture/public-interface.md`,
"Breaking change D-24"); since D-25 E it also holds the wiring (`set_economy`, `set_collection`, `wiring`, with
`EconomySet` and `CollectionSet`). `Account.json` is **frozen** since D-25 E: `Account` left the systems (a player is the wallet
address; "Breaking change D-25 (E)"), so `scripts/abis.sh` no longer writes it, and the file is the ABI of aff59e06
(the `Account` deployed on Sepolia today). It stays only because `packages/chain/src/abis.ts` still imports it; it goes
when CLIENT drops that import (nothing deployed by a fresh run has this ABI). `Tutorial.json` and `Lobby.json` went with D-21 and D-24 (the tutorial is off chain, the
`Lobby` class ended): their history is in git (`git show 38f1c959:contracts/abis/Tutorial.json`). `Faucet.json` is the
ABI of the USDC that `Daily` charges on devnet (`token` and `contracts.MockUSDC` in `deployments/devnet.json`);
`Token.json` is the old mock ERC20, not USDC. `MockRouter.json` is the Ekubo router stand-in, devnet only.
`Collection.json` is the soulbound game NFT.

Regenerate them after any change of the contract interface (functions, events, types):

```sh
scripts/abis.sh
```

The script builds `contracts/` with the toolchain of `.tool-versions` (scarb on the `PATH`) and
rewrites the nine files. CI runs it and fails on `git diff --exit-code contracts/abis` when the
committed files are stale.

A diff in this folder is an ABI change for the client: review it as such.
