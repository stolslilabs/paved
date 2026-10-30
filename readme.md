## Programme documents

Paved is being taken up again. The context, plan, decisions, risks and operating rules are in
[`docs/programme/`](docs/programme/). The client is in `packages/`; the deprecated `app/` was removed in #591
(see git history).

### Terminal 1 - Client setup

This will set the client up, however you **must** run the other scripts otherwise it will not work

```
cd app && pnpm dev
```

### Terminal 2 - Build the contracts and run the sequencer

```
sh scripts/contracts.sh
```

### Terminal 3 - Local stack

The Dojo and Torii scripts (`scripts/indexer.sh`, `scripts/dev-stack.sh`) were removed with the Dojo
contracts (P2). The client (`packages/app`) reads `contracts/deployments/<network>.json`
(`VITE_NETWORK`, default `devnet`), written by CORE's deploy script; each `VITE_*` variable set
overrides it: `VITE_RPC_URL`, `VITE_DEPLOYED_BLOCK`, `VITE_CHALLENGE_ADDRESS`, `VITE_SETUP_ADDRESS`
(`VITE_TOKEN_ADDRESS` is gone: the entry token is the Faucet, read from `Challenge.entry_price`, and the faucet is `contracts.Faucet` of the file, with no env override; no `Account` since D-25 E: a player is the wallet address, with no registration, and the
name is the address). The playing account is the device's own (#918, `docs/architecture/accounts.md`): a key made at the
first Connect and kept in `localStorage`, whose account is deployed on its first write; on devnet by the deployer
`VITE_DEPLOYER_ADDRESS` and `VITE_DEPLOYER_PRIVATE_KEY` (the node's first predeployed account), elsewhere by itself.
Without a full deployment the client shows "not connected". The indexer is `VITE_INDEXER_URL`. Design: `docs/architecture/client-data-layer.md`.
