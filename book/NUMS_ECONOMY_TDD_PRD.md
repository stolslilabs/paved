# Paved x Nums Economy PoC

## TDD Product Requirements Document (PRD)

- Status: Draft for implementation scoping
- Date: February 25, 2026
- Repository: `/Users/os/conductor/workspaces/paved/abu-dhabi-v2`
- Scope type: Contract-first PoC with app/indexer integration

## 1. Problem Statement

Paved currently runs a fixed-entry, pooled-prize tournament economy:
- Entry price is static per mode (`Daily`, `Weekly`).
- Entry fees are transferred into system contract balance.
- Rewards are rank-split from `Tournament.prize`.

The Nums concept requires an adaptive issuance economy with:
- Supply-aware reward multiplier.
- Session-time lock of reward curve.
- Burn-on-entry sustainability loop.
- Transitional-to-steady-state target supply control.

## 2. Goals

1. Introduce a deterministic, onchain reward multiplier based on `current_supply` vs `target_supply`.
2. Lock multiplier at game purchase/spawn so player economics are predictable for that session.
3. Add supply target schedule `S_target(t) = a*t + b` with governance override.
4. Add burn pipeline on entry flow.
5. Implement all behavior with strict TDD gates (red -> green -> refactor).

## 3. Non-Goals (PoC)

1. Full production-grade DEX routing optimization.
2. Multi-token fee routing across many stables.
3. Complex anti-bot skill-difficulty adaptation.
4. Governance UI beyond admin/system calls.

## 4. Current State (Code Truth)

1. Payment flow:
- `Daily.spawn/Weekly.spawn` calls `hostable.spawn`, then `payable.pay`.
- Source: `contracts/src/systems/daily.cairo`, `contracts/src/systems/weekly.cairo`, `contracts/src/components/payable.cairo`.

2. Reward flow:
- Tournament payout is rank-based from `Tournament.prize`.
- Source: `contracts/src/models/tournament.cairo`.

3. Token:
- Token includes public faucet `mint()`.
- Source: `contracts/src/mocks/token.cairo`.

4. Frontend:
- Generated client pre-approves token then calls `spawn`.
- Source: `app/src/dojo/bindings/contracts.gen.ts`.

5. Gap:
- No economy config/state model, no per-session multiplier snapshot, no burn ledger.

## 5. Product Requirements

### 5.1 Functional Requirements

- FR-001: Compute reward multiplier from supply ratio at spawn time.
- FR-002: Lock multiplier to game/session and never recompute for that session.
- FR-003: Expose target supply as fixed or affine function of time (`a`, `b`, `t0`).
- FR-004: If supply >= `2 * target`, effective mint reward is zero.
- FR-005: Entry flow supports split allocation:
  - `team_bps` to treasury.
  - `burn_bps` to burn pipeline.
- FR-006: Contracts expose read APIs for current economy config and previewed multiplier.
- FR-007: All reward and burn-relevant state changes emit explicit events.
- FR-008: Backward compatibility for active tournaments is preserved (no retroactive multiplier mutation).

### 5.2 Non-Functional Requirements

- NFR-001: Deterministic arithmetic (fixed-point integer math only).
- NFR-002: Overflow-safe math for supply and reward operations.
- NFR-003: Test coverage for all boundary conditions in piecewise curve.
- NFR-004: No silent fallback in payment paths (explicit errors).

## 6. Economy Rules (PoC Exact)

### 6.1 Variables

- `S`: current circulating supply snapshot at spawn.
- `T`: target supply snapshot at spawn.
- `m`: locked reward multiplier (fixed-point).

### 6.2 Target Supply

- `T(t) = a * (t - t0) + b`.
- `a` signed integer slope (growth if positive, deflation if negative).
- `b` initial target at `t0`.
- Optional manual override flag to force fixed `T_override`.

### 6.3 Multiplier Curve (PoC piecewise linear)

Use scale `FP = 1_000_000`.

1. If `S <= T`:
- `m = FP + min(FP, ((T - S) * FP) / T)`.
- Range: `[1.0, 2.0]`.

2. If `T < S < 2T`:
- `m = FP - (((S - T) * FP) / T)`.
- Range: `(0.0, 1.0)`.

3. If `S >= 2T`:
- `m = 0`.

4. Edge safety:
- If `T == 0`, revert with `ECON_TARGET_ZERO`.

### 6.4 Session Lock

At `spawn`:
- Compute `S`, `T`, `m`.
- Persist them on `Game` (or session model) once.

At `claim`:
- Use locked `m` from session.
- Never use current global `S`/`T`.

### 6.5 Reward Formula (PoC)

- `reward_base = performance_to_base_reward(game_score, mode)`.
- `reward_minted = (reward_base * m) / FP`.

For PoC in Paved, keep tournament ranking for winner eligibility, but minted amount should be multiplier-adjusted. The rank-based split can remain as a compatibility layer in phase 1.

## 7. Proposed Data Model Changes

## 7.1 New Dojo Models

