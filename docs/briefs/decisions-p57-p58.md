# Brief: decision numbering, the Economy hardening becomes P-58 and the client-specification rulings get their P-57 row

Track CORE of Paved. A documents-only fix (PM, 2026-10-14). P-57 was already the number of the PM's rulings on the client specification: `docs/client/spec-v1.md` section B, `docs/client/v2-architecture.md` and `docs/architecture/client-spec-core.md` all cite it. But `docs/programme/DECISIONS.md` has no row for them, and #396 recorded the Economy hardening as P-57. Commit this brief as `docs/briefs/decisions-p57-p58.md`, as the first commit of your PR.

## Goal

1. **Renumber the Economy hardening from P-57 to P-58** everywhere #396 wrote it. These are, on main at 37d8835c:
   - `docs/programme/DECISIONS.md:61` (its row);
   - `docs/architecture/economy.md:149, 230, 239, 243, 253, 274`;
   - `docs/architecture/public-interface.md:741, 822`;
   - `docs/architecture/upgrade-owner.md:51` ("P-57 (3)" becomes "P-58 (3)");
   - `docs/measures/baseline.md:1331, 1335`.

   Run `git grep -n "P-57"` and check every hit by hand. A hit about the Economy hardening (the swap's sign, the referrers, set_setup, the coverage findings) becomes P-58. A hit about the client specification (spec-v1.md, v2-architecture.md, client-spec-core.md, s1-client-spec-core.md, STATUS.md) stays P-57. Also grep `contracts/` and `scripts/` for comments that cite P-57 for the hardening.
2. **Add the P-57 row** for the client-specification rulings, in number order in DECISIONS.md, in the same style as its neighbours:
   - who: PM;
   - date: 2026-10-14;
   - the decision: "P-57 B1 to B10, see `docs/client/spec-v1.md` section B";
   - reversal: the owner's word on any point.
3. **Keep the P-58 row as it is**, apart from its number.

## Runs

- No build or test is needed: documents only.
- After the change, `git grep -n "P-57"` must list only client-specification uses, and `git grep -n "P-58"` only Economy-hardening uses. Paste both outputs into the report.

## Git

- Push the branch the plugin created for this thread. Do not create or rename a branch.
- **Never `git rebase`**, never force-push. If main moves, `git merge origin/main`. Plain pushes only.

## Allowlist

- `docs/programme/DECISIONS.md`.
- `docs/architecture/economy.md`, `public-interface.md`, `upgrade-owner.md`.
- `docs/measures/baseline.md`.
- Any other file only for a hit that is the Economy hardening's: list each one in the report.
- `docs/briefs/decisions-p57-p58.md`.
- Do not touch the client documents (`docs/client/**`, `client-spec-core.md`), whose P-57 is right.

## PR

- Title: `docs: the Economy hardening is P-58; P-57 gets its row (the client specification rulings)`.
- Use `gh pr create` with this line in the body: `Review: none — documents only (decision numbering)`.
- Report: the PR's number and head, and both grep outputs. Do not merge.

