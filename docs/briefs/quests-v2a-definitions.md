# Brief: quests v2a, definitions only, shipped by the fresh deployment

Track CORE of Paved. The PM's rulings of 2026-10-14 on `docs/architecture/quests-v2.md` (#421): v2a now, with definitions only through Setup's owner calls, carried by deploy.sh's fresh path so that the fresh Sepolia deployment ships them. A review follows; no audit (it adds no value path: no reward). Commit this brief as `docs/briefs/quests-v2a-definitions.md`, as the first commit of your PR.

**Machine: the VPS.**

## Goal

1. **The v2a catalogue** as Setup definitions, from quests-v2.md's class (A) rows:
   - the rotating daily set (Setup's start offset in whole days);
   - the weekly quests;
   - the higher tiers.

   Use exactly the definitions quests-v2.md gives: ids, tasks, counts, windows, offsets. Where it leaves a choice open, pick it and say so in the PR. **No reward on any of them** (the PM asks the owner the reward question, with R0 as the default).
2. **Reserve task ids 11 to 18** in `contracts/src/constants.cairo` (or where task ids are defined), as named constants or a documented reserved range, so no other use takes them. No behaviour change. If reserving them needs more than constants and comments, stop and report.
3. **deploy.sh's fresh path defines them**, in the same run as today's v1 definitions, through the same Setup owner calls.
   - The record keeps them (a rerun sends nothing new).
   - The smoke or the checks read back that each v2a quest and achievement is defined as specified.
   - `--check-only` covers them.
   - devnet.json is regenerated only if the fresh devnet path's output changes; use `--unmerged` for rehearsals so the tracked file is not overwritten unless that is intended, and say which.
4. **Tests:** test-deploy-url.sh cases for the new definitions' calls and read-backs (against the fake node). A local devnet run of `deploy.sh devnet --unmerged`, showing the v2a definitions on chain, recorded in the PR.
5. **The indexer:** check whether the indexer and client already handle the new windows (the daily offset, weekly) and the new ids. If they need tests or code, that is CLIENT's (META's) part: list exactly what, under "For CLIENT" in the PR. Do not edit `packages/**`.
6. **Docs:**
   - `docs/architecture/quests.md`: the v2a catalogue as built;
   - quests-v2.md: a line "v2a: built in #<this PR>";
   - the release-day checklist (`docs/programme/sepolia-release-day.md`): the v2a definitions to expect, in the checks of the fresh deploy.

## Runs (VPS)

- scarb and snforge through the shims on PATH only (plain `scarb`, `snforge`). Never prepend `~/.asdf/installs` to PATH or call a binary by its path. At most one Cairo build or test run at a time on the VPS: the shim lock queues them.
- `PAVED_SCARB_SHIM` and `PAVED_SNFORGE_SHIM` are test hooks only. Never point them at real binaries.
- starknet-devnet: the direct path `~/.asdf/installs/starknet-devnet/0.10.0/bin/starknet-devnet` on a free port, stopped by its PID. Devnet keys only.
- Run the whole test-deploy-url.sh once at the end, as CI does (empty HOME, PATH=/usr/bin:/bin), and give its summary.
- If a read or command is refused, report its exact text. Do not route around it.
- Never use or print the `STARKNET_*` variables. **Nothing is sent to Sepolia or any public network.**

## Git

- Push the branch the plugin created for this thread. Do not create or rename a branch.
- **Never `git rebase`**, never force-push. If main moves, `git merge origin/main`. Plain pushes only.

## Allowlist

- `scripts/deploy.sh`, `scripts/test-deploy-url.sh`.
- `contracts/src/constants.cairo` (the reserved range only), and a test of it if needed.
- `contracts/deployments/devnet.json`, only if the fresh devnet output changes (say so).
- `docs/architecture/quests.md`, `quests-v2.md` (one line), `docs/programme/sepolia-release-day.md` (the v2a checks).
- `docs/briefs/quests-v2a-definitions.md`.
- Not `packages/**` (CLIENT's), not other contract code, not `contracts/abis/**` (no ABI change).

## PR

- Title: `feat: quests v2a, the rotating daily set, weekly quests and higher tiers as definitions, shipped by the fresh deploy`.
- Body:
  - the catalogue table;
  - the reserved ids;
  - the deploy.sh calls and checks;
  - the devnet run;
  - "For CLIENT";
  - one line on why no audit (no reward, no value path).
- Report: the PR's number and head, the commands with their outputs. Do not merge.
