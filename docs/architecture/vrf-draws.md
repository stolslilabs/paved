# Cartridge's VRF for every draw (#638, design)

Track CORE's design for #638, part of the PvP plan #637. The owner's decisions of 2026-10-20 bind:

- Cartridge's VRF gives a true random for every tile drawn.
- The commit to a future block hash is dropped.
- The devnet mock is Glitchbomb's.

The Overseer ruled on 2026-10-20 on open points 1 and 3 to 6, as proposed (section 7). Point 2 is a question for
Cartridge that the owner asks: it stays **pending**, and the decisions of #643 and #645 that wait on it are listed in
section 7. Section 8 is as built.

Sources read for this note: Cartridge's public provider and server, `cartridge-gg/vrf` on `main` (MIT, cartridge-gg):
`src/vrf_provider/vrf_provider_component.cairo`, `src/types.cairo`, `server/src/main.rs`,
`server/src/routes/proof.rs` and `server/src/routes/outside_execution/mod.rs`. Glitchbomb's repository could not be
read from here: GitHub answers 404 without a login. Its mock is known only from #638's description (section 4).

## 1. Summary

- **The source of a draw is `Source::Salt(salt)`, with the salt computed from the draw: its kind, its game and its index.**
  The provider's seed is `poseidon(salt, caller, chain_id)`, the caller being the embedding system. So a draw's random is
  fixed for that draw. A reverted transaction sent again draws the same tile, and no player action can reroll it.
- **One draw per transaction.** The embedding system enforces it itself, and the provider enforces it too (section 3).
- **What a player can see before a draw depends on Cartridge's deployment, not on this design.**
  - Cartridge's published server answers any seed: `/proof` returns the random for a raw seed, with no authentication in
    the handler.
  - `/outside_execution` returns the signed wrapper to its caller, with the proof in the `submit_random` calldata. It does
    not simulate the transaction or check whether it would revert.
  - If a player can reach either route in production, they can read **every** future draw of their own game, not only the
    next one. That holds for `Salt` and for `Nonce` sources alike, since both seeds are computed from public values.
  - So this must be confirmed with Cartridge before #643 relies on it (open point 2). A preview of the next tile for
    everyone does not answer that case.
- **Fee estimation leaks nothing.** The provider's `consume_random` returns 0 when every resource bound of the
  transaction is 0 ("Always return 0 during fee estimation to avoid leaking vrf info"). A local simulation cannot get a
  real value: `consume_random` asserts the random is non-zero (`NOT_FULFILLED`), and only `submit_random`, with a proof
  checked against Cartridge's public key, writes it.
- **What this PR builds:** a component that a system embeds; the mock provider; a test harness contract that embeds the
  component, for the snforge tests and the size and gas measures; the client's call builder; and the devnet deployment
  of the mock. No game system draws through it yet: the first is #643.

## 2. How Cartridge's flow works (from its source)

1. The client puts `request_random(caller, source)` on the VRF provider as the **first** call of its multicall. On chain
   it does nothing. Cartridge's server uses it to find the seed.
2. Cartridge's server computes the seed, proves it with Cartridge's key and wraps the player's outside execution. The
   wrapper's calls are: `submit_random(seed, proof)`, then the player's calls, then `assert_consumed(seed)`. The
   paymaster submits the wrapper.
3. The embedding system calls `consume_random(source)` with the same source.
   - It gets `poseidon(random, consume_count)`, where `consume_count` is the number of earlier consumes in the
     transaction.
   - A source whose seed was not submitted panics with `NOT_FULFILLED`.
4. `assert_consumed` reverts the whole transaction if nothing consumed, then clears the stored random.

Seeds (`get_seed`):

- `Salt(s)`: `poseidon(s, caller, chain_id)`.
- `Nonce(addr)`: `poseidon(nonce[addr], addr, caller, chain_id)`. The nonce increments on the first consume of the
  transaction.

`nonce[addr]` is keyed by `addr` alone, whatever the caller. So **any contract can advance any address's nonce** by
consuming `Nonce(addr)` in a transaction of its own.

The provider is at `0x051fea4450da9d6aee758bdeba88b2f665bcbf549d2c61421aa724e9ac0ced8f` on mainnet and on Sepolia
(class `0x00be3edf…7257`, from its README).

## 3. Rules against replaying a draw

**The salt.**

```
salt = poseidon('PAVED_DRAW', kind, game_id, draw_index)
```

- `kind` keeps apart the draws of one system that share a game id: an attack's tile, a reward offer, the matchmaker's
  opponent.
