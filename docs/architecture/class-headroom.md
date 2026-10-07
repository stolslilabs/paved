# Class headroom and the split of the game contracts (P-25, design)

Ruling P-25 of the project manager: before the P8 design, a note on the headroom of every class (contents, size,
margin, how P8 fits), and "split a contract if needed rather than squeeze". This document measures where the bytes
go, measures the split options in prototypes, and recommends one split with its plan of pull requests.

Starknet caps a declared class at **81,920 Sierra felts and 81,920 CASM felts** (CASM is the bound that binds here;
bal7hazar/slingfall#12, O-41). The programme keeps every class at **at most 90 % of the cap, 73,728 felts** (R-9).

Sources read: `contracts/src/` (systems, components, structure, store, views, quests of #242),
`docs/architecture/{native-storage,structure-state,leaderboard,quests,public-interface}.md`,
`docs/programme/{OPERATIONS,PLAN}.md`, `contracts/deployments/README.md`, `scripts/{deploy,abis}.sh`,
`packages/chain/src/deployment.ts`, `packages/indexer/src/deployment.ts`, and PR #242 (P7, branch
`hp/paved-core/t-0074-p7-quests-and-achievements-contracts`, head `3f91639`).

## Summary

- **Today.** `Daily` is at 98.2 % of the cap on main and **111.8 % with P7** (#242 cannot be declared);
  `Tutorial` is at 91.9 % and 93.8 % with P7. Both embed the whole game engine; the move code alone (one copy of
  `build` with the structure state, placement, assessment and forests) is about **62,000 CASM felts**, 76 % of the
  cap. Whatever class runs a move holds that.
- **No split that puts a call on the move path meets the gas target.** A library call costs **+138,440 L2 gas per
  move** with release code (+5.4 % on the simple move a) and +213,740 with the test profile (+4.2 %). The bare
  syscall is 99,230 of it (test profile), above the 3 % of the simple move on its own in release.
- **Recommendation: option (e), "the move stays, the rest moves out".** `Daily` and `Tutorial` keep `build` and the
  views; everything that does not run on an ordinary move (spawn, claim, sponsor, discard, surrender, the quests
  and achievements report at game over, the quest definitions, and P8 later) goes into **one declared class,
  `Lobby`**, run through `library_call_syscall`. Storage, caller and events stay `Daily`'s and `Tutorial`'s.
  - Sizes, measured with P7: **Daily 72,408 CASM (88.4 %)**, **Tutorial 66,672 (81.4 %)**, **Lobby 58,747
    (71.7 %)**; P8 (estimate 10,000 felts at most) goes into `Lobby`: about 84 %.
  - Gas, measured: **simple moves a0, a, b, c, d unchanged** (+360 L2 gas in release, 0.0 %); a game over that is
    not an ordinary move pays one library call: closing moves g, h, i, k **+118,650** in release
    (k, the full quests report, 1,241,819 to 1,360,469, +9.6 %).
  - Public interface: the same four contracts and addresses, **every function, view and event of the ABIs
    unchanged** (measured by ABI diff); only the constructors of `Daily` and `Tutorial` gain one `ClassHash`
    argument. The player still approves `Daily` and calls `Daily.spawn`.
  - Goldens identical (all 21 golden tests pass on the prototype). The structure-state code is not touched: no
    correctness audit. A **security audit** is due: the token-paying and owner-only paths now run through a library
    call.
- **Weak point**: `Daily` keeps 1,320 felts below the 90 % line. P8 does not touch the move path, but any growth of
  the move code must be paid elsewhere. The fallback, measured: put the move behind a library call too (option a,
  +138,690 per move) or the forest scoring (8,413 felts) behind one (option c2, needs a correctness audit).

## How it was measured

All figures were measured on the VPS on 2026-10-07 with the pinned toolchain (scarb 2.20.1, snforge 0.64.0),
`RAYON_NUM_THREADS=1`, under `prlimit --as=8589934592 -- /usr/bin/time -v`. Peak RSS: 1.2 to 1.5 GB for a release
build, 4.5 to 5.1 GB for a gas run (`--max-threads 2`).

- **Bases.** main `0a1d7a6` and #242 head `3f91639` (P7), each exported with `git archive` to a scratch folder
  outside the worktree. Nothing of the prototypes is committed.
- **Class sizes.** `scarb --release build` with `casm = true` (what `scripts/deploy.sh` declares); Sierra =
  length of `sierra_program`, CASM = length of `bytecode` of the compiled class, as `scripts/class-sizes.sh` of
  #242 reads them.
- **Where the bytes go.** The compiled class carries `bytecode_segment_lengths`, one segment per Sierra function in
  the order of `sierra_program_debug_info.user_func_names` (their counts and sums match the bytecode exactly, for
  every class measured). This gives the CASM size of every function that was not inlined; inlined code counts in
  its caller (so `PlayableComponent::build` holds much of the engine it inlines).
- **Gas.** The gas tests of `contracts/tests/gas.cairo` (`snforge test test_gas_`), which isolate the L2 gas of
  the last call of each scenario. Both profiles: the **test profile** (`snforge test`, the dev profile with
  `inlining-strategy = "avoid"`, the one the committed ceilings use) and **release** (`snforge test --release`,
  the code that is declared). A prototype that exceeds a committed ceiling fails that test after printing its
  figure; the figure is what is reported.
- **Prototypes.** Option (a) and option (e) were built for real (new class, constructor argument, library
  dispatchers, test setups declaring the class); options (b), (c) and the P8 size are derived from the
  per-function sizes, and say so.

## 1. What each class holds today

### Sizes

| Class | Sierra | CASM | Of the cap | Margin to 90 % |
|---|---:|---:|---:|---:|
| `Daily` (main) | 36,028 | 80,418 | 98.2 % | -6,690 |
| `Tutorial` (main) | 33,975 | 75,296 | 91.9 % | -1,568 |
| `Account` (main) | 1,307 | 2,879 | 3.5 % | 70,849 |
| `Token` (main, test and devnet only) | 1,611 | 4,374 | 5.3 % | 69,354 |
| `Daily` (#242, P7) | 44,814 | 91,570 | 111.8 % | -17,842 |
| `Tutorial` (#242, P7) | 34,835 | 76,859 | 93.8 % | -3,131 |

The first four figures are those of the brief, reproduced.

### Contents

| Class | Components | Entry points | Modules it compiles in |
|---|---|---|---|
| `Daily` | Hostable (spawn, claim, sponsor), Ownable (embedded ABI: owner, pending_owner, transfer_ownership, accept_ownership, upgrade), Payable (pay, refund), Playable (build, discard, surrender); with P7 quiver `QuestComponent` and `AchievementComponent` (internal layer) | `IDaily` (spawn, claim, sponsor, discard, surrender, build), `IGameView` (4 views), `ITournamentView` (3 views), with P7 `IDailyQuests` (4 owner-only) | the whole engine: `structure::{placement, state, assessment, forest, oriented, tables, record}`, `models::{game, builder, tile, tournament}`, `helpers::random_deck`, `types::deck`, `store`, `views`, `leaderboard`, with P7 `quests` |
| `Tutorial` | Hostable (spawn), Ownable, Tutoriable (build, discard, surrender); with P7 `AchievementComponent` | `ITutorial` (spawn, discard, surrender, build), `IGameView` | the same engine, its own copy |
| `Account` | Ownable | register, player views | `models::player` |
| `Token` | ERC20 mock | ERC20 | `mocks` |

### Where the bytes go (CASM felts per module, release)

Measured from the segment lengths; each row is the sum of the functions of that module that were not inlined.

| Module | `Daily` main | `Tutorial` main | `Daily` P7 |
|---|---:|---:|---:|
| `structure::placement` | 13,285 | 13,285 | 13,285 |
| `components::playable` (Daily) / `tutoriable` (Tutorial): the move entry points, with the engine they inline | 12,810 | 14,516 | 12,957 |
| `structure::forest` (P4) | 8,312 | 8,312 | 8,413 |
| `store` | 7,279 | 7,125 | 7,415 |
| `structure::assessment` | 5,992 | 5,992 | 6,304 |
| `structure::state` | 5,209 | 5,209 | 5,209 |
| `structure::oriented` | 4,200 | 4,200 | 4,200 |
| `systems::<contract>` (ABI wrappers, constructor) | 3,881 | 2,452 | 5,458 |
| `models::game` | 3,409 | 3,409 | 3,456 |
| `components::hostable` | 2,560 | 2,165 | 2,563 |
| `views` | 2,296 | 1,928 | 2,306 |
| `core` (library code) | 1,838 | 1,788 | 2,816 |
| `helpers::random_deck` | 1,469 | 1,469 | 1,469 |
| `leaderboard` | 1,410 | - | 1,410 |
| `components::ownable` | 1,137 | 1,137 | 1,287 |
| `models::tournament` | 1,131 | - | 1,131 |
| `types::deck` | 890 | - | 890 |
| `structure::tables` | 737 | 737 | 737 |
| quiver (`quiver_quest`, `quiver_achievement`) | - | - | 6,491 |
| `quests` (P7 tally) | - | - | 1,071 |
| the rest (plan, math, payable, multiplier, record, spot, role, events, slots) | 2,573 | 1,572 | 2,702 |
| **Total** | **80,418** | **75,296** | **91,570** |

The biggest single functions in `Daily` (main): `PlayableComponent::build` 8,344, `PlayableComponent::discard`
3,972, three specialisations of `placement::place` (2,103, 1,455, 1,328), `GameImpl::assess` 1,794,
`assessment::recover` 1,724, `forest::assess_forest` 1,715, `HostableComponent::spawn` 1,590.

What this says:

- The engine is shared code, but each class has its own copy. Tables are cheap (737); placement, forests and the
  structure state are not.
- Discard is the second-biggest function: it inlines the draw and the game over.
- P7 adds 11,152 felts to `Daily`. 10,117 of them are outside the move: quiver (6,491), the report wrappers
  (+1,577 in `systems::daily`), the tally (1,071) and library code (+978). About 1,000 are in the engine
  (the game counters).

Variants built to locate the bytes, with their measured sizes (main unless noted):

| Variant | `Daily` | `Tutorial` | New class |
|---|---:|---:|---:|
| Engine class with `PlayableComponent` and `TutoriableComponent` side by side (two copies of the move) | 41,400 | 34,213 | Engine 80,039 (97.7 %) |
| Engine class with ONE move body (a `tutorial` flag) plus spawn, discard, surrender | 15,095 | 9,032 | Engine 76,335 (93.2 %) |
| Same, spawn stays in the callers | 41,400 | 34,213 | Engine 68,388 (83.5 %) |
| Same, only `build` in the engine | 47,296 | 41,026 | Engine 62,244 (76.0 %) |

The last row is the size of the move: about 62,000 felts, whichever class holds it.

## 2. Split options

The per-call cost of a library call, measured (test profile, on scenario a, as deltas of extra calls added to
`Daily.build` in the option (a) prototype):

| Part | L2 gas |
|---|---:|
| `library_call_syscall` to an empty entry point | 99,230 |
| reading the class hash from storage (`ClassHash` field of the caller) | 39,490 |
| the 6 move arguments (`game_id`, orientation, x, y, role, spot), serialised and deserialised | 48,470 |
| the rest of the real `build` call (entry wrapper of the engine) | 26,550 |
| **one library call carrying a move** | **213,740** |
| same in release (measured on a, a0, b, c, d) | 138,440 to 139,020 |

Packing the six arguments into one `u128` was measured too: worse, +255,040 instead of +213,740 (the unpacking
costs more than the decoding it saves). A class hash written as a constant would save the 39,490 read, but the
test build and the release build do not have the same class hash, so the tests would need a two-pass build;
even then the simple move would stay above +3 %.

The target of the brief is "a simple move costs at most +3 %": 3 % of a is 152,470 L2 gas in the test profile and
77,606 in release. **One library call on the move path is above it in both profiles.**

### (a) The game engine as one shared class, called by `Daily` and `Tutorial`

`Engine` is declared, never deployed. `Daily.build` and `Tutorial.build` make one library call to it; the
storage, the caller (`get_caller_address` is the player) and the events stay the caller's. Spawn, discard and
surrender stay in the callers (keeping them in the engine pushes it to 93.2 %).

Sizes, measured on #242 (P7): **Engine 62,925 (76.8 %), Daily 58,046 (70.9 %), Tutorial 42,225 (51.5 %)**. P8
would go into `Daily` (about 83 % with the 10,000 felts estimate).

Library calls per action: one per `build` (every move), none for the rest.

Gas, measured, before -> after (L2 gas):

| Scenario | Test profile, #242 | | Release, #242 | |
|---|---:|---:|---:|---:|
| a0 open simple move | 5,626,675 -> 5,847,775 | +3.9 % | 2,784,640 -> 2,923,330 | +5.0 % |
| a simple move | 5,112,995 -> 5,334,095 | +4.3 % | 2,601,100 -> 2,739,790 | +5.3 % |
| b move with a character | 6,087,384 -> 6,308,484 | +3.6 % | 2,988,859 -> 3,127,749 | +4.6 % |
| c close a large city | 6,160,411 -> 6,381,511 | +3.6 % | 3,088,163 -> 3,227,043 | +4.5 % |
| d worst case | 7,049,784 -> 7,270,884 | +3.1 % | 3,411,499 -> 3,550,769 | +4.1 % |
| e close a forest | 9,358,159 -> 9,579,259 | +2.4 % | 4,634,904 -> 4,773,784 | +3.0 % |
| f worst forest scan | 19,097,619 -> 19,318,719 | +1.2 % | 9,045,184 -> 9,184,254 | +1.5 % |
| g, h, i, k closing moves (surrender) | unchanged | 0 | unchanged | 0 |

On main the same split gives the same constant: +213,740 (test) and +138,440 to +139,020 (release) on every
build. A game that ends on a `build` pays the same one call as any build.

- **Public interface.** Addresses, functions, views and events unchanged; constructors gain `engine_class`
  (ABI diff, main). The approval and `spawn` are unchanged.
- **Access control.** The engine has no owner path; its entry points are reachable only through a deployed instance
  of `Engine`, which would only touch its own storage. `engine_class` is written once in the constructor.
- **Goldens.** The move code moves class and the Daily and Tutorial bodies become one (a `tutorial` flag: no reseed
  on build, parameters from the deck, no tournament). That is a rewrite of the move entry, so the goldens must
  prove it, and it calls for the **correctness audit**.
- **Deploy.** Declare `Engine`, pass its class hash to both constructors.
- **Verdict.** Best sizes, but every move pays +4 to +5 %: against the gas target.

### (b) `Daily` split into a game contract and a tournament, prize and quests contract

A second deployed contract `Tournament` holds the prize pool, the leaderboard, claim, sponsor, the quests and P8.
The game contract calls it at spawn (entry price) and at game over (submit, quests); claim goes to it directly.

Sizes, derived from the P7 per-function table (not built): the game contract keeps the move, discard (4,013),
surrender (517), the views and the wrappers. That is the `Daily` of option (e) plus discard and surrender:
**about 77,000 felts, 94 %**. `Tutorial` is untouched at 93.8 %. **It fails the size target for both game
contracts.** To pass, the move would still need option (a) or (e) underneath.

Gas: a `call_contract_syscall` at every game over and every spawn, with an authorisation check on the callee.
Simple moves are unchanged (derived: no call on that path).

- **Public interface.** One more address. `ITournamentView` and `claim`/`sponsor` move to it. The prize tokens and
  the approval move to the contract that holds the pool, so the player's approval target changes. `Claimed`,
  `Sponsored` and the quest events come from a second address. CLIENT and the indexer both change.
- **Access control.** New: the tournament contract must only accept submissions from the game contract (a stored
  allowed caller). That is a **security audit**, plus the token audit (it holds the pool).
- **Deploy.** One more deploy and a wiring transaction.
- **Verdict.** Worse on every axis.

### (c) Other splits

- **(c1) Tables or `oriented` as a library class.** `tables` is 737 felts and `oriented` 4,200. They are called
  many times per move (every area of the tile and of its neighbours), and each call is at least 138,440 in release.
  Rejected on the measured per-call cost.
- **(c2) Forest scoring as a library class.** `structure::forest` is 8,413 felts in P7 `Daily`. It only runs past
  a rare gate: a closed forest that holds a Woodsman or a Herdsman. It reads the in-memory structure state of the
  move (`Structures`, not yet flushed to storage), which would have to be flushed first or serialised across the
  call. That changes the structure-state algorithm (**correctness audit**). Kept as the fallback to buy about
  8,000 felts of room in `Daily` if the move code grows.
- **(c3) Tutorial slimmed to its own small engine.** The Tutorial deck is fixed (10 tiles, scripted parameters).
  An engine without forests or characters would be smaller (about 67,000 felts derived, without the 8,312 of
  forests). But it is a second engine to keep identical to the first, its golden must still hold, and `Daily` is
  not helped. Not needed once (e) is done: `Tutorial` lands at 81.4 %.
- **(c4) Release inlining set to `avoid`.** Smaller code, but the test profile, which uses it, costs twice the
  release gas on a simple move (5,082,345 against 2,586,870 on main). Rejected.
- **(c5) The views through the lobby too** (measured on top of (e)): `Daily` 71,677 (-731), `Tutorial` 65,870
  (-802), `Lobby` 63,884. Each view would then pay a library call. Not worth it.

### (e) The move stays, the rest moves out (recommended)

`Daily` and `Tutorial` keep the code that runs on every move (`build`, with the engine) and the views. Everything
else runs in **`Lobby`**, one declared class shared by both, through `library_call_syscall`. The components use
flat storage (`#[substorage(v0)]`), so `Lobby`'s code reads and writes the same variables in the caller's storage
as the caller's own code would.

| Entry point | Where it runs | Library calls |
|---|---|---|
| `Daily.build`, `Tutorial.build` (not the last tile) | the caller | 0 |
| `Daily.build`, `Tutorial.build` that ends the game | the caller, then `Lobby.report(tally)` / `Lobby.tutorial_report()` | 1 |
| `spawn` (both), `claim`, `sponsor`, `discard`, `surrender` | `Lobby` | 1 |
| `define_quest`, `retire_quest`, `define_achievement`, `retire_achievement` | `Lobby` (owner check inside) | 1 |
| all views, `Ownable` | the caller | 0 |
| P8: paid entry, settlement at game over | `Lobby` (in `spawn` and in the game-over call already made) | 0 more |

Sizes, measured on #242 (P7):

| Class | Sierra | CASM | Of the cap | Margin to 90 % |
|---|---:|---:|---:|---:|
| `Daily` | 32,471 | 72,408 | 88.4 % | 1,320 |
| `Tutorial` | 30,617 | 66,672 | 81.4 % | 7,056 |
| `Lobby` (declared only) | 26,860 | 58,747 | 71.7 % | 14,981 |

Gas, measured, before (#242) -> after (L2 gas):

| Scenario | Test profile | | Release | |
|---|---:|---:|---:|---:|
| a0 open simple move | 5,626,675 -> 5,625,485 | -0.0 % | 2,784,640 -> 2,785,000 | +0.0 % |
| a simple move | 5,112,995 -> 5,111,805 | -0.0 % | 2,601,100 -> 2,601,460 | +0.0 % |
| b move with a character | 6,087,384 -> 6,086,194 | -0.0 % | 2,988,859 -> 2,989,219 | +0.0 % |
| c close a large city | 6,160,411 -> 6,159,221 | -0.0 % | 3,088,163 -> 3,088,523 | +0.0 % |
| d worst case | 7,049,784 -> 7,048,594 | -0.0 % | 3,411,499 -> 3,411,859 | +0.0 % |
| e close a forest | 9,358,159 -> 9,356,969 | -0.0 % | 4,634,904 -> 4,635,264 | +0.0 % |
| f worst forest scan | 19,097,619 -> 19,096,429 | -0.0 % | 9,045,184 -> 9,045,544 | +0.0 % |
| g closing move, places in the top 3 | 1,912,269 -> 2,059,999 | +7.7 % | 1,109,829 -> 1,228,479 | +10.7 % |
| h closing move, not placed | 1,509,313 -> 1,656,843 | +9.8 % | 781,423 -> 900,073 | +15.2 % |
| i closing move after the tournament | 1,330,734 -> 1,478,264 | +11.1 % | 661,214 -> 779,864 | +17.9 % |
| **k closing move with the full quests report** | 2,240,149 -> 2,388,879 | +6.6 % | 1,241,819 -> 1,360,469 | **+9.6 %** |
| j tournament view | 370,628 -> 370,028 | -0.2 % | 303,728 -> 303,728 | 0 |

What is measured and what is derived:

- **Measured.** Every row above.
- **Derived.** The closing moves g, h, i, k of the gas suite end the game by `surrender`, which runs in `Lobby`:
  one call carrying `game_id`. A game that ends on its last `build` makes one call to `Lobby.report(tally)` after
  the move, carrying one `u128`. Its cost is derived as the same order, about +118,650 in release, not measured:
  the suite has no isolated build-closing scenario. The PR adds one (below).
- `spawn`, `claim`, `sponsor` and `discard` each pay one call; not measured here. No spawn or claim gas target
  exists.

**Effect on the CLIENT track.**

| Thing | After (e) |
|---|---|
| Contracts deployed (`contracts/deployments/devnet.json`, `contracts`) | Unchanged: `Account`, `Daily`, `Tutorial`, `Token`, same roles; the client calls `Daily` and `Tutorial` as today |
| New entry | `Lobby` is declared, not deployed: it has a class hash and no address. Recorded as a new top-level key `"classes": { "Lobby": "0x.." }`, not under `contracts` (which means an address). `packages/chain/src/deployment.ts` and `packages/indexer/src/deployment.ts` read only the named addresses, so they ignore it |
| ABIs (`contracts/abis/*.json`) | `Daily.json` and `Tutorial.json`: only the `constructor` entry changes (gains `lobby_class: ClassHash`). Every function, view, struct, enum and event is identical: ABI diff of the release classes, #242 -> prototype, 75 and 47 entries before and after. No new ABI file: the client never calls `Lobby` (`scripts/abis.sh` keeps its list) |
| Public views | Unchanged, and still computed in `Daily` and `Tutorial` (no call, no gas change: j measured) |
| Events | Unchanged. They are emitted by `Lobby`'s code during a library call, so their `from_address` is still `Daily` or `Tutorial`; same keys, data and order (the e2e event tests pass on the prototype) |
| Approve and spawn | Unchanged. `entry_price().token` is approved for the **`Daily` address**, then `Daily.spawn`. `Lobby.spawn` runs as `Daily`: its `transferFrom(player, Daily, price)` is made by `Daily`, and the tokens land on `Daily`. `claim` pays out of `Daily`'s balance as today |
| Indexer | Reads events from the same two addresses, `Daily` and `Tutorial`; nothing to change |
| What a player pays | Ordinary moves: no change. A game over, a discard, a surrender, a spawn, a claim: one library call more (about 119,000 L2 gas in release where measured) |

- **Access control.** Owner-only quest definitions keep their check, now in `Lobby`'s code
  (`assert_only_owner` on the caller's `Ownable` storage). `get_caller_address()` in a library call is the player
  or the owner who called `Daily`, so the player checks of discard and surrender are unchanged. `lobby_class` is
  written once by the constructor and has no setter. `Lobby`'s own entry points are reachable only on a deployed
  instance of the class, which would touch only that instance's storage: the deploy script only declares it.
  Changing the lobby later goes through the existing owner `upgrade` of `Daily`, with a new class that sets the new
  hash. A setter would be new access control (audit).
- **Goldens.** Identical: `build`, the structure state and the draw are not touched. Discard and surrender are the
  same component code in another class. Measured: the 21 golden tests pass on the prototype (1 ignored by its
  attribute). The e2e suite also passes (120 of 127) except for harness work the PR must do: 4 constructor tests pass the
  old calldata, and 3 tests exceed their gas budgets by the one call.
- **Deploy.** `scripts/deploy.sh` declares `Lobby` before `Daily` and `Tutorial`, passes its class hash as the last
  constructor argument of both, and writes `classes.Lobby` into `devnet.json`. `scripts/class-sizes.sh` (#242)
  lists `Lobby`. The smoke check is unchanged: it plays the Tutorial through the same entry points.
- **Audits (OPERATIONS).** No correctness audit: the structure-state algorithm is unchanged. A **security audit**
  is due: the paths that hold and pay tokens (spawn, claim, sponsor) and the owner-only paths now run through a
  library call, and that pattern is new in the repository. Points to check: caller and contract address under the
  library call, the immutability of `lobby_class`, that no `Lobby` entry point can be reached as `Daily` other than
  through `Daily`'s own wrappers, and that the flat storage variables match.
- **Room for P8.** P8 (`docs/programme/PLAN.md`: paid game, a moving mean shifted by profitability, the stake lost
  below a threshold) acts at spawn and at game over, both already in `Lobby`. The game-over call already carries
  the tally, whose low 32 bits are the score (`quests::encode`). An estimate, not a measure, of P8's code: the
  rolling mean in fixed point, a threshold check, a stored stake per game, one transfer and events. At most
  10,000 felts, judging by the 11,152 that P7 added with quiver. `Lobby` would then be at about 84 %. The move path
  and `Daily` do not grow with P8.

## 3. Recommendation

**Option (e).** It is the only option measured that meets all three targets at once:

| Target | (a) engine class | (b) two contracts | (e) lobby class |
|---|---|---|---|
| Every class <= 90 % with P7 and P8 | yes (76.8 / 70.9 / 51.5 %) | no (about 94 %, derived) | yes (88.4 / 81.4 / 71.7 %, Lobby about 84 % with P8) |
| Simple move at most +3 % | no (+4.3 % test, +5.3 % release on a) | yes (derived) | yes (+0.0 % measured) |
| Least change to the public interface | constructors only | new address, approval target, views and events move | constructors only |
| Audit | correctness (move rewritten) | security (new caller check, pool moves) | security (token and owner paths through a library call) |

Its cost: every game over, discard, surrender, spawn and claim pays one library call (+118,650 L2 gas in release,
measured on the closing moves; +9.6 % on the closing move with the full quests report). Its risk: `Daily` keeps
only 1,320 felts below 90 %. That is enough for P8, which goes into `Lobby`, but not for growth of the move code.
`scripts/class-sizes.sh` in CI catches it. The measured way out is (a) on top of (e), or (c2).

What reverses this choice: the PM rules that +3 % on a simple move may be exceeded (then (a) gives more room in
`Daily`); or the move code has to grow by more than 1,320 felts (then (a) or (c2)); or a security audit refuses
the library-call pattern for the token paths (then (b), with its interface changes).

## 4. Pull requests

Not stacked: each one branches from main and targets main (rule of the programme).

**PR S1. Lobby class (this split), on main, before #242 merges.**
- Goal. `Lobby` declared class with spawn, claim, sponsor, discard and surrender for both modes. `Daily` and
  `Tutorial` keep `build` and the views, and take `lobby_class` in their constructors. No P7 in it.
- Allowlist.
  - Code: `contracts/src/systems/{lobby,daily,tutorial}.cairo` (lobby new), `contracts/src/lib.cairo`.
  - Test setups and harness: `contracts/src/tests/setup.cairo`, `contracts/tests/setup.cairo`, and the
    constructor and budget lines of `contracts/src/tests/e2e/{access,views}.cairo`.
  - Gas tests: `contracts/tests/gas.cairo`, with new ceilings for g, h, i, the cause stated (one library call),
    and a new scenario l, "game over on the last `build`", isolated.
  - Deploy and generated files: `scripts/deploy.sh`, `contracts/deployments/{README.md,devnet.json}`
    (regenerated, `classes.Lobby`), `contracts/abis/{Daily,Tutorial}.json` (regenerated: constructors only).
  - Docs: `docs/measures/baseline.md` (sizes and gas), `docs/architecture/native-storage.md` (a "Classes"
    section), `docs/architecture/public-interface.md` ("Changes since publication": constructors).
- Acceptance.
  - Every class at most 90 % in release.
  - Goldens identical.
  - a0, a, b, c, d, e, f within +0.1 % of main in both profiles.
  - ABI diff: constructors only.
  - `scripts/deploy.sh devnet` passes its smoke check on a fresh devnet.
  - The e2e and access tests pass, plus a test that `Lobby`'s owner-only entry points revert for a non-owner
    through `Daily`.
- Audit: security (token and owner paths through a library call). Review as usual.

**#242 (P7) after S1.** It merges main and moves its additions to where (e) puts them:
- the quiver components, the `report` and the quest definitions go into `Lobby`;
- `Daily.build` and `Tutorial.build` call `Lobby.report(tally)` / `Lobby.tutorial_report()` only at game over;
- `scripts/class-sizes.sh` lists `Lobby`.

Acceptance as #242 plus the sizes of section 2 (e) (Daily at most 72,408, measured on the prototype) and k within
+0.2 % of the prototype's 2,388,879 (test profile). No new audit beyond #242's, unless S1's audit asks for one.

**P8.** Its code goes into `Lobby` (spawn and the game-over call). Its design names `Lobby`'s margin as its budget,
and `Daily`'s 1,320 felts as untouchable.

If #242 must merge before S1, the same split is done inside #242 instead (the prototype of section 2 (e) is that
diff), with the same acceptance and the security audit.
