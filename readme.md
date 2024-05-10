### Terminal 1 - Client setup

This will set the client up, however you **must** run the other scripts otherwise it will not work

```
cd app && pnpm dev
```

### Terminal 2 - Build the contracts and run the sequencer

```
sh scripts/contracts.sh
```

### Terminal 3 - Migrate the contracts and start the indexer

```
sh scripts/indexer.sh
```
