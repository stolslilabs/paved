# Paved contracts

Native Starknet contracts of Paved (Cairo, no framework since phase P2).

- `Account`: player registry.
- `Daily`: Daily games, tournaments, entry fee and prizes (ERC20).
- `Tutorial`: Tutorial games.

Design, storage layout, events and access rules: `docs/architecture/native-storage.md`.

## Toolchain

Pinned in `.tool-versions`: scarb 2.20.1, starknet-foundry (snforge) 0.64.0.

```sh
scarb fmt --check
scarb build
snforge test            # whole suite (CI); locally, filter: snforge test golden, snforge test test_gas_
```

Runs are single-threaded (`RAYON_NUM_THREADS=1`); measure peak memory first
(`prlimit --as=8589934592 -- /usr/bin/time -v snforge test <filter>`). Gas and coverage measures:
`scripts/measure.sh`.

## Layout

- `src/types`, `src/elements`, `src/helpers`: game rules (pure logic).
- `src/models`: game state as plain structs, with their rules.
- `src/store.cairo`: storage of the game state (`Map`s, packed values).
- `src/components`, `src/systems`: entry points.
- `src/tests`: e2e tests and golden games; `tests/`: gas measures (integration crate).
