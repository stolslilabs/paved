# E brief: Account leaves the systems, identity is the wallet address, Setup holds the wiring

Track CORE of Paved. Step E of the D-25 order (P-53), after step D (#346, aff59e0). A review and two audits follow:
access control (Setup's wiring setters) and economy (the referral rule, P-52 ruling 5). Commit this brief as
`docs/briefs/e-account-out.md`, as the first commit of your PR.

## The specification

- D-25, P-52, P-53 in `docs/programme/DECISIONS.md`.
- P-53 ruling 5: Account leaves `systems/`. Whatever the tests need stays in `mocks/` as a mock Account. The rest,
  `manageable` included, is deleted.
- P-53 ruling 2: Setup is the single registry of the wiring, read through one view per call.
- `docs/architecture/glitchbomb-gap.md`:
  - section 4, Setup;
  - section 6, "Player identity off Account": the id is already the address, the storage keyed by player id, the
    events, the behaviour that changes, the indexer, the client, and what the mock must give;
  - section 7, row E.
- The line numbers in the note are from before D-20, A+B and D. Re-read the code.

## What to build

1. **Setup holds the wiring.**
   - Owner-only setters for the economy and collection addresses on Setup (`set_economy`, `set_collection`), emitting
     `EconomySet` and `CollectionSet`, with the same names and fields as `Account` emits today.
   - One view returning the wiring, the one view per call of P-53 ruling 2.
   - `Daily` reads the economy and collection addresses through its `setup` field (step D added it), in one call where
     it needs both, instead of reading `Account`. Measure spawn's gas before and after: the note estimates
     -200k to -300k.
   - Daily's `account` slot stays declared and dead (P-42). Pin it by name, as the other dead fields are pinned.
   - The zero-setup guard of step D covers the report only. Decide what a zero `setup` does to spawn's wiring read
     (spawn cannot proceed without the economy), and test it.
2. **Account leaves.**
   - `systems/account.cairo` and `components/manageable.cairo` are deleted.
   - Whatever the tests still need becomes a mock Account in `contracts/src/mocks/` (P-53 ruling 5): the old-layout
     tests that pin `Account` (for example `test_upgrade_layout_pins_account_and_economy_by_name`, `upgrade_d18`), if
     they still need it. If no test needs it, say so; the PM's wording keeps a mock for the tests that do.
   - `Store.player`, `assert_exists` and the registration checks go.
   - `PlayerCreated` is emitted by nothing deployed. Keep it documented as a past event in public-interface.md, as
     #337 did for the prize events.
3. **Behaviour that changes.**
   - **Spawn** no longer requires a registered player: any account may play.
   - **The referral rule** becomes "a non-zero address other than the payer" (economy lens). Keep the rest of the rule
     as it is, and test both sides of it.
4. **Storage (P-42).** No storage name changes. `players` and `account` stay declared and dead in Challenge's layout.
   Pin them.

## Tests

- Setup's wiring: the setters are owner-only, emit their events, and are read back through the view.
- Daily reads its wiring from Setup: spawn works with Setup's addresses, and fails clearly when Setup's wiring is
  unset (say how).
- Spawn by an unregistered address works.
- The referral: a zero referrer and the payer as referrer are refused (or ignored, as today's rule does: keep its
  behaviour); any other non-zero address is accepted.
- The mock Account: what it serves, if anything.
- Goldens unchanged. Every scenario under its ceiling. Scenario f is the tightest: if any passes its ceiling, stop
  and report.
- ABIs: regenerate with `scripts/abis.sh`. `Account.json` goes, unless the mock keeps an ABI the tools need; say
  which. `Setup.json` and `Daily.json` change. Write the diff into public-interface.md as "Breaking change D-25 (E)".
- `deploy.sh`, devnet and fresh path: stop deploying Account; set the economy and collection on Setup (owner calls);
  `contracts.Account` is no longer written. Keep `--repoint` and `--d18` untouched (pinned to 06c024d).
  `scripts/test-deploy-url.sh` and `scripts/check-artifact-names.sh` stay green; the checker's 06c024d allow-list may
  need Account for the pinned paths: say what you change there.

## Runs (VPS, D-251)

- scarb 2.20.1 and snforge 0.64.0 from `~/.asdf/installs/`.
- snforge: `RAYON_NUM_THREADS=1 prlimit --as=16106127360 -- /usr/bin/time -v snforge test <filter> --max-threads 2`.
- scarb build: `prlimit --as=12884901888`.
- Only after `free -g` shows 8 GB or more available. One build at a time. Record the peaks.
- Scoped runs first, then the whole suite once at the end.
- A capped run with no progress for 15 minutes is stopped and reported.
- Never use or print the `STARKNET_*` variables. Nothing is sent to any network.
- For `scripts/test-deploy-url.sh` on this VPS, put Node 24's binary first on `PATH`
  (`$HOME/.asdf/installs/nodejs/24.21.0/bin`).

## Git

- Push the branch the plugin created for this thread **right after the brief commit**: CLIENT builds its PR on it.
- **Never `git rebase`**, never force-push. If main moves, `git merge origin/main`. Plain pushes only.

## Allowlist

- `contracts/src/**`, `contracts/tests/**`, and `contracts/abis/**` through `scripts/abis.sh`, plus its README by hand.
- `scripts/deploy.sh`, `scripts/test-deploy-url.sh`, `scripts/abis.sh`, `scripts/check-artifact-names.sh`: what the
  change needs.
- Docs:
  - `docs/architecture/glitchbomb-gap.md`: sections 4 and 6 marked "As built (E)";
  - `public-interface.md`: the E section;
  - `economy.md`: the referral rule;
  - `upgrades.md`: the dead slots and pins;
  - `class-headroom.md`, `docs/measures/baseline.md`: figures.
- `docs/briefs/e-account-out.md`.
- Not `packages/**`, not `contracts/deployments/**`, not `scripts/signer/**` (unless it names Account artifacts; then
  names only, and say so).

## PR

- Title: `feat: D-25 E, Account leaves the systems, identity is the address, Setup holds the wiring`.
- Body:
  - the summary;
  - the ABI diff;
  - Setup's wiring interface;
  - the referral rule before and after;
  - the dead slots and their pins;
  - sizes;
  - gas before and after, spawn first;
  - goldens unchanged;
  - the mock Account, and what it serves;
  - "For CLIENT": the events, `PlayerCreated` gone, names from the Controller, the referrer check, the deployment
    hash;
  - one line on the audits.
- Report: the PR's number and head, everything in the body, and the peaks. Do not merge.
