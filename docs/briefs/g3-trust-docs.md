# G3 brief: upgrades.md "Trust" brought up to date, and a new mainnet gate (documents only)

Track CORE of Paved. Documents only: no file under `contracts/`, `scripts/` or `packages/` changes. Commit this brief as
`docs/briefs/g3-trust-docs.md`, as the first commit of your PR.

## What to write

1. **`docs/architecture/upgrades.md`, the "Trust" section.** It predates D-24 and D-25 E: it still names `Account` and
   `set_lobby_class` and leaves out `Setup`. Bring it to today's main:
   - `Setup` in: its owner powers, as `docs/architecture/upgrade-owner.md` (#361) lists them;
   - `Account` and `set_lobby_class` out, or marked as history where the section describes the past.
   Cite file:line from origin/main. Keep every other section of the file as it is. Point to `upgrade-owner.md` for
   the detail rather than copying it.
2. **The mainnet gates** (PM, 2026-10-14). Add two rows to `docs/programme/PLAN.md`'s table of before-mainnet items, in
   its format, each with status "planned":
   - "Pause guardian on Challenge.spawn": the emergency stop that every owner option lacks today. The guardian is an
     owner-set address that can pause spawn only; unpausing is the owner's. Built after G1.
   - "Bound set_router and set_pool": by a router allowlist, or by the timelock if the owner chooses it (option (d) of
     upgrade-owner.md).
   Add one line to `docs/programme/RISKS.md` if no risk row covers "an owner call redirects new purchases"
   (set_setup, set_router, Setup.upgrade), pointing to upgrade-owner.md and these gates.

## Facts first

Check each fact against origin/main. If the code contradicts what the PM asked for, write what the code says, and say
so under "For the PM".

## Allowlist

- `docs/architecture/upgrades.md` (the "Trust" section only), `docs/programme/PLAN.md` (the two rows),
  `docs/programme/RISKS.md` (one line, if needed).
- `docs/briefs/g3-trust-docs.md`.
- Nothing else. Another task (G1) changes `contracts/**` and the measures at the same time.

## Checks

- Documents only. `ci` must be green.

## Git

- Push the branch the plugin created for this thread. Do not create or rename a branch.
- **Never `git rebase`.** If main moves, `git merge origin/main`. Plain pushes only.

## PR

- Title: `docs: upgrades.md Trust after D-25, and two mainnet gates (pause guardian, router bounds)`.
- Body: the summary, and "For the PM" if any. Add the line `Review: none — documents only (a trust section and gate
  rows; no code changed)` at the end of the body.
- Report: the PR's number and head, the diff stat, and the CI result. Do not merge.
