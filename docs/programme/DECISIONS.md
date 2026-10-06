# Paved: decisions

Owner: the owner of the programme. PM: the programme's project manager. Overseer: the organisation's
Overseer.

| id | decision | who | date | what would reverse it |
|---|---|---|---|---|
| D-1 | Plan v0 is validated: order P0..P8, tracks CORE, CLIENT, META, ECO | owner | 2026-10-06 | The owner changes the plan |
| D-2 | Token: the official name is decided later with the team; the client hard-codes `$TILE` for now | owner | 2026-10-06 | The team picks a name |
| D-3 | Randomness: keep what is implemented, a predictable daily seed and a game seed that evolves with the player's actions; no VRF for now | owner | 2026-10-06 | The owner asks for a VRF (revisit before paid games in P8, see RISKS) |
| D-4 | Out of scope for now: Weekly, and multiplayer (duel included) | owner | 2026-10-06 | The owner brings them back |
| D-5 | Networks: Katana / Madara for the MVP and the tests; a mainnet trial later when the owner is satisfied (reserved act: their go); Sepolia not required | owner | 2026-10-06 | The owner asks for Sepolia or another network |
| D-6 | Licence: Apache 2.0, replacing MIT | owner | 2026-10-06 | The owner changes the licence |
| P-1 | Configurable game creation (#181) is also out of the path, like Weekly | PM | 2026-10-06 | The owner asks for it |
| P-2 | Client base is `packages/` (2026); app-native stays dormant | PM | 2026-10-06 | The owner prefers `app/` |
| P-3 | #181 is reworked, not reverted; its economy leaves the path in P1 | PM | 2026-10-06 | A bug is found in the kept pieces |
| P-4 | No 2024 branch is merged; `dev` is a reference (duel, tile varieties, performance) | PM | 2026-10-06 | The owner asks to merge one |
| P-5 | Woodsman and Herdsman keep their 2024 rules (Woodsman = forest x adjacent closed roads; Herdsman = forest x adjacent completed cities) | PM | 2026-10-06 | The owner gives other rules |
| P-6 | The node (Katana, Madara or starknet-devnet) is chosen in P0 by measurement: it must accept Cairo 2.20 classes once Dojo is gone | PM | 2026-10-06 | The measure says otherwise |
| O-1 | Paved may depend on `quiver_quest` and `quiver_achievement` (bal7hazar/quiver), from the quests and achievements step (P7), by published version on scarbs.xyz only (0.2.0 today, Cairo 2.20), pinned in the manifests; never a git or path dependency. A breaking release is announced by Grim World to the Overseer, who tells Paved. What Paved needs from quiver goes to the Overseer as a request to Grim World, never as a PR of ours | Overseer | 2026-10-06 | The Overseer changes the rule |
| O-2 | No Slingfall library and no hexx-cairo as dependencies; their docs are lessons only. The toolchain Scarb 2.20.1 / snforge 0.64 is the organisation's (D-180) | Overseer | 2026-10-06 | The Overseer allows a dependency |
| O-3 | Copying Grim World's indexer code is allowed: keep its licence header if any, say in the file where the code comes from; it is then our copy, maintained by us | Overseer | 2026-10-06 | The Overseer withdraws the permission |
| P-7 | CLIENT targets, at 72 tiles on the Mac under CDP CPU throttling 4x and a 60 Hz cadence: p95 frame time <= 16.7 ms; draw calls and triangles below baseline B; time to interactive <= 0.5 s (estimates, fixed after the throttled baseline). Two measures added: click-to-display latency, and long tasks > 50 ms and React commit time while Game.tsx polls Torii, throttled and not | PM | 2026-10-06 | The owner names another reference device |
