# D brief: the tutorial leaves the contracts, Lobby's cold paths return, and Setup holds the quests (D-21 + D-24)

Track CORE of Paved. Step D of the D-25 order (P-53): D-21 and D-24 folded into one PR, built as `Setup`. A review and
two audits follow: security (who may report for whom, P-51 ruling 6; the Setup access control, P-52 ruling 5) and
economy (the purchase and the record move from `Lobby` back into Challenge). Commit this brief as
`docs/briefs/d-setup-quests.md`, as the first commit of your PR.

## The specification (merged in #332, cde34ff; #334 649d451)

- Decisions in `docs/programme/DECISIONS.md`:
  - D-21, D-22, P-49 (the tutorial goes off chain; the claim);
  - D-24, P-51 (Lobby's cold paths, the quest system);
  - D-25, P-52, P-53 (the system is named Setup; Account's wiring moves to Setup in step E, not here).
- `docs/architecture/leaderboard.md`:
  - "D-21: the tutorial leaves the contracts": what goes; it touches no structure-state code; what `Lobby` and
    `Collection` lose; the storage left dead; the claim;
  - "D-24: Lobby's cold paths and a quest system": every path of `Lobby` and where it goes; what stays dead; the CASM
    projection; the quest code today; the design.
- `docs/architecture/public-interface.md`: "Breaking change D-21" and "Breaking change D-24".
- `docs/architecture/quests.md`.
- `docs/architecture/glitchbomb-gap.md`, section 4 (Setup).

Implement what they say. Where the code shows a note is wrong, follow the code's truth, fix the note in the same PR, and
say so under "Spec corrections". Main has moved since the notes were written: D-19b (#331), D-20b (#337) and the systems
layout (#342) are merged, so the line numbers in the notes are stale. Re-read the code.

## What to build

1. **The tutorial leaves (D-21, P-49 ruling 1).**
   - Remove `systems/tutorial.cairo`, `components/tutoriable.cairo` and the tutorial deck
     (`elements/decks/tutorial.cairo`, and its use in `types/deck.cairo` and `helpers/random_deck.cairo`).
   - Remove the tutorial branches in `Lobby` (`tutorial_*`, `finish_tutorial`), `Collection`, `hostable`, `views`,
     `seed`, `quests` and the rest.
   - `Mode::Tutorial`'s code becomes dead: never reused (P-42, P-49 ruling 4). Keep the variant or its value reserved,
     and say how.
   - Remove the tutorial golden (`tests/golden/tutorial.cairo`) and the tutorial tests. List them.
   - The Sepolia `Tutorial` stays deployed and unused. Nothing here touches it.
2. **Lobby's cold paths return (D-24, P-51 ruling 1).**
   - `spawn` (with the purchase and the mint), `discard`, `surrender` and the game-over finish go back into `Daily`'s
     own code. The library-call wrappers go, and so do `set_lobby_class`, `ILobbyClass` and `LobbyClassSet`.
   - The constructor loses its `lobby_class` argument.
   - The `lobby_class` slot and the substorage members that only `Lobby` used stay declared, dead, never reused, with a
     comment each (P-42).
   - **The `Lobby` class is deleted** (`systems/lobby.cairo`). The name Lobby is reserved for multiplayer (P-51
     ruling 2).
   - If `Daily`'s CASM passes 72,947 felts (P-44) with everything back in, stop and report the figure before you build
     the fallback (a library under another name for `spawn` and the purchase).
3. **Setup (P-51 ruling 3, P-52, P-53).** A new contract, `systems/setup.cairo`, named `Setup`.
   - **The quiver components**, `QuestComponent` and `AchievementComponent`, move here from `Daily`: event mode,
     `TrackAll`, `authorize_admin` set to Setup's owner.
   - **Ownable and upgradeable**, like the other systems (D-17).
   - **The definitions:** `define_quest`, `retire_quest`, `define_achievement` and `retire_achievement`, owner-only,
     with today's checks (a recurring quest starts at 00:00 UTC; every task total is positive; no task id twice).
   - **The reporter allowlist:** `set_reporter(reporter, allowed)`, owner-only. It sets the reporter in both
     components (quiver's `set_reporter`, which emits `QuestReporterSet` and `AchievementReporterSet`).
   - **The report:** `report(player_id, quests: Span<TaskProgress>, achievements: Span<TaskProgress>)`. It reverts for
     a caller that is not a reporter, and runs `progress_many` on each component.
   - **The tutorial claim:** `claim_tutorial()`, called by the player.
     - It is idempotent: `tutorial_claims: Map<felt252, bool>`. When the flag is already set, it returns with no
       effect, no revert and no event.
     - Otherwise it sets the flag and runs `achievement.progress(caller, TASK_TUTORIAL_FINISHED = 10, 1)`.
     - No verification, no registration check, no token or value (P-49 ruling 2).
   - **Not in this PR:** the wiring that `Account` holds today (the economy and collection addresses). That is step E.
     Design `Setup`'s storage so step E can add it without moving anything.
4. **Challenge reports to Setup.**
   - At game over (build, discard or surrender), `Daily` makes **one** external call, `Setup.report(...)`, carrying the
     player and at most the entries the tally gives. No call on a move that does not end the game.
   - `player_id` is the caller of the move that ended the game. That caller must be the game's player, or the move
     reverts. Keep that check, and show it in the PR body.
   - `Economy.record` stays in Challenge, at the same point as before.
   - The tally's encoding (`quests.cairo`: which counters make which task) stays in Challenge.
   - `Daily` gets Setup's address. Choose the simplest path consistent with step E: a constructor argument plus an
     owner-only setter, or a storage field. Say which, and how step E's single registry will replace or keep it.
   - **Training reports nothing.** No contract of Training is a reporter.
5. **Storage (P-42).**
   - `Daily`'s `Quest_*` and `Achievement_*` members stay declared and dead.
   - Pin them, and `lobby_class`, by name, as #337 pinned the dead prize fields.
   - Setup's storage is fresh. Past progress is not migrated (P-51 ruling 5).

## Tests

- **Setup.**
  - Definitions: owner-only, with every check.
  - `set_reporter`: owner-only, emits both events.
  - `report`: reverts for a non-reporter; a reporter's report emits `QuestProgressed` and `AchievementProgressed` per
    entry.
  - `claim_tutorial`: the first call emits `AchievementProgressed { task 10, count 1 }` and credits First Stone; the
    second call does nothing and does not revert; it has no other effect.
- **Challenge.**
  - A game over by build, by discard and by surrender each makes one `Setup.report` with the right player and
    entries.
  - A move that does not end the game makes no call to Setup.
  - The game over still calls `Economy.record`.
  - A move by anyone but the game's player reverts before any report.
- **Purchase and mint from Challenge** (economy lens): the same transfers, the same `Economy.purchase` and
  `Collection.mint` calls, the same values as through `Lobby` before. Port the existing spawn tests, re-entry included.
- **Goldens:** the Daily goldens stay identical; the tutorial golden goes. List the golden files and the expected
  values unchanged.
- **The ABIs:** regenerate with `scripts/abis.sh`.
  - `Tutorial.json` and `Lobby.json` go; `Setup.json` is new; `Daily.json` changes.
  - The diff must match the D-21 and D-24 sections of public-interface.md. Correct those sections where the build
    differs.
- **Sizes:** run `scripts/class-sizes.sh` before and after. Give `Daily` (Challenge) against 72,947 with its headroom,
  and `Setup`.
- **Gas:** the scenarios of `docs/measures/baseline.md`, in an "After D-21/24" table, with spawn, discard, surrender
  and the game-over build.
  - The game over now makes an external call instead of a library call: give the before and after.
  - Scenario f is at 98.09 % of its ceiling. If any scenario passes its ceiling, stop and report.
- **deploy.sh:** CI (`scripts/test-deploy-url.sh`) must stay green.
  - The fresh deployment path (step F) is written later. Here, change only what CI needs: Lobby and Tutorial no longer
    exist as artifacts, and Setup does.
  - `--repoint` and `--d18` run from the pinned commit 06c024d, not from this tree, so leave them alone.

## Runs (VPS, D-251)

- scarb 2.20.1 and snforge 0.64.0 from `~/.asdf/installs/`.
- snforge: `RAYON_NUM_THREADS=1 prlimit --as=16106127360 -- /usr/bin/time -v snforge test <filter> --max-threads 2`.
- scarb build: `prlimit --as=12884901888`.
- Only after `free -g` shows 8 GB or more available. One build at a time. Record the peaks.
- Scoped runs first, then the whole suite once at the end.
- A capped run with no progress for 15 minutes is stopped and reported.
- Never use or print the `STARKNET_*` variables. Nothing is sent to any network.
- For `scripts/test-deploy-url.sh` on this VPS, put Node 24's binary first on `PATH`
  (`$HOME/.asdf/installs/nodejs/24.21.0/bin`): the asdf shim fails in the test's environment.

## Git

- Push the branch the plugin created for this thread. Do not create or rename a branch.
- **Never `git rebase`**, never force-push. If main moves, `git merge origin/main`. Plain pushes only.
- **Push early**, after the first compiling commit: the ABIs change, and CLIENT builds its PR on this branch.

## Allowlist

- `contracts/src/**`, `contracts/tests/**`.
- `contracts/abis/**`, through `scripts/abis.sh`, plus `contracts/abis/README.md` by hand.
- `scripts/deploy.sh`, `scripts/test-deploy-url.sh`, `scripts/abis.sh`: what CI and the artifact list need only.
- Docs:
  - `docs/architecture/leaderboard.md`: the D-21 and D-24 sections become "As built";
  - `public-interface.md`: the D-21 and D-24 sections;
  - `quests.md`;
  - `upgrades.md`: the dead slots and their pins;
  - `class-headroom.md`, `docs/measures/baseline.md`, `docs/measures/golden-games.md`: figures, and the tutorial
    golden removed.
- `docs/briefs/d-setup-quests.md`.
- Not `packages/**` (read only), not `contracts/deployments/**`, not `scripts/signer/**`.

## PR

- Title: `feat: D-21 and D-24, the tutorial leaves, Lobby's cold paths return, Setup holds the quests`.
- Body:
  - the summary;
  - the ABI diff, as built;
  - Setup's interface;
  - who may report for whom: the path, with file:line;
  - the tutorial claim;
  - what stays dead, and its pins;
  - sizes, with Challenge's headroom;
  - gas before and after, the game over first;
  - goldens unchanged, and the tutorial golden removed;
  - "Spec corrections";
  - "For CLIENT": the ABIs, Setup's address and events, the claim;
  - one line on the audits: security (report access control, Setup's owner-only paths) and economy (the purchase and
    the record moved back into Challenge).
- Report: the PR's number and head, everything in the body, and the peaks. Do not merge.

## Addendum (PM, from CLIENT's W1c, #345, built on this branch)

1. **Parity.** Step D deletes `tests/golden/tutorial.cairo` and `elements/decks/tutorial.cairo`, which CLIENT's
   engine parity test transcribed. CLIENT has frozen the tutorial golden (`tutorial_full`, 2,794) and its scripted
   placements as a game-core fixture taken from 38f1c95; the PM accepts that. Add one line to
   `docs/architecture/parity-fixture.md`: after D-21 the tutorial game is no longer in CORE's fixture, and CLIENT
   keeps it frozen (from 38f1c95). `parity-fixture.md` is added to the allowlist, for that line only.
2. **deploy.sh, the devnet and fresh path**, beyond what CI needs (CLIENT's devnet and e2e runs depend on it). On
   devnet:
   - stop deploying Tutorial and Lobby;
   - deploy Setup;
   - wire it: Daily gets Setup's address, and Setup's reporter allowlist holds Daily (`set_reporter(Daily, true)`);
   - write `contracts.Setup` (address and class hash) into the deployment file it writes, like the other contracts.

   The definitions (`define_quest` and `define_achievement`) that deploy.sh or a script ran against Daily now run
   against Setup: say where they live and move them. Extend `scripts/test-deploy-url.sh` where it covers the devnet
   path. `--repoint` and `--d18` stay pinned to 06c024d: do not touch them. No committed file under
   `contracts/deployments/**` changes.
3. **Collection.json still declares a `tutorial` view.** If it is the tutorial game's NFT path, it goes with D-21:
   remove it. If it is something else, keep it and say exactly what it is (file:line) in the report.

Everything else in the brief holds.
