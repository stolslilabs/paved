# Packages Economy UI + Testnet Simulation

## TDD Product Requirements Document

- Status: Draft for implementation planning
- Date: February 26, 2026
- Repository: `/Users/os/conductor/workspaces/paved/abu-dhabi-v2`
- Scope type: Packages-stack UI/data integration only (`packages/*`)

## 1. Problem Statement

Contract-side economy/token behavior is implemented, but the active packages-based client stack does not expose it end-to-end:

1. Economy metadata is not visible in the current UI.
2. Active package bindings/models do not include new economy fields.
3. App config is hardcoded to local dev values, so testnet simulation is not first-class.
4. Token mint + play flow exists in pieces, but not as a clear testnet user workflow with economy observability.

Result: we cannot reliably simulate and validate the full lifecycle from UI in the active stack:
`mint -> approve -> spawn -> play -> claim -> observe economy effects`.

## 2. Goals

1. Expose token and economy data in the packages UI stack (`packages/app-web`, `packages/ui`, `packages/chain`, `packages/game-core`).
2. Provide a first-class testnet-capable UX for token minting and gameplay.
3. Support full-loop simulation with user-visible telemetry.
4. Ship via strict TDD with clear red/green/refactor milestones.

## 3. Non-Goals

1. Rewriting contract economics logic.
2. Production tokenomics redesign.
3. Mobile (`React Native`) implementation in this phase.
4. Onchain analytics/indexer redesign beyond required queries.

## 4. Current State (Code Truth)

### 4.1 Contract status

1. Economy curve, snapshot lock, split/burn, claim multiplier, and tests exist in contracts.
2. `snforge test` passes with economy e2e tests.

### 4.2 Packages status gaps

1. Active chain models are stale and do not include economy fields.
2. `Game`/`Tournament` models in `packages/game-core` do not include multiplier snapshot fields.
3. `packages/app-web` uses direct Torii SQL for gameplay data and no economy-specific hook/UI.
4. `packages/app-web/src/main.tsx` is local-hardcoded and not environment/network-profile driven.
5. Token mint is called in account creation flow, but not surfaced as explicit wallet/token controls in UI.

### 4.3 Deployment artifact mismatch risk

Current checked-in deployment manifests used by app/build tooling appear behind source-level economy schema and contract set. This must be resolved before package codegen and runtime integration.

## 5. User Outcomes

1. As a player on testnet, I can view token balance and mint test tokens (where token supports faucet mint).
2. As a player, I can start games and play with approved token spend.
3. As a player, I can see session economy snapshot values (`supply`, `target`, `multiplier`) for my game.
4. As a player, I can claim rewards and observe resulting balance and economy deltas.
5. As a tester, I can run a repeatable simulation checklist in one environment.

## 6. Functional Requirements

### FR-001 Network Profiles

Add environment-driven network profile support in packages app:

1. `local-dev` (Katana + local Torii)
2. `slot-testnet` (Cartridge Katana endpoint)
3. `sepolia` (optional, only if token contract supports required UX)

Each profile must define:

1. `rpcUrl`
2. `toriiUrl`
3. `worldAddress`
4. `manifestPath/manifest object`
5. `token support flags` (e.g. `supportsMint`)

### FR-002 Token UX

Expose token controls in UI:

1. `balance` (existing polling hook reused or upgraded)
2. `mint` action (when `supportsMint=true`)
3. `approve` flow visibility/errors for spawn path
4. Transaction pending/error/success states

### FR-003 Economy Data Surface

Expose read paths for:

1. Per-game snapshot:
   - `entry_multiplier_fp`
   - `entry_supply_snapshot`
   - `entry_target_snapshot`
2. Tournament multipliers:
   - `top1_multiplier_fp`
   - `top2_multiplier_fp`
   - `top3_multiplier_fp`
3. Global economy singleton (when available in deployment):
   - `EconomyConfig`
   - `EconomyState`
4. Optional read API for `preview_multiplier(time)` for diagnostics.

### FR-004 UI Display

Display economy info in active UI:

1. Landing:
   - token balance + mint action
   - current network badge
2. Game screen:
   - locked snapshot card
   - effective multiplier (human-readable, e.g. `1.25x`)
3. Tournament context:
   - rank payout preview with multiplier-adjusted value

