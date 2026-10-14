## Programme documents

Paved is being taken up again. The context, plan, decisions, risks and operating rules are in
[`docs/programme/`](docs/programme/). The 2026 client is in `packages/`; `app/` is deprecated and kept
for reference only.

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
contracts (P2). The client (`packages/app-web`) reads `contracts/deployments/<network>.json`
(`VITE_NETWORK`, default `devnet`), written by CORE's deploy script; each `VITE_*` variable set
overrides it: `VITE_RPC_URL`, `VITE_DEPLOYED_BLOCK`, `VITE_DAILY_ADDRESS`, `VITE_SETUP_ADDRESS`
(`VITE_TOKEN_ADDRESS` is gone: the entry token is the Faucet, read from `Challenge.entry_price`, and the faucet is `contracts.Faucet` of the file, with no env override; no `Account` since D-25 E: a player is the wallet address, with no registration, and the
name comes from the Controller). The playing account is `VITE_PLAYER_ADDRESS` and
`VITE_PLAYER_PRIVATE_KEY` (a devnet predeployed account); without it the client is read-only, and
without a full deployment it shows "not connected". Design: `docs/architecture/client-data-layer.md`.
