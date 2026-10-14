# Brief: Economy hardening, the swap's PAVED-leg sign check and no referral to the Vault or the router

Track CORE of Paved. The PM's rulings of 2026-10-14 on the coverage findings
(`docs/measures/coverage.md`, "Findings for a ruling", 1 to 3). It touches value, so a review and
short security and economy audits follow.

Machine: the Mac.

## Goal

1. **The swap's PAVED-leg sign (ruling 1).** `Economy.swap` refuses a PAVED leg that is not paid out
   to Economy, with `'Economy: wrong delta'`: the rule and error of `quote_swap`
   (`assert(paved_leg.sign || paved_leg.mag == 0, errors::WRONG_DELTA)`). The check goes before
   `min_out` and before any use of `bought`. Tests: a router double returning the PAVED leg paid in
   (`{100 PAVED, sign: false}`) makes `purchase` revert `'Economy: wrong delta'`, even with PAVED
   donated to Economy; a zero PAVED leg behaves as today; the normal path is unchanged.
2. **No referral to the Vault or the router (ruling 2).** Treated like self-referral: no referral is
   paid, and the share stays in the Vault's part. Find where Economy and Challenge are also excluded
   and say what the full set is. The rule reads the current Vault and router addresses
   (`set_router` can replace the router). Tests: referrer set to the Vault, the router, Economy,
   Challenge and the payer each pays no referral (`Purchased.referrer == 0`, `referral == 0`); the
   burn quote and the Vault's PAVED are those of a purchase with no referrer; after `set_router(new)`
   the new router is excluded and the old one is not.
3. **Docs.** `docs/architecture/economy.md` (the referral rule, the full excluded set, the swap's
   sign check; drop D-25 E's stale "a referral paid to the Vault is counted once", and say why: since
   P-56 the margin reaches the Vault as PAVED, and USDC sent to the Vault is stranded).
   `docs/architecture/upgrade-owner.md` (ruling 3: `Challenge.set_setup` stays an owner power, used
   only between games, or after the 24 h expiry plus the settlement window; if the new setup points
   at another Economy, games in flight can no longer end and `settle` on the old Economy reverts; no
   contract guard). `docs/programme/DECISIONS.md` (a row per ruling, with what would reverse it).
   `docs/architecture/public-interface.md` (the referral rule, the new revert of `purchase`).
4. **ABI.** No signature changes: `scripts/abis.sh` shows no diff.
5. **Gas.** Purchase gas before and after, and the spawn scenarios; every scenario under its
   ceiling, none raised. Recorded in `docs/measures/baseline.md` ("After the Economy hardening").

## Allowlist

`contracts/src/systems/economy.cairo`; `contracts/src/systems/challenge.cairo` only if the exclusion
lives there; `contracts/src/mocks/router.cairo`; the new `contracts/src/tests/economy/hardening.cairo`
and its `mod` line; `contracts/tests/gas.cairo` only if a figure falls; the docs above; this brief.
Not `tests/economy/{economy,vault,token,curve}.cairo` (T1), not `tests/e2e/**` (T2), not
`contracts/abis/**`, `scripts/**`, `packages/**`, `contracts/deployments/**`.
