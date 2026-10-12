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

   The node behind `STARKNET_RPC_URL` must (a) accept request bodies of at least about 2 MB, since the declare
   bodies are about 1.8 MB for Daily, 1.67 MB for Tutorial and 1.51 MB for Lobby, and (b) serve
   `starknet_addDeclareTransaction`. Both are checked read-only, with the URL passed to curl through its config on
   stdin, never in argv: a `starknet_chainId` request padded to about 2.5 MB returns HTTP 200, and
   `starknet_addDeclareTransaction` with empty params returns -32602 (invalid params: the method exists), not
   -32601 (method not found). The owner sets `STARKNET_RPC_URL` in the VPS environment to an endpoint that passes
   both checks (it may hold an API key, so it is never written anywhere), and `scripts/deploy.sh sepolia` runs in
   that plain environment, with no override.
   **Zan carried the deploy** (2026-10-11, thread t-0197, main 009bb3c): the public endpoint
   `https://api.zan.top/public/starknet-sepolia/rpc/v0_10` (`starknet_chainId` `SN_SEPOLIA`, `starknet_specVersion`
   `0.10.3-rc.0`) took the 8 declares, the deploys, the wiring and the smoke, 31 transactions with no lost answer and
   `== smoke ok`. It rate-limits: one read during the funding estimates got `-32011: cu limit exceeded; Request too
   fast per second`, which is not retried, so the need fell back to the 200 STRK floor; no send was refused.
   The earlier endpoints, each of which failed (2026-10-10 and 2026-10-11):
   - the first provider: HTTP 503 "Request body size limit reached" at 2.5 MB (`Account` declared, then stopped);
   - Infura Sepolia: `-32601` for `starknet_addDeclareTransaction` (no declare);
   - Cartridge (`/x/starknet/sepolia`, spec 0.9.0, and `/rpc/v0_10`, spec 0.10.2): `-32603: Internal error` on the
     `starknet_estimateFee` of Daily's declare, nothing sent;
   - dRPC public (`https://starknet-sepolia.drpc.org`, spec 0.10.3): intermittent `-32601` on reads
     (`starknet_getBlockWithTxHashes`, `starknet_getBlockWithTxs`) and on sends, and a timeout on a send; a Tutorial declare it
     refused did not land. Daily had been declared by then (t-0182), so the Zan run skipped Account and Daily.

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

**Repointing Sepolia's `Economy` at a new `MockRouter` (E-9, R-1; the tool is rehearsed, the Sepolia run is part B).**
The E-9 class quotes through the router's `quote_swap`, which Sepolia's current `MockRouter` lacks, so an `Economy`
upgrade alone breaks Sepolia's quote. The path keeps the playtest data; its detail is in
`docs/architecture/economy.md`, "As built: E-9". The tool is `scripts/deploy.sh sepolia --repoint`, with the three
variables of phase 2, from merged main; `--check-only` first runs every check below and prints the seed, sending
nothing and writing nothing.

