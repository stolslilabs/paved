# Sepolia release day: the fresh deployment, in order

Written 2026-10-14 (CORE, t-0339). D-27: Sepolia gets one fresh deployment at the end, with F's tool (`scripts/deploy.sh`,
"Fresh Sepolia deployment" in `OPERATIONS.md`). This is the checklist of that day, in the order it runs: **contracts, then the
indexer, then the client.** Nothing in this file is run before the go of step 1. The deployment, its date and the funded account
stay with the PM and the owner. No line holds a secret: the funded account is in the environment by name only
(`STARKNET_ACCOUNT_ADDRESS`, `STARKNET_PRIVATE_KEY`, `STARKNET_RPC_URL`), and nobody pastes a value into a command, a file or a report.

The rehearsal that backs this file ran twice on local starknet-devnet 0.10.0 (spec 0.10.2, seed 42): at main `a28f1e8d`, and again at
`9924820a` (which has G7a, #413) with the guardian change of this pull request: `deploy.sh devnet`, `deploy.sh sepolia --rehearse`,
`--rehearse --estimate-only` and a `--rehearse --check-only` rerun on the complete record. All passed both times. Its figures are marked as
local ones wherever they appear.

## 0. Before the day

- The contract changes planned before the fresh deployment have merged (P-59: G7's C4 and C6 are before D-27's run).
- The commit to deploy is named by the PM: a commit of `main`, the checkout clean. `deploy.sh` refuses a tree whose contract
  sources (`contracts/src`, `Scarb.toml`, `Scarb.lock`) differ from the merge base with `origin/main`.
- The VPS, as for every Cairo build: `scarb` and `snforge` through the shims on PATH only, one Cairo run at a time, the build
  prebuilt under the cap of `AGENTS.md` (`RAYON_NUM_THREADS=1 prlimit --as=12884901888 -- scarb build`, run in `contracts/`:
  3.6 GB RSS, 3 minutes measured on 2026-10-14). `deploy.sh` builds too, so its build is then a no-op.
- Node 24 on PATH, `scripts/signer` installed by the script itself (`npm ci`).
- The CLIENT side is ready to ship (the PR that reads F's keys has merged: "Inputs" in `docs/client/f-release.md`).

## 1. Contracts

### 1.1 The go

Two words, in this order, before any transaction:

1. **The PM's:** the commit, and that the contracts are final for this deployment.
2. **The owner's:** Sepolia gets its fresh deployment now (D-27), and the funded account is the one in the environment.

Without both, nothing below runs. A reserved act on a production network never applies here (Sepolia is a test network, D-16),
but the spending is the owner's account, so the go is theirs.

### 1.1a The rehearsal at the deploy commit: after the go, before the funded run

The two rehearsals above ran at `a28f1e8d` and `9924820a`; `main` has moved since (#415 at least). So the day rehearses again, at the commit
named in 1.1, with the checkout clean. It runs on a fresh local starknet-devnet, sends nothing to Sepolia and needs no funded variable
(`deploy.sh --rehearse` unsets them first), so the funded `--estimate-only` of 1.2 stays the first command against Sepolia.

1. A fresh devnet, as `deploy.sh` documents it: `starknet-devnet --host 127.0.0.1 --port 5050 --seed 42` (a new process, not one that
   already ran a deployment).
2. The rehearsal, with its record in a temporary directory outside the repository (`<tmp>` is a file path in an existing directory):

   ```
   scripts/deploy.sh sepolia --rehearse --out <tmp> --guardian deployer
   ```

   Expected: `smoke ok`, then `== fresh: complete; a rerun sends nothing` and the record's content. Exit 0.
3. The check on that record, still on the same devnet:

   ```
   scripts/deploy.sh sepolia --rehearse --check-only --out <that record>
   ```

   Expected last line: `== fresh: check only: every check passed; nothing was sent`. Exit 0.
4. The commit's sha (`git rev-parse HEAD`) is written into the record of the day, with the result of both commands.

**Stop** if either command fails or ends otherwise: nothing goes to Sepolia, not even the `--estimate-only` of 1.2. Report the failing
step's output exactly to the PM; do not fix contracts or scripts on the day. The devnet and `<tmp>` are the rehearsal's own and are
discarded after (stop the devnet process you started; remove only `<tmp>`).

### 1.2 The funding check: the first step of the day, with no earlier run

```
scripts/deploy.sh sepolia --estimate-only
```

It reads only: every check of the run, the signer's install and the build, then a fee estimate of each declare in deploy order
against Sepolia, with the funded account. It sends nothing (the signer's fetch refuses every `starknet_add*` method). **It is not
run before the day.** On the day it is the first command: its figure is the real one.

Expected: `== node ...`, the chain id `0x534e5f5345504f4c4941`, eight lines `estimate <Class>: ... ok, overall_fee ...` in the order
Challenge, Setup, Faucet, PavedToken, MockRouter, Vault, Economy, Collection, then `== funding: 8 class(es) to declare, estimated at
<n> STRK; need 1.25 x <n> STRK + 20 STRK margin = <m> STRK`, `deployer STRK balance <b> STRK: covers the need of <m> STRK`, and
`== estimate only: each of the 8 classes estimated or already declared; nothing was sent`. Exit 0.

**Stop** if an estimate line shows an error (it prints the node's whole error), if the balance is below the need, or if the chain id
is not Sepolia's. The funding figures, side by side:

| Figure | STRK | Source |
|---|---|---|
| Held by the D-16 deployer account after F (the PM) | 3,005 | the PM, 2026-10-14 |
| Needed by a fresh deployment (the PM's estimate, from F) | about 150 | the PM, 2026-10-14 |
| Declares of the 8 classes, estimated (9.72 at `a28f1e8d`; Challenge's class grew with G7a) | 9.81 | **local** devnet, `--rehearse --estimate-only` at `9924820a` |
| The whole rehearsed run, spent (declares, deploys, wiring, definitions, the guardian, the smoke) | 9.82 | **local** devnet at `a28f1e8d` (before G7a), balance 1,000 before and 990.18 after; not re-measured at `9924820a` |
| What `deploy.sh` requires before it sends (1.25 x the declares + 20 STRK margin; the bounds of one declare: 33.16 STRK locally) | 33 locally | **local**, the script's own funding check at `9924820a` |

The two local figures are an estimate: a devnet prices gas by its own constants, not Sepolia's, so only their shape carries (the
declares are the bulk, about 99 % of the run; the deploys, the multicalls and the smoke are cents). Sepolia's prices make the real
run cost about 150 STRK (the PM's figure), and the funded account holds twenty times that. The run's own check is the one that counts:
the real `--estimate-only` above, then the same funding check inside the run.

### 1.3 Every check, nothing sent

```
scripts/deploy.sh sepolia --check-only --out contracts/deployments/sepolia-next.json
```

The variables are present (named when missing, never printed), the chain id is SN_SEPOLIA (SN_MAIN is refused by `deploy.sh` and
again by the signer), the deployer account is deployed on the node, `contracts/deployments/sepolia.json` is not the output (it
holds the old live deployment and is refused), the build, the funding check. Expected last line:
`== fresh: check only: every check passed; nothing was sent`. Exit 0; the file `sepolia-next.json` does not exist yet.

### 1.4 The deployment

```
scripts/deploy.sh sepolia --out contracts/deployments/sepolia-next.json --guardian deployer
```

**The guardian is set in this run** (PM, 2026-10-14): the fresh path sets the deployer as Challenge's guardian by default, right
after the wiring; `--guardian deployer` only spells that default out, and no other value is accepted. Nothing is left to do
by hand afterwards.

**The default is not Sepolia's alone.** It changes `deploy.sh devnet` for every user of it: the node's first predeployed account (the
deployer) becomes Challenge's guardian, with one `GuardianSet` event at deploy. CLIENT's `e2e-devnet` test
(`packages/chain/test/e2e-devnet.test.ts`) calls `set_guardian` with the same account again, which is harmless (the same address, one
more `GuardianSet`).

Expected, in order (each stage prints its transactions; the names below are the `== ` headings of the output):

| Stage | What lands | What to see |
|---|---|---|
| `== build`, `== funding` | the build; the funding check | `deployer STRK balance ... covers the need` |
| `== declare` | the 8 classes | one `declare <Class> <hash> tx <hash>` per class |
| `== deploy` | Faucet, PavedToken, MockRouter, Vault (vPAVED, exit fee 500 bps) | one `deploy <Name> <address>` each |
| `== pool and stake` | the pool (800,000 PAVED and the Faucet's 10,000 USDC), **the Vault's 1,000 dead shares, then the owner's 199,000 PAVED stake**, then Economy (split defaults), `PavedToken.set_minter(Economy)` | `PavedToken: minter Economy, admin 0`; `PavedToken: total supply 1,000,000 PAVED, deployer holds 0`; `Vault: dead shares 1,000 vPAVED, owner's stake 199000 vPAVED` |
| (Setup, Challenge, Collection) | deployed after the stake | |
| `== wire` | one multicall: `Setup.set_reporter(Challenge)`, `Economy.set_game(Challenge)`, `Setup.set_economy`, `Setup.set_collection`, `Collection.set_minters(Challenge, 0)`; then **`Challenge.set_guardian(@account)`** | `Setup: Challenge reports to it...`; `Economy: router MockRouter, ... config burn 7368 sigma 0 slope 12220 cap 5 target 1,000,000 PAVED referral 500, mean 3980000`; `Challenge.set_guardian(the deployer): the deployer is the guardian` |
| `== definitions` | quests 1 and 5 to 16 and achievements 1 to 16 on Setup (29 definitions, one multicall): v1 (quest 1, Daily Run; achievements 1 to 9) and **v2a** (quests 5 to 16, achievements 10 to 16; see below); quests 2 to 4 are not defined (four dailies a day, the PM's ruling of 2026-10-14) | `29 definition(s) to send`; `Setup holds quests 1 and 5 to 16 and achievements 1 to 16, v1 and v2a, each as specified` |
| `== wrote contracts/deployments/sepolia-next.json` | `contracts` and `token`, only now (claim_tutorial is one-shot) | |
| `== smoke` | reads, then a paid spawn at stake 1, one build, the surrender, `claim_tutorial`; the keeper settles the game at (D + 2) x 86400 | `smoke ok` |
| end | | `== fresh: complete; a rerun sends nothing` and the file's content |

**The order the rehearsal checked** (and the script asserts): the dead shares and the owner's stake are in the Vault before Economy
exists and before `Economy.set_game` (the `pool and stake` stage precedes `wire`); the fee and split defaults are in
Economy's constructor and are read back (`burn_bps` 7,368, referral 500, the Vault's exit fee 500 bps); every owner is the
deployer, read back on Economy, Challenge, Setup, Collection and Vault in the smoke (`owner() of Economy, Challenge, Setup,
Collection and Vault: the deployer`); Challenge's Setup is wired and Setup's reporter is Challenge; the guardian is set after the wiring and
before the definitions, and the smoke reads it.

**The smoke reads, and fails otherwise:** `Challenge.guardian(): the deployer; spawn_paused(): false`; and, for the definitions,
`Setup holds every definition, each as specified: quests 1 and 5 to 16, achievements 1 to 16 (v1 and v2a)`.

**The v2a definitions to expect** (`quests.md`, "As built: v2a, definitions only"; no reward on any, no contract change). The run reads each one back from Setup's storage
and dies on one that is there but not as below:

| Ids | What | Schedule (seconds) | Tasks |
|---|---|---|---|
| quest 1 (v1) | Daily Run, the only v1 daily defined (quests 2, 3 and 4 are not) | 86,400 in 86,400, start 0 | `GAME_FINISHED` 1 |
| quests 5, 6, 7 | rotating daily, roads and cities | 86,400 in 259,200, start 0 / 86,400 / 172,800 | `STRUCTURE_SCORED` 4 / 8 / 12 |
| quests 8, 9, 10 | rotating daily, forests | the same | `FOREST_SCORED` 2 / 3 / 4 |
| quests 11, 12, 13 | rotating daily, points | the same | `POINTS` 2,000 / 5,000 / 8,000 |
| quests 14, 15, 16 | weekly (Monday 00:00 UTC to Sunday) | 604,800 in 604,800, start 345,600 | `FOREST_SCORED` 5; `STRUCTURE_SCORED` 30; `POINTS` 20,000 |
| achievements 10 to 16 | higher tiers, no window | | `FOREST_SCORED` 50 (40 points); `WONDER_SCORED` 10 (50); `BIG_STRUCTURE` 10 (40); `HIGH_SCORE` 10 (50) and 25 (80); `GAME_FINISHED` 250 (60) and 1,000 (80) |

The live rotating quest of a UTC day is the one whose start offset is `day number mod 3` (a day number is `floor(time / 86400)`).
Task ids 11 to 18 are reserved and none is defined. The client shows `Quest #<id>` (`Achievement #<id>` for an achievement) for an id it has no text for (CLIENT's part).

**What the definitions check proves, and what it does not.** `deploy.sh` reads each definition back from Setup's storage and compares it with
quiver 0.2.0's packing (`fresh_expected_slots`, `fresh_slot_matches`). No CI test pins that packing: the fake node of `test-deploy-url.sh` uses the
same formula, so only a run against the real Setup class checks it. That is step 1.1a's rehearsal at the deploy commit. A line `quest N is
defined, but not as specified` (or `achievement N ...`) there, or on the day, means **stop**: a definition cannot be edited, so report it and
send nothing more.

**The events to expect in the run's blocks** (105 events in all were read from the rehearsed devnet before v2a, with v1's 4 quests and 9 achievements; the fresh set has 29 definitions, one `QuestDefined` or `AchievementDefined` each, 16 more than v1's 13, so **121 is computed, not measured**. The two definition rows below were **measured** on a local devnet run of `deploy.sh devnet --unmerged` at this pull request's head: 13 `QuestDefined` and 16 `AchievementDefined` read by selector; that run's other events include the smoke's game, so its 177 are not comparable; counted by selector):

| Event | Count | Emitted by |
|---|---|---|
| `OwnershipTransferred` | 5 | Vault, Economy, Setup, Challenge, Collection (each Ownable, at its constructor; PavedToken has no owner) |
| `ExitFeeSet` | 1 | Vault (constructor) |
| `PoolSet` | 1 | Economy (constructor) |
| `EconomyConfigured` | 1 | Economy (constructor) |
| `GuardianSet` | 1 | Challenge (the wiring step's guardian call) |
| `QuestDefined` | 13 (measured on devnet: Daily Run of v1 + 12 of v2a; quests 2 to 4 are not defined) | Setup (the definitions multicall) |
| `AchievementDefined` | 16 (measured on devnet: 9 of v1 + 7 of v2a) | Setup (the definitions multicall) |

The indexer must know `GuardianSet` (and `SpawnPaused`, `SpawnUnpaused`) before it reads this deployment: it halts on an unknown
selector. That is step 2's concern (it is built from the same commit), and the reason the indexer is rebuilt after the contracts.

### 1.5 Recording the deployment

1. The run wrote `contracts/deployments/sepolia-next.json` (the keys of "The deployment file" in `OPERATIONS.md`:
   `contracts.{Challenge,Setup,Collection,Economy,PavedToken,Vault,Faucet,MockRouter}` each `{address, class_hash}`, `token`,
   `network`, `chain_id`, `rpc_url` as `$STARKNET_RPC_URL`, `deployed_at`, `deployed_block`, and the tool's `fresh` record).
2. In the pull request of the day: `git mv contracts/deployments/sepolia-next.json contracts/deployments/sepolia.json` (the old file stays in the history;
   the client, the indexer and META keep reading `sepolia.json`).
3. The ABIs: `scripts/abis.sh` (the build is the one deployed; the ABIs are checked by CI against the build); commit any difference.
4. The addresses go to the PM in the report: all eight contracts, their class hashes, `deployed_block`, the `fresh` record's transaction hashes.
5. The check against the chain, read-only, from that commit (it is also step 2 of the indexer release):
   `CHECK_RPC_URL=<the Sepolia RPC URL> node scripts/client/check-deployment.mjs --file contracts/deployments/sepolia.json`
   ends `every check passed; nothing was sent`.

### 1.6 If a step fails mid-way

The run is resumable and the record is the file `--out` names (`fresh`): the salt and the first run's commit (written before the first
send), each class hash, each transaction hash as the signer sends it. **Rerun the same command.** The rerun:

- awaits each recorded transaction's receipt first (up to 300 s, `REPOINT_WAIT_S`): `SUCCEEDED` is not sent again (a deploy's
  address is read from its receipt); `REVERTED` may be sent again; **no receipt stops the run with the hash named** (look it up
  before rerunning: it may be pending); a hash the signer finds `not landed` is cleared and sent again;
- skips each step whose result is on the chain (declares, deploys, the wiring, the guardian, each definition);
- refuses a changed build: a resumed record's classes must be the ones built (so the same commit, never another);
- needs the funding for what is left only; after `fresh.complete` it sends nothing, needs no margin, and reads back only what always
  holds: addresses, classes, `Setup.wiring()`, `router()`, the definitions and **`owner()` of Economy, Challenge, Setup, Collection and
  Vault, which must still be the deployer on every run (the run dies if one is not)**. The guardian and `spawn_paused()` are live state
  since (the owner's `set_guardian`, the guardian's pause), so a complete record's rerun does not read them.

`--check-only --out <the same file>` on a partial record lists each recorded transaction with its status and what a run would send,
and sends nothing: the first thing to run after a stop. The funded account's nonce is never reused by hand. A failure that is not a
network or node one (a revert in the contracts, a check that fails on the chain) stops the day: report it exactly (the failing
step's output), do not fix contracts on the day, and do not delete the record. `--repoint`, `--d18` and `--upgrade-challenge` are not
part of the fresh path.

## 2. Indexer

After the contracts (1.5 done: `sepolia.json` is on `main`), and before the client. By reference to CLIENT's
[`docs/client/f-release.md`](../client/f-release.md), each step in order, none copied here:

1. The inputs and F's commit: [Inputs](../client/f-release.md#inputs).
2. The checks against the file and the chain: [Checks against the file](../client/f-release.md#checks-against-the-file).
3. The order of the release, steps 1 to 3 (before F, the checks, the indexer): [The order, with the indexer](../client/f-release.md#the-order-with-the-indexer).
4. The indexer's commands (stop the service and the watch, release F's commit, schema 11, `rebuild` to `status ok`, `state ok`,
   `behind 0`, start): "Release at F" in [`docs/client/indexer-hosting.md`](../client/indexer-hosting.md).

The indexer must be a build that knows G4's events (`GuardianSet`, `SpawnPaused`, `SpawnUnpaused`), which the fresh run emits.

## 3. Client

After step 2 is done (a client published first shows "unavailable" for the leaderboard, the player pages and the quests):

1. Build: [Building the client](../client/f-release.md#building-the-client).
2. Publish and rollback: the same section (`publish.sh`, `switch.sh`).
3. Smoke in a browser, steps 1 to 9: [Smoke in a browser](../client/f-release.md#smoke-in-a-browser).
4. Done: [What "done" means](../client/f-release.md#what-done-means).

## 4. Owner handover

**Mainnet only, deferred (D-28); on Sepolia the deployer stays owner.** The deployer owns Economy, Challenge, Setup, Collection and the
Vault, is Challenge's guardian, and keeps them. No `transfer_ownership` is sent on the day.

## 5. After the deployment: D-28's measure

D-28 (3): Sepolia's performance is measured once the fresh deployment exists. CLIENT's measure is
`scripts/e2e-sepolia/part-b.mjs` (#376) with `--confirmed --extra-mint --purchases 2 --moves 5`, writing `latency.json` and `latency.md`;
how it runs and what "confirmed" means are in [Latency](../client/f-release.md#latency-what-a-player-feels-s1-d-28). It spends test funds on Sepolia: the owner runs
it, not CI and not a thread. The contract-side reading of that script (what it records and what it cannot) is in the pull request
that added this file, and in "The D-28 measure, contract side" below.

### The D-28 measure, contract side

Read from `scripts/e2e-sepolia/part-b.mjs` and `latency.mjs` at `a28f1e8d`:

- **It does record the finality it waits for.** The page's own polls of `starknet_getTransactionStatus` are captured per transaction
  and `latency.json` keeps, for each of the move, purchase and mint, the first time each `finality_status` was answered
  (`RECEIVED`, `PRE_CONFIRMED`, `ACCEPTED_ON_L2`), since t0; the `accepted` field of a move is the first `ACCEPTED_ON_L2` or
  `ACCEPTED_ON_L1`. The client itself (`waitForTransaction`) waits for `ACCEPTED_ON_L2`, and fetches the receipt after that.
- **It does not record "receipt to ACCEPTED_ON_L2".** By construction there is no such interval: the receipt is fetched after the status
  is `ACCEPTED_ON_L2`, so `receipt` is later than `accepted` by one poll and a round trip. What it measures is t0 to hash (signing),
  hash to confirmed, and the `PRE_CONFIRMED` to `ACCEPTED_ON_L2` gap. The first status is seen at the page's 250 ms poll, so a
  status shorter than that is absent, not zero.
- **The gap on the contract side:** the script records no chain-side figure. It keeps no block number, no block timestamp and no actual
  fee or L2 gas of the transaction, so the wait cannot be split into the sequencer's inclusion time and the contracts' execution cost,
  and it cannot show whether a slow move is slow because of its gas (G7's subject) or the network. All of its marks are the host's clock.
  The settle and keeper path (`settle` at (D + 2) x 86400) is out of its scope. No second script is written here (the brief forbids it);
  if the owner wants the split, the receipts the script already sees carry the block number, `actual_fee` and `execution_resources`, and
  a later change of `latency.mjs` (CLIENT's file) can keep them.
