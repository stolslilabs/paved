# Client track status

Dated 2026-10-06. Track CLIENT of the programme Paved (the packages-based web client).

| Step | State |
|---|---|
| A. The packages build and their tests run | Done, #188 (CI job `client`) |
| B. Frame-time baseline at 38 and 72 tiles | In this PR (`client: frame-time baseline at 38 and 72 tiles (baseline B)`): method and figures in `docs/measures/client-baseline.md` |
| Renderer: instanced tiles, shared materials, no per-tile edge geometry | Next. Target (an estimate, not a measure): p95 frame time <= 16.7 ms at 72 tiles on the Mac |
| Data layer: drop Torii and polling, view calls and events | From P2, with `paved-core` |

Out of scope: Weekly, multiplayer/duel (owner D-4), configurable games (P-1), app-native.

The baseline measures a recorded board, not a live deployment (decided 2026-10-06): the contracts
change in P2 and a fixture is deterministic. Latency from move to display is therefore not in the
baseline; it needs a live node.
