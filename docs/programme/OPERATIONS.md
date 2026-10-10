# Paved: operations

The operating document of the programme. It adds to the organisation's standard and does not repeat it.

## Tracks and orchestrators

| Track | Orchestrator | Phases | Repository |
|---|---|---|---|
| CORE | `paved-core` | P0 to P5 | `/home/claude/projects/paved` |
| CLIENT | `paved-client` | from P2 | `/home/claude/projects/paved`; browser and GPU work on the owner's Mac clone `/Users/bal7hazar/git/paved` |
| META | later | P6, P7 | |
| ECO | later | P8 | |

**Mac clone rule.** `/Users/bal7hazar/git/paved` is used ONLY as the source of a worktree, by that
absolute path. Nobody checks out, resets, cleans, stashes or pops in it. Every brief of a Mac thread
repeats this rule.

## Profiles by kind of task

| Task | Profile |
|---|---|
| A clear, briefed task | impl-sonnet |
| The native port (P2), the structure-state design (P5), the economy (P8) | impl-opus |
| Anything else for the most capable model | impl-fable, only as its profile rule allows |
| Review of a Sonnet PR | review-opus |
| Review of a PR by Opus or Fable | review |

## Domain rules

- **Toolchain** is pinned in `.tool-versions` and in every `Scarb.toml`. Today: scarb 2.20.1 with
  snforge 0.64.0 (P3, organisation D-180).
- A **toolchain bump is its own PR**.
- Builds and measures run single-threaded (`RAYON_NUM_THREADS=1`).
- **Every gameplay test carries a gas budget.**
- **Golden games** (move sequences with expected score) stay identical through P2, P3 and P5. They are
  never edited to make a test pass.
- **quiver** (`quiver_quest`, `quiver_achievement`) only by pinned published version on scarbs.xyz,
  never git or path (O-1).
- Code copied from Grim World keeps its licence header and names its source in the file (O-3).
- No Slingfall library and no hexx-cairo as dependencies (O-2).
- **Memory.** A build or test run whose peak is not known is measured first, capped:
  `prlimit --as=8589934592 -- /usr/bin/time -v <command>`. A run above about 8 GB never runs on the VPS
  while agents work there; it runs on the Mac. Golden-game generation is bounded: one game per run.
- **Machines.** A new thread starts on the Mac when the VPS is loaded, with the absolute path
  `/Users/bal7hazar/git/paved` (only as the source of its worktree, rule above). Pins and measures that
  commit a figure stay on Linux (CI or VPS). The Mac restarts for updates and its agents come back
  logged out.
- **Tests are scoped** as in [`AGENTS.md`](../../AGENTS.md). Briefs name the parts touched and their
  test command.
- No deployment to a production network without the owner's go (reserved act).
- **Networks (D-8, D-16).** Devnet for tests, Starknet Sepolia for playtests, mainnet the owner's act.

## Sepolia (S-1, D-16, P-39)

Phase 1 (the code, the docs and the devnet tests) merges first. Phase 2 deploys:

1. On the VPS, from merged main (a clean worktree on `origin/main`, nothing unmerged: the script refuses
   contract sources that differ from the merge base), with the funded account in the environment by name only:
   `STARKNET_ACCOUNT_ADDRESS`, `STARKNET_PRIVATE_KEY`, `STARKNET_RPC_URL`. No value is printed, logged, echoed
   or written: no `set -x`, no `env` dump, no value in a file, a commit or a report.
2. First `scripts/deploy.sh sepolia --rehearse` on a fresh local `starknet-devnet`, then
   `scripts/deploy.sh sepolia`. It builds, declares, deploys and wires (`contracts/deployments/README.md`,
   "Sepolia"), writes `contracts/deployments/sepolia.json`, then runs the smoke. Signing is open until the PM
   picks an option (README, "Signing on Sepolia"); until then the run stops before anything is sent.
3. `sepolia.json` is committed in a follow-up PR, with the run's output (addresses, transactions, the smoke).
4. The smoke's test-sized traces are listed in the README; its paid game is settled by the keeper from
   `(D + 2) x 86400`.
5. The report gives the addresses of `sepolia.json` (contracts, class hashes, `deployed_block`) to the PM.

## Checks that gate a merge

- CI build
- Format
- Contracts tests
- Client build and tests

## Audits

Audits are exceptions, by kind of task, never for a whole track:

| Change | Phase | Lens |
|---|---|---|
| Access control of the native contracts | P2 | security |
| Any change that mints, burns, holds or pays tokens | P8 | security and economy |
| A change of the structure-state algorithm | P5 | correctness against the goldens |

Briefs that name an audit for other tasks do not bind.
