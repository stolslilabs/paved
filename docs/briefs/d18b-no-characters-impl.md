# D-18b brief: characters leave the game, the implementation

Track CORE of Paved. A change of the structure-state algorithm and of the published ABI. A review and a
correctness-lens audit follow. Commit this brief as `docs/briefs/d18b-no-characters-impl.md`, as the first commit of
your PR.

## The specification (merged in #320, 07aab8a)

- D-18 and P-45 in `docs/programme/DECISIONS.md`.
- `docs/architecture/structure-state.md`, section "D-18: scoring without characters (planned)": the formulas, the
  closing conditions, what goes, the storage left as dead slots, the forest scan, the end of a game, and the goldens.
- `docs/architecture/public-interface.md`, section "Breaking change D-18": the ABI diff, Tutorial, the remaining views
  with their exact fields, and the quests.
Implement what they say. Where the code shows they are wrong, follow the code's truth, fix the note in the same PR,
and say so in the PR body under "Spec corrections".

## Rulings to apply (PM's P-45, and CORE for the points the note leaves open)

1. Every structure (road, city, wonder, forest) scores once, on the move that closes it, with power 1 and weight 1.
   Adventurer and Paladin's power 2 goes with them. That is P-45 ruling 1.
2. Forest: closed when `open == 0` and every adjacent road is closed. Points = (distinct closed road roots + distinct
   closed city roots) x 300 x bonus(size). P-15 stays. One `Scored` (FOREST) and one `count_forest` per forest.
3. **A forest that scores 0 points still emits its `Scored`**, as today (CORE, 2026-10-13: it keeps the quests' unit
   "one per forest closure"). Reversed if the PM rules otherwise.
4. **Once per move.** Keep a per-move set of scored roots, so that a root reached from two start spots, or a wonder
   reached from two sides, scores once. Test that case for each category.
5. Open at game end: nothing scores (already so).
6. `role` and `spot` leave `Daily.build` and the Tutorial's path. The `characters` view goes. `builder` keeps
   `game_id, player_id, tile_id, plan`. The remaining views and their fields must be exactly as public-interface.md
   lists them; if you must differ, fix the note and say so (CLIENT's `VIEW_FIELDS` match it).
7. **Events.** `Scored` keeps its layout. `Built` loses `role` and `spot`, as the note says. Change no other event.

## Storage and the upgrade (D-17)

- No field is renamed or retyped. `chars` in `Record`, the `Characters` map, `GameState.characters` and
  `Tile.occupied_spot` stay declared and become dead (never written, never read). Remove the code that uses them.
- `Lobby` shares one storage layout with `Daily` and `Tutorial` (P-42). Say whether `Lobby`'s class changes, and
  whether Sepolia needs a new `lobby_class` (`set_lobby_class`).
- **Games open across the upgrade (PM, 2026-10-13).** No character left on such a game may score, or block a spot.
  State in the PR how those games end: scored under the new rules, or settled as they are. Prove it with a test:
  - deploy today's `Daily` class (main at 07aab8a);
  - play a game that places characters on open structures: a road, a city, a forest and a wonder if possible;
  - upgrade to the new class;
  - finish the game. Show what scores, that nothing double-scores (in particular a structure scored before the
    upgrade, whose `chars` were cleared, and an open one whose root still holds `chars`), and that no spot is blocked.
  Do the same for one Tutorial game if Tutorial's path differs.
- The Sepolia rollout is an upgrade of `Daily` and `Tutorial` (CORE's default). If the test shows open games cannot
  be ended consistently, stop and report with the evidence. A fresh deploy is then decided by me.

## Measures

- `scripts/class-sizes.sh` before and after. **`Daily` must stay at or under 72,947 CASM felts (P-44).** Removing the
  characters should free room; give the figure and the headroom.
- Gas: the scenarios of `docs/measures/baseline.md`, before and after, with a new "After D-18" table. Scenarios e and
  f measure the forest scan, which now runs on every forest closure. Add a scenario that closes a forest that held no
  character before D-18, if no existing one covers it.
- Ceilings in `contracts/tests/gas.cairo` are reset to the new figures, as the earlier phases did: the measured value
  plus the same margin. Say the margin.

## Goldens and oracle

- Regenerate the goldens from the new rules: `src/tests/golden/daily.cairo`, `forest.cairo`, `full_deck.cairo`,
  `tutorial.cairo`, `harness.cairo`, and `docs/measures/golden-games.md`.
- **Independence.** The new expected scores must not come from running the new code. Derive them from the oracle's
  walks, rewritten to the no-character rules (`src/tests/oracle.cairo`, `src/tests/differential.cairo`). Then check
  the structure state against them. Hand-check one golden game's totals in the PR body, structure by structure.
- The oracle's check "forest left unscored" becomes "closed structure left unscored". It covers every category.

## ABIs

- Regenerate with `scripts/abis.sh`. The `Contract ABIs up to date` job must pass. CLIENT's tests will fail on main
  until CLIENT's PR follows: the PM set the merge order. CLIENT's first PR is built on this branch and merges right
  after this one. Do not touch `packages/**`.

## Runs (VPS, D-251)

- scarb 2.20.1 and snforge 0.64.0 from `~/.asdf/installs/`.
- snforge: `RAYON_NUM_THREADS=1 prlimit --as=16106127360 -- /usr/bin/time -v snforge test <filter> --max-threads 2`.
- scarb build: `prlimit --as=12884901888`.
- Only after `free -g` shows 8 GB or more available. One build at a time. Record the peaks.
- Scoped runs first: the structure-state, forest, assessment, golden, oracle, differential, e2e, upgrade and gas
  tests, and `class-sizes.sh`. The whole suite once, at the end.
- A capped run with no progress for 15 minutes is stopped and reported.
- Never use or print the `STARKNET_*` variables. Nothing is sent to any network.

## Git

- Push the branch the plugin created for this thread. Do not create or rename a branch: CLIENT builds on it.
- Never `git rebase`, never force-push. If main moves, `git merge origin/main`. Plain pushes only.
- Push early (after the first compiling commit), so CLIENT can start from the branch.

## Allowlist

- `contracts/src/**`, `contracts/tests/**`.
- `contracts/abis/**`, through `scripts/abis.sh`.
- `docs/architecture/structure-state.md` (the D-18 section becomes "As built: D-18"), `public-interface.md` (only
  to confirm or correct the D-18 section), `quests.md` (only if a quest unit differs from the note),
  `class-headroom.md`, `docs/measures/baseline.md`, `docs/measures/golden-games.md`.
- `docs/briefs/d18b-no-characters-impl.md`.
- Not `packages/**`, not `scripts/**`, not `contracts/deployments/**`. If `scripts/deploy.sh` passes a role or a
  spot anywhere, say so; do not change it.

## PR

- Title: `feat: D-18, characters leave the game (scoring on closure, ABI break)`.
- Body:
  - the summary;
  - the ABI diff, as built;
  - the open-games answer, with its test;
  - sizes before and after, with Daily's headroom under the cap;
  - gas before and after, forest scenarios first;
  - the goldens and the oracle, and the hand-checked game;
  - "Spec corrections";
  - Lobby and `lobby_class`;
  - "For CLIENT": the branch name and the exact view fields;
  - one line on why an audit is asked: a change of the structure-state algorithm, the result every score depends on.
- Report: the PR's number and head, everything in the body, and the peaks. Do not merge.
