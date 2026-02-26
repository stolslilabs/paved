# Packages Economy Simulation Checklist

1. Select profile using `VITE_CHAIN_PROFILE` and set `VITE_RPC_URL`, `VITE_TORII_URL`, `VITE_WORLD_ADDRESS`.
2. Launch app and confirm network badge + token panel are visible.
3. Create player account if needed.
4. Mint test tokens (if mint is enabled for the profile).
5. Start a new game and verify spawn succeeds.
6. Confirm `Economy Snapshot` card shows `Supply`, `Target`, and `Multiplier` values.
7. Complete gameplay actions (`build`, `discard`, or `surrender`) and finish game.
8. Claim reward and confirm token balance changed.
9. Verify landing payout preview shows `base * multiplier = adjusted` values.
10. Record profile, tx hashes, and before/after balance snapshots for regression tracking.
