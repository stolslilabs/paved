# D-18a brief: characters leave the game, the documents (no code)

Track CORE of Paved. Documents only: no file under `contracts/`, `scripts/` or `packages/` changes. Commit this brief
as `docs/briefs/d18a-no-characters-docs.md`, as the first commit of your PR.

## The decision (owner, via the PM, 2026-10-13)

**D-18.** Characters leave the game entirely. Closing a structure scores its points, with no character placed.
Closing a forest scores both:
- what a Woodsman scored: the distinct closed adjacent roads;
- what a Herdsman scored: the distinct closed adjacent cities.
This reverses P4. Mainnet is not launched, so nothing on production is affected.

**The PM's rulings for the details** (PM, 2026-10-13). Record them as **P-45**:
1. Every structure (road, city, wonder, forest) scores once, on the move that closes it. Its points are what the
   current formula gives for one character of power 1 and weight 1.
2. Forest: the closing condition is unchanged (its own half-edges land, and every adjacent road is closed).
   - Points = (distinct closed adjacent road roots + distinct closed adjacent city roots) x base x bonus(size).
   - P-15 stays: a city counts only when its root is closed, and only once.
   - One `Scored` event per forest, category FOREST.
3. A structure still open at game end scores nothing.
4. A wonder scores when its 8 neighbours are placed.
5. `role` and `spot` leave `Daily.build`. The `characters` view, the `Character` model and the builder counters go.
   A breaking ABI is accepted, because only Sepolia runs it.
6. The forest scan now runs on every forest closure, not only when a forest character is there. Its cost is measured
   in the implementation. `Daily` must stay under the P-44 cap (72,947 CASM felts).

## What to write

1. **`docs/programme/DECISIONS.md`**: two rows after the last one, in the table's format.
   - D-18: who "owner, via the PM", date 2026-10-13. What reverses it: "The owner brings characters back".
   - P-45: the six rulings, condensed. Who "PM", date 2026-10-13. What reverses it: "A measurement of the
     implementation (cost or `Daily`'s cap), or a contract fact that contradicts a ruling".
   - Mark P4-era rows that D-18 makes obsolete as "(reversed by D-18)", where a row exists for them. Do not delete
     any row.
2. **`docs/programme/PLAN.md`**: the P4 line's status becomes "done, reversed by D-18 (2026-10-13)". Change nothing
   else in that table.
3. **The architecture note.** Add a section "D-18: scoring without characters (planned)" to
   `docs/architecture/structure-state.md`. Keep it short, about one screen. It holds:
   - for each category (road, city, wonder, forest): when it scores and the exact formula, written from today's
     code with power 1 and weight 1 substituted. Cite file:line for each formula and for the closing condition you
     read;
   - what the structure state no longer needs: the character and power fields on records, the per-builder counters,
     and the "a forest character is there" trigger of the forest scan. Name the storage that becomes unused. D-17's
     rule: on an upgrade, no field is renamed or retyped, so unused fields stay declared or are left as dead slots.
     Say which;
   - the forest scan on every forest closure: what it walks, and the existing cost figures it should be compared
     with (`docs/measures/baseline.md`, the P4 and P5 rows). No new figure: the implementation measures;
   - the end of a game: open structures score nothing (ruling 3). Say what the code does today at game end, if
     anything, for open structures with characters, and what changes;
   - the goldens and the oracle: regenerated from the new rules in the implementation. List the golden files and
     the oracle that will change.
4. **`docs/architecture/public-interface.md`**: a section "Breaking change D-18". It holds:
   - the ABI diff for `Daily` and `Tutorial`, read from today's ABI (`contracts/abis/**`) and code:
     - `build`'s signature, before and after;
     - every view and every struct field that goes (`characters`, `Character`, the builder counters such as
       `placed_count` and `available_count`, and any other);
     - every event or event field that changes or goes (character placement, `Scored` fields that name a role,
       a spot or a character). List each one;
   - the codes of `role` and `spot` in the conventions table, marked "removed by D-18";
   - a sentence under "Stability promise": D-18 is a stated exception, accepted for Sepolia because mainnet is not
     launched. The promise holds again from the D-18 release on.
   Keep every other line.

## Facts first

Before writing, check each fact you state against the code on main (`contracts/src/**`, `contracts/abis/**`). If a
ruling is wrong for the contracts, or cannot be done as written, do not change the ruling. Write what the code says,
and flag it in the PR body under "For the PM", with the evidence (file:line). Two to check in particular:
- ruling 4: what a wonder needs today to close, and whether "its 8 neighbours are placed" is the same thing;
- ruling 2: whether a forest today can close without every adjacent road closed, and how "distinct root" is
  computed for roads and cities.

## For other tracks (PR body only)

- **META (indexer):** the event changes, and whether the `Scored` event's layout changes.
- **CLIENT:** `build` without `role` and `spot`, the role picker gone, and the `characters` view gone.
Do not edit their files.

## Allowlist

- `docs/programme/DECISIONS.md`, `docs/programme/PLAN.md`.
- `docs/architecture/structure-state.md`, `docs/architecture/public-interface.md`.
- `docs/briefs/d18a-no-characters-docs.md`.
- Nothing else.

## Checks

- Documents only. `ci` must be green (the path filters skip the code jobs).
- Read the result once against this brief: every ruling is there, and nothing in the four files contradicts D-18.

## Git

- Push the branch the plugin created for this thread. Do not create or rename a branch.
- Never `git rebase`. If main moves, `git merge origin/main`. Plain pushes only.

## PR