1. `EconomyConfig` (singleton key `id=1`)
- `id: u8`
- `target_mode: u8` (0 fixed, 1 affine)
- `target_fixed: felt252`
- `target_a: felt252` (signed encoded)
- `target_b: felt252`
- `target_t0: u64`
- `team_bps: u16`
- `burn_bps: u16`
- `max_multiplier_fp: u32` (default `2*FP`)
- `fp_scale: u32` (default `FP`)
- `manual_target_override: bool`
- `target_override: felt252`

2. `EconomyState` (singleton key `id=1`)
- `id: u8`
- `last_snapshot_time: u64`
- `last_supply: felt252`
- `last_target: felt252`
- `last_multiplier_fp: u32`
- `total_minted: felt252`
- `total_burned: felt252`
- `total_team_alloc: felt252`

3. `EntrySettlement` (key by `game_id`)
- `game_id: u32`
- `entry_amount: felt252`
- `team_amount: felt252`
- `burn_amount: felt252`
- `settled: bool`

## 7.2 Existing Model Extensions

1. `Game`
- Add `entry_multiplier_fp: u32`
- Add `entry_supply_snapshot: felt252`
- Add `entry_target_snapshot: felt252`

2. `Tournament` (optional in phase 1)
- Keep existing fields unchanged for compatibility.

## 8. Contract/API Changes

### 8.1 New System Contract

Add `contracts/src/systems/economy.cairo` with interface:

- `configure(config fields...)` admin-only.
- `preview_multiplier(time: u64) -> (supply, target, multiplier_fp)`.
- `snapshot_for_spawn(mode: Mode) -> (supply, target, multiplier_fp)`.
- `record_mint(amount: felt252)` internal/system-callable.
- `record_burn(amount: felt252)` internal/system-callable.

### 8.2 Hostable / Daily / Weekly Updates

1. `spawn` path:
- call economy snapshot.
- persist snapshot into game/session fields.
- compute entry split amounts.
- emit `EconomySnapshotLocked` and `EntrySplitComputed`.

2. `claim` path:
- compute reward from locked multiplier.
- transfer/mint according to payout mode.
- record mint in economy state.

3. `sponsor` path:
- unchanged in phase 1 unless explicitly included in burn split.

### 8.3 Payable Component Updates

Add settlement helpers:
- `pay_split(caller, total, treasury, burn_sink)`.
- `burn_from_contract(amount)` if token supports burn.

## 9. Token and Settlement Strategy

## 9.1 PoC Mode A (inside current repo, fastest)

- Use existing ERC20-like token.
- Add burn entrypoint to token mock.
- Entry split sends burn portion to burn sink and burns.
- No USD peg in this phase.

## 9.2 PoC Mode B (USD pegged path)

- Entry in stable token (e.g. USDC-like on Starknet).
- Split stable: treasury share transferred directly.
- Burn share swapped to native token by settlement executor.
- Burn purchased token.

Mode B requires new integration surface and is phase 2.

## 10. Event Requirements

Add events:
1. `EconomyConfigured`.
2. `EconomySnapshotLocked(game_id, supply, target, multiplier_fp)`.
3. `EntrySplitComputed(game_id, entry, team, burn)`.
4. `EntryBurnExecuted(game_id, amount)`.
5. `RewardMinted(game_id, player_id, reward_base, multiplier_fp, reward_final)`.

## 11. TDD Plan (Mandatory Red-Green-Refactor)

## 11.1 Test Inventory

### Unit tests

1. `contracts/src/helpers/economy_curve.cairo` tests:
- `test_multiplier_equals_2x_when_supply_zero_and_target_positive`
- `test_multiplier_equals_1x_when_supply_equals_target`
- `test_multiplier_equals_0_when_supply_equals_double_target`
- `test_multiplier_monotonic_decrease_between_target_and_double_target`
- `test_multiplier_reverts_when_target_zero`

2. `contracts/src/models/economy.cairo` tests:
- config validation (`team_bps + burn_bps == 10000`).
- affine target computation at known timestamps.
- override precedence behavior.

### Integration/e2e tests

1. `contracts/src/tests/e2e/economy_spawn_claim.cairo`:
- spawn locks snapshot once.
- claim uses locked multiplier even if global supply changes before claim.
- oversupply snapshot m=0 results in zero minted reward.

2. `contracts/src/tests/e2e/economy_entry_split.cairo`:
- entry split accounting for team/burn amounts.
- burn execution reduces circulating supply metric.

3. `contracts/src/tests/e2e/economy_compat.cairo`:
- existing daily/weekly flows still work.
- existing claim rank guards unchanged.

### App tests

1. `app/src/dojo/game/models/tournament.economy.test.ts`
- reward display uses locked multiplier metadata.

2. `app/src/hooks/useEconomy.test.ts`
- preview and snapshot values render correctly.

## 11.2 Milestone-by-Milestone TDD Steps

### Implementation Checklist (Live)

- [x] M1: Curve library
- [x] M2: Economy config/state models
- [x] M3: Spawn snapshot lock
- [x] M4: Claim reward uses locked multiplier
- [x] M5: Entry split and burn
- [x] M6: Frontend integration

