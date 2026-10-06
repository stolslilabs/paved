# Client track status

Dated 2026-10-06. Track CLIENT of the programme Paved (the packages-based web client).

2026-10-06: throttled (CPU 4x, 60 Hz) at 72 tiles, the cadence holds (no missed frame) but time to
interactive is 6.2 s against 0.5 s; a click shows its tile in 37 ms (p50) unthrottled, 86 ms
throttled; in the real Game page each Torii poll costs 3 React commits and no long task (one
exception, in a session run at load 18.6), while each
placement brings two to three long tasks of 57-123 ms throttled.

2026-10-06, renderer step (P-7b): at 72 tiles throttled, time to interactive is 0.85 s (from 6.2 s;
0.24 s unthrottled), a click shows its tile in 34 ms p95 (from 115 ms), draw calls per median frame
137 (from 207) and triangles 0.74 M (from 1.7 M), with identical screenshots but for a few edge pixels on
tile borders. Every P-7b target is met but two: one long task (56-58 ms) per play session remains, the
first transaction signature (chain layer); and 0.1 % of in-play frames run over 1.5 intervals.

| Step | State |
|---|---|
| A. The packages build and their tests run | Done, #188 (CI job `client`) |
| B. Frame-time baseline at 38 and 72 tiles | Done, #190: method and figures in `docs/measures/client-baseline.md` |
| C. Throttled baseline, click-to-display latency, polling cost in play (P-7) | Done, #192: section "Throttled and in-play (P-7)" of `docs/measures/client-baseline.md` |
| Renderer: shared geometry and materials, no per-tile edge geometry (P-7b) | Done, #194: `docs/measures/client-renderer.md`. Instancing measured and dropped |
| Data layer: drop Torii and polling, view calls and events | From P2, with `paved-core` |

Out of scope: Weekly, multiplayer/duel (owner D-4), configurable games (P-1), app-native.

The baseline measures a recorded board, not a live deployment (decided 2026-10-06): the contracts
change in P2 and a fixture is deterministic. Latency from move to display is therefore not in the
baseline; it needs a live node.