- The caller in the provider's seed keeps apart the systems.
- `draw_index` is the game's draw counter, stored by the embedding system and incremented by the draw. Nothing the player
  chooses (a position, an orientation, a transaction) enters the salt. So a draw cannot be steered by choosing a move,
  and cannot be rerolled by reverting.

**Why not `Nonce`.**

- With `Nonce(player)`, a player could read the next draw, then advance their own nonce from a contract of their own,
  and so redraw at will (a reroll).
- `Nonce(system)` has the same hole, and also lets another player's draw change yours.
- `Salt` has no state that anyone else can advance.

**A reverted and resent transaction** has the same salt, so the same seed, so the same random: ECVRF is deterministic for
one key and one seed. Tested with the mock (section 4), which derives its value from the seed.

**The draw is the first consume of its transaction** (found in review, 2026-10-20).

- Cartridge's `consume_random` returns `poseidon(random[seed], consume_count)`, where `consume_count` counts the
  transaction's consumes **for every seed together**.
- `submit_random` is public: anyone may submit a proof that is valid for a seed of their own. It resets the count to 0
  and leaves the seeds already stored in place.
- So, after the wrapper submits the Paved seed `S`, a player's calls could replay a proof for their own consumer's seed
  `A` and consume `A` N times before calling Paved. The unchanged `S` would then return `poseidon(random[S], N)`, a
  value the player chooses by choosing N: a reroll.
- **The rule:** the component reads the provider's `get_consume_count()` and refuses the draw unless it is 0
  (`'VRF: not first consume'`). The draw's value is then always `poseidon(random[S], 0)`.
  - A player who resets the count to 0 by submitting their own proof again only gets that same value.
  - `random[S]` is fixed: it is checked against Cartridge's key for `S`.
- The mock counts the consumes of each transaction the same way (`get_consume_count`, keyed by the transaction hash)
  and mixes the count into its value.
- Tested: a draw after another consume in its transaction is refused, and any number of consumes in an earlier
  transaction leave the draw's value unchanged (fuzzed).

**One draw per transaction.**

- **The provider.** The server fulfils one seed per transaction (the first `request_random`). A second draw of the same
  game uses the next index, so another seed, so it panics with `NOT_FULFILLED`. Two consumes of one source in one
  transaction get different values (`consume_count`).
- **The component.** It also checks the rule itself, so that the mock and the devnet behave as the chain does. It stores
  the transaction hash of its last draw (`vrf_last_draw_tx`) and refuses a second draw in the same transaction:
  `'VRF: one draw per tx'`. The check is contract-wide, so one transaction cannot draw in two games of the same system
  either.

**What is left, if the routes of section 1 are reachable.**

- Every draw of a game is computable in advance by its player, and by anyone who knows its salt. The order is then
  known: by the measures of #637, a bot then reaches 100 to 117 % of the village, with 3 stars in 35 to 58 % of attacks.
- Showing the next tile to everyone would not close that gap. The leak is the whole future, not one tile ahead.
- **This design needs nothing else from Cartridge.** It needs only that their production server proves a seed only when
  the paymaster submits the transaction, and that a reverting transaction does not land with its proof in the calldata.
  If that holds, no peek is possible and the UI shows no next tile (open points 2 and 3).

## 4. The mock provider

- **A native `#[starknet::contract]`, `MockVrfProvider`** (`contracts/src/mocks/vrf.cairo`), with the provider's
  interface (`IVrfProvider`) and its `Source` enum (`contracts/src/vrf.cairo`).
  - Its calls are `request_random(caller, source)` and `assert_consumed(seed)`, which do nothing, and
    `consume_random(source) -> felt252`.
  - The serialization of `Source` is Cartridge's (`0` for `Nonce`, `1` for `Salt`), so the client sends the same calldata
    on the devnet and on chain.
- **Its value comes from the source, not from the transaction hash (proposed; it departs from Glitchbomb's).**
  - `consume_random` computes the seed as the provider does, with the caller, the chain id and, for `Nonce`, an
    incremented nonce.
  - It returns `poseidon(seed, 'MOCK_VRF')`.
  - So a retried draw gets the same tile in the tests. With the transaction hash, the snforge tests would have to cheat
    the hash, and could not show that a draw is fixed by its source.
- **Source of the port.** The interface and the seed formula come from Cartridge's public provider (MIT, cartridge-gg).
  The contract shape follows #638's description of Glitchbomb's mock (at `5efcbcec`, MIT, cartridge-gg). If the owner
  wants a line-by-line port of Glitchbomb's file, it must be exported here, since it cannot be read from here (open
  point 5).
