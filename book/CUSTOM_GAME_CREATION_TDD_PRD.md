# Paved Configurable Game Creation - PRD/TDD Checklist

- Status: In progress
- Date: February 25, 2026
- Repository: `/Users/os/conductor/workspaces/paved/abu-dhabi-v2`
- Scope: Contracts + packages stack (`packages/app-web`, `packages/chain`, `packages/game-core`)

## 1. Product Scope Checklist

- [x] Support template-based creation (`template_id`).
- [x] Support explicit config creation (`GameConfigInput`) when policy allows.
- [x] Validate config onchain and return explicit, deterministic errors.
- [x] Snapshot effective config per game at creation.
- [x] Keep legacy mode-only `spawn()` flow operational.
- [x] Add read APIs for templates, validation preview, and effective config lookup.
- [ ] Emit creation/template/config events.
- [x] Restrict policy-sensitive fields to admin-managed controls.

## 2. Non-Goals Checklist (confirm out-of-scope)

- [x] No governance UI in PoC.
- [x] No community template marketplace in PoC.
- [x] No mid-game rule mutation in PoC.
- [x] No advanced anti-abuse systems in PoC.

## 3. Config Schema Checklist

- [x] Define `GameConfig` snapshot fields:
- [x] `config_id: u64`
- [x] `mode: u8`
- [x] `deck_id: u8`
- [x] `entry_price: felt252`
- [x] `duration_seconds: u64`
- [x] `tile_limit: u16`
- [x] `seed_policy: u8`
- [x] `scoring_profile_id: u16`
- [x] `character_profile_id: u16`
- [x] `allow_discard: bool`
- [x] `allow_surrender: bool`
- [x] `private_game: bool`
- [x] `access_root: felt252`
- [x] `metadata_uri_hash: felt252`

## 4. Policy Validation Checklist

- [x] Enforce `duration_seconds` min/max.
- [x] Enforce `entry_price` max policy.
- [x] Enforce deck/mode compatibility.
- [x] Require non-zero `access_root` for private games.
- [x] Reject invalid enum/profile IDs.
- [x] Guarantee no silent fallback to defaults for explicit config.

## 5. Data Model Checklist (Cairo/Dojo)

- [x] Add `GameConfigTemplate` model.
- [x] Add `GameConfigSnapshot` model (keyed by `game_id`).
- [x] Add `ConfigPolicy` singleton model.
- [x] Extend `Game` with `config_id`.
- [x] Register new models in setup/index wiring.

## 6. Contract API Checklist

- [x] Add configurable creation system (`contracts/src/systems/configurable.cairo`).
- [x] Implement `create_with_template(template_id: u32) -> u32`.
- [x] Implement `create_with_config(config: GameConfigInput) -> u32`.
- [x] Implement `register_template(template: GameConfigInput) -> u32` (admin).
- [x] Implement `set_template_enabled(template_id: u32, enabled: bool)` (admin).
- [x] Implement `preview_validation(config: GameConfigInput) -> ValidationResult`.
- [x] Implement `get_effective_config(game_id: u32) -> GameConfigSnapshot`.

## 7. Legacy Compatibility Checklist

- [x] Keep existing external daily/weekly/tutorial spawn signatures unchanged.
- [x] Route legacy `spawn()` internally to default templates.
- [x] Ensure legacy-created games persist `GameConfigSnapshot`.
- [x] Ensure legacy gameplay behavior matches current production expectations.

## 8. Hostable/Gameplay Wiring Checklist

- [x] Add internal spawn path accepting effective config.
- [x] Replace mode-hardcoded runtime parameters with snapshot config reads.
- [x] Keep a single internal spawn pipeline to reduce divergence.

## 9. Event Checklist

- [ ] `TemplateRegistered(template_id, version)`
- [ ] `TemplateStatusUpdated(template_id, enabled)`
- [ ] `GameCreatedWithTemplate(game_id, template_id, config_id)`
- [ ] `GameCreatedWithConfig(game_id, creator, config_id)`
- [ ] `GameConfigSnapshotted(game_id, config_id)`
- [ ] Optional: `ConfigValidationFailed(creator, code)`

## 10. Packages Integration Checklist

- [x] `packages/chain`: extend create-game params for `templateId?` and `configInput?`.
- [x] `packages/chain`: route calldata to correct entrypoint.
- [x] `packages/chain`: expose validation preview calls.
- [x] `packages/game-core`: add shared `GameConfig` and validation mirror types.
- [x] `packages/app-web`: template selection UX for creation.
- [x] `packages/app-web`: advanced explicit-config panel (feature-flagged).
- [x] `packages/app-web`: surface field-level validation errors.

## 11. TDD Checklist (Red -> Green -> Refactor)

### M1. Config model + validator primitives
- [x] RED: failing validator boundary tests exist first.
- [x] GREEN: minimal validator implementation passes.
- [x] REFACTOR: shared validation helpers extracted.

