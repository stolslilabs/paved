# D-20a brief: tournaments leave the code, the documents (no code)

Track CORE of Paved. Documents only: no file under `contracts/`, `scripts/` or `packages/` changes. Commit this brief
as `docs/briefs/d20a-no-tournaments-docs.md`, as the first commit of your PR.

## The decision (owner, via the PM, 2026-10-13)

**D-20.** Tournaments leave the code. The owner does not want to keep that feature.

**The PM's rulings** (PM, 2026-10-13). Record them as **P-48**:
1. **These go:**
   - the day prize pool and everything around it: `sponsor`, `claim` and `reclaim`;
   - the `Tournament` model and the prize storage;
   - the `Sponsored` and `Claimed` events;
   - the on-chain Top3, if only prizes use it.
2. **These stay:**
   - the daily seed and the day id;
   - the economy settlement;
   - the daily leaderboard. It is the owner's own goal ("daily seed and leaderboard"), and the indexer can serve it.
   If something else reads the on-chain ranking (the economy mean, the quests, the keeper), show it, and keep what it
   needs.
3. An audit follows the implementation (security and economy lenses): the change touches code that holds and pays
   tokens.
4. Sepolia: D-20 ships in the later upgrade, with D-19. D-18c is not held for it. The test prize funds left in
   `Daily` on Sepolia are reported before that upgrade removes their claim path.
5. Storage follows P-42: removed fields are left dead, never reused.

**The PM's further rulings, from CLIENT's inventory** (PM, 2026-10-13). Add them to P-48:
6. **On the Podium** (`quests.md`, P-22/O-37) today reads the prize slots of `Daily.tournament`. From D-20 it is
   credited from the indexer's daily leaderboard: the top 3, by the leaderboard's existing ranking rule.
7. **The indexer replays history strictly.** `Sponsored`, `Claimed` and `Reclaimed` stay documented as past events
   (their layouts kept in the docs); CLIENT keeps them known as skipped.
8. **Sepolia order:** the D-20 upgrade goes together with the indexer's rebuild (schema 7), right after CLIENT's
   PR 1 merges.

## What to write

1. **`docs/programme/DECISIONS.md`**: two rows after the last one, in the table's format.
   - D-20: who "owner, via the PM", date 2026-10-13. What reverses it: "The owner brings tournaments back".
   - P-48: the five rulings, condensed. Who "PM", date 2026-10-13. What reverses it: "A contract fact that something
     kept depends on what goes".
   - Mark rows that D-20 makes obsolete (P-31, P-37 and any other prize or tournament ruling) as "(reversed by
     D-20)". Do not delete any row.
2. **An inventory: what goes and what stays.** Add a section "D-20: tournaments leave the code (planned)" to
   `docs/architecture/leaderboard.md`, or to the note that holds the prize design today (say which, and why). Read it
   from main's code, and cite file:line for each item.
   - **Every piece of the prize path:**
     - entry points: `claim` (`systems/daily.cairo:17`), `sponsor`, `reclaim`, and any `Lobby` or `Tutorial` one;
     - components: `components/hostable.cairo`;
     - models: `models/tournament.cairo`, and fields in `models/index.cairo` and `game.cairo`;
     - storage: the prize and sponsor maps, the `Tournament` records;
     - events: `Sponsored`, `Claimed`;
     - views: `views.cairo`;
     - constants;
     - the token movements, and who holds the tokens: is it `Daily`, or `Vault` (`economy/vault.cairo`)?
   - **Top3 and the on-chain ranking** (`leaderboard.cairo`). Who writes it, and who reads it besides the prize:
     - the economy mean and the settlement;
     - the quests (`quests.cairo`);
     - the keeper;
     - `GameOver`;
     - the views.
     For each reader, say whether it needs the ranking. Then state what stays (a ranking, a best score per day, or
     nothing on chain) and what goes.
   - **The daily seed, the day id and the settlement**: show they do not depend on what goes.
   - **Storage under P-42**: every map or field that becomes dead. Name each one, and say that it stays declared,
     never written or read, never reused.
   - **What `Lobby` and `Tutorial` lose.** Does `Lobby`'s class change? `lobby.cairo` cites tournaments.
   - **The tokens.**
     - Can funds be stuck once `claim` and `reclaim` go: sponsored but unclaimed prizes, or prizes of past days?
     - What must the Sepolia upgrade do first? (Read the code only. Nothing is sent and nothing is read on chain in
       this task: the Sepolia figure comes with the implementation.)
     - Propose how part B reads and reports them.
   - **The mocks and tests that go** (`mocks/reentrant_token.cairo`, if only the prize uses it), and the goldens: do
     any golden or expected score change? (They should not.)