1. The indexer that follows Sepolia runs a version that ignores `RouterSet` (E-9's `IGNORED`, 55a5969 or later)
   before step 4. The tool cannot check it: the PM confirms it before the run.
2. Before anything is estimated or sent, the tool checks: the node's chain id is `SN_SEPOLIA` and the signer checks it
   again (`SN_MAIN` is always refused); the deployer is deployed and is `Economy.owner()`; `Economy`'s class is the one
   of `sepolia.json` or the E-9 one; its stored router (`Economy.addresses().router`, which both classes have) is the
   old `MockRouter` of `sepolia.json`, or the new one a stopped run recorded; the deployer's STRK covers the estimates
   of the declares still to send (the funding check of phase 2, on `MockRouter` and `Economy`).
3. Declare the E-9 `Economy` and `MockRouter` classes (skipped when declared).
4. Deploy the new `MockRouter(PAVED, USDC)` and seed it (`add_liquidity`) at the old pool's current ratio, in one
   multicall with the unstake and the faucet mints. The amounts: the ratio of the old pool's reserves; the depth as
   close to the old pool's as the deployer's PAVED allows, its balance plus an unstake that keeps 10 % of its Vault
   stake staked (E-7: USDC that reaches a Vault nobody stakes in goes to the first staker); the USDC at that ratio,
   from its balance, then the MockUSDC faucet (10,000 USDC per call, 20,000 per address), keeping the 2 USDC of the
   smoke's paid spawn, with less PAVED when that falls short. The old pool's reserves cannot be withdrawn. Test tokens on the test network: CORE's step, not
   an owner's act. **Sepolia only; on mainnet the pool is Ekubo's and none of this applies.** On the 009bb3c state
   (rehearsal, 200,000 PAVED staked, the old pool at 799,893.6 PAVED and 10,001.4 USDC) the seed was 179,999.999928
   PAVED and 2,250.614291 USDC, 79.978164 PAVED per USDC as in the old pool, 22.5 % of its depth. That depth is accepted
   for Sepolia, which moves test tokens only (review of #313); part B's `--check-only` prints Sepolia's own figure.
5. Before `Economy` points at it, the new router must answer `quote_swap` for 1.4 USDC at its own pool key and the
   limit 0, whole fill, PAVED out. Then one multicall of the owner's account: `Economy.upgrade(<E-9 class hash>)`,
   `Economy.set_router(<new MockRouter>)`, `Economy.set_pool(<its pool_key()>, 0)` (only the calls still missing).
6. The tool writes the new `MockRouter` and class hashes in `sepolia.json`, and records the run under its `repoint`
   key (the previous `MockRouter` and `Economy` class, the salt, the seed, every transaction hash), keeping every
   other field: `deployed_block` and every address but the `MockRouter`'s are unchanged. The smoke checks
   `Economy.router()`, `Economy.quote_swap(1400000)` (above 0), `owner()` on the five upgradable contracts, and one
   paid Daily spawn at stake 1, surrendered after. Part B commits the file in a follow-up PR with the run's output.

The run is resumable. Each transaction's hash is recorded in `sepolia.json` before the signer sends it, and each step
reads what landed before it sends anything: rerun after a stop, the tool sends only what is left, and a complete
repoint sends nothing and needs no funding margin. A recorded deploy, seed, repoint multicall, smoke spawn or surrender
is awaited first, up to 300 s: landed, it is not sent again; reverted, it may be; with no receipt the run stops
(check the hash before any rerun). So a seed still in flight is never sent twice, and no second `MockRouter` is deployed
while one is recorded; the salt is recorded first as well, so a repeated deploy could only collide with the first. A
view, quote or receipt that fails stops the run before anything else is sent, and `--check-only` then exits non-zero. Rehearse it on a fresh starknet-devnet (seed 42) on the
009bb3c state, which that commit's own `scripts/deploy.sh sepolia --rehearse` deploys:
`scripts/deploy.sh sepolia --rehearse --repoint --deployment <that run's file> [--check-only]`. R-1's rehearsal (PR
body) ran it end to end, killed it after the `MockRouter` deploy, killed the rerun right after it sent the seed, reran
it at once to completion (one seed, one unstake), then reran it again with no transaction sent.

Neither the indexer nor the client needs a rebuild for the repoint. The indexer reads from `sepolia.json` the
addresses of `Daily`, `Tutorial`, `Account`, `Economy` and `Collection`, `deployed_block` and `chain_id`, and checks
its database against a hash of those five addresses; none of them changes (`Economy` is upgraded in place). The
client reads the same addresses, `PavedToken`, `Vault`, `MockUSDC` and `token`; it never reads the `MockRouter`, and
`Economy.quote_swap(u256) -> u256` keeps its ABI: the release built from 1235607 needs no rebuild. A client built from
main at or after 7e906a1 (#312, E-9b's router pin) reads `Economy.router()` and buys only when it is the deployment
file's `MockRouter`. On Sepolia before the repoint, `Economy`'s class has no `router()`, so such a client cannot buy;
after it, it buys only with part B's `sepolia.json`. The next Sepolia client release is built from the commit where
part B's `sepolia.json` merges, or later.

The same rules as phase 2 hold: the funded account by variable name only, nothing printed, from merged main.

## Checks that gate a merge

- CI build
- Format
- Contracts tests
- Client build and tests
- Signer tests (`scripts/signer/`: `npm ci && npm test`, Node 24; its devnet rehearsal tests are skipped in CI,
  which has no build or node for them)

Not in `ci`: **the mainnet fork test (E-9)**, `contracts/src/tests/economy/fork.cairo`. It checks Ekubo's router
`quote_swap`, the price limit and a partial fill on a fork of Starknet mainnet. Its tests are `#[ignore]`, so the
plain `snforge test` of `ci` skips them; they read the network through a public RPC that needs no key (`MAINNET` in
`contracts/Scarb.toml`, block pinned). Run it on demand, and before the owner's mainnet go, from `contracts/`:
`RAYON_NUM_THREADS=1 prlimit --as=16106127360 -- snforge test paved::tests::economy::fork --ignored --max-threads 2`.
It sends nothing to any network. Its unit-test side (the mock's `quote_swap`, `Economy.quote_swap` on devnet) runs in
`ci`.

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