### M2. Template registry + policy model
- [x] RED: failing template/policy tests exist first.
- [x] GREEN: template registry + policy enforcement pass tests.
- [x] REFACTOR: admin/policy checks consolidated.

### M3. Create with template path
- [x] RED: failing e2e for template creation + snapshot.
- [x] GREEN: template creation succeeds and snapshot persists.
- [x] REFACTOR: spawn setup deduplicated.

### M4. Create with explicit config path
- [x] RED: failing e2e for valid and invalid explicit configs.
- [x] GREEN: explicit config path validates and persists snapshot.
- [x] REFACTOR: unify with template path via one internal spawn function.

### M5. Legacy spawn compatibility routing
- [x] RED: failing compatibility tests for daily/weekly/tutorial.
- [x] GREEN: legacy `spawn()` routes to defaults and passes.
- [x] REFACTOR: mode-to-template mapping centralized.

### M6. Packages client integration
- [x] RED: failing package tests for chain/app-web/game-core.
- [x] GREEN: UI + adapter wiring passes.
- [x] REFACTOR: shared form schema/types reduced duplication.

## 12. Test Inventory Checklist

### Cairo unit tests
- [x] `test_rejects_duration_below_min`
- [x] `test_rejects_duration_above_max`
- [x] `test_rejects_invalid_deck_for_mode`
- [x] `test_rejects_private_game_without_access_root`
- [x] `test_accepts_valid_minimal_config`
- [x] Template enable/disable tests
- [x] Template versioning tests

### Cairo integration/e2e tests
- [x] create with template succeeds
- [x] template snapshot persisted correctly
- [x] create with valid explicit config succeeds
- [x] create with invalid explicit config reverts with expected code
- [x] legacy daily/weekly/tutorial spawn still works
- [x] legacy spawn snapshot matches defaults
- [x] gameplay reads duration/discard/surrender from snapshot

### Packages tests
- [x] `packages/chain` calldata routing tests
- [x] `packages/app-web` template selection flow tests
- [x] `packages/app-web` advanced config validation/error tests
- [x] `packages/app-web` create dispatch entrypoint tests
- [x] `packages/game-core` type/validator tests

## 13. Files to Change Checklist

### Contracts
- [x] `contracts/src/models/index.cairo`
- [ ] `contracts/src/models/config_template.cairo` (new)
- [ ] `contracts/src/models/config_policy.cairo` (new)
- [x] `contracts/src/helpers/config_validation.cairo` (new)
- [x] `contracts/src/components/hostable.cairo`
- [x] `contracts/src/systems/configurable.cairo` (new)
- [ ] `contracts/src/systems/daily.cairo`
- [ ] `contracts/src/systems/weekly.cairo`
- [ ] `contracts/src/systems/tutorial.cairo`
- [x] `contracts/src/lib.cairo`
- [x] `contracts/src/tests/setup.cairo`
- [x] New unit/e2e test files

### Packages
- [x] `packages/chain/src/contracts.ts`
- [x] `packages/chain/src/hooks/useActions.ts`
- [x] `packages/app-web/src/pages/Landing.tsx`
- [x] `packages/app-web/src/pages/Game.tsx`
- [x] `packages/game-core/src/types/mode.ts` (or new config module)
- [x] `packages/game-core/src/index.ts`
- [x] Package-level test files

### Docs
- [x] `book/docs/pages/create.mdx`
- [x] `book/docs/pages/intro.mdx`

## 14. Rollout Checklist

- [ ] Phase 0: ship behind `CONFIG_CREATE_V1=false`.
- [ ] Phase 1: enable template creation only.
- [ ] Phase 2: enable explicit config for whitelist.
- [ ] Phase 3: public explicit config with hardened policy.

## 15. Risk Control Checklist

- [x] Add policy constraints to limit game imbalance.
- [x] Add dedicated legacy compatibility regression tests.
- [x] Keep one internal spawn source of truth.
- [x] Keep schema parity across contracts and packages.

## 16. Product Decision Checklist (must resolve)

- [ ] Decide if explicit config is public at launch or restricted.
- [ ] Decide which fields are user-configurable in phase 1.
- [ ] Decide if private game access list is required in phase 1.
- [ ] Decide if template authorship is admin-only initially.

## 17. PR Sequence Checklist

- [ ] PR-1: config model + validators + tests
- [ ] PR-2: template registry + policy + tests
- [ ] PR-3: template creation path + snapshot + tests
- [ ] PR-4: explicit config path + tests
- [ ] PR-5: legacy compatibility routing + tests
- [ ] PR-6: packages integration + docs

## 18. Definition of Done Checklist

- [ ] Every milestone satisfies RED -> GREEN -> REFACTOR evidence.
- [x] `sozo test` passes.
- [x] Package tests pass.
- [x] Docs updated for new creation flows.
- [ ] No unresolved high-severity risk remains.
