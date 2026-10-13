# Gate brief: calibration against competent play (RISKS and PLAN, no code)

Track CORE of Paved. Documents only: no file under `contracts/`, `scripts/` or `packages/` changes. Commit this brief
as `docs/briefs/gate-competent-play.md`, as the first commit of your PR.

## The decision (PM, 2026-10-13)

The curve parameters are the PM's (P-46). The PM sets a new mainnet gate, **"calibration against competent play"**:

- Before mainnet, `c` and `rho` must give E[h] below 1 for the best known bot buying blind.
- The 0.9 average over a mix that includes novice play does not settle it.
- E4 does the work, with Sepolia playtest data.
- What reverses it: the owner accepts that skilled players earn more than they pay.

The measurement behind it is `docs/measures/selective-buyer.md` (#338, e1273f7). At today's `c` 1.222 (sigma 0):

- the greedy bot buying blind has E[h] 1.369 on the 50 calibration decks, and 1.501 on 410 decks;
- the calibration's population is 25 % greedy, 50 % noisy and 25 % novice;
- a model estimate of the `c` that brings the blind greedy bot to E[h] 0.9 is 0.804 (`slope_bps` 8,037) on the 50
  calibration decks, or 0.733 (7,329) on the 410. The mix then falls to 0.59 or 0.54.

  These two figures were computed for the PM and are not in the note. Quote them as "model estimates (PM request,
  2026-10-13)", and add them to the note's section on the baseline as one short paragraph, if that note is in your
  allowlist (it is, below).

## What to write

1. **`docs/programme/RISKS.md`.**
   - A new row, after the last one: "Skilled play or a bot earns more than it pays".
     - Phase: "before mainnet".
     - Mitigation: the gate above, done by E4 with Sepolia playtest data. Cite the figures above and
       `selective-buyer.md`.
   - Update R-4 (the predictable daily seed). Under D-23 the seed is per token: Poseidon(salt, token id), where the
     token id is the game's own counter. So the next deck is known before a purchase. Cite the selective buyer's edge
     with the mean held by others:
     - +1.20 at p50, +1.69 at p90, +2.23 at p99, against 0.9;
     - at zero traffic, selection does not pay from p50 to p95.
     A VRF, or a seed revealed after the purchase, removes the selection edge. Whether a VRF becomes a mainnet gate is
     the owner's question, asked by the PM and open: say so.
   Keep every other row.
2. **`docs/programme/PLAN.md`.** In the table that holds the other before-mainnet items, add a row:
   - item: "Calibration against competent play";
   - when: "Before mainnet: `c` and `rho` give E[h] below 1 for the best known bot buying blind (PM, 2026-10-13). E4
     does it with Sepolia playtest data";
   - status: "planned".
   Change nothing else.
3. **`docs/programme/DECISIONS.md`.** A row recording the gate as a PM decision, P-54:
   - who: "PM";
   - date: 2026-10-13;
   - what reverses it: "The owner accepts that skilled players earn more than they pay".
4. **`docs/measures/selective-buyer.md`.** One short paragraph in its baseline section with the two `c` estimates,
   labelled as above. No other change.

## Allowlist

- `docs/programme/RISKS.md`, `docs/programme/PLAN.md`, `docs/programme/DECISIONS.md` (the P-54 row only).
- `docs/measures/selective-buyer.md` (the one paragraph).
- `docs/briefs/gate-competent-play.md`.
- Nothing else.

## Checks

- Documents only. `ci` must be green.
- Read the result once against this brief.

## Git

- Push the branch the plugin created for this thread. Do not create or rename a branch.
- **Never `git rebase`.** If main moves, `git merge origin/main`. Plain pushes only.

## PR

- Title: `docs: mainnet gate, calibration against competent play (RISKS, PLAN, P-54)`.
- Body: the summary and the figures. Add the line `Review: none — documents only (risk, plan and decision rows; no
  code changed)` at the end of the body.
- Report: the PR's number and head, the diff stat and the CI result. Do not merge.