- **The mock is deployed by `deploy.sh` on the devnet only.** It is refused by name on Sepolia and mainnet, as
  `MockUSDC` is.

## 5. The component and the client

**`DrawableComponent`** (`contracts/src/components/drawable.cairo`), flat, like the other components (`upgrades.md`,
"Storage layout discipline"). Its storage is new names only:

| Variable | Type | Role |
|---|---|---|
| `vrf_provider` | `ContractAddress` | Cartridge's provider, or the mock on devnet. Set by the owner |
| `vrf_last_draw_tx` | `felt252` | The transaction hash of the last draw: the one-draw-per-transaction rule |

Its calls:

- `draw_random(ref self, kind: felt252, game_id: felt252, draw_index: u32) -> felt252`. Internal: the embedding system
  calls it inside its own entry point, with its own draw counter.
  - It checks the one-draw rule.
  - It computes the salt and calls `consume_random(Source::Salt(salt))`.
  - It returns the random, which then replaces the seed of that draw, for example in `draw_from_bitmap(random, …)`.
- `vrf_salt(kind, game_id, draw_index) -> felt252`. A pure function: the client computes the same salt for its
  `request_random`.
- `set_vrf_provider(address)`, owner only, in the embedding system's ABI. It also emits `VrfProviderSet` for the
  indexer.

**The client (`@paved/chain`).**

- `vrfSalt(kind, gameId, drawIndex)`, the TypeScript mirror of the salt, pinned against Cairo by a fixture as the codec
  is.
- `withVrfRequest(calls, { provider, consumer, salt })` puts `request_random(consumer, Salt(salt))` first.
- The deployment gains `vrfProvider`: Cartridge's address on Sepolia and mainnet, the mock's on the devnet. The devnet
  path is the same call against the mock, which ignores it.
- `request_random` on the provider becomes a session policy (it moves no token, P-65).
- The draw's write and its tile view come with #643, which owns the first drawing entry point.

