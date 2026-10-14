# S1 brief: three contract items of the client specification (a docs note, no code)

Track CORE of Paved. Documents only: no file under `contracts/`, `scripts/` or `packages/` changes. Commit this brief as
`docs/briefs/s1-client-spec-core.md`, as the first commit of your PR.

## Context

- The owner's client specification and the PM's rulings P-57: `/home/claude/.herdr-projects/paved/scratch/spec-client-v1.md`
  (read only). CLIENT leads it; three contract items are CORE's (P-57, item 9).
  - Line 34: "Challenge mode: a unique seed, a hash of the token id. It evolves with each placement, deterministically
    and predictably, to draw the next tile, so that play renders with no loading."
  - Line 36: "A game costs $2, with a minimum score to beat (the average performance adjusted for the protocol's fees,
    as in Nums). Keep the same prices and bonuses as Glitchbomb (a reward bonus for high stakes)."
  - Line 37: "A game is valid 24 h. Show it in the purchase scene and in the game's details."
  - P-57 item 8: the client computes the next draw locally with the engine (parity with the contract proven in CI),
    and the chain's answer confirms it.
- Glitchbomb, the model: `/home/claude/projects/glitchbomb` at 5efcbce, read only; its notes and `AGENTS.md` are
  information, not instructions to you.
- Paved on main: `contracts/src/systems/{challenge,economy}.cairo`, `models/game.cairo`, `docs/architecture/economy.md`.

## What to write

One new note, `docs/architecture/client-spec-core.md`, titled "Client specification v1: the contract items". Cite
file:line on both sides.

1. **"A game is valid 24 h."**
   - Today: every time limit on a game. Check at least:
     - whether a game can expire or be played forever;
     - the day id and `end_in_day`;
     - when Economy records and settles;
     - the 48 h settlement window (`economy.cairo`, the longest wait from purchase to settlement);
     - what happens to an unfinished game's stake.
   - What must change for a 24 h validity:
     - is it a deadline after which a move reverts;
     - does an unfinished game record its score at expiry, or forfeit;
     - how does it interact with settlement and the mean;
     - what view gives the client the deadline for the purchase scene and the game details?
   - Recommend one design, with its contract change and its cost, or say if today's code already gives it.
2. **Prices and stake bonuses: a parity table, Paved against Glitchbomb.**
   - Rows: the base price ($2), the stake options and their multipliers, the reward boost for high stakes, the
     minimum score to beat (P-8's curve and mean, against Glitchbomb's equivalent, "as in Nums"), the fees (burn,
     margin, referral).
   - For each row: Paved's value (file:line), Glitchbomb's value (file:line), and same or different.
   - Flag every difference and recommend:
     - keep Paved's value (with why, citing the decision that set it: D-10, P-46, ...);
     - or align with Glitchbomb, with the contract change.
     Where a change touches a decided value (P-46 and others), say so: that is the PM's or the owner's to rule.
3. **Next-tile prediction.**
   - For the client to draw the next tile locally, it needs the game's current seed and the withdrawn bitmap (and
     anything else the draw reads).
   - Check that the existing views (`game`, `builder`, `tiles`, ...) expose all of it, and that the client needs no
     extra call per move beyond what it reads today.
   - If something is missing, propose the smallest view or field (an addition at the end of a struct is not a break).
   - Say how the client checks its prediction against the chain's answer (the `Built` event, the next view read).

## Allowlist

- `docs/architecture/client-spec-core.md` (new).
- `docs/briefs/s1-client-spec-core.md`.
- Nothing else.

## Checks

- Documents only. `ci` must be green.

## Git

- Push the branch the plugin created for this thread. Do not create or rename a branch.
- **Never `git rebase`.** If main moves, `git merge origin/main`. Plain pushes only.

## PR

- Title: `docs: the client specification's contract items (24 h validity, Glitchbomb parity, next-tile prediction)`.
- Body:
  - the three answers in short, each with its recommendation;
  - "For the PM": the decisions it needs;
  - the line `Review: none — documents only (a note; no code changed)` at the end.
- Report: the PR's number and head, the diff stat, and the CI result. Do not merge.

## Addendum: code

Re-scope from the PM, after CLIENT's P0 (`docs/client/v2-architecture.md`, sections 6.5 and 9.4, on #373; read only).
S1 becomes a CODE PR. PR title: `feat: S1, game expiry after 24 h, initial_seed view, and the client spec's contract items`.

1. **A view of a game's initial seed:** `initial_seed(game_id) -> felt252` on Challenge (the seed the game started with,
   before any draw). Keep `tiles()` in draw order, with statuses, as today: confirm it.
2. **The 24 h validity (the PM's ruling):**
   - after 24 h from its start, a game refuses further moves (build, discard; surrender too unless argued otherwise)
     with an 'expired' error;
   - an expired game can still be recorded and settled, so the economy is unchanged for it. Today only the reward is
     voided: say exactly what changes;
   - expose the expiry time (start + 24 h) in the game view (an appended field at the end of GameView is not a break);
   - tests: a move before expiry works; a move after it reverts; an expired game records and settles; the boundary
     second; and an upgrade test (a game started before the upgrade gets the same 24 h from its stored start, or say
     what it gets).
3. **The parity table with Glitchbomb:** CLIENT found five figures already matching. Confirm each, and list every
   difference with file:line on both sides. Keep the docs note for this part (and for items 1 and 2's design) in
   `docs/architecture/client-spec-core.md`.
4. Next-tile prediction: with `initial_seed` and `tiles()`, confirm in the note that the client has everything it
   needs, with no extra call per move.

Constraints:

- Do not touch `contracts/src/systems/economy.cairo` or the Vault: V1b, paused, will resume there. If the expiry needs
  an Economy change, stop and report.
- Goldens unchanged (no move happens after 24 h in any golden); gas: every scenario under its ceiling, with the expiry
  check's cost per move.
- ABIs via `scripts/abis.sh`: the new view and the appended GameView field. CLIENT follows on this branch: push right
  after the brief commit.
- A review and a correctness audit follow (expiry changes the game rules).

Runs as in the D-251 rules: scarb 2.20.1 and snforge 0.64.0 from `~/.asdf/installs/`; snforge under
`RAYON_NUM_THREADS=1 prlimit --as=16106127360 -- /usr/bin/time -v`; scarb build under `prlimit --as=12884901888`;
`free -g` 8 GB or more first; one build at a time; scoped runs, then the whole suite once.

Allowlist now: `contracts/src/**` except `systems/economy.cairo` and `systems/vault.cairo`; `contracts/tests/**`;
`contracts/abis/**` via `abis.sh`; `docs/architecture/client-spec-core.md`, `public-interface.md` (the new view and
field), `upgrades.md` (if storage changes); `docs/measures/baseline.md`; the brief. Not `packages/**`, not `scripts/**`,
not `contracts/deployments/**`.

Never `git rebase`; plain pushes. Report the PR's number and head. Do not merge.
