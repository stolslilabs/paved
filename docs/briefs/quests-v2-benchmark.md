# Brief: quests and achievements v2, a benchmark of Nums and Glitchbomb and a proposal

Track CORE of Paved. The PM's go of 2026-10-14. This is an owner macro goal, and only v1 exists: `docs/architecture/quests.md`, with the Setup contract and its quest component. This task is documents only: **no contract change.** Commit this brief as `docs/briefs/quests-v2-benchmark.md`, as the first commit of your PR.

## Sources (read only)

- **Nums** at commit `4f8f405`: the clone `/home/claude/projects/nums`.
- **Glitchbomb** at commit `5efcbce`: the clone `/home/claude/projects/glitchbomb`.
- Read them ONLY with `git -C <clone> show <sha>:<path>`, `git -C <clone> ls-tree -r --name-only <sha>` and `git -C <clone> grep <pattern> <sha>`. **Never check out, reset, switch, stash or edit anything in those clones.** Other sessions use them.
- **Paved v1:** `docs/architecture/quests.md`, `contracts/src/systems/setup.cairo` and the quest and achievement components, `docs/architecture/indexer.md` and `leaderboard.md` (event mode: QuestCompleted and QuestClaimed are declared, not emitted), and the client's quest surfaces under `packages/` (read only).
- Cite file:line at the sha for every claim about Nums or Glitchbomb.

## Goal

1. **Benchmark**, with a table per topic for Nums, Glitchbomb and Paved v1:
   - the catalogue: which quests, which achievements, and their tasks;
   - the windows: daily, weekly, other, and how intervals are computed;
   - rewards: does completing or claiming pay anything (tokens, XP, unlocks, cosmetics)? How, from which budget or mint, and who can mint?
   - the claim flows: on-chain claim or event only, the storage they need, and the gas where known;
   - the client surfaces: where quests and achievements show, their progress display, and notifications.
2. **Propose a v2 for Paved**, as options with a recommendation:
   - catalogue additions that fit the game: closings (roads, cities, wonders, forests), scores, streaks, the Training and Tutorial modes, Challenge stakes. Each with its exact task definition, and whether today's events and views can drive it;
   - **whether quests pay a reward.** That touches the economy (PAVED's supply, the Vault, D-10), so it is **the owner's call.** Lay out the options: none, PAVED minted from a quest budget, a share of the Vault, non-token rewards. Give each one's effect on supply and abuse risk (bots, Training farming);
   - **what a claim would need:** storage mode versus event mode, per-player storage, gas, and the indexer and client changes;
   - **the link to XP and meta-progression,** which the owner mentioned as a future goal: how v2's data could feed it without locking a design in now.
3. **Write it to `docs/architecture/quests-v2.md`** (new). End with "For the PM", which separates:
   - what CORE can decide or build within decided scope (catalogue additions in event mode, for example);
   - what needs the PM;
   - what is the owner's: rewards that touch the economy, XP and meta-progression.

## Runs

- No build or test is needed. Read only.

## Git

- Push the branch the plugin created for this thread. Do not create or rename a branch.
- **Never `git rebase`**, never force-push. If main moves, `git merge origin/main`. Plain pushes only.

## Allowlist

- `docs/architecture/quests-v2.md` (new), `docs/briefs/quests-v2-benchmark.md`. No other file. Nothing in the Nums or Glitchbomb clones.

## PR

- Title: `docs: quests and achievements v2, the benchmark of Nums and Glitchbomb, and the options`.
- Use `gh pr create` with this line in the body: `Review: none — documents only (a benchmark and a proposal)`.
- Report: the PR's number and head, and a summary of the recommendation. Do not merge.
