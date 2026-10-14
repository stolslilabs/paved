# Brief: the repository's scripts use the scarb and snforge shims by default (the owner's Cairo rule)

Track CORE of Paved. A priority fix: the PM's request of 2026-10-14, found by CLIENT's W1j. A review on the other model follows; no audit (no contract changes). Commit this brief as `docs/briefs/scripts-use-shims.md`, as the first commit of your PR.

## The rule (owner, 2026-10-14)

At most one Cairo build or test run at a time on the VPS, always through the shims: the plain `scarb` and `snforge` on PATH, which are `~/.local/bin/scarb` and `~/.local/bin/snforge` on the VPS. They hold the machine-wide lock. No PATH prepend of `~/.asdf/installs`, and no direct binary path.

## What is wrong on main

- `scripts/deploy.sh:433-439`: `SCARB_BIN_DIR` defaults to `$ASDF/scarb/2.20.1/bin`, and `SNCAST_BIN_DIR` to `$ASDF/starknet-foundry/0.64.0/bin`. Both are prepended to PATH, so a plain `scripts/deploy.sh devnet` builds outside the lock. That directory also holds `snforge`. Note that `sncast declare` itself calls `scarb` from PATH.
- `scripts/measure.sh:21-29`: prepends the asdf scarb, snforge and cairo-coverage directories to PATH.
- `scripts/node/run-sample.sh:10-18` and `scripts/node/README.md:11,21`: the same asdf defaults and prepend, documented as the defaults.

## Goal

1. **By default, scarb and snforge come from PATH, with no prepend**, in `deploy.sh`, `measure.sh` and `node/run-sample.sh`.
2. **Overrides stay explicit:** `SCARB_BIN_DIR`, `SNFORGE_BIN_DIR`, `CAIRO_COVERAGE_BIN_DIR` and `SNCAST_BIN_DIR` are used only when the caller sets them.
3. **sncast and starknet-devnet stay as they are:** they are not Cairo builds, so keep their defaults. But the sncast directory must never put an asdf `scarb` or `snforge` ahead of the shims. Call sncast by its absolute path (`$SNCAST_BIN_DIR/sncast`), or otherwise make sure the directory added to PATH cannot shadow them, and say which you chose.
4. **cairo-coverage** (measure.sh): it is not scarb or snforge. Keep its install directory on PATH if snforge needs it, but after the shims, never ahead of them. Say how snforge finds it.
5. **A guard, in deploy.sh and measure.sh (and run-sample.sh), before any build:**
   - Resolve `command -v scarb`, and `command -v snforge` where the script uses it.
   - If the VPS shim exists (`$HOME/.local/bin/scarb` is executable) and the scarb found is not that path, refuse to start with a clear message: "scarb resolves to <path>, not the shim ~/.local/bin/scarb: the owner's rule is one Cairo run at a time through the shims (set SCARB_BIN_DIR=$HOME/.local/bin, or fix PATH)". Exit non-zero before anything is built or sent. Do the same for snforge.
   - If the shim does not exist (the Mac, CI), only print a warning naming the scarb found, and continue.
   - This applies to an explicit override too: on the VPS, an override pointing at the asdf directory is refused. `SCARB_BIN_DIR=$HOME/.local/bin` passes.
   - Tests that stub scarb need a way through. Add a narrowly named variable for the expected shim path (for example `PAVED_SCARB_SHIM`, default `$HOME/.local/bin/scarb`), which `test-deploy-url.sh` points at its stub. Document it as a test hook, not a way round the rule.
6. **A check in CI:** cases in `scripts/test-deploy-url.sh`, which "Build game" runs, cover:
   - the default (no override) resolves scarb from PATH, with no prepend;
   - the refusal when the shim exists and scarb resolves elsewhere;
   - the warning when there is no shim;
   - an explicit override that is the shim passes.

   If measure.sh cannot be exercised there, add a small shell test of its guard that CI runs, or say why not.
7. **Docs:** `scripts/node/README.md`, the env-override comments in `deploy.sh` and `measure.sh`, and `AGENTS.md` if it documents the asdf defaults for these scripts. They must state the shim default, the overrides, and the guard.

## Runs

- **No Cairo build or test is needed for this task.** Do not run `scarb build`, `snforge` or `deploy.sh devnet` for real. `test-deploy-url.sh` stubs the toolchain.
- If you think a real Cairo run is necessary, use the plain shim only, one at a time, and say why.
- Run `bash scripts/test-deploy-url.sh` (use `node` on PATH, with no prepend) and `shellcheck` if it is installed.
- Never use or print the `STARKNET_*` variables. Nothing is sent to any network.

## Git

- Push the branch the plugin created for this thread. Do not create or rename a branch.
- **Never `git rebase`**, never force-push. If main moves, `git merge origin/main`. Plain pushes only.

## Allowlist

- `scripts/deploy.sh`, `scripts/measure.sh`, `scripts/node/run-sample.sh`, `scripts/node/README.md`, `scripts/test-deploy-url.sh`.
- `AGENTS.md`: only the lines on these scripts' toolchain defaults.
- `docs/briefs/scripts-use-shims.md`.
- Not `contracts/**`, not `packages/**`, not `.github/**` (CI already runs `test-deploy-url.sh` in "Build game"; if you think a workflow change is needed, stop and report).
- V1b (#382) also edits `deploy.sh` and `test-deploy-url.sh`, in other places (the vPAVED deploy steps and `--repoint`). Keep your change to the toolchain block and the guard so the merge stays simple.

## PR

- Title: `fix(scripts): scarb and snforge from the shims by default, with a guard (the owner's Cairo rule)`.
- Body:
  - what changed in each script;
  - the guard and its messages;
  - the test hook;
  - the CI cases;
  - one line on why no audit: scripts only, no contract changes, no value.
- Report: the PR's number and head, the commands with their output, and anything you could not do. Do not merge.

