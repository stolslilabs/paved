# F brief, part A: the fresh Sepolia deployment tool, the definitions, and a devnet rehearsal

Track CORE of Paved. Step F of the D-25 order (P-53): one fresh Sepolia deployment, after D-23b (#354, 382a241). R-1 part B and D-18c part B were dropped: F supersedes them (PM, 2026-10-14). **Part A sends nothing
to Sepolia**, not even an estimate. It makes `deploy.sh`'s fresh path deploy the whole D-19 to D-25 system, defines the
quests and achievements, and rehearses all of it on a local devnet. Part B is the real run, briefed separately.
Commit this brief as `docs/briefs/f-fresh-sepolia.md`, as the first commit of your PR.

## Context

- P-53: one fresh Sepolia deployment after D-23b. The test data is dropped and the indexer is rebuilt once, with CLIENT
  and META shipping their matching versions in the same wave. D-17 stays the path for mainnet.
- The system on main after D-23b (#354):
  - the contracts: Challenge (ex-Daily), Setup, Collection, Economy, Vault, PavedToken, Faucet (ex-MockUSDC) and
    MockRouter (test network);
  - no Account, no Tutorial, no Lobby;
  - Setup holds the wiring (economy and collection) and the reporter allowlist, with Challenge in it.
- `deploy.sh`'s devnet path already deploys most of this; steps D, E and D-23b extended it. Read it first and list
  what the fresh Sepolia path still lacks.
- `--repoint` and `--d18` stay as they are, pinned to 06c024d. Do not touch them.
- Requirements gathered for F:
  1. **The quest and achievement definitions** (PM, 2026-10-13): the `quests.md` v1 set, as Setup-owner calls in the
     fresh path:
     - the 4 daily quests;
     - the 9 achievements, task 9 and the indexer-reported Podium (task 8) included if `quests.md` says they are
       defined on chain;
     - the tutorial task 10 behind First Stone.
     Use the figures as `quests.md` writes them, including any still marked "to calibrate", and list those.
  2. **Order (security audit of #346):** `claim_tutorial` is one-shot, so the definitions run **before** Setup's address
     is written to the deployment file that the client reads. The smoke checks that Setup holds every definition before
     the run reports success.
  3. **The deployment file's keys (PM's rulings):**
     - the test USDC is keyed `contracts.Faucet`, no longer `contracts.MockUSDC`;
     - the game contract is keyed `contracts.Challenge`, no longer `contracts.Daily`;
     - CLIENT follows in the same wave.
  4. **RISKS.md R-4:** its seed formula is stale. The seed is Poseidon(salt, Challenge's address, token id) since the
     PM's addition to P-50. Correct it.
  5. The economy's configuration: the P-46 values (`slope_bps` 12,220, MEAN0 3,980,000), as deploy.sh already passes
     them. Check them.

## Goal

1. **The tool.** `scripts/deploy.sh sepolia [--check-only]`, the fresh path. It mirrors the existing modes:
   - the same signer path and secret handling;
   - receipt-checked resume through a record in the deployment file;
   - SN_MAIN refused.

   Before it sends anything, it checks:
   - the chain id is SN_SEPOLIA;
   - the deployer's funding covers the estimate (the signer's funding check);
   - it refuses to overwrite a deployment file that holds a live deployment unless the operator names a new output
     path. The old `sepolia.json` describes the old Sepolia deployment. Propose how the new file is named or replaces
     it in part B, and say which.

   Its steps:
   1. declare every class;
   2. deploy, in dependency order;
   3. wire: Setup's economy and collection, Challenge's Setup, Setup's reporter (Challenge), the minters, the
      Economy's router and pool;
   4. define the quests and achievements on Setup;
   5. write the deployment file, keyed as above;
   6. smoke:
      - a paid spawn;
      - a D-18 build;
      - a game over that reports to Setup;
      - `claim_tutorial` once;
      - the `wiring()` view;
      - `owner()` on every ownable contract;
      - the Faucet refusing mainnet is already covered by its constructor.

   It is resumable: rerun after a stop, it reads what landed and sends only the rest, and a rerun after completion
   sends nothing.
2. **The rehearsal, on a local devnet** (seed 42, your own process, stopped by PID at the end):
   - `--check-only` first, which must end with "every check passed; nothing was sent";
   - then the run and the smoke;
   - kill it once mid-run, after the deploys and before the definitions, and resume it;
   - rerun after completion: it sends nothing;
   - record the transaction count and the deployer's spend.
   Use the devnet's predeployed account through the child's environment only, as `--rehearse` does.
3. **Docs.** `docs/programme/OPERATIONS.md`: the fresh deployment procedure, its command, checks, resume and smoke,
   the order (definitions before the address is published), and what CLIENT and the indexer change in the same wave.
   `RISKS.md` R-4 (requirement 4).

## Tests

- `scripts/test-deploy-url.sh`, extended to the fresh Sepolia path with a marker URL, green.
- `scripts/check-artifact-names.sh` green.
- The signer suite only if you touch `scripts/signer/**`.
- The rehearsal (point 2), with its output in the PR.

## Runs (VPS)

- starknet-devnet: `~/.asdf/installs/starknet-devnet/0.10.0/bin/starknet-devnet`.
- scarb build: `prlimit --as=12884901888`, after `free -g` shows 8 GB or more available. One build at a time.
- For `test-deploy-url.sh`, put Node 24's binary first on `PATH`.
- **Never export the `STARKNET_*` variables** into the tests or the rehearsal. Nothing is sent to Sepolia.
- A run with no progress for 15 minutes is stopped and reported. Stop every devnet you started, by its own PID.

## Git

- Push the branch the plugin created for this thread, right after the brief commit.
- **Never `git rebase`.** If main moves, `git merge origin/main`. Plain pushes only.

## Allowlist

- `scripts/deploy.sh`: the fresh Sepolia path and what it shares with devnet. Not `--repoint` or `--d18`.
- `scripts/test-deploy-url.sh`, `scripts/check-artifact-names.sh`.
- `scripts/signer/**`, only if a signer command is missing. Say which.
- `docs/programme/OPERATIONS.md`, `docs/programme/RISKS.md` (R-4 only), `docs/briefs/f-fresh-sepolia.md`.
- Not `contracts/src/**`, not `packages/**`, and not `contracts/deployments/sepolia.json` (part B writes it).

## PR

- Title: `feat: F part A, the fresh Sepolia deployment tool with the quest definitions, rehearsed on devnet`.
- Body:
  - what the fresh path deploys and wires, in order;
  - the definitions, with their figures and which are "to calibrate";
  - the checks;
  - the resume;
  - the rehearsal output: each step, the kill and resume, the rerun, the smoke, and the transaction count and spend;
  - the deployment file's name and keys;
  - "For CLIENT": the keys, the file, the order;
  - the funding the real run needs.
- Report: the PR's number and head, the body, and the peaks. Do not merge. A review follows.
