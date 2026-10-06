# Client track status

Dated 2026-10-06.

2026-10-06: throttled (CPU 4x, 60 Hz) at 72 tiles, the cadence holds (no missed frame) but time to
interactive is 6.2 s against 0.5 s; a click shows its tile in 37 ms (p50) unthrottled, 86 ms
throttled; in the real Game page each Torii poll costs 3 React commits and no long task, while each
placement brings two to three long tasks of 57-123 ms throttled. Track CLIENT of the programme Paved (the packages-based web client).

| Step | State |
|---|---|
| A. The packages build and their tests run | Done, #188 (CI job `client`) |
| B. Frame-time baseline at 38 and 72 tiles | Done, #190: method and figures in `docs/measures/client-baseline.md` |
| C. Throttled baseline, click-to-display latency, polling cost in play (P-7) | In this PR (`client: throttled baseline, click latency, polling cost (P-7)`): section "Throttled and in-play (P-7)" of `docs/measures/client-baseline.md` |
| Renderer: instanced tiles, shared materials, no per-tile edge geometry | Next. Targets of P-7 (estimates), at 72 tiles under CPU 4x and 60 Hz: p95 frame time <= 16.7 ms, draw calls and triangles below baseline B, time to interactive <= 0.5 s |
| Data layer: drop Torii and polling, view calls and events | From P2, with `paved-core` |

Out of scope: Weekly, multiplayer/duel (owner D-4), configurable games (P-1), app-native.

The baseline measures a recorded board, not a live deployment (decided 2026-10-06): the contracts
change in P2 and a fixture is deterministic. Latency from move to display is therefore not in the
baseline; it needs a live node.