### FR-005 Simulation Flow

Document and support end-to-end simulation:

1. Create account (if needed)
2. Mint token
3. Spawn game
4. Complete game actions (build/discard/surrender path)
5. Claim reward
6. Verify balance + displayed economy values changed as expected

## 7. Non-Functional Requirements

1. No regression in existing game action UX (spawn/build/discard/surrender/claim).
2. Deterministic formatting for token/economy values (shared helpers).
3. Type-safe model surfaces across `game-core`, `chain`, `app-web`.
4. Keep polling/network load bounded (existing intervals retained or improved).
5. New logic covered by tests in each touched package.

## 8. Package-Level Design

### 8.1 `packages/game-core`

Add model-level economy fields and helpers:

1. Extend `GameData/Game` with:
   - `entry_multiplier_fp`
   - `entry_supply_snapshot`
   - `entry_target_snapshot`
2. Extend `TournamentData/Tournament` with:
   - `top1_multiplier_fp`
   - `top2_multiplier_fp`
   - `top3_multiplier_fp`
3. Add helpers:
   - `fpToMultiplier(fp: number): number`
   - `computeAdjustedReward(base, multiplierFp, fpScale=1_000_000)`

### 8.2 `packages/chain`

1. Regenerate/align bindings (`models.gen.ts`, `contracts.gen.ts`) with economy-enabled manifest.
2. Add adapters for new fields.
3. Add hooks:
   - `useEconomyState`
   - `useEconomyConfig`
   - `useGameEconomySnapshot(gameId)`
4. Add systems methods:
   - `mintToken`
   - optional `previewEconomyMultiplier`
5. Add network/profile config utilities consumed by app.

### 8.3 `packages/ui`

Add presentational components only:

1. `TokenPanel` (balance + mint button + state)
2. `EconomySnapshotCard` (supply/target/multiplier)
3. optional `RewardPreviewRow` for claim display

### 8.4 `packages/app-web`

1. Replace hardcoded chain config with env/profile selection.
2. Wire new chain hooks + UI components into `Landing` and `Game`.
3. Keep existing gameplay path intact.
4. Add simulation-oriented status copy/errors for token/economy actions.

## 9. Data/Binding Alignment Plan

Before package feature work:

1. Ensure deployment manifest used by app includes:
   - economy-enabled `Game`/`Tournament` fields
   - economy models/contracts if required by read path
2. Regenerate package bindings from that manifest.
3. Validate generated types expose required economy fields.

If manifest cannot be aligned, economy UI work should stop and return explicit blocker.

## 10. TDD Plan (Red-Green-Refactor)

## M1: Model + adapter surfaces

RED:

1. Add failing tests in `packages/game-core/__tests__/game.test.ts` and `tournament.test.ts` for new fields.
2. Add failing adapter tests in `packages/chain/test` for mapping economy fields from raw entities.

GREEN:

1. Implement model field additions and adapters.

REFACTOR:

1. Consolidate FP/multiplier utilities to shared helper module.

## M2: Chain systems + hooks

RED:

1. Add failing tests in `packages/chain/test/contracts.test.ts` for `mintToken` and economy calls.
2. Add failing tests for parsing `provider.call` shapes for economy reads.

GREEN:

1. Implement new systems methods and hooks.

REFACTOR:

1. Normalize call-result decoding paths.

## M3: UI components

RED:

1. Add failing tests in `packages/ui/__tests__` for:
   - `TokenPanel`
   - `EconomySnapshotCard`
2. Assertions for loading/error/disabled states.

GREEN:

1. Implement components and export from `packages/ui/src/index.ts`.

REFACTOR:

1. Reuse existing typography/badge primitives.

## M4: App integration

RED:

1. Add failing tests in `packages/app-web/__tests__`:
   - network profile resolution
   - landing token panel mapping
   - game economy snapshot mapping
   - claim reward preview calculation

GREEN:

1. Wire components/hooks into `Landing.tsx` and `Game.tsx`.
2. Replace hardcoded local config with profile-based config.

REFACTOR:

1. Extract all display formatting into dedicated utility module.

## M5: Simulation verification

RED:

1. Add failing test checklist document and optional script assertions for required flow steps.

GREEN:

1. Execute simulation on chosen testnet profile and record tx hashes + expected deltas.