### Verification Notes

- `sozo test` / `scarb test` are blocked in this environment by missing Scarb default registry configuration (`https://there-is-no-default-registry-yet.com`).
- App lint/tests are blocked in this environment because `eslint` is not installed in the current workspace runtime.

### M1: Curve library

RED:
- write unit tests for curve boundaries and monotonicity.
- run `sozo test` and confirm failures from missing curve implementation.

GREEN:
- implement minimal piecewise function.

REFACTOR:
- extract shared fixed-point helpers.

### M2: Economy config/state models

RED:
- tests for config validation and target computation.

GREEN:
- add model fields and validation logic.

REFACTOR:
- consolidate error constants and conversion helpers.

### M3: Spawn snapshot lock

RED:
- failing e2e proving `entry_multiplier_fp` is set at spawn.

GREEN:
- wire economy snapshot into spawn path.

REFACTOR:
- reduce duplication between daily/weekly system calls.

### M4: Claim reward uses locked multiplier

RED:
- failing e2e where supply changes between spawn and claim but payout remains tied to snapshot.

GREEN:
- claim computes payout from persisted snapshot values.

REFACTOR:
- isolate payout math into helper module.

### M5: Entry split and burn

RED:
- failing e2e for split amounts and burn accounting.

GREEN:
- implement split transfer + burn logic.

REFACTOR:
- centralize settlement event emission.

### M6: Frontend integration

RED:
- UI tests for economy preview and locked multiplier display.

GREEN:
- add hooks/components for economy metadata.

REFACTOR:
- remove duplicated formatting/conversion logic.

## 12. File-Level Change List (Planned)

Contracts:
1. `contracts/src/models/index.cairo` (new models + `Game` extension).
2. `contracts/src/models/economy.cairo` (new).
3. `contracts/src/helpers/economy_curve.cairo` (new).
4. `contracts/src/components/hostable.cairo` (spawn/claim updates).
5. `contracts/src/components/payable.cairo` (split/burn helpers).
6. `contracts/src/systems/economy.cairo` (new).
7. `contracts/src/systems/daily.cairo` (wire economy).
8. `contracts/src/systems/weekly.cairo` (wire economy).
9. `contracts/src/lib.cairo` (module exports).
10. `contracts/src/tests/setup.cairo` (register economy system/model).
11. New e2e and unit test files listed in Section 11.

App:
1. `app/src/dojo/bindings/contracts.gen.ts` (regen after ABI changes).
2. `app/src/dojo/systems.ts` (new economy calls).
3. `app/src/hooks/useEconomy.tsx` (new).
4. `app/src/ui/components/*` for multiplier and supply telemetry.

Docs:
1. `book/docs/pages/purchase.mdx` (replace placeholder).
2. `book/docs/pages/scoring.mdx` (link economy behavior).

## 13. Rollout Plan

1. Phase 0 (dev only): feature flag `ECONOMY_V2=false` by default.
2. Phase 1 (shadow mode): compute and store multiplier snapshots, keep old payout.
3. Phase 2 (active mode): payout uses locked multiplier and burn split.
4. Phase 3: stable-token entry and swap/burn executor integration.

## 14. Risks and Mitigations

1. Risk: Faucet mint breaks scarcity assumptions.
- Mitigation: disable/remove public faucet in non-test deployments.

2. Risk: Arithmetic precision drift.
- Mitigation: fixed-point constants, boundary tests, monotonicity tests.

3. Risk: Backward compatibility with existing tournaments.
- Mitigation: preserve old claim behavior when `entry_multiplier_fp == 0` legacy mode.

4. Risk: Burn path depends on token features.
- Mitigation: abstract burn via adapter interface and test both direct-burn and sink-burn modes.

## 15. Acceptance Criteria

1. All tests in Section 11 pass in CI.
2. For any game session, changing global supply after spawn does not change claim multiplier.
3. Multiplier boundaries hold exactly at `S=0`, `S=T`, `S=2T`.
4. Entry split math equals configured BPS allocations to the wei-equivalent unit.
5. Events emitted for every snapshot, split, burn, and reward mint.
6. Existing daily/weekly gameplay remains functional.

## 16. Out-of-Scope Questions Requiring Product Decision

1. Keep rank-based tournament rewards as base payout, or move to purely per-session performance mint?
2. Should sponsor deposits be subject to burn split?
3. In production, should burn be immediate onchain or batched by settlement executor?
4. Should target slope `a` be mutable continuously or epoch-gated?

## 17. Execution Order (PRs)

1. PR-1: Curve + Economy models + tests (no behavior change).
2. PR-2: Spawn snapshot lock + events + tests.
3. PR-3: Claim multiplier payout + tests.
4. PR-4: Entry split/burn + tests.
5. PR-5: Frontend telemetry + docs.

## 18. Definition of Done

1. TDD checklist satisfied for each milestone:
- failing test observed first.
- minimal implementation to pass.
- refactor with tests still green.

2. `sozo test` and app tests pass.
3. Docs updated and aligned with deployed behavior.
4. No unresolved critical risk in Section 14.