**The indexer.** It needs no table here: `VrfProviderSet` is a configuration event. The draws' events belong to the
systems that draw (#643, #642, #639).

## 6. Size and cost (to measure in the PR)

- **CASM.** `scripts/class-sizes.sh` on the harness contract, with and without the component: the felts it adds to an
  embedding system. These are judged against each future embedder's cap (P-44, `class-headroom.md`).
- **Gas.**
  - `contracts/tests/gas.cairo` measures one draw through the mock: the salt, the dispatcher call and the two storage
    accesses.
  - The real provider's `submit_random` (the ECVRF verification) and `assert_consumed` run in the same transaction, paid
    by the paymaster. snforge cannot measure them without Cartridge's class.
  - Proposed: measure the consumer side in `gas.cairo`, and Cartridge's part once on Sepolia, from the receipt of a
    harness draw (open point 6).

## 7. Rulings and the pending point

Ruled by the Overseer (2026-10-20), as proposed:

1. **The source is `Salt(poseidon('PAVED_DRAW', kind, game_id, draw_index))`**, never `Nonce`: a nonce can be advanced
   by any contract, so a player could reroll.
3. **No next-tile preview in the UI.**
4. **One draw per transaction, contract-wide**, enforced by the component (one storage read and one write per draw), on
   top of what the provider already enforces.
5. **The mock's value comes from the source**, not from the transaction hash. It is ported from Cartridge's public
   interface and #638's description of Glitchbomb's mock.
6. **The embedding in this PR is a test harness only.** The first real embedding is #643. Cartridge's part of the gas is
   measured on Sepolia, not in snforge.

**Pending: point 2, three questions for Cartridge** (the owner asks them; the answers come through the Overseer):

- Is the production VRF server's `/proof` or `/outside_execution` route reachable by a player?
- Does the paymaster submit a VRF-wrapped transaction that reverts?
- Does it ever return the signed wrapper to the client?

If any answer is yes, a player can read their whole game in advance, whatever the source. Glitchbomb's integration
cannot answer this; only Cartridge's deployment can.

What waits on the answers:

- **#643 (the attacks).**
  - Whether the attack's tiles can be drawn one at a time on the VRF, with the order hidden. The attack's star
    thresholds (#637, open point 1) were measured with the order hidden.
  - Whether the attack's UI may show only the tile in hand.
  - Whether the matchmaker's opponent draw (#639) can share the same source.
  - If any answer is yes, #643 needs another source of hidden order before it ships, since the owner dropped the
    future block hash.
- **#645 (the Challenge on the VRF).** The owner gave the go on 2026-10-21 without waiting for the answers, with a
  two-tile lookahead (D-30, `challenge-vrf.md`): the questions below stay open, and the exposure is bounded by the
  horizon the UI shows.
  - Whether moving the Challenge to the VRF removes the selective buyer's edge (R-4,
    `docs/measures/selective-buyer.md`). If a player can read the draws in advance, the VRF does not remove it, and
    D-3, D-13 and D-28 stay as they are.
  - Whether the Challenge's per-draw reseed is replaced by one VRF draw per tile.

## 8. As built

Code:

- `contracts/src/vrf.cairo`: `Source`, `IVrfProvider` and `draw_salt`.
- `contracts/src/components/drawable.cairo`: `DrawableComponent`.
- `contracts/src/mocks/vrf.cairo`: `MockVrfProvider`.
- `contracts/src/mocks/drawer.cairo`: `DrawHarness`, test only.
- Tests: `contracts/src/tests/vrf.cairo` (coverage group `tests-vrf`) and `contracts/tests/gas.cairo`, z15.
- Client: `packages/chain/src/vrf.ts`, tests in `packages/chain/test/vrf.test.ts`.

Departures from sections 4 and 5:

- The salt function is `draw_salt` in `paved::vrf`, not a call of the component. The client's mirror is `vrfSalt`, pinned
  against it by one fixture value.
- The mock's `assert_consumed` takes the seed, as Cartridge's provider does. #638 describes Glitchbomb's as taking the
  source.
- The mock refuses only SN_MAIN at construction: starknet-devnet runs as SN_SEPOLIA, so Sepolia cannot be refused there.
- The interface has `get_consume_count` too, for the first-consume rule of section 3.
- `Deployment.vrfProvider` (`resolveDeployment`) carries the network's provider, so the app reads it with the other
  addresses.

**The devnet path.**

- `scripts/deploy.sh devnet` declares and deploys `MockVrfProvider`, with no constructor argument, and records it as
  `contracts.MockVrfProvider`.
- `deploy` refuses the mock by name on every other network.
- The smoke reads its consume count (0) and the consume of a salt (not 0).
- Rehearsed on a fresh `starknet-devnet --seed 42` with `scripts/deploy.sh devnet --unmerged`: `smoke ok`, the mock at
  `0x02c5080f…b46d`, class `0x02abc54e…e5d7`.
- The address depends only on the class hash (salt 1, no `--unique`, no calldata). So the entry is in the committed
  `contracts/deployments/devnet.json`, and a regeneration from the same class writes the same entry.
- `vrfProvider` resolves it there, which `packages/chain/test/vrf.test.ts` pins.

**CASM** (release, `scripts/class-sizes.sh`, VPS, 2026-10-20):

| Class | Sierra | CASM | Of the cap |
|---|---|---|---|
| `DrawHarness` | 1,172 | 2,803 | 3.4 % |
| `DrawHarness` without the component (measured, not committed) | 825 | 1,999 | 2.4 % |
| `MockVrfProvider` | 877 | 1,381 | 1.7 % |

So the component adds **804 CASM felts** (347 Sierra) to the system that embeds it. For #643's system, that is to be
judged against its cap (P-44).

**Gas.** z15 in `contracts/tests/gas.cairo` measures one draw on the consumer's side over the mock, the game's second:
**986,461 L2 gas** (CI, snforge 0.64.0), and its ceiling is that figure + 5 %, 1,035,785. It was 599,559 before the
review fix. The difference is the component's `get_consume_count` call, and the mock's count of the transaction's
consumes (two slots written per consume), which Cartridge's provider keeps in its own storage. Cartridge's part
(`submit_random` and `assert_consumed`) is not in it.

**The local snforge run was skipped under the VPS cap.**

- The test build of `contracts/` peaks at **8.35 GB RSS** (8,352,724 kB; VmPeak 14.2 GB).
- main peaks the same without this branch's modules (8,352,860 kB).
- That is above the 8 GB scope of the VPS's Cairo shim, so the run is OOM-killed after the diagnostics, which pass
  without errors.
- The tests ran in CI (`AGENTS.md`): the 16 of `paved::tests::vrf` and z15 pass (951 passed, 0 failed).

**Follow-up:** the indexer's `VrfProviderSet`, with #643, the first system that emits it outside the test harness.
