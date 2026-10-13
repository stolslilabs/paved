# D-19a brief: tile owners and majority scoring, the documents (no code)

Track CORE of Paved. Documents only: no file under `contracts/`, `scripts/` or `packages/` changes. Commit this brief
as `docs/briefs/d19a-tile-owners-docs.md`, as the first commit of your PR.

## The decision (owner, via the PM, 2026-10-13)

**D-19**, in preparation for a multiplayer mode:
- a tile gets an owner: the player who places it;
- when a closed structure is resolved, its points go to the owner with the most tiles in the structure;
- on a tie, nobody gets the points.

**The PM's rulings for the details** (PM, 2026-10-13). Record them as **P-47**:
1. Tiles are counted per owner. Each distinct tile counts once, even when it has two areas in the same structure.
2. A forest counts its own tiles only, not the tiles of the adjacent roads and cities that give it its points.
3. A wonder counts the wonder tile and its 8 neighbours.
4. In single player every tile belongs to the player, so Daily and Tutorial scores do not change. The goldens stay
   identical, and that is the proof.
5. Storage follows P-42: new fields only. The owner is the player id.
6. The counting design is CORE's: either counts per root kept through unions, or a walk of the structure at scoring,
   bounded by the deck, as the forest scan does. It is measured in the implementation: gas per move against the
   D-18 figures, and `Daily`'s CASM under the P-44 cap (72,947 felts).
7. An audit follows the implementation (correctness lens).
8. D-18c's Sepolia rollout is not held for D-19. D-19 reaches Sepolia in a later upgrade.

## What to write

1. **`docs/programme/DECISIONS.md`**: two rows after the last one, in the table's format.
   - D-19: who "owner, via the PM", date 2026-10-13. What reverses it: "The owner changes the multiplayer scoring
     rule".
   - P-47: the eight rulings, condensed. Who "PM", date 2026-10-13. What reverses it: "A measurement of the
     implementation (gas or `Daily`'s cap), or a contract fact that contradicts a ruling".
2. **`docs/programme/PLAN.md`**: a D-19 line in the table that lists D-18, status "planned (2026-10-13)", if such a
   table exists. Change nothing else.
3. **The architecture note.** Add a section "D-19: tile owners and majority scoring (planned)" to
   `docs/architecture/structure-state.md`, after "As built: D-18". About one to two screens. It holds:
   - **What a structure's tiles are**, per category, read from today's code (cite file:line):
     - road and city: how the structure state knows which tiles belong to a root today, if it does at all (records
       per area or half-edge, unions, sizes). A tile with two areas in the same structure counts once (ruling 1):
       say how that case arises in the deck (for example a city tile with two city areas that later join);
     - forest: its own tiles only (ruling 2);
     - wonder: the wonder tile and its 8 neighbours (ruling 3). Note that the neighbours are not part of the
       wonder's structure today, so this is a positional count.
   - **The owner field.** Where it lives under P-42 and D-17: a new field on `Tile` (`models/index.cairo:44`), or
     a new map keyed by (game, tile). Check how `Tile` is stored. Say whether appending a field to the stored struct
     is layout-safe for tiles written before an upgrade, and what an old tile reads as (zero). Say what a zero owner
     must mean for a game open across the upgrade, so that ruling 4 holds for it too.
   - **The two counting designs** (ruling 6), with what each needs:
     - counts per root through unions: what is stored per root (a small map owner -> count, or a bounded list),
       how a union merges two roots' counts, how ruling 1 is kept (a tile already counted in the merged root), and
       what it costs in storage writes per move;
     - a walk at scoring: what it visits, its bound (the deck), and how it relates to the forest scan's code;
     - the single-player case: whether either design can skip the count when the game has one player, and whether
       that is allowed by ruling 4 (the result is identical by construction). This is a candidate for the
       cheapest path; say what it costs and what it leaves untested.
     **Recommend one**, with the reasons. No figure: the implementation measures. CORE decides from your note; the
     implementation may change the choice with a measurement.
   - **The tie and the result**: who receives the points, what is written when nobody does (a tie), and whether
     the score of each player and any event must change. Read `Scored` (`events.cairo`) and how a game's score is
     stored today, and say whether a multiplayer score needs a new field (per player) or whether D-19 only computes
     the winner and leaves the per-player score to the multiplayer mode. Flag what the multiplayer mode will need
     that D-19 does not build.
   - **Tests without a multiplayer mode**: how the implementation can test majority, ties and ruling 1 to 3 when
     no entry point lets two players build in one game (a test-only harness on the structure state, as the oracle
     and the differential tests do). List the golden files that must stay identical (ruling 4).
4. **`docs/architecture/public-interface.md`**: a section "Planned change D-19". It holds:
   - every ABI change D-19 implies, read from today's ABI (`contracts/abis/**`) and code: for instance `owner` in
     `TileView` (`tiles`, `daily.cairo:283`, `tutorial.cairo:178`), and any event field (`Scored`, `Built`). For each
     one, say if it is an addition (new field at the end) or a break;
   - if nothing in the ABI needs to change for D-19 itself, say so, and list what the multiplayer mode would add.
   Keep every other line.

## Facts first

Before writing, check each fact you state against the code on main (`contracts/src/**`, `contracts/abis/**`). If a
ruling is wrong for the contracts, or cannot be done as written, do not change the ruling. Write what the code says,
and flag it in the PR body under "For the PM", with the evidence (file:line). Check in particular:
- ruling 1: whether the structure state can tell two areas of one tile apart from two tiles, today;
- ruling 3: whether "the wonder tile and its 8 neighbours" are all placed exactly when the wonder closes (D-18,
  P-45 ruling 4), so the count is over 9 placed tiles;
- ruling 5: whether `Lobby` shares the storage that a new field touches (P-42), and whether its class changes.

## For other tracks (PR body only)

- **META (indexer):** any event change.
- **CLIENT:** any view change (the tile owner).
Do not edit their files.

## Allowlist

- `docs/programme/DECISIONS.md`, `docs/programme/PLAN.md`.
- `docs/architecture/structure-state.md`, `docs/architecture/public-interface.md`.
- `docs/briefs/d19a-tile-owners-docs.md`.
- Nothing else.

## Checks

- Documents only. `ci` must be green (the path filters skip the code jobs).
- Read the result once against this brief: every ruling is there, and nothing in the four files contradicts D-19.

## Git

- Push the branch the plugin created for this thread. Do not create or rename a branch.
- **Never `git rebase`.** If main moves, `git merge origin/main`. Plain pushes only.

## PR

- Title: `docs: D-19, tile owners and majority scoring (decision, structure note, ABI)`.
- Body: the summary; the recommended counting design in three lines; "For the PM" (any ruling the code contradicts,
  with evidence); "For META"; "For CLIENT".
- Report: the PR's number and head, the diff stat, each fact checked against the code (file:line), the recommended
  design and why, and the CI result. Do not merge.
