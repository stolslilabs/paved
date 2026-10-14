# Brief: small Later items, batched (two economy.md doc fixes, the sncast cause on --estimate-only, GNU sed in one test)

Track CORE of Paved (PM, 2026-10-14: batch them into one small PR). A review on the other model follows; no audit. Commit this brief as `docs/briefs/later-batch-1.md`, as the first commit of your PR.

## Items

1. **economy.md, the old burn share** (from the #396 re-review): `docs/architecture/economy.md:69` says "70 % (`0.7 P`) is swapped to PAVED through Ekubo and burned", and `:150` says "Burn share `q = P x BURN_BPS / 1...`". Since P-56 the burn is `burn_bps` (7,368 by default), so the summary and the table no longer add up to the price. Bring both lines to the as-built split, or mark them as history, consistent with the lines #396 fixed.
2. **economy.md, the zero-PAVED-leg sentence** (`:281`): it says nothing is burned "but for PAVED donated to `Economy`". The code burns the whole PAVED balance after `clear_minimum(paved, min_out)`, which also pulls PAVED left on the router. Say exactly what is burned.
3. **deploy.sh, the sncast cause on `--estimate-only`** (from the #389 review): the funding check's class-hash call (about `deploy.sh:2520`) discards stderr. So on `sepolia --estimate-only` with sncast missing, every class reads "declared unknown" and the run ends without the "sncast not found" cause. Make the cause show, for example by resolving sncast once, bare, before that loop, as #389 did for `sc`. Add a test-deploy-url.sh case.
4. **test-deploy-url.sh:220, GNU-only `sed -i`** (from the #395 review): on macOS, BSD sed reads the script as a backup suffix and the case fails. Rewrite that stub with `printf`/`cat >`, or use a portable form, so the case passes on both.

## Runs

- **No Cairo build or test is needed.** Do not run deploy.sh for real.
- Run the whole `bash scripts/test-deploy-url.sh` once at the end, mimicking CI as #389 did (no sncast, no shim on PATH, `node` on PATH), and give its summary line.
- `PAVED_SCARB_SHIM` and `PAVED_SNFORGE_SHIM` are test hooks only. Never point them at real binaries to get past the guard.
- Never use or print the `STARKNET_*` variables. Nothing is sent to any network.

## Git

- Push the branch the plugin created for this thread. Do not create or rename a branch.
- **Never `git rebase`**, never force-push. If main moves, `git merge origin/main`. Plain pushes only.

## Allowlist

- `docs/architecture/economy.md` (items 1 and 2 only).
- `scripts/deploy.sh` (item 3 only), `scripts/test-deploy-url.sh` (items 3 and 4).
- `docs/briefs/later-batch-1.md`.
- Nothing else.

## PR

- Title: `chore: small Later items (economy.md burn share and zero leg, sncast cause on --estimate-only, portable sed)`.
- Body:
  - each item with its change;
  - the test-deploy-url.sh summary line;
  - one line on why no audit.
- Report: the PR's number and head, the commands with their output. Do not merge.
