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
2. First `scripts/deploy.sh sepolia --rehearse` on a fresh local `starknet-devnet`
   (`~/.asdf/installs/starknet-devnet/0.10.0/bin/starknet-devnet --host 127.0.0.1 --port 5050 --seed 42`), then
   `scripts/deploy.sh sepolia`. It builds, declares, deploys and wires (`contracts/deployments/README.md`,
   "Sepolia"), writes `contracts/deployments/sepolia.json`, then runs the smoke. Every transaction is signed by
   the starknet.js signer in `scripts/signer/` (P-40), which `deploy.sh` installs there with `npm ci` (Node 24 on
   the PATH; never a global install). Prebuild the contracts under the cap of AGENTS.md first
   (`RAYON_NUM_THREADS=1 prlimit --as=12884901888 scarb --release build` in `contracts/`), so the script's own build
   is a no-op; the signer's heap is capped by `deploy.sh` (`--max-old-space-size=640`).

   What is checked before anything is sent, in order:
   - the network is `sepolia` (mainnet refused by name, any other value refused);
   - the three variables are set and not empty (each missing one named), the address is 0x-hex, the URL is
     `https://`; then they are copied into unexported shell variables and unset, so no child but the signer has
     them, and the signer gets them in its environment, never in argv;
   - the node answers, and its chain id is `SN_SEPOLIA` (`0x534e5f5345504f4c4941`);
   - the deployer account is deployed on the node (`starknet_getClassHashAt`);
   - the contract sources equal the merge base with `origin/main` (no untracked source either);
   - in the signer, before each transaction: the variables (address and key felts below the field prime, the URL
     a remote `https` one for `SIGNER_NETWORK=sepolia`), node options (`NODE_OPTIONS` only
     `--max-old-space-size=<n>`, no `NODE_DEBUG`), each felt argument below the field prime, and the node's chain
     id again (`SN_MAIN` always refused);
   - each class hash the signer declares equals `sncast utils class-hash` for the same contract.

   No value of the three variables appears in an argv, an echo, an error, a log or a file: `deploy.sh` prints
   `$STARKNET_RPC_URL` and `$STARKNET_ACCOUNT_ADDRESS` instead, `curl` reads the URL and the request from its
   config on stdin, the signer gets them in an allowlisted environment and names the deployer `@account` in
   calldata, and a failing signer's output is redacted before it is printed (the signer sanitises it first).
   **Funding (S-1c, S-1d):** after the build and before the first declare, `deploy.sh` reads the deployer's STRK
   balance (`balance_of` of `@account` on the STRK token, a public read) and prints the amount only. It then
   estimates, read-only as `--estimate-only` does, the declare of each class the node does not have yet (a class it
   has is skipped), and needs at least 1.25 x the sum of those estimates + a **20 STRK** margin
   (`FUNDING_MARGIN_STRK`, for the deploys, invokes and smoke: about 1.1 STRK at Sepolia's gas price of 2026-10-11,
   measured from the S-1d rehearsal). The need is raised when one declare's resource bounds want more when it is
   sent: 2.3 x its estimate (starknet.js adds 50% to the amount and to the price, plus the tip) after 1.25 x the
   declares before it, + the margin. When an estimate cannot be had (the retries spent, or the node's error), the
   need falls back to the **200 STRK** floor (`FUNDING_FLOOR_STRK`). It prints the need and the balance; below the
   need, the run stops having sent nothing. A rerun after a partial deploy thus needs only what is left.
   `--estimate-only` prints the same need and balance lines and sends nothing either way.

   **Retries (S-1c):** read calls, those of `deploy.sh` (curl) and those of the signer, are retried on HTTP 5xx or
   `-32601`: at most 5 attempts, with waits of 1, 2, 4 and 8 s. A transaction (`starknet_add*`) is never retried.

   **A send whose answer is lost (S-1d):** for every transaction (declare, deploy, invoke, multicall), the signer
   computes its hash from the signed request and prints it on stderr (`signer: sending <method>, transaction
   <hash>`) before sending it once. `deploy.sh` shows that line on the terminal as it comes (redacted), so a run
   killed afterwards still leaves the hash on screen.
   - A refusal of the write API (insufficient resources or balance, validation failure, and the like) stops the run
     as before.
   - `-32601`, `51` (class already declared) and `52` (invalid nonce) can also echo a transaction that went in, so
     the signer first reads the hash's receipt for 30 s (3 reads). If it finds one, it goes on as below; otherwise it
     fails with `refused (<code>); no receipt for <hash> after 30 s; check it before any rerun`.
   - Any other failed answer is not sent again: a timeout such as dRPC's `30: Request timeout on the free plan`,
     HTTP 5xx with or without JSON, a result under HTTP 5xx, a page that is not JSON, or a network error. The signer
     reads that hash's receipt (`starknet_getTransactionReceipt`, with the read retry) every 5 s until 5 minutes
     after the first read, by the clock, so a slow or flapping node does not stretch the wait. Each read is aborted
     after 30 s, or at the deadline, so a node that never answers cannot hold it either. A receipt that names another
     hash is ignored.
   - An add* answered with another hash than the signed one stops the run: `node returned <h1>, signed <h2>; check
     both before any rerun`.
   - What the receipt shows decides the outcome:
     - SUCCEEDED: the command goes on as a normal success, with the same output.
     - REVERTED: it fails with that status.
     - No receipt in time: it fails with `sent, status unknown: <hash>; check it before any rerun`, and `deploy.sh`
       stops.
   - Spec 0.10 has no REJECTED status. starknet-devnet 0.10.0 refuses an invalid transaction at the add* (`55`) and
     keeps nothing: its hash then answers `29` (not found) to both the status and the receipt. A rejected
     transaction whose answer was lost thus ends as "status unknown". A node outside the spec that answers REJECTED
     fails with that status.

   **Rerunning after a partial deploy:** first look up the hash the run named (an explorer, or
   `starknet_getTransactionReceipt`) and wait until it is final or known lost. A rerun is safe for declares: each
   goes through `declareIfNot`, so a class the node has is skipped, and the funding check counts only the classes
   left. It is **not** safe once a deploy has been sent: every deploy uses a fresh random salt, so a rerun deploys
   a second set of contracts at new addresses. After a deploy, never rerun without checking what is on chain; finish
   the wiring by hand from the addresses the run printed instead, or decide to redeploy everything on purpose.

   **Estimate only (S-1c), before a deployment or to diagnose one:** `scripts/deploy.sh sepolia --estimate-only`
   runs every check above, the signer's install and the build, then estimates each declare in deploy order
   (`signer estimate declare`, which refuses every `starknet_add*` method) and sends nothing. It prints the node's
   `starknet_specVersion` in its header and on every line, so runs on different endpoints compare without the URL,
   then per class: the Sierra file's bytes, the CASM felts, the request's bytes, whether the class is declared, and
   the estimate or the node's whole error (redacted). It exits 1 when one estimate fails. Rehearse it first on a
   fresh devnet with `scripts/deploy.sh sepolia --rehearse --estimate-only`. Diagnostic options only, after
   `--estimate-only`: `--bounds <l1_amount,l1_price,l1_data_amount,l1_data_price,l2_amount,l2_price>`,
   `--validate`, `--block-id pre_confirmed`. Before its output is pasted anywhere, check the log for the three
   values, by variable, never printing them. On Sepolia the signer uses a fixed tip (0x5f5e100) and reads no block
   (`scripts/signer/README.md`).
3. `sepolia.json` is committed in a follow-up PR, with the run's output (addresses, transactions, the smoke).
4. The smoke's test-sized traces are listed in the README; its paid game is settled by the keeper from
   `(D + 2) x 86400`.
5. The report gives the addresses of `sepolia.json` (contracts, class hashes, `deployed_block`) to the PM.

## Checks that gate a merge

- CI build
- Format
- Contracts tests
- Client build and tests
- Signer tests (`scripts/signer/`: `npm ci && npm test`, Node 24; its devnet rehearsal tests are skipped in CI,
  which has no build or node for them)

A change of `scripts/deploy.sh` or `scripts/signer/` that touches the Sepolia path also needs, from its reviewer,
`scripts/deploy.sh sepolia --rehearse` on a fresh local starknet-devnet (seed 42), end to end with its smoke
(`== smoke ok`), and `npm test` in `scripts/signer/` with `contracts/target/dev/` built, so the signer's own
rehearsal tests run. Not in CI: the rehearsal took 275 s on the VPS with the contracts already built (2026-10-10),
above the 2 minutes a CI job may spend on it.

## Audits

Audits are exceptions, by kind of task, never for a whole track:

| Change | Phase | Lens |
|---|---|---|
| Access control of the native contracts | P2 | security |
| Any change that mints, burns, holds or pays tokens | P8 | security and economy |
| A change of the structure-state algorithm | P5 | correctness against the goldens |

Briefs that name an audit for other tasks do not bind.
