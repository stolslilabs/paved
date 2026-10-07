# Paved: risks

| # | Risk | Phase | Mitigation |
|---|---|---|---|
| R-1 | The native port changes the rules | P2 | Golden games (move sequences with expected score) recorded in P0 and kept identical through P2, P3 and P5; never edited to pass |
| R-2 | Move cost is unbounded: the DFS grows with the game | P5 | Structure state (union-find or equivalent) designed in P5; worst-case move measured and budgeted |
| R-3 | Katana / Madara do not accept Cairo 2.20 classes | P0, P3 | Realised: Katana 1.7.1 and 1.8.0-rc.9 refuse Sierra 1.9.x; starknet-devnet 0.10.0 adopted (D-8); re-check Katana with `scripts/node/run-sample.sh` on a new release |
| R-4 | The daily seed is predictable, so bots can precompute the best game | P8 | Accepted by D-3 for now; revisit (VRF or a seed revealed at entry) before paid games in P8 |
| R-5 | #181 has flaws: never deployed (open economy config, open mint, first-caller admin, prize theft by id collision, double-counted supply, locked stakes) | P8 | Not deployed; the economy is rewritten in P8 with an audit (security and economy lenses) |
| R-6 | The 2026 client was built by an unsupervised agent and its promises are unmet | CLIENT | Measure frame time and build before building on it (client P0) |
| R-7 | bun is missing on the VPS, so the client build is unverified there | CLIENT | Install or run the client build where bun exists (the Mac clone, or CI) and make it a merge check |
| R-8 | The default installed snforge (0.61, 0.64) crashes the runner against the pinned `snforge_std` | P0, P3 | Updated: the pair is Scarb 2.20.1 / snforge 0.64.0 with `snforge_std` pinned `=0.64.0` |