REFACTOR:

1. Simplify operator runbook and remove duplication.

## 11. Test Inventory

### `packages/game-core`

1. `game` includes economy snapshot fields and preserves existing behavior.
2. `tournament.reward` adjusted payout helper uses rank multiplier correctly.

### `packages/chain`

1. `createSystems.mintToken` emits correct call.
2. `createSystems.previewEconomyMultiplier` parses tuple result correctly.
3. `useBalance/useEconomy*` handle bigint/string/array call results safely.

### `packages/ui`

1. Token panel renders balance and mint action states.
2. Economy snapshot card renders supply/target/multiplier formats.

### `packages/app-web`

1. Landing maps chain state to token/economy UI props.
2. Game page displays locked snapshot for loaded game.
3. Network profile parsing from env is deterministic.
4. Failure states (no mint support, missing economy rows) degrade gracefully.

### Integration/Manual acceptance

1. On selected profile, user can mint and then spawn game.
2. After claim, token balance increases by expected adjusted amount.
3. Displayed multiplier equals onchain snapshot multiplier for same game.

## 12. File-Level Change Scope (Planned)

### `packages/game-core`

1. `src/models/game.ts`
2. `src/models/tournament.ts`
3. `src/index.ts`
4. `__tests__/game.test.ts`
5. `__tests__/tournament.test.ts`

### `packages/chain`

1. `src/contracts.ts`
2. `src/models/adapters.ts`
3. `src/hooks/useBalance.ts` (or new token hook)
4. new hooks:
   - `src/hooks/useEconomyState.ts`
   - `src/hooks/useEconomyConfig.ts`
   - `src/hooks/useGameEconomySnapshot.ts`
5. `src/index.ts`
6. `test/contracts.test.ts`
7. regenerated:
   - `src/bindings/contracts.gen.ts`
   - `src/bindings/models.gen.ts`

### `packages/ui`

1. new components:
   - `src/components/TokenPanel.tsx`
   - `src/components/EconomySnapshotCard.tsx`
2. `src/components/index.ts`
3. `src/index.ts`
4. tests in `__tests__/`

### `packages/app-web`

1. `src/main.tsx` (network profile/env config)
2. `src/pages/Landing.tsx`
3. `src/pages/Game.tsx`
4. new utils/hooks for mapping/formatting
5. tests in `__tests__/`

## 13. Environment and Config Requirements

1. Add profile-driven env keys in app-web:
   - `VITE_CHAIN_PROFILE=local|slot|sepolia`
   - `VITE_RPC_URL`
   - `VITE_TORII_URL`
   - `VITE_WORLD_ADDRESS`
   - `VITE_SUPPORTS_TOKEN_MINT=true|false`
2. Manifest selection must match profile world deployment.
3. Token contract capabilities must be declared per profile (`mint` availability).

## 14. Risks and Mitigations

1. Risk: Manifest/bindings drift blocks economy fields.
   - Mitigation: explicit alignment gate before feature coding.
2. Risk: Testnet token may not support faucet mint.
   - Mitigation: capability flag + alternate faucet UX/path.
3. Risk: Hardcoded master key flow unsuitable for real users.
   - Mitigation: profile-specific auth strategy; isolate local-only defaults.
4. Risk: Torii query shape differences across environments.
   - Mitigation: robust parsing tests for all result shapes.

## 15. Acceptance Criteria

1. All new tests pass in `packages/game-core`, `packages/chain`, `packages/ui`, `packages/app-web`.
2. User can execute full simulation loop in selected testnet profile.
3. Economy snapshot shown in UI matches onchain game data.
4. Token mint button behavior correctly follows profile capability flag.
5. No regression in existing game action flow.

## 16. Open Decisions

1. Primary target profile for first release: `slot-testnet` vs `sepolia`.
2. Wallet UX for testnet: current burner/master flow vs controller/wallet connect.
3. Whether to expose global economy config/state in landing now or phase 2.

## 17. Execution Order

1. PR-1: Manifest/binding alignment gate + model field additions.
2. PR-2: Chain hooks/systems for economy + token actions.
3. PR-3: UI components (token/economy widgets) with tests.
4. PR-4: App integration + network profile config.
5. PR-5: Testnet simulation runbook + verification evidence.

