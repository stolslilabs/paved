# Contract ABIs

`Challenge.json`, `Setup.json`, `Token.json`, `Faucet.json`, `MockRouter.json`, `PavedToken.json`, `Vault.json`,
`Economy.json` and `Collection.json` are the ABIs (the `abi` array only) of the native Starknet contracts,
taken from `target/dev/paved_<Contract>.contract_class.json` and pretty-printed. The client imports them from here.
`Setup.json` is the quests and achievements system (D-24): the definitions, the reporter allowlist, the report `Challenge`
makes at each game over, the tutorial claim, and every quiver event (`docs/architecture/public-interface.md`,
"Breaking change D-24"); since D-25 E it also holds the wiring (`set_economy`, `set_collection`, `wiring`, with
`EconomySet` and `CollectionSet`). `Account.json` went with D-25 E (a player is the wallet address, `Account` left the systems;
"Breaking change D-25 (E)"): its history is in git (`git show aff59e06:contracts/abis/Account.json`). `Tutorial.json` and `Lobby.json` went with D-21 and D-24 (the tutorial is off chain, the
`Lobby` class ended): their history is in git (`git show 38f1c959:contracts/abis/Tutorial.json`). `Faucet.json` is the
ABI of the USDC that `Challenge` charges on devnet (`token` and `contracts.MockUSDC` in `deployments/devnet.json`);
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