3. **`docs/architecture/public-interface.md`**: a section "Breaking change D-20".
   - The ABI diff for `Daily`, `Tutorial` and `Lobby`, read from `contracts/abis/**`: every entry point, view,
     struct and event that goes or changes. Keep the D-19 section and every other line as they are.
   - The stability promise: say that D-20 is a stated exception, as D-18 was.
   - **Past events** (ruling 7): `Sponsored`, `Claimed` and `Reclaimed` (check the exact name of the third in
     `events.cairo`) stay documented with their layouts, as events emitted before D-20 that an indexer replaying
     history must still know and skip.
   - **The day id in `GameSpawned` and `GameOver`:** say whether both keep the day id (or the tournament id that
     carries it) after D-20, with the field names and layouts. The daily leaderboard groups on it. If either event
     carries it only as `tournament_id`, say whether the field stays (same layout, the day id) or changes, and
     flag a change under "For the PM".
4. **`docs/architecture/quests.md`** (ruling 6): rewrite On the Podium's source: from D-20, it is credited from the
   indexer's daily leaderboard, the top 3 by its existing ranking rule (name the rule and where it is written).
   Say what the contract still does for that quest (nothing on chain, or a counter), from the code.
5. **The other notes that describe the prize** (`economy.md`, `class-headroom.md`,
   `native-storage.md`): add a one-line "Planned: D-20 removes …" pointer
   where they describe the prize. No other edit. Do not edit CLIENT's or META's notes (`client-*.md`,
   `docs/client/**`) or `indexer.md`: list them in the PR body instead.

## Facts first

Check each fact against the code on main. If a ruling is wrong for the contracts (something kept reads what goes),
do not change the ruling. Write what the code says, and flag it under "For the PM" with file:line.

## For other tracks (PR body only)

- **META (indexer):** the events that go, and whether the indexer decodes `Sponsored` or `Claimed` or serves prizes
  (`packages/indexer/**`, read only). Can it serve the daily leaderboard alone?
- **CLIENT:** the entry points and views that go; what the client shows of prizes today (`packages/**`, read only).

## Allowlist

- `docs/programme/DECISIONS.md`.
- `docs/architecture/leaderboard.md` (or the note you name), `docs/architecture/public-interface.md` (a new D-20
  section only).
- `docs/architecture/quests.md`: On the Podium (ruling 6) and pointers.
- One-line pointers in: `economy.md`, `class-headroom.md`, `native-storage.md` (under
  `docs/architecture/`).
- Not `structure-state.md` or `upgrades.md`: the D-19b PR holds them now. List there what D-20b must add.
- `docs/briefs/d20a-no-tournaments-docs.md`.
- Nothing else.

## Checks

- Documents only. `ci` must be green.
- Read the result once against this brief: every ruling is there, and nothing contradicts D-20.

## Git

- Push the branch the plugin created for this thread. Do not create or rename a branch.
- **Never `git rebase`.** If main moves, `git merge origin/main`. Plain pushes only.

## PR

- Title: `docs: D-20, tournaments leave the code (decision, inventory, ABI diff)`.
- Body:
  - the summary;
  - the inventory in short: what goes, what stays, and who reads the ranking;
  - "Tokens at risk";
  - the Sepolia order (ruling 8);
  - "For the PM";
  - "For META";
  - "For CLIENT".
- Report: the PR's number and head, the diff stat, each fact checked (file:line), and the CI result. Do not merge.
