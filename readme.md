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
contracts (P2). A native local stack (deploy to a devnet, contract addresses for the client in
`VITE_ACCOUNT_ADDRESS`, `VITE_DAILY_ADDRESS`, `VITE_TUTORIAL_ADDRESS` and `VITE_TOKEN_ADDRESS`) comes with the
data-layer step; until then the client builds but cannot reach a chain.
