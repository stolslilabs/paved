#!/usr/bin/env bash
# Builds, declares and deploys the native Paved contracts, writes contracts/deployments/<network>.json for the
# client, then runs a smoke check.
#
# Usage: scripts/deploy.sh devnet [--unmerged] [--guardian deployer]
#        scripts/deploy.sh sepolia [--rehearse] [--check-only] [--out <file>] [--guardian deployer]
#        scripts/deploy.sh sepolia [--rehearse] --estimate-only [--bounds <6 integers>] [--validate] [--block-id <tag>]
#        scripts/deploy.sh sepolia --repoint [--check-only]
#        scripts/deploy.sh sepolia --rehearse --repoint --deployment <file> [--check-only]
#        scripts/deploy.sh sepolia --d18 [--check-only]
#        scripts/deploy.sh sepolia --rehearse --d18 --deployment <file> [--check-only]
#        scripts/deploy.sh sepolia --upgrade-challenge [--check-only] [--guardian deployer]
#        scripts/deploy.sh sepolia --rehearse --upgrade-challenge --deployment <file> [--check-only] [--guardian deployer]
#
# Networks: `devnet` (a local node, D-8) and `sepolia` (Starknet Sepolia, public playtests, D-16). Every other value
# is refused: mainnet is the owner's act. Sepolia runs the devnet economy path (P-39): the Faucet (D-25 B, a bounded USDC
# faucet, S-1; keyed contracts.Faucet since F) and MockRouter, with the same pool. `deploy` refuses the Faucet and MockRouter by name on mainnet, and the old
# mock Token off devnet (no path deploys it since F: devnet.json has one key per contract).
#
# Since the PM's ruling of 2026-10-14 `devnet` sets a guardian too, for every user of it: the node's first predeployed
# account (the deployer) becomes Challenge's guardian, with one GuardianSet event at deploy. CLIENT's e2e-devnet test sets
# the same guardian again, harmlessly (the same address, one more GuardianSet).
#
# --unmerged (devnet): deploys the working tree of a pull request (the source check below is skipped) and writes
# the deployment file to a temporary path, printed at the end, never to contracts/deployments/. The committed file
# is only written from main-equivalent sources.
#
# devnet: the node is not started here. Start a seeded one first (addresses are then stable across runs):
#   starknet-devnet --host 127.0.0.1 --port 5050 --seed 42
# It must be fresh: a second run on the same node fails at the first deploy (same addresses).
#
# sepolia (S-1, D-16, P-39): the devnet path on Starknet Sepolia, less P-38's test PAVED. Deploys
# use `--unique` and a fresh random salt (a public network: addresses then depend on the deployer). The smoke cannot
# move Sepolia's time, so it leaves its paid game for the keeper to settle at (D + 2) x 86400. It reads three
# variables, by name only:
#   STARKNET_ACCOUNT_ADDRESS  the funded deployer (owner) account
#   STARKNET_PRIVATE_KEY      its key: never printed, logged or written to a file
#   STARKNET_RPC_URL          a Sepolia RPC endpoint (it may carry an API key: never printed)
# It refuses to start when one is missing, naming it. Every transaction (declare, deploy, invoke, multicall) and
# every view call goes through the starknet.js signer in scripts/signer/ (P-40), installed there with `npm ci`:
# sncast 0.64.0 signs only from an accounts file, a keystore or a Ledger, and its `--url` would put the RPC URL in
# argv. The three values are copied into unexported shell variables and the variables unset, so only the signer
# receives them, through its own environment (`send`), never argv; no other child (curl, python3, scarb, sncast, npm)
# inherits them. The URL and the request reach curl through its config on stdin. No value of the three is printed:
# the URL and the deployer show as `$STARKNET_RPC_URL` and `$STARKNET_ACCOUNT_ADDRESS`, the signer's calldata names
# the deployer `@account`, and comparisons read it on stdin. Before anything is sent: the chain id is
# SN_SEPOLIA, the deployer account is deployed on the node, then the signer checks the chain id again itself.
# Phase 2 runs it from merged main (docs/programme/OPERATIONS.md).
#
# sepolia, the fresh path (F, P-53; docs/programme/OPERATIONS.md, "Fresh Sepolia deployment"): one whole new system,
# resumable. Before anything is built or sent: the variables, the chain id SN_SEPOLIA (SN_MAIN is refused there and by
# the signer), the deployer deployed, and the deployment file it will write: a file holding a live deployment (one with
# no `fresh` record, as contracts/deployments/sepolia.json of the old Sepolia deployment) is refused unless the operator
# names a new output path with --out <file>; a file with a `fresh` record for this network and chain is resumed. After
# the build: a resumed record's classes are the ones built. Then the funding check (the declares still to send, as
# below). In order, each step skipped when what it would send has landed (read from the chain):
#   1. declare the 10 classes; 2. deploy Faucet, PavedToken, MockRouter, Vault (vPAVED), then the pool (one multicall)
#   and the Vault's dead shares with the owner's stake (one multicall), Economy (its router, pool key and the P-46 configuration in its constructor),
#   PavedToken.set_minter(Economy), Setup, Challenge(owner, USDC, Setup), Collection, Story(owner, Setup), Avatar(owner, Setup); 3. wire, one multicall of what is
#   missing: Setup.set_reporter(Challenge), Setup.set_reporter(Story), Setup.set_spender(Avatar), Economy.set_game(Challenge), Setup.set_economy, Setup.set_collection,
#   Collection.set_minters(Challenge, 0), then read back with Economy's router, pool, config and mean; 4. define the
#   quests.md v1 and v2a sets on Setup (quests 1 and 5 to 16, achievements 1 to 16), one multicall of the definitions Setup does not
#   hold (FRESH_QUESTS, FRESH_ACHIEVEMENTS), each one read back as specified, followed in the same multicall by the shop
#   (cobbles v1, part 2: Economy.set_seller(Setup) and Setup.set_pack x 4, FRESH_PACKS), the skin prices (part 3:
#   Setup.set_skin_price for the 19 plans of each theme of FRESH_SKIN_THEMES, today theme 1, Forest) and the cobbles (set_quest_cobbles x 13,
#   set_achievement_cobbles x 15, FRESH_QUEST_COBBLES and FRESH_ACHIEVEMENT_COBBLES) that are not there yet, read back through
#   the views seller, pack, skin_price, quest_cobbles and achievement_cobbles; then Story's campaigns and levels
#   (FRESH_STORY_CAMPAIGNS, FRESH_STORY_LEVELS: set_campaign, set_level), one multicall of what Story lacks, read back
#   through its views campaign and level (docs/architecture/story-mode.md, 8); then Avatar's defaults (FRESH_AVATAR_*: set_parts,
#   set_price_bounds, set_item for the free base set), one multicall of what Avatar lacks, read back through its views
#   parts, price_bounds and item (docs/architecture/avatar-chain.md);
#   5. write the deployment file: `contracts` (Faucet, Challenge, Setup, Collection, Economy, PavedToken, Vault,
#   MockRouter, Story, Avatar) and `token` appear only now, after the definitions (claim_tutorial is one-shot: #346's audit); 6. smoke:
#   owner() on Economy, Challenge, Setup, Collection, Vault, Story and Avatar, Story's Setup, reporter and levels, Avatar's Setup,
#   spender and defaults, the Vault's exit fee, Setup.wiring(), every definition
#   held, a paid spawn at stake 1 (the Vault's PAVED grows by its margin),
#   one D-18 build next to the starter, the surrender (a game over reported to Setup: 2 events or more), the token,
#   claim_tutorial once, pack 1 bought (buy_pack: its USDC through Economy's game split, its cobbles credited); the
#   rehearsal settles the game at (D + 2) x 86400 too.
# The guardian (PM, 2026-10-14): the fresh path sets the deployer as Challenge's guardian in the same run, by default
# (devnet, sepolia and their rehearsal), right after the wiring and before the definitions: Challenge.set_guardian(@account),
# the same call and checks as --upgrade-challenge's (guardian() none or the deployer, another address refused and never
# printed; the deployer's address is the signer's `@account`, in no argv). `--guardian deployer` is accepted on the fresh path
# as the explicit spelling of that default; there is no other value and no way to leave the guardian unset. The smoke reads
# guardian() (the deployer) and spawn_paused() (false) and fails otherwise; a complete record's rerun reads neither (live
# state since: the owner's set_guardian, the guardian's pause). The hash is recorded as `guardian_tx`.
# The record is the file's `fresh` key: the salt and the first run's commit, written before the first send; each class
# hash; each transaction hash as the signer sends it (deploys, pool, stake, minter, wiring, definitions, each smoke
# transaction), never an address. A recorded transaction is awaited first (its receipt, up to REPOINT_WAIT_S): landed, it
# is not sent again (a deploy's address is read from its receipt); reverted, it may be; no receipt stops the run, the
# hash named; a hash the signer finds `not landed` is cleared. So a rerun after a stop sends only what is left, and a
# rerun after completion (`fresh.complete`) sends nothing, needs no funding margin, and reads back only what always holds
# (addresses, classes, owners, wiring(), router(), the definitions, the smoke's recorded game): the pool, the stake,
# Economy's pool, config and mean, the guard rate and the day's figures move with live play, the owner's configure calls
# and the keeper, so they are not asserted then (review of #358). owner() of Economy, Challenge, Setup, Collection and
# Vault is read on every run, a complete record's included, and the run dies when one is not the deployer; the guardian
# and spawn_paused() are not read then. A first run asserts them, the launch pool (800,000 PAVED, 10,000
# USDC) and the guard rate (LAUNCH_RATE) before the smoke's spawn included. --check-only: every check above,
# the funding check, and what the record holds; nothing is sent, the file is not written, and it ends "every check
# passed; nothing was sent".
#
# --rehearse (sepolia): the same Sepolia path, signer included, on a fresh local starknet-devnet (started as above),
# with the node's first predeployed account instead of the funded one (its public dev key, in the signer's
# environment only, with SIGNER_NETWORK=devnet), the working tree's sources, and the file written to a temporary
# path (--out <file>: that file, so a stopped rehearsal can be resumed). The funded account's variables are unset first,
# so a shell that holds them never hands them to the rehearsal. Its smoke also settles the paid game, as devnet's does.
#
# --estimate-only (sepolia, and its rehearsal; S-1c): every check above, the signer's install and the build, then a fee
# estimate of each declare in deploy order (`signer estimate declare`, which runs on a fetch that refuses every
# starknet_add* method), and nothing is sent. One line per class: the node's starknet_specVersion, the Sierra file's
# bytes, the CASM bytecode's felts, the request's bytes, whether the class is declared already, then the estimate or
# the node's whole error (JSON-RPC code, message and data, or HTTP status and body), redacted. Exit 1 when one fails.
# The next three options are diagnostic only, for the -32603 of S-1b (docs/briefs/s1c-estimate.md), passed to the
# signer: --bounds l1_amount,l1_price,l1_data_amount,l1_data_price,l2_amount,l2_price (explicit resource bounds instead
# of zero), --validate (no SKIP_VALIDATE), --block-id pre_confirmed (instead of latest; `pending` left the spec in 0.9).
#
# --repoint (sepolia, and its rehearsal; R-1, E-9): repoints the deployed Economy at a new MockRouter, which E-9's
# Economy.quote_swap needs (the old one has no `quote_swap`). It applies only to a pre-V1b deployment (the 1:1 Vault, whose
# `staked` and `unstake` its seed uses): a vPAVED Vault (P-56) is refused before anything is estimated or sent. It deploys nothing else and keeps every address but the
# MockRouter's. It runs the same checks, signer and build as above (from main-equivalent sources on Sepolia), then reads
# contracts/deployments/sepolia.json (the rehearsal: the file `--deployment` names) and checks, before anything is
# estimated or sent: the file is a sepolia one for the node's chain; Economy.owner() is the deployer; Economy's class is
# the file's or the E-9 one; its stored router (`addresses()`, which both classes have) is the file's old MockRouter or
# the new one the file records; the old MockRouter is of the file's class; a recorded new one is of the E-9 class over
# PAVED and USDC. The funding check then estimates the declares of MockRouter and Economy still to send. In order, each
# step skipped when what it would send has landed:
#   1. declare MockRouter and Economy (declareIfNot);
#   2. deploy MockRouter(PAVED, USDC), salt recorded first;
#   3. seed it, one multicall: Vault.unstake and Faucet.mint (the file's MockUSDC) of what the deployer lacks, both approvals,
#      add_liquidity. The amounts: the old pool's ratio (its reserves); its depth as far as the deployer's PAVED allows,
#      its balance plus an unstake that keeps 10 % of its stake staked (E-7); the USDC at that ratio from its balance,
#      then the faucet (10,000 per call, 20,000 per address), less the smoke's 2 USDC, less PAVED when that falls short;
#   4. once the new router answers quote_swap(1.4 USDC) at its pool key and the limit 0 with a whole fill, one multicall
#      of Economy.upgrade(E-9 class), set_router(new MockRouter), set_pool(its pool_key(), 0) (only what is missing);
#   5. contracts.MockRouter and contracts.Economy.class_hash in the file;
#   6. the smoke: Economy.router() is the new MockRouter, quote_swap(1400000) > 0, owner() on the five upgradable
#      contracts, a paid Daily spawn at stake 1 through the new pool, then its surrender (sent once each).
# Every step is recorded under the file's `repoint` key as it lands (the previous MockRouter and Economy class, the
# salt, the seed, each transaction hash, recorded as the signer sends it), every other field kept, the file replaced
# through a rename. So a rerun after a stop reads what landed and sends only the rest, and a complete one sends nothing.
# A recorded deploy, seed, repoint multicall, spawn or surrender is awaited first (its receipt, up to 300 s): landed, it
# is not sent again; reverted, it may be; with no receipt the run stops, the hash named. A send the signer finds `not
# landed` (no status answered, the nonce unchanged, the object absent) has its hash cleared, so a rerun sends it again. No second MockRouter is deployed
# while one is recorded. A view, quote or receipt that fails stops the run before anything else is sent. A rerun with
# nothing left to send needs no funding margin. --check-only: the checks, the funding check, the seed plan and the new
# router's quote; nothing is sent and the file is not written; a failed check exits non-zero. The file's `deployed_block` and addresses (but the MockRouter's) do not change: the indexer
# and the client read nothing that the repoint changes (docs/programme/OPERATIONS.md).
#
# --d18 (sepolia, and its rehearsal; D-18c): upgrades the deployed Daily, Tutorial and Account to the D-18 classes
# (characters leave the game), points Daily and Tutorial at the D-18 Lobby, and sets Economy's slope to 12,220 bps
# (P-46). It deploys nothing and keeps every address. It runs after R-1's repoint, with the same checks, signer and
# build (from main-equivalent sources on Sepolia), reads the same deployment file (`--deployment` in the rehearsal) and
# checks, before anything is estimated or sent: the file is a sepolia one for the node's chain; its `repoint` key
# records a new MockRouter that is the file's MockRouter and Economy.router() answers it (otherwise it refuses: D-18c
# runs after R-1 part B); the deployer is owner() of Daily, Tutorial, Account and Economy; the classes of Daily,
# Tutorial and Account are the file's or the D-18 ones; the Lobby class Daily and Tutorial run (their `lobby_class`
# storage: no view exists) is the file's or the D-18 one; Economy.config() is printed, and differs from the recorded
# previous one, if any, by the slope alone; the smoke's 2 USDC are held or within the faucet's cap. The funding check
# then estimates the declares still to send. In order, each step skipped when what it would send has landed:
#   1. declare the D-18 Account, Daily, Tutorial and Lobby (declareIfNot);
#   2. one multicall of the owner: Daily.upgrade, Tutorial.upgrade, Account.upgrade, Daily.set_lobby_class,
#      Tutorial.set_lobby_class, Economy.configure (the config read, slope 12,220; only the calls still missing);
#   3. contracts.<Daily|Tutorial|Account>.class_hash and classes.Lobby in the file;
#   4. the smoke: the four classes, the Lobby class of Daily and Tutorial, the config, owner() on the five upgradable
#      contracts, a paid Daily spawn at stake 1, one D-18 build(game_id, orientation, x, y) next to the starter (the
#      first of the 16 placements whose fee estimate the node accepts), the four fields of builder(), the surrender.
# Every step is recorded under the file's `d18` key as it lands (the previous classes and config, each transaction
# hash as the signer sends it), with the same receipt wait, `not landed` clearing and REPOINT_WAIT_S as --repoint: a
# rerun sends only what is left, and a complete one sends nothing and needs no funding margin. --check-only: the checks,
# the funding check and what a run would send; nothing is sent, the file is not written, and it ends "every check
# passed; nothing was sent". A downgrade after a D-18 move is unsupported for open games (docs/programme/OPERATIONS.md).
#
# --upgrade-challenge (sepolia, and its rehearsal; G6, D-17, U-1): upgrades the deployed Challenge in place to the class
# of the build (G1's deck walk and G4's pause guardian on F's deployment), and with --guardian deployer sets the
# deployer as its guardian. It deploys nothing and keeps every address. It runs after the indexer release that knows
# G4's events (GuardianSet, SpawnPaused, SpawnUnpaused: the indexer halts on an unknown selector), with the same checks,
# signer and build as above (from main-equivalent sources on Sepolia), reads the same deployment file (`--deployment`
# in the rehearsal) and checks, before anything is estimated or sent: the file is a sepolia one for the node's chain
# (SN_SEPOLIA; SN_MAIN is refused above and by the signer); the deployer is Challenge.owner(); Challenge's class on the
# node is the file's or the new one (a resume); every other contract of the file (Setup, Collection, Economy,
# PavedToken, Vault, Faucet, MockRouter) is of the file's class on the node and the build's class is the same, so only
# Challenge is upgraded; on the new class, guardian() is none or the deployer (another address is refused, never
# printed) and spawn_paused() is false (unless the record is complete); F's smoke game (`fresh.smoke.game_id`) reads
# back; the smoke's 2 USDC are held or within the faucet's cap. The funding check then estimates the declare if it is
# still to send. In order, each step skipped when what it would send has landed:
#   1. declare the new Challenge class (declareIfNot);
#   2. Challenge.upgrade(new class);
#   3. with --guardian deployer, Challenge.set_guardian(@account): the keyword stands for the deployer, its address read
#      from STARKNET_ACCOUNT_ADDRESS by name by the signer, so it is in no argv and printed as `$STARKNET_ACCOUNT_ADDRESS`
#      (the record says `guardian: deployer`);
#   4. contracts.Challenge.class_hash in the file, every other field kept;
#   5. the smoke: the class read back, owner(), guardian() the deployer (compared, never printed), spawn_paused() false,
#      F's smoke game read back (a game spawned before the upgrade), a paid spawn at stake 1 and one build next to the
#      starter on the new class (left open), then the deployer's STRK balance.
# Every step is recorded under the file's `upgrade_g1g4` key as it lands (the previous class, the commit, each
# transaction hash as the signer sends it), with the same receipt wait, `not landed` clearing and REPOINT_WAIT_S as
# --repoint: a rerun sends only what is left. A complete record (`complete: yes`, written once the smoke passed, and
# `guardian: deployer` when --guardian deployer is given) is never sent to again: its rerun asserts only what cannot
# drift, Challenge's class (the recorded one) and each recorded transaction SUCCEEDED, needs no funding margin, and
# reads neither the owner, the guardian, the pause nor the other classes (live state since: a transfer, the guardian's
# pause, the owner's set_guardian, a later upgrade). A first run and a resume check everything. --check-only: the checks, the
# funding check and what a run would send; nothing is sent, the file is not written, and it ends "every check passed;
# nothing was sent".
#
# devnet keeps sncast (salt 1 and no `--unique`: the signer always deploys unique, which would tie the addresses of
# contracts/deployments/devnet.json to the deployer and the salt of each run).
#
# Since D-21 and D-24 a fresh run deploys no Tutorial and declares no Lobby: the cold paths are Challenge's own code, and
# the quests, the achievements and the tutorial claim are Setup's (--repoint and --d18 keep theirs, run from 06c024d).
# Deploy order (P8 E3, docs/architecture/economy.md sections 1, 4, 5; E1's audit):
#   Faucet, PavedToken(deployer, deployer) (no old mock Token since F: the client's entry token is the Faucet, `token`),
#   MockRouter(paved, usdc) seeded with 800,000 PAVED and the 10,000 USDC its constructor preminted to the deployer
#   (outside the faucet, so nobody can push the deployer to the faucet's caps first), Vault(owner, paved, exit fee
#   500 bps) (vPAVED, P-56) with 1,000 PAVED of dead shares deposited for the Vault itself, then the owner's 199,000
#   PAVED (devnet: 199,000 - 1,000 x N) deposited, both before Economy can buy, Economy(owner, paved, usdc, vault, router, the
#   router's pool key, sqrt_ratio_limit 0 (the mock ignores it), the decided configuration, initial mean
#   3,980 points, launch rate 7.6e31 after the pool's fee), PavedToken.set_minter(Economy) (then
#   minter() == Economy and admin() == 0 are checked), Setup(owner), Challenge(owner, USDC, Setup),
#   Setup.set_reporter(Challenge, true) (Challenge.setup() and Setup.is_reporter(Challenge) checked by read back),
#   Economy.set_game(Challenge) (after the stake), Setup.set_economy(Economy), Collection(owner) (P8 E5b, the soulbound
#   ERC721 of the games), then as the owner Setup.set_collection(Collection) and Collection.set_minters(Challenge, 0)
#   (no Tutorial minter since D-21; Setup.wiring() and Collection.challenge() checked by read back). Since D-25 E no
#   Account is deployed: a player is the wallet address, Setup holds the wiring, and contracts.Account is not written
#   (--repoint and --d18 keep theirs, run from 06c024d). The quests and achievements of quests.md v1 are defined on Setup
#   by its owner after the wiring and before the file is written (F). On devnet only, 1,000 PAVED goes to each predeployed account other than the deployer, from the
#   owner's stake (P-38: the stake is 199,000 - 1,000 x N, the pool stays 800,000). Every spawn mints its game to the player; the smoke reads token_uri and owner_of.
# Challenge's VRF provider (#645, docs/architecture/challenge-vrf.md): the fresh path sets it right after the guardian, as
#   Challenge's owner (fresh_vrf_step): the devnet's MockVrfProvider, on devnet and, for the smoke only, on Sepolia (the
#   owner's ruling of 2026-10-21): Cartridge's provider proves a draw only inside its server's VRF wrapper, which the smoke's
#   plain invokes do not have. On Sepolia the mock is deployed but never written in the deployment file, and once the smoke
#   passed fresh_vrf_final_step sets Cartridge's provider and reads it back (smoke.provider_tx).
# The VRF mock (#638, docs/architecture/vrf-draws.md; Sepolia's smoke since #645, above): on devnet, MockVrfProvider is declared and deployed (no
#   constructor argument) and keyed `contracts.MockVrfProvider`, the devnet's VRF provider for the client
#   (`vrfProvider` in @paved/chain); on Sepolia it is deployed for the smoke only and never keyed in the file (the client
#   draws through Cartridge's provider there); `deploy` refuses it by name on mainnet. The smoke reads its consume count (0)
#   and a consume of a salt (not 0).
# Upgrades (P-42, P-56, docs/architecture/upgrades.md): the `owner` of Economy, Challenge, Setup, Collection and Vault
#   is the deployer, who alone may `upgrade` them (and set Challenge's Setup, Setup's reporters, Setup's wiring and the
#   Vault's exit fee); the smoke reads owner() back on each. PavedToken has no owner and no upgrade.
# Deployer, owner and smoke player: devnet and --rehearse, the first predeployed account, read from the node at run
# time (public dev keys of the node), its key held in a temporary accounts file removed on exit (devnet) or in the
# signer's environment (--rehearse); sepolia, the funded account. Files: a temporary directory, removed on exit, holds
# sncast's accounts file (devnet only: the node's public dev key), the multicall files (contract addresses, entry
# points, amounts) and the deploy transaction hashes; the signer's output stays in a variable. No value of the three
# sepolia variables is written to a file.
#
# Env overrides: RPC_URL (devnet and --rehearse: localhost only), SCARB_BIN_DIR, SNCAST_BIN_DIR.
# Toolchain (the owner's Cairo rule, 2026-10-14: at most one Cairo run at a time on the VPS, always through the shims):
# `scarb` comes from the PATH, with no prepend; on the VPS that is the shim ~/.local/bin/scarb, which holds the
# machine-wide lock. SCARB_BIN_DIR is put first on the PATH only when the caller sets it (SCARB_BIN_DIR=$HOME/.local/bin
# passes). Before anything is built or sent, a guard refuses (exit 2) when the shim exists and scarb resolves elsewhere
# (an asdf directory included, overrides too); with no shim (the Mac, CI) it only warns. The shim is a script (`#!` first
# line): a native binary at ~/.local/bin/scarb is no shim, and warns. PAVED_SCARB_SHIM is the shim path the guard expects
# (default ~/.local/bin/scarb): a hook for scripts/test-deploy-url.sh and its stubs, not a way round the rule. PAVED_SCARB_SHIM is a TEST HOOK only (PM, 2026-10-14): a thread never points it at a real binary to get past the guard. sncast is not a Cairo build: it is run by its absolute path, $SNCAST_BIN_DIR/sncast (default: the asdf
# starknet-foundry 0.64.0 bin; plain `sncast` from the PATH when that file is absent; "sncast not found" at its first call when neither exists), so its directory never goes on the
# PATH and cannot put an asdf scarb or snforge ahead of the shim (sncast itself calls `scarb` from the PATH).
# `deployed_at` is the merge base of HEAD with origin/main, and the script refuses when the contract
# sources of the working tree (contracts/src, Scarb.toml, Scarb.lock; untracked files in src too) differ from it.
# Needs: scarb 2.20.1, sncast 0.64.0, curl, python3, git; sepolia and --rehearse also Node 24 and npm.
set -euo pipefail
# No variable assigned below is exported unless the script says so.
set +a

# The funded account (sepolia, D-16), by name only: its three variables are copied into unexported shell variables
# (unset first, so a caller's export of the same names cannot stick) and unset before anything else runs, so no child
# (python3 for the test hook below, curl, scarb, sncast, npm) ever inherits them. Only `send` passes them on, to the
# signer, in its environment; devnet and --rehearse clear the copies below.
unset FUNDED_ADDRESS FUNDED_KEY FUNDED_URL
FUNDED_ADDRESS="${STARKNET_ACCOUNT_ADDRESS:-}"
FUNDED_KEY="${STARKNET_PRIVATE_KEY:-}"
FUNDED_URL="${STARKNET_RPC_URL:-}"
unset STARKNET_ACCOUNT_ADDRESS STARKNET_PRIVATE_KEY STARKNET_RPC_URL SIGNER_NETWORK

# class_declared: reads a starknet_getClass answer on stdin; succeeds only for a JSON object with no `error`
# field whose `result` is itself an object. Anything else (malformed JSON, a list, a string result, an error)
# is "not declared or unknown", and fails.
class_declared() {
  python3 -I -c '
import sys, json
try:
    d = json.load(sys.stdin)
except Exception:
    sys.exit(1)
sys.exit(0 if isinstance(d, dict) and "error" not in d and isinstance(d.get("result"), dict) else 1)
' 2>/dev/null
}

# class_hash_answer: reads a starknet_getClassHashAt answer on stdin; succeeds only for a hex `result` and no `error`.
class_hash_answer() {
  python3 -I -c '
import sys, json, re
try:
    d = json.load(sys.stdin)
except Exception:
    sys.exit(1)
ok = isinstance(d, dict) and "error" not in d and isinstance(d.get("result"), str) and re.fullmatch("0x[0-9a-fA-F]+", d["result"])
sys.exit(0 if ok else 1)
' 2>/dev/null
}

USAGE="Usage: scripts/deploy.sh devnet [--unmerged] [--guardian deployer] | scripts/deploy.sh sepolia [--rehearse] [--check-only] [--out <file>] [--guardian deployer] | scripts/deploy.sh sepolia [--rehearse] --estimate-only [--bounds <6 integers>] [--validate] [--block-id <tag>] | scripts/deploy.sh sepolia --repoint [--check-only] | scripts/deploy.sh sepolia --rehearse --repoint --deployment <file> [--check-only] | scripts/deploy.sh sepolia --d18 [--check-only] | scripts/deploy.sh sepolia --rehearse --d18 --deployment <file> [--check-only] | scripts/deploy.sh sepolia --upgrade-challenge [--check-only] [--guardian deployer] | scripts/deploy.sh sepolia --rehearse --upgrade-challenge --deployment <file> [--check-only] [--guardian deployer]"
NETWORK="${1:-}"
UNMERGED=0
REHEARSE=0
CHECK_SEND=0
ESTIMATE_ONLY=0
ESTIMATE_ARGS=()
REPOINT=0
REPOINT_CHECK_ONLY=0
REPOINT_FILE=""
D18=0
# --upgrade-challenge (G6): the mode, and --guardian deployer.
UPGRADE_CHALLENGE=0
UC_GUARDIAN_DEPLOYER=0
# The fresh path (F): --check-only and --out <file>.
FRESH_CHECK_ONLY=0
FRESH_OUT=""
FRESH_GUARDIAN_HOOK=""
FRESH_DEFINITIONS_HOOK=""
FRESH_GUARDIAN_CHALLENGE=""
# The key of the deployment file under which --repoint (`repoint`), --d18 (`d18`) or --upgrade-challenge (`upgrade_g1g4`)
# records what it sent.
RECORD_KEY=repoint
if [[ "$NETWORK" == "sepolia" && ( "${2:-}" == "--estimate-only" || ( "${2:-}" == "--rehearse" && "${3:-}" == "--estimate-only" ) ) ]]; then
  # sepolia [--rehearse] --estimate-only [diagnostics]: the diagnostics reach the signer as its own options, which it
  # checks again (six integers in range, a block tag of the spec).
  [[ "$2" == "--rehearse" ]] && { REHEARSE=1; shift; }
  ESTIMATE_ONLY=1
  shift 2
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --validate) ESTIMATE_ARGS+=(--validate); shift ;;
      --bounds)
        [[ "${2:-}" =~ ^[0-9xa-fA-F,]{11,400}$ ]] || { echo "deploy.sh: --bounds expects six comma-separated integers" >&2; exit 2; }
        ESTIMATE_ARGS+=(--bounds "$2"); shift 2 ;;
      --block-id)
        [[ "${2:-}" == latest || "${2:-}" == pre_confirmed ]] || { echo "deploy.sh: --block-id expects latest or pre_confirmed" >&2; exit 2; }
        ESTIMATE_ARGS+=(--block-id "$2"); shift 2 ;;
      *) echo "deploy.sh: unknown option '$1' for 'sepolia --estimate-only'" >&2; echo "$USAGE" >&2; exit 2 ;;
    esac
  done
  set -- sepolia
elif [[ "$NETWORK" == "sepolia" && ( "${2:-}" == --repoint || "${2:-}" == --d18 || "${2:-}" == --upgrade-challenge ||
    ( "${2:-}" == "--rehearse" && ( "${3:-}" == --repoint || "${3:-}" == --d18 || "${3:-}" == --upgrade-challenge ) ) ) ]]; then
  # sepolia [--rehearse] --repoint (R-1): repoints the deployed Economy at a new MockRouter (see "--repoint" above).
  # sepolia [--rehearse] --d18 (D-18c): the D-18 upgrade, after the repoint (see "--d18" above).
  # sepolia [--rehearse] --upgrade-challenge (G6): Challenge upgraded in place (see "--upgrade-challenge" above). The
  # three take the same options, and --upgrade-challenge also --guardian deployer; the variables keep the repoint's
  # names (REPOINT_FILE, REPOINT_CHECK_ONLY).
  [[ "$2" == "--rehearse" ]] && { REHEARSE=1; shift; }
  MODE_FLAG="$2"
  case "$MODE_FLAG" in
    --d18) D18=1; RECORD_KEY=d18 ;;
    --upgrade-challenge) UPGRADE_CHALLENGE=1; RECORD_KEY=upgrade_g1g4 ;;
    *) REPOINT=1 ;;
  esac
  shift 2
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --check-only) REPOINT_CHECK_ONLY=1; shift ;;
      --deployment)
        ((REHEARSE)) || { echo "deploy.sh: --deployment is for the rehearsal only: sepolia $MODE_FLAG reads contracts/deployments/sepolia.json" >&2; exit 2; }
        [[ -n "${2:-}" && -f "$2" ]] || { echo "deploy.sh: --deployment expects an existing deployment file" >&2; exit 2; }
        REPOINT_FILE="$(cd "$(dirname "$2")" && pwd)/$(basename "$2")"
        shift 2 ;;
      --guardian)
        # The keyword alone: the address is the deployer's, read from STARKNET_ACCOUNT_ADDRESS by name, never from
        # argv; the refusal does not echo what was given.
        [[ "$MODE_FLAG" == --upgrade-challenge ]] || { echo "deploy.sh: --guardian is for sepolia --upgrade-challenge only" >&2; exit 2; }
        [[ "${2:-}" == deployer ]] ||
          { echo "deploy.sh: --guardian expects the keyword deployer (the address is read from STARKNET_ACCOUNT_ADDRESS by name, never from argv)" >&2; exit 2; }
        UC_GUARDIAN_DEPLOYER=1
        shift 2 ;;
      *) echo "deploy.sh: unknown option '$1' for 'sepolia $MODE_FLAG'" >&2; echo "$USAGE" >&2; exit 2 ;;
    esac
  done
  if [[ "$REHEARSE" == 1 && -z "$REPOINT_FILE" ]]; then
    echo "deploy.sh: sepolia --rehearse $MODE_FLAG needs --deployment <file>, the rehearsal's own deployment file" >&2
    exit 2
  fi
  set -- sepolia
elif [[ "${2:-}" == "--check-class-answer" ]]; then
  # Test hook (scripts/test-deploy-url.sh): the verdict of class_declared on stdin, nothing else runs.
  class_declared
  exit $?
elif [[ "$NETWORK" == "sepolia" && "${2:-}" == "--check-send-failure" ]]; then
  # Test hook (scripts/test-deploy-url.sh): after the sepolia variable checks, and before the node, chain id and
  # deployer checks, one `send call --contract 0x1 --function f`, then exit. The test puts a fake signer first on
  # PATH, which fails. With real variables and the real signer it is one read-only call to 0x1 on that node:
  # nothing is built, signed or sent.
  CHECK_SEND=1
elif [[ "$NETWORK" == "devnet" && ( "${2:-}" == "--unmerged" || "${2:-}" == "--guardian" ) ]]; then
  # devnet [--unmerged] [--guardian deployer], in either order. --guardian deployer is the default spelled out.
  shift
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --unmerged) UNMERGED=1; shift ;;
      --guardian)
        [[ "${2:-}" == deployer ]] ||
          { echo "deploy.sh: --guardian expects the keyword deployer (the fresh path always sets the deployer as guardian)" >&2; exit 2; }
        shift 2 ;;
      *) echo "deploy.sh: unknown option '$1' for 'devnet'" >&2; echo "$USAGE" >&2; exit 2 ;;
    esac
  done
  set -- devnet
elif [[ "$NETWORK" == "sepolia" && -n "${2:-}" ]]; then
  # sepolia [--rehearse] [--check-only] [--out <file>] (F): the fresh path (see "sepolia, the fresh path" above).
  shift
  [[ "$1" == "--rehearse" ]] && { REHEARSE=1; shift; }
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --check-only) FRESH_CHECK_ONLY=1; shift ;;
      --out)
        [[ -n "${2:-}" && "$2" != -* && -d "$(dirname "$2")" && ! -d "$2" ]] ||
          { echo "deploy.sh: --out expects a file path in an existing directory" >&2; exit 2; }
        FRESH_OUT="$(cd "$(dirname "$2")" && pwd)/$(basename "$2")"
        shift 2 ;;
      --guardian)
        [[ "${2:-}" == deployer ]] ||
          { echo "deploy.sh: --guardian expects the keyword deployer (the fresh path always sets the deployer as guardian)" >&2; exit 2; }
        shift 2 ;;
      --check-fresh-guardian)
        # Test hook (scripts/test-deploy-url.sh): after the node, deployer and build checks, runs fresh_guardian_step or
        # fresh_guardian_smoke (<step|smoke>) against the Challenge <address>, then exits. `step` can send set_guardian, so,
        # unlike --check-send-failure (which signs and sends nothing), the hook is refused here, at parse time and before
        # anything is read or sent, unless the run is a --rehearse one: the rehearsal takes its node from RPC_URL, which must
        # be local, signs with the node's predeployed account and unsets the funded account's variables, so the hook can
        # never send on a public network. The test drives it against a fake node on a local RPC_URL.
        ((REHEARSE)) || { echo "deploy.sh: --check-fresh-guardian is a test hook of the rehearsal: it needs sepolia --rehearse (a local node) and is refused on sepolia; nothing was read or sent" >&2; exit 2; }
        [[ "${2:-}" == step || "${2:-}" == smoke ]] && [[ "${3:-}" =~ ^0x[0-9a-fA-F]+$ ]] ||
          { echo "deploy.sh: --check-fresh-guardian expects <step|smoke> <Challenge address>" >&2; exit 2; }
        FRESH_GUARDIAN_HOOK="$2"; FRESH_GUARDIAN_CHALLENGE="$3"
        shift 3 ;;
      --check-fresh-definitions)
        # Test hook, the guardian one's twin: runs fresh_definitions_step or fresh_definitions_smoke (<step|smoke>) against
        # the Setup <address> and the Economy <address> (its seller, cobbles v1 part 2), then exits. `step` can send the definitions, so it is refused, before anything is read or
        # sent, unless the run is a --rehearse one (a local node, the node's predeployed account).
        ((REHEARSE)) || { echo "deploy.sh: --check-fresh-definitions is a test hook of the rehearsal: it needs sepolia --rehearse (a local node) and is refused on sepolia; nothing was read or sent" >&2; exit 2; }
        [[ "${2:-}" == step || "${2:-}" == smoke ]] && [[ "${3:-}" =~ ^0x[0-9a-fA-F]+$ ]] && [[ "${4:-}" =~ ^0x[0-9a-fA-F]+$ ]] ||
          { echo "deploy.sh: --check-fresh-definitions expects <step|smoke> <Setup address> <Economy address>" >&2; exit 2; }
        FRESH_DEFINITIONS_HOOK="$2"; FRESH_DEFINITIONS_SETUP="$3"; FRESH_DEFINITIONS_ECONOMY="$4"
        shift 4 ;;
      *) echo "deploy.sh: unknown option '$1' for 'sepolia$( ((REHEARSE)) && echo ' --rehearse')'" >&2; echo "$USAGE" >&2; exit 2 ;;
    esac
  done
  set -- sepolia
elif [[ -n "${2:-}" || -n "${3:-}" ]]; then
  echo "deploy.sh: unknown option '${3:-$2}' for '${NETWORK}${3:+ $2}'" >&2
  echo "$USAGE" >&2
  exit 2
fi
case "$NETWORK" in
  devnet | sepolia) ;;
  mainnet)
    echo "deploy.sh: refusing mainnet: a mainnet deployment is the owner's act (D-16), and the Faucet is refused there by name." >&2
    echo "$USAGE" >&2
    exit 2 ;;
  *)
    echo "deploy.sh: unsupported network '${NETWORK}'. Only 'devnet' (a local node) and 'sepolia' (D-16) are allowed." >&2
    echo "$USAGE" >&2
    exit 2 ;;
esac

# sepolia: the funded account's variables, by name only (never a value). A missing one stops the run here.
unset SEND_ADDRESS SEND_KEY SEND_NETWORK
SEND_ADDRESS=""
SEND_KEY=""
SEND_NETWORK=""
if [[ "$NETWORK" == "sepolia" && "$REHEARSE" == 0 ]]; then
  missing=()
  [[ -n "$FUNDED_ADDRESS" ]] || missing+=(STARKNET_ACCOUNT_ADDRESS)
  [[ -n "$FUNDED_KEY" ]] || missing+=(STARKNET_PRIVATE_KEY)
  [[ -n "$FUNDED_URL" ]] || missing+=(STARKNET_RPC_URL)
  if [[ "${#missing[@]}" -gt 0 ]]; then
    echo "deploy.sh: sepolia needs ${missing[*]} in the environment (set, not empty); nothing was sent" >&2
    exit 2
  fi
  [[ "$FUNDED_ADDRESS" =~ ^0x[0-9a-fA-F]{1,64}$ ]] ||
    { echo "deploy.sh: STARKNET_ACCOUNT_ADDRESS is not a 0x hex address (its value is not printed)" >&2; exit 2; }
  [[ "$FUNDED_URL" == https://* ]] ||
    { echo "deploy.sh: STARKNET_RPC_URL must be an https:// URL (its value is not printed)" >&2; exit 2; }
  # It goes into a quoted string of curl's config (rpc): no character that could end the string or the line there.
  [[ "$FUNDED_URL" != *[\"\\$'\n'$'\r']* ]] ||
    { echo "deploy.sh: STARKNET_RPC_URL holds a double quote, a backslash or a line break (its value is not printed)" >&2; exit 2; }
  SEND_ADDRESS="$FUNDED_ADDRESS"
  SEND_KEY="$FUNDED_KEY"
  SEND_NETWORK=sepolia
  unset RPC_URL
  RPC_URL="$FUNDED_URL"
else
  RPC_URL="${RPC_URL:-http://127.0.0.1:5050}"
fi
FUNDED_ADDRESS=""
FUNDED_KEY=""
FUNDED_URL=""
export -n RPC_URL
# sepolia and its rehearsal send through the signer (P-40); devnet through sncast.
USE_SIGNER=0
[[ "$NETWORK" == "sepolia" ]] && USE_SIGNER=1
# Full-authority match: a prefix glob would let `http://127.0.0.1:5050@other-host:5050` through.
LOCAL_URL_RE='^http://(127\.0\.0\.1|localhost|\[::1\]):[0-9]+/?$'
if [[ ( "$NETWORK" == "devnet" || "$REHEARSE" == 1 ) && ! "$RPC_URL" =~ $LOCAL_URL_RE ]]; then
  # Only scheme and host are printed: the URL could carry an API key (userinfo, path, query or fragment).
  # The authority is cut first, so an `@` after the host never counts as userinfo.
  # Each part says what could not be read, never a bare placeholder.
  RPC_SCHEME="(not a URL: no '://')"; RPC_HOST="(not a URL: no '://')"
  if [[ "$RPC_URL" == *://* ]]; then
    RPC_SCHEME="(unparsable scheme)"
    [[ "${RPC_URL%%://*}" =~ ^[A-Za-z][A-Za-z0-9+.-]*$ ]] && RPC_SCHEME="${RPC_URL%%://*}"
    auth="${RPC_URL#*://}"; auth="${auth%%[/?#]*}"; auth="${auth##*@}"
    if [[ "$auth" == \[* ]]; then RPC_HOST="${auth%%]*}]"; else RPC_HOST="${auth%%:*}"; fi
    [[ -n "$RPC_HOST" ]] || RPC_HOST="(unparsable host: empty)"
  fi
  echo "deploy.sh: devnet must be a local node (http://127.0.0.1|localhost|[::1]:<port>), got scheme '${RPC_SCHEME}' host '${RPC_HOST}'" >&2
  exit 2
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ASDF="${ASDF_DATA_DIR:-$HOME/.asdf}/installs"
SNCAST_BIN_DIR="${SNCAST_BIN_DIR:-$ASDF/starknet-foundry/0.64.0/bin}"
# The signer's node: resolved on the caller's PATH; `send` runs this absolute path.
NODE_BIN="$(command -v node || true)"
# scarb from the PATH (the shim); only an explicit SCARB_BIN_DIR goes first.
[[ -z "${SCARB_BIN_DIR:-}" ]] || PATH="$SCARB_BIN_DIR:$PATH"
PAVED_SCARB_SHIM="${PAVED_SCARB_SHIM:-$HOME/.local/bin/scarb}"
SCARB_FOUND="$(command -v scarb || true)"
# A shim is an executable script (a `#!` first line): the real ones forward to ~/.asdf/shims. A native binary at that path
# (the Mac holds a stray scarb there) is no shim: it warns, it does not refuse.
SHIM_NOTE="no shim at $PAVED_SCARB_SHIM"
if [[ -x "$PAVED_SCARB_SHIM" && ! -r "$PAVED_SCARB_SHIM" ]]; then
  echo "deploy.sh: the shim $PAVED_SCARB_SHIM is executable but unreadable, so it cannot be told from a stray binary: refusing (fix its permissions)" >&2
  exit 2
fi
if [[ -x "$PAVED_SCARB_SHIM" && "$(head -c 2 "$PAVED_SCARB_SHIM" 2>/dev/null | LC_ALL=C tr -d '\0')" != '#!' ]]; then
  SHIM_NOTE="no shim at $PAVED_SCARB_SHIM (a native binary, not a script)"
  PAVED_SCARB_SHIM_USED=0
elif [[ -x "$PAVED_SCARB_SHIM" ]]; then
  PAVED_SCARB_SHIM_USED=1
else
  PAVED_SCARB_SHIM_USED=0
fi
if [[ "$PAVED_SCARB_SHIM_USED" == 1 ]]; then
  if [[ "$SCARB_FOUND" != "$PAVED_SCARB_SHIM" ]]; then
    echo "deploy.sh: scarb resolves to ${SCARB_FOUND:-(not found)}, not the shim $PAVED_SCARB_SHIM: the owner's rule is one Cairo run at a time through the shims (set SCARB_BIN_DIR=\$HOME/.local/bin, or fix PATH)" >&2
    exit 2
  fi
else
  echo "deploy.sh: warning: $SHIM_NOTE, using scarb ${SCARB_FOUND:-(not found)}" >&2
fi
# sncast by its absolute path (see the header); a function, so `sc sncast ...` and a bare `sncast` both use it.
# sncast-wrapper begin (scripts/test-deploy-url.sh runs this block)
# Resolved at the first use, so a run that never calls sncast needs none. `type -P` looks at files only, so the wrapper
# never finds itself; the cache is a private name, reset here, so an exported SNCAST_BIN changes nothing.
_paved_sncast_bin=""
sncast_resolve() { # prints the cause and returns 2 when there is no sncast
  if [[ -z "$_paved_sncast_bin" ]]; then
    _paved_sncast_bin="$SNCAST_BIN_DIR/sncast"
    [[ -x "$_paved_sncast_bin" ]] || _paved_sncast_bin="$(type -P sncast || true)"
  fi
  if [[ -z "$_paved_sncast_bin" ]]; then
    echo "deploy.sh: sncast not found: neither $SNCAST_BIN_DIR/sncast nor on the PATH (set SNCAST_BIN_DIR)" >&2
    return 2
  fi
}
sncast() { sncast_resolve || return; "$_paved_sncast_bin" "$@"; }
# sncast-wrapper end
# devnet: salt 1 and no `--unique`, so the addresses are stable across runs. sepolia (and its rehearsal): a fresh
# random salt and `--unique`, so the addresses depend on the deployer and no rerun collides with an earlier one.
if [[ "$NETWORK" == "devnet" ]]; then
  SALT=1
  UNIQUE=()
else
  SALT="$(python3 -I -c 'import secrets;print(hex(secrets.randbits(120)))')"
  UNIQUE=(--unique)
fi
# The RPC URL is printed for a local node only: a public one may carry an API key (it then shows by variable name).
# On sepolia the deployer's address is printed by name too (D-16: no value of the three variables is printed).
if [[ "$NETWORK" == "sepolia" && "$REHEARSE" == 0 ]]; then RPC_LABEL="\$STARKNET_RPC_URL"; else RPC_LABEL="$RPC_URL"; fi
WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT
if [[ "$UNMERGED" == 1 || "$REHEARSE" == 1 ]]; then
  OUT_DIR="$(mktemp -d)"
  OUT="$OUT_DIR/$NETWORK.json"
else
  OUT="$ROOT/contracts/deployments/$NETWORK.json"
fi
[[ -z "$FRESH_OUT" ]] || OUT="$FRESH_OUT"
ACCOUNTS=(--accounts-file "$WORK_DIR/accounts.json")
SIGNER_JS="$ROOT/scripts/signer/signer.mjs"
# The signer's heap cap: 1.5x its measured peak (405,544 kB RSS, declare Daily, VPS 2026-10-10), rounded up to 64 MB.
SIGNER_HEAP="--max-old-space-size=640"
RELEASE_DIR="$ROOT/contracts/target/release"
# --repoint, --d18 and --upgrade-challenge: the deployment they read and update; sepolia's committed file unless the
# rehearsal names its own.
[[ ( "$REPOINT" == 1 || "$D18" == 1 || "$UPGRADE_CHALLENGE" == 1 ) && -z "$REPOINT_FILE" ]] &&
  REPOINT_FILE="$ROOT/contracts/deployments/sepolia.json"
# The fresh path through the signer (sepolia and its rehearsal) keeps its record in the file it writes, under `fresh`.
FRESH_RECORD=0
if [[ "$NETWORK" == sepolia && "$REPOINT" == 0 && "$D18" == 0 && "$UPGRADE_CHALLENGE" == 0 && "$ESTIMATE_ONLY" == 0 &&
    "$CHECK_SEND" == 0 ]]; then
  FRESH_RECORD=1
  REPOINT_FILE="$OUT"
  RECORD_KEY=fresh
fi

die() { echo "deploy.sh: $*" >&2; exit 1; }

# The URL and the request go to curl through its config on stdin, not its arguments: a public URL may carry an API
# key, and the params may hold the deployer's address. `-q` (first) keeps curl from reading a ~/.curlrc. In the
# config's quoted strings, backslashes, double quotes and line breaks are escaped (the URL holds none: checked above).
#
# A read method of RPC_RETRIED (the signer's list, S-1c) is retried while the node answers HTTP 5xx or the JSON-RPC error
# -32601 (a Sepolia endpoint did, at random, with HTTP 200 or 400): at most 5 attempts, waits 1, 2, 4, 8 s. Any other
# method goes once (deploy.sh sends no transaction through curl; a starknet_add* method would never be retried). A
# node that does not answer at all is not retried. Fails unless the last answer is HTTP 2xx.
RPC_RETRIED=" starknet_specVersion starknet_chainId starknet_getClassHashAt starknet_getClass starknet_getTransactionReceipt starknet_getStorageAt "
RPC_DELAYS=(1 2 4 8)
rpc() {
  local body="{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"$1\",\"params\":$2}" answer code attempt=1
  body="${body//\\/\\\\}"
  body="${body//$'\n'/\\n}"
  body="${body//$'\r'/\\r}"
  while true; do
    answer="$(printf 'url = "%s"\ndata = "%s"\n' "$RPC_URL" "${body//\"/\\\"}" |
      curl -q -s -K - -X POST -H 'content-type: application/json' -w '\n%{http_code}')" || answer=$'\n000'
    code="${answer##*$'\n'}"
    answer="${answer%$'\n'*}"
    if [[ "$RPC_RETRIED" == *" $1 "* && "$attempt" -le "${#RPC_DELAYS[@]}" ]] &&
        [[ "$code" == 5?? || "$answer" =~ \"code\"[[:space:]]*:[[:space:]]*-32601 ]]; then
      echo "deploy.sh: $1 failed (HTTP $code), attempt $attempt of $(( ${#RPC_DELAYS[@]} + 1 )); retrying" >&2
      sleep "${RPC_DELAYS[$((attempt - 1))]}"
      attempt=$((attempt + 1))
      continue
    fi
    [[ "$code" == 2?? ]] || return 1
    printf '%s\n' "$answer"
    return 0
  done
}

# jq-less JSON helpers. `pyj <expr>` reads JSON on stdin and prints the python expression on `d`.
pyj() { python3 -I -c 'import sys,json;d=json.load(sys.stdin);print('"$1"')'; }

# sc <sncast args...>: runs sncast with --json, prints the result object (last JSON line) on
# stdout, dies with the error message if sncast reports one. Build noise on stderr is dropped.
sc() {
  local raw
  [[ "$1" != sncast ]] || sncast_resolve || return   # bare: the stderr of the run below is discarded
  raw="$("$@" --json 2>/dev/null)" || true
  python3 -I - "$raw" <<'PY'
import json, sys
last = None
for line in sys.argv[1].splitlines():
    try:
        obj = json.loads(line)
    except ValueError:
        continue
    if "command" in obj or obj.get("type") == "error":
        last = obj
if last is None:
    sys.exit("sncast printed no result")
if last.get("error") or last.get("type") == "error":
    sys.exit("sncast error: " + str(last.get("error", last))[:600])
print(json.dumps(last))
PY
}

# redact: reads the deployer's address, the key and the RPC URL, one per line, then a text, all on stdin (never argv),
# and prints the text with each of the three replaced by its variable's name: the URL and the key as written, in any
# case, and any hex number equal to the address or the key, padded or not. The signer sanitises its own output
# already (the key and the URL, not the address); this is the second layer, and the one for the address.
redact() {
  python3 -I -c '
import re, sys
address, key, url = (sys.stdin.readline().rstrip("\n") for _ in range(3))
text = sys.stdin.read()
for value, name in ((url, "$STARKNET_RPC_URL"), (key, "$STARKNET_PRIVATE_KEY")):
    if value:
        text = re.sub(re.escape(value), name, text, flags=re.I)
def number(value):
    try:
        return int(value, 16)
    except ValueError:
        return None
names = {n: name for value, name in ((address, "$STARKNET_ACCOUNT_ADDRESS"), (key, "$STARKNET_PRIVATE_KEY"))
         if (n := number(value))}
text = re.sub(r"0x[0-9a-fA-F]+|\b[0-9a-fA-F]{32,}\b", lambda m: names.get(int(m.group(0), 16), m.group(0)), text)
sys.stdout.write(text)'
}

# send <signer command> [options...]: runs scripts/signer as the deployer and prints its JSON line. The signer starts
# in a subshell whose environment is an allowlist: PATH and HOME, the account, the key and the node (never argv:
# exported in the subshell, not passed as `VAR=value` to `env`), SIGNER_NETWORK, and NODE_OPTIONS as the heap cap
# alone. Nothing else of deploy.sh's environment reaches it (no NODE_TLS_REJECT_UNAUTHORIZED, NODE_EXTRA_CA_CERTS,
# NODE_DEBUG or proxy variable). The signer refuses other node options, but only once node runs, after an inspector
# from NODE_OPTIONS would already listen. SIGUSR1 cannot open the inspector (--disable-sigusr1). Its stdout and stderr
# are held in a variable, never a file: on success the last line is the JSON line, on failure the run dies with its
# tail, redacted (`redact`) and cut by whole lines (`failure_tail`). The line naming each transaction before it is sent
# is shown as it comes (`stream_sending`, S-1d), and only then: the tail leaves it out (S-1e). In calldata, `@account` stands for the deployer: the signer reads its address from its
# environment, so the address is in no argv either.
send() {
  local res status=0 recorded
  # Exit 97: stream_sending could not record a hash (--repoint); otherwise the signer's own status.
  res="$(run_signer "$@" | stream_sending; s=("${PIPESTATUS[@]}"); [[ "${s[1]}" == 0 ]] || exit 97; exit "${s[0]}")" || status=$?
  if [[ "$status" == 97 ]]; then
    die "signer $1: a transaction was sent but its hash (shown above) could not be recorded under $RECORD_KEY.$RECORD_SENDING in
$REPOINT_FILE: record it there, or check it, before any rerun"
  fi
  if [[ "$status" != 0 ]]; then
    # --repoint (review of #313, loop 2): the hash recorded as the signer sent it is cleared only on the signer's own
    # verdict that it did not land (`not landed`: no status of the hash answered, the nonce still the signed one at
    # pre_confirmed, the class or contract absent; scripts/signer/README.md), and only when it names that hash. So a rerun
    # sends the step again instead of waiting for a receipt that will never come. Any other failure (a lost answer,
    # `sent, status unknown`, a hash the node has seen) keeps the key, and the rerun waits for its receipt. The verdict is
    # matched as the whole line the signer prints for its error (`signer: refused (<code>); …`), so a node's message
    # quoted elsewhere in the output cannot clear the key (review of #313, loop 3).
    if [[ -n "${RECORD_SENDING:-}" && -n "$REPOINT_FILE" ]]; then
      recorded="$(rp_get "$RECORD_SENDING")"
      if [[ "$recorded" =~ ^0x[0-9a-f]+$ ]] &&
          grep -qE "^signer: refused \(-?[0-9]+\); no receipt for $recorded after [0-9]+ s; not landed \([^)]*\); check it before any rerun\$" <<<"$res"; then
        rp_set "$RECORD_SENDING=" &&
          echo "deploy.sh: the signer found $recorded not landed: $RECORD_KEY.$RECORD_SENDING cleared, so a rerun sends it again" >&2
      fi
    fi
    # The lines already shown left out, then redacted whole, then cut: a value across the cut is still replaced.
    res="$(while IFS= read -r line || [[ -n "$line" ]]; do sending_line "$line" || printf '%s\n' "$line"; done <<<"$res")"
    die "signer $1 failed:
$(failure_tail "$(redact_text "$res")")"
  fi
  # The JSON line: the last line that starts with `{` (stderr shares the stream).
  local line result=""
  while IFS= read -r line; do
    [[ "$line" == "{"* ]] && result="$line"
  done <<<"$res"
  [[ -n "$result" ]] || die "signer $1 printed no JSON line"
  printf '%s\n' "$result"
}

# stream_sending: copies the signer's output (stdout and stderr, one stream) to stdout for `send`, and shows on the
# terminal (stderr), as it comes, each line by which the signer names a transaction before it sends it (S-1d): a run
# killed or stopped afterwards still leaves the hash on screen. Only a line made of the method and a hex hash is shown,
# redacted (`redact_text`).
stream_sending() {
  local line unrecorded=0
  while IFS= read -r line || [[ -n "$line" ]]; do
    printf '%s\n' "$line"
    if sending_line "$line"; then
      printf '   %s\n' "$(redact_text "$line")" >&2
      # --repoint: the hash is recorded in the deployment file as the signer sends it, so a run killed meanwhile leaves
      # it there for the rerun (RECORD_SENDING names its key under `repoint`). A failed record does not cut the signer
      # short (it may have sent already): the output is still copied, and stream_sending fails at its end, which stops
      # the run (`send`, exit 97).
      if [[ -n "${RECORD_SENDING:-}" ]] && ! rp_set "$RECORD_SENDING=${line##* }"; then
        printf '   deploy.sh: could not record %s under %s.%s\n' "${line##* }" "$RECORD_KEY" "$RECORD_SENDING" >&2
        unrecorded=1
      fi
    fi
  done
  return "$unrecorded"
}

# sending_line <line>: whether it is the signer's line naming a transaction before it is sent (`stream_sending`).
sending_line() { [[ "$1" =~ ^signer:\ sending\ starknet_add[A-Za-z]+,\ transaction\ 0x[0-9a-f]+$ ]]; }

# failure_tail <text>: at most 800 characters, all counted (the 3-space indents, the line breaks, the count line): the
# whole text, indented, when it fits; else a line counting the lines left out (40 characters kept for it), then the
# last whole lines that fit, indented (S-1e: a cut inside a line printed `failed: .json`). A last line too long alone
# keeps its end, after `...`.
failure_tail() {
  local line i size=0 first budget=800
  local -a lines=()
  while IFS= read -r line || [[ -n "$line" ]]; do lines+=("$line"); size=$((size + ${#line} + 4)); done <<<"$1"
  (( size <= budget )) || budget=760
  i=${#lines[@]} size=0
  while (( i > 0 )) && (( size + ${#lines[i - 1]} + 4 <= budget || i == ${#lines[@]} )); do
    size=$((size + ${#lines[i - 1]} + 4)); i=$((i - 1))
  done
  (( i == 0 )) || printf '   (%s earlier line(s) not shown)\n' "$i"
  first="${lines[i]:-}"
  (( ${#first} + 4 <= budget )) || first="...${first: -$((budget - 7))}"
  printf '   %s\n' "$first"
  for (( i = i + 1; i < ${#lines[@]}; i++ )); do printf '   %s\n' "${lines[i]}"; done
}

# redact_text <text>: the text with the three values replaced by their names (`redact`, all on stdin).
redact_text() { printf '%s\n%s\n%s\n%s' "$SEND_ADDRESS" "$SEND_KEY" "$RPC_URL" "$1" | redact; }

# run_signer <signer command> [options...]: the signer in send's allowlisted environment; prints its stdout and stderr
# (one stream), unredacted, and returns its exit status. Its output is redacted by the caller before it is printed.
run_signer() {
  (
    while read -r name; do
      [[ "$name" == PATH || "$name" == HOME ]] || unset "$name" 2>/dev/null || true
    done < <(compgen -e)
    export STARKNET_ACCOUNT_ADDRESS="$SEND_ADDRESS" STARKNET_PRIVATE_KEY="$SEND_KEY" STARKNET_RPC_URL="$RPC_URL" \
      SIGNER_NETWORK="$SEND_NETWORK" NODE_OPTIONS="$SIGNER_HEAP"
    exec "$NODE_BIN" --disable-sigusr1 "$SIGNER_JS" "$@" 2>&1
  )
}

if [[ "$CHECK_SEND" == 1 ]]; then
  send call --contract 0x1 --function f
  exit 0
fi

# On stdin, not argv: the values compared include the deployer's address.
hex_int() { printf '%s' "$1" | python3 -I -c 'import sys;print(int(sys.stdin.read(),16))'; }
# u256 calldata: low and high halves, decimal.
u256() { python3 -I -c 'import sys;v=int(sys.argv[1]);print(v%2**128, v>>128)' "$1"; }
felt_str() { python3 -I -c 'import sys;print(int(sys.argv[1],16).to_bytes(31,"big").lstrip(b"\0").decode())' "$1"; }

# Calls a view and prints the response felts, space separated.
call() { # <address> <function> [calldata...]
  local addr="$1" fn="$2"; shift 2
  local args=()
  [[ $# -gt 0 ]] && args=(--calldata "$@")
  if ((USE_SIGNER)); then
    send call --contract "$addr" --function "$fn" ${args[@]+"${args[@]}"} | pyj '" ".join(d["result"])'
  else
    sc sncast call --url "$RPC_URL" --contract-address "$addr" --function "$fn" ${args[@]+"${args[@]}"} |
      pyj '" ".join(d["response_raw"])'
  fi
}

# Invokes an entry point as the deployer, waits for acceptance, prints the tx hash.
invoke() { # <address> <function> [calldata...]
  local addr="$1" fn="$2"; shift 2
  local args=()
  [[ $# -gt 0 ]] && args=(--calldata "$@")
  local tx
  if ((USE_SIGNER)); then
    tx="$(send invoke --contract "$addr" --function "$fn" ${args[@]+"${args[@]}"} | pyj 'd["transaction_hash"]')" ||
      die "invoke $fn failed"
  else
    tx="$(sc sncast --wait "${ACCOUNTS[@]}" --account dev invoke --url "$RPC_URL" \
      --contract-address "$addr" --function "$fn" ${args[@]+"${args[@]}"} | pyj 'd["transaction_hash"]')"
  fi
  echo "   $fn tx $tx" >&2
  echo "$tx"
}

# Invokes several calls as the deployer, each argument "<address> <function> [calldata...]": through the signer in one
# multicall transaction (its hash then in LAST_TX), on devnet one invoke each. Prints nothing on stdout.
invoke_all() {
  local spec tx
  if ((USE_SIGNER)); then
    python3 -I -c '
import json, sys
calls = []
for spec in sys.argv[2:]:
    contract, function, *calldata = spec.split()
    calls.append({"contract": contract, "function": function, "calldata": calldata})
with open(sys.argv[1], "w") as f:
    json.dump(calls, f)
' "$WORK_DIR/calls.json" "$@" || die "invalid multicall"
    tx="$(send multicall --calls "$WORK_DIR/calls.json" | pyj 'd["transaction_hash"]')" || die "multicall failed"
    LAST_TX="$tx"
    echo "   multicall$(for spec in "$@"; do printf ' %s' "$(cut -d' ' -f2 <<<"$spec")"; done) tx $tx" >&2
  else
    for spec in "$@"; do
      # Each spec splits into the address, the function and the calldata.
      # shellcheck disable=SC2086
      invoke $spec >/dev/null
    done
  fi
}

declare_class() { # <Contract> -> class hash
  local name="$1" expected out
  expected="$(sc sncast utils class-hash --contract-name "$name" | pyj 'd["class_hash"]')" ||
    die "class-hash $name failed"
  if ((USE_SIGNER)); then
    # The release build's files; the class the node takes must be the one sncast computes from the same sources.
    out="$(send declare --sierra "$RELEASE_DIR/paved_$name.contract_class.json" \
      --casm "$RELEASE_DIR/paved_$name.compiled_contract_class.json")" || die "declare $name failed"
    [[ "$(hex_int "$(pyj 'd["class_hash"]' <<<"$out")")" == "$(hex_int "$expected")" ]] ||
      die "declare $name: the signer declared $(pyj 'd["class_hash"]' <<<"$out"), sncast computes $expected"
    if [[ "$(pyj 'd["already_declared"]' <<<"$out")" == True ]]; then
      echo "   declare $name $expected (already declared)" >&2
    else
      echo "   declare $name $expected tx $(pyj 'd["transaction_hash"]' <<<"$out")" >&2
    fi
  elif out="$(sc sncast --wait "${ACCOUNTS[@]}" --account dev declare --url "$RPC_URL" \
      --contract-name "$name" 2>&1)"; then
    echo "   declare $name $(pyj 'd["class_hash"]' <<<"$out") tx $(pyj 'd["transaction_hash"]' <<<"$out")" >&2
  elif grep -q "already declared" <<<"$out"; then
    echo "   declare $name $expected (already declared)" >&2
  else
    die "declare $name failed (is the node fresh? restart devnet with --seed 42): $out"
  fi
  echo "$expected"
}

deploy() { # <Contract> <class hash> [constructor calldata...] -> address
  local name="$1" class="$2"; shift 2
  # The mocks are for tests, devnet and Sepolia (E1's audit, P-39): the Faucet and MockRouter are refused by name on
  # mainnet (the network check at the top refuses it already), the old mock Token off devnet. The VRF mock: devnet, and
  # Sepolia for its smoke only (#645, the owner's ruling of 2026-10-21: fresh_vrf_step, fresh_vrf_final_step).
  case "$name" in
    Faucet|MockRouter) [[ "$NETWORK" == "devnet" || "$NETWORK" == "sepolia" ]] || die "refusing to deploy the mock $name on $NETWORK" ;;
    MockVrfProvider) [[ "$NETWORK" == "devnet" || "$NETWORK" == "sepolia" ]] || die "refusing to deploy the mock $name on $NETWORK" ;;
    Token) [[ "$NETWORK" == "devnet" ]] || die "refusing to deploy the mock $name on $NETWORK" ;;
  esac
  local args=() out
  if ((USE_SIGNER)); then
    # The signer always deploys unique (the address depends on the deployer), as UNIQUE does on this path.
    [[ $# -gt 0 ]] && args=(--calldata "$@")
    out="$(send deploy --class-hash "$class" --salt "$SALT" ${args[@]+"${args[@]}"})" || die "deploy $name failed"
  else
    [[ $# -gt 0 ]] && args=(--constructor-calldata "$@")
    out="$(sc sncast --wait "${ACCOUNTS[@]}" --account dev deploy --url "$RPC_URL" \
      --class-hash "$class" --salt "$SALT" ${UNIQUE[@]+"${UNIQUE[@]}"} ${args[@]+"${args[@]}"})" || die "deploy $name failed (is the node fresh?)"
  fi
  local tx
  tx="$(pyj 'd["transaction_hash"]' <<<"$out")"
  echo "$tx" >>"$WORK_DIR/deploy-txs"  # deploy runs in a subshell: a file, not an array
  echo "   deploy $name $(pyj 'd["contract_address"]' <<<"$out") tx $tx" >&2
  pyj 'd["contract_address"]' <<<"$out"
}

# --repoint (R-1, E-9) and --d18 (D-18c): the deployment file's record, under RECORD_KEY (`repoint` or `d18`).
# rp_set <key=value>...: sets each dotted key under it (an empty value removes it) and rewrites the file through a temporary file in its directory, renamed over it,
# so a kill leaves the old file or the new one, never half of it. Every other field is kept. rp_get <key>: the value, or
# nothing.
rp_set() {
  python3 -I - "$REPOINT_FILE" "$RECORD_KEY" "$@" <<'PY'
import json, os, sys, tempfile
path, top, *pairs = sys.argv[1:]
d = json.load(open(path))
record = d.setdefault(top, {})
for pair in pairs:
    key, _, value = pair.partition("=")
    *parents, leaf = key.split(".")
    node = record
    for p in parents:
        node = node.setdefault(p, {})
    if value:
        node[leaf] = value
    else:
        node.pop(leaf, None)
fd, tmp = tempfile.mkstemp(dir=os.path.dirname(path))
os.chmod(tmp, os.stat(path).st_mode & 0o777)
with os.fdopen(fd, "w") as f:
    json.dump(d, f, indent=2)
    f.write("\n")
os.replace(tmp, path)
PY
}
rp_get() {
  python3 -I - "$REPOINT_FILE" "$RECORD_KEY" "$1" <<'PY'
import json, sys
node = json.load(open(sys.argv[1])).get(sys.argv[2], {})
for p in sys.argv[3].split("."):
    node = node.get(p, {}) if isinstance(node, dict) else {}
print(node if isinstance(node, str) else "")
PY
}

# v <name> <command...>: runs the command and assigns its stdout to <name>. A `die` inside a command substitution ends
# only that subshell, and its status is lost in an `echo` argument, a here-string or a process substitution; so in the
# repoint every call whose failure must stop the run goes through here, which stops it (review of #313, finding 1).
v() {
  local __out __name="$1"
  shift
  __out="$("$@")" || die "$1 failed: stopping before anything else is sent"
  printf -v "$__name" '%s' "$__out"
}

# repoint_tx_status <tx>: SUCCEEDED or REVERTED from its receipt; PENDING when the node knows the transaction but has no
# receipt yet; UNKNOWN when the node knows nothing of it.
repoint_tx_status() {
  local answer status
  answer="$(rpc starknet_getTransactionReceipt "[\"$1\"]")" || answer=""
  status="$(pyj 'd.get("result",{}).get("execution_status","")' <<<"$answer" 2>/dev/null || true)"
  if [[ "$status" == SUCCEEDED || "$status" == REVERTED ]]; then echo "$status"; return; fi
  answer="$(rpc starknet_getTransactionStatus "[\"$1\"]")" || answer=""
  if [[ -n "$(pyj 'd.get("result",{}).get("finality_status","")' <<<"$answer" 2>/dev/null || true)" ]]; then echo PENDING; else echo UNKNOWN; fi
}

# repoint_settled <key>: the transaction a run recorded under `repoint.<key>`, before anything that depends on it is
# derived again (review of #313, finding 2). Nothing recorded: returns 1. Otherwise its receipt is awaited (5 s apart,
# for at most REPOINT_WAIT_S, 300 s by default, as the signer's recovery waits): SUCCEEDED returns 0; REVERTED clears the
# key and returns 1, so the step may be sent again; no receipt by then stops the run, the hash named, and nothing is
# sent again while it might still land.
# The test of the wait (scripts/test-deploy-url.sh) lowers it; anything but a whole number of seconds is refused.
REPOINT_WAIT_S="${REPOINT_WAIT_S:-300}"
[[ "$REPOINT_WAIT_S" =~ ^[0-9]{1,5}$ ]] || { echo "deploy.sh: REPOINT_WAIT_S must be a whole number of seconds" >&2; exit 2; }
repoint_settled() {
  local tx status waited=0
  tx="$(rp_get "$1")"
  [[ -n "$tx" ]] || return 1
  while true; do
    status="$(repoint_tx_status "$tx")"
    case "$status" in
      SUCCEEDED) echo "   $1 $tx (recorded): landed"; return 0 ;;
      REVERTED) echo "   $1 $tx (recorded): reverted, so it may be sent again"; rp_set "$1="; return 1 ;;
    esac
    (( waited < REPOINT_WAIT_S )) ||
      die "$1 $tx (recorded) has no receipt after ${REPOINT_WAIT_S} s (node: $status): check it before any rerun; nothing more was sent"
    echo "   $1 $tx (recorded): $status, waiting for its receipt" >&2
    sleep 5
    waited=$((waited + 5))
  done
}

# felt64 <felt>: 0x and 64 hex digits (O-19), in python: bash's printf saturates above 2^63.
felt64() { printf '%s' "$1" | python3 -I -c 'import sys;print("0x%064x" % int(sys.stdin.read(), 16))'; }
# gt <a> <b>: a > b, decimal integers of any size (bash arithmetic stops at 2^63).
gt() { python3 -I -c 'import sys;sys.exit(0 if int(sys.argv[1]) > int(sys.argv[2]) else 1)' "$1" "$2"; }
# felt_eq <a> <b>: the same felt, whatever the padding.
felt_eq() { [[ -n "$1" && -n "$2" && "$(hex_int "$1")" == "$(hex_int "$2")" ]]; }
# u256_of <low> <high>: the integer, decimal.
u256_of() { python3 -I -c 'import sys;print(int(sys.argv[1],16)+(int(sys.argv[2],16)<<128))' "$1" "$2"; }
# class_at <address>: the class hash deployed there, or nothing. class_of <address>: the same, but fails when the node
# does not answer one (through `v`, a failed read stops the run instead of reading as another class).
class_at() { rpc starknet_getClassHashAt "[\"latest\",\"$1\"]" | pyj 'd.get("result","")' 2>/dev/null || true; }
class_of() {
  local answer
  answer="$(rpc starknet_getClassHashAt "[\"latest\",\"$1\"]")" || return 1
  class_hash_answer <<<"$answer" || return 1
  pyj 'd["result"]' <<<"$answer"
}

# repoint_state: reads the deployment file and the chain, checks what must hold before anything is sent, and sets
# what has landed already (RP_* variables). Read-only: nothing is estimated, signed or sent here.
repoint_state() {
  echo "== repoint: state (read-only)"
  [[ -f "$REPOINT_FILE" ]] || die "no deployment file $REPOINT_FILE"
  local fields
  fields="$(python3 -I - "$REPOINT_FILE" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
c, r = d.get("contracts", {}), d.get("repoint", {})
prev = r.get("previous", {})
def addr(name):
    return c.get(name, {}).get("address", "")
print(d.get("network", ""), d.get("chain_id", ""), addr("Economy"), addr("PavedToken"), addr("MockUSDC"), addr("Vault"),
      addr("Account"), addr("Daily"), addr("Tutorial"), addr("Collection"),
      # Before the repoint completes, the old router and Economy class are the file's; after, the record keeps them.
      prev.get("MockRouter", {}).get("address", addr("MockRouter")),
      prev.get("MockRouter", {}).get("class_hash", c.get("MockRouter", {}).get("class_hash", "")),
      prev.get("Economy", {}).get("class_hash", c.get("Economy", {}).get("class_hash", "")))
PY
)" || die "$REPOINT_FILE is not a deployment file"
  read -r RP_NETWORK RP_CHAIN ECONOMY PAVED USDC VAULT ACCOUNT DAILY TUTORIAL COLLECTION OLD_ROUTER OLD_ROUTER_CLASS \
    OLD_ECONOMY_CLASS <<<"$fields"
  [[ "$RP_NETWORK" == sepolia ]] || die "$REPOINT_FILE is a '$RP_NETWORK' deployment, not sepolia"
  [[ -n "$OLD_ECONOMY_CLASS" ]] || die "$REPOINT_FILE lacks an address or class hash the repoint needs"
  felt_eq "$RP_CHAIN" "$CHAIN_ID" || die "$REPOINT_FILE is for chain $RP_CHAIN, the node is $CHAIN_ID"
  # The E-9 classes, from the release build (the hashes sncast computes, as declare_class checks the signer's).
  NEW_ECONOMY_CLASS="$(sc sncast utils class-hash --contract-name Economy | pyj 'd["class_hash"]')" || die "class-hash Economy failed"
  NEW_ROUTER_CLASS="$(sc sncast utils class-hash --contract-name MockRouter | pyj 'd["class_hash"]')" || die "class-hash MockRouter failed"
  ! felt_eq "$NEW_ECONOMY_CLASS" "$OLD_ECONOMY_CLASS" || [[ -n "$(rp_get previous.Economy.class_hash)" ]] ||
    die "the built Economy class is the deployed one ($OLD_ECONOMY_CLASS): nothing to upgrade to"
  echo "   file ${REPOINT_FILE#"$ROOT/"}: Economy $ECONOMY, old MockRouter $OLD_ROUTER"
  echo "   E-9 classes: Economy $NEW_ECONOMY_CLASS, MockRouter $NEW_ROUTER_CLASS"

  # The deployer owns Economy (its upgrade, set_router and set_pool are the owner's).
  local owner a_raw
  v owner call "$ECONOMY" owner
  [[ "$(hex_int "$owner")" == "$DEPLOYER_INT" ]] || die "the deployer $DEPLOYER_LABEL is not Economy.owner()"
  echo "   Economy.owner() is the deployer"
  # The seed reads the 1:1 Vault's `staked` and sends its `unstake`: a vPAVED Vault (P-56, V1b) has neither, so a repoint
  # of its deployment is refused here, before anything is estimated or sent (fix loop 1 of #382; under D-27 Sepolia gets a
  # fresh deployment instead; reversed if the PM wants --repoint ported to vPAVED). Any other failure stops as `v` does.
  local staked_err
  if ! staked_err="$(call "$VAULT" staked "$DEPLOYER_ARG" 2>&1 >/dev/null)"; then
    [[ "$staked_err" != *ENTRYPOINT_NOT_FOUND* ]] || die "--repoint applies only to a pre-V1b deployment (the 1:1 Vault): the Vault $VAULT has no staked() (vPAVED)"
    printf '%s\n' "$staked_err" >&2
    die "call failed: stopping before anything else is sent"
  fi
  # Economy's class: the deployed one or the E-9 one, nothing else.
  RP_ECONOMY_CLASS="$(class_at "$ECONOMY")"
  if felt_eq "$RP_ECONOMY_CLASS" "$NEW_ECONOMY_CLASS"; then RP_UPGRADED=1
  elif felt_eq "$RP_ECONOMY_CLASS" "$OLD_ECONOMY_CLASS"; then RP_UPGRADED=0
  else die "Economy's class on the node is $RP_ECONOMY_CLASS: neither the file's $OLD_ECONOMY_CLASS nor the E-9 class"; fi
  # Its stored router, through addresses() (both classes have it; router() is E-9's): the old MockRouter, or the new
  # one this record names. Its tokens and Vault must be the file's.
  local a
  v a_raw call "$ECONOMY" addresses
  read -r -a a <<<"$a_raw"
  felt_eq "${a[0]}" "$PAVED" && felt_eq "${a[1]}" "$USDC" && felt_eq "${a[2]}" "$VAULT" ||
    die "Economy.addresses() does not name the file's PavedToken, MockUSDC and Vault"
  NEW_ROUTER="$(rp_get MockRouter.address)"
  if felt_eq "${a[3]}" "$OLD_ROUTER"; then RP_REPOINTED=0
  elif felt_eq "${a[3]}" "$NEW_ROUTER"; then RP_REPOINTED=1
  else die "Economy's router is ${a[3]}: neither the old MockRouter of the file nor a new one it records"; fi
  felt_eq "$(class_at "$OLD_ROUTER")" "$OLD_ROUTER_CLASS" || die "the old MockRouter $OLD_ROUTER is not of class $OLD_ROUTER_CLASS"
  echo "   Economy: class $( ((RP_UPGRADED)) && echo "E-9 (upgraded)" || echo "$OLD_ECONOMY_CLASS (not upgraded)"), router $( ((RP_REPOINTED)) && echo "the new MockRouter $NEW_ROUTER" || echo "the old MockRouter")"
  # A new MockRouter this record names: of the E-9 class, over PAVED and USDC.
  if [[ -n "$NEW_ROUTER" ]]; then
    felt_eq "$(class_at "$NEW_ROUTER")" "$NEW_ROUTER_CLASS" || die "the recorded MockRouter $NEW_ROUTER is not of class $NEW_ROUTER_CLASS on the node"
    repoint_check_router_tokens "$NEW_ROUTER"
    echo "   new MockRouter $NEW_ROUTER (recorded): deployed, E-9 class"
    repoint_complete
  elif [[ -n "$(rp_get MockRouter.deploy_tx)" ]]; then
    echo "   new MockRouter: a deploy was sent ($(rp_get MockRouter.deploy_tx)), its address not recorded: read from its receipt below"
  fi
}

# repoint_complete: sets RP_COMPLETE when nothing is left to send (Economy upgraded, repointed and on the new pool, the
# pool seeded, the smoke's game recorded and its transactions landed), so the funding check need not refuse a rerun
# that sends nothing (review of #313, note 4). Read-only.
RP_COMPLETE=0
repoint_complete() {
  local raw pool k r t
  ((RP_UPGRADED && RP_REPOINTED)) || return 0
  v raw call "$ECONOMY" pool; read -r -a pool <<<"$raw"
  v raw call "$NEW_ROUTER" pool_key; read -r -a k <<<"$raw"
  python3 -I -c 'import sys;v=[int(x,16) for x in sys.argv[1:]];sys.exit(0 if len(v)==12 and v[:5]==v[7:] and v[5:7]==[0,0] else 1)' \
    "${pool[@]}" "${k[@]}" || return 0
  v raw repoint_reserves "$NEW_ROUTER"; read -r -a r <<<"$raw"
  [[ "${r[0]}" != 0 && "${r[1]}" != 0 ]] || return 0
  [[ -n "$(rp_get smoke.game_id)" ]] || return 0
  v raw call "$ECONOMY" terms "$(rp_get smoke.game_id)"; read -r -a t <<<"$raw"
  [[ "$(hex_int "${t[9]}")" == 1 ]] || return 0
  local key
  for key in seed.tx multicall_tx smoke.spawn_tx smoke.surrender_tx; do
    [[ -z "$(rp_get "$key")" || "$(repoint_tx_status "$(rp_get "$key")")" == SUCCEEDED ]] || return 0
  done
  RP_COMPLETE=1
  echo "   complete: upgraded, repointed, seeded, smoke recorded; nothing is left to send"
}

# repoint_check_router_tokens <router>: its pool is PAVED and USDC, in the address order.
repoint_check_router_tokens() {
  local k raw
  v raw call "$1" pool_key
  read -r -a k <<<"$raw"
  [[ "${#k[@]}" == 5 ]] || die "MockRouter($1).pool_key returned ${#k[@]} felts, expected 5"
  if python3 -I -c 'import sys;sys.exit(0 if int(sys.argv[1],16)<int(sys.argv[2],16) else 1)' "$PAVED" "$USDC"; then
    felt_eq "${k[0]}" "$PAVED" && felt_eq "${k[1]}" "$USDC" || die "MockRouter($1) is not over PAVED and USDC"
  else
    felt_eq "${k[0]}" "$USDC" && felt_eq "${k[1]}" "$PAVED" || die "MockRouter($1) is not over PAVED and USDC"
  fi
}

# repoint_reserves <router>: its reserves as `paved usdc`, decimal.
repoint_reserves() {
  local r raw
  v raw call "$1" reserves
  read -r -a r <<<"$raw"
  [[ "${#r[@]}" == 4 ]] || die "MockRouter($1).reserves returned ${#r[@]} felts, expected 4"
  if python3 -I -c 'import sys;sys.exit(0 if int(sys.argv[1],16)<int(sys.argv[2],16) else 1)' "$PAVED" "$USDC"; then
    echo "$(u256_of "${r[0]}" "${r[1]}") $(u256_of "${r[2]}" "${r[3]}")"
  else
    echo "$(u256_of "${r[2]}" "${r[3]}") $(u256_of "${r[0]}" "${r[1]}")"
  fi
}

# repoint_quote <router> <usdc in>: the router's own quote_swap at its pool key and Economy's limit (0), one hop; prints
# the PAVED out, and dies unless the whole input fills and the PAVED leg is paid out (Economy.quote_swap's checks).
repoint_quote() {
  local k d raw
  v raw call "$1" pool_key
  read -r -a k <<<"$raw"
  v raw call "$1" quote_swap "${k[@]}" 0 0 0 "$USDC" "$2" 0
  read -r -a d <<<"$raw"
  [[ "${#d[@]}" == 4 ]] || die "MockRouter($1).quote_swap returned ${#d[@]} felts, expected 4"
  python3 -I - "$PAVED" "$USDC" "$2" "${d[@]}" <<'PY' || die "MockRouter($1).quote_swap($2) does not fill the whole input with PAVED out"
import sys
paved, usdc, amount, m0, s0, m1, s1 = sys.argv[1:]
legs = [(int(m0, 16), int(s0, 16)), (int(m1, 16), int(s1, 16))]
usdc_leg, paved_leg = (legs[1], legs[0]) if int(paved, 16) < int(usdc, 16) else (legs[0], legs[1])
ok = usdc_leg == (int(amount), 0) and paved_leg[1] == 1 and paved_leg[0] > 0
print(paved_leg[0])
sys.exit(0 if ok else 1)
PY
}

# repoint_seed_plan: the seed of the new pool (R-1), unless one is recorded: the old pool's ratio, read from its
# reserves; its depth as far as the deployer's PAVED allows, which is its balance plus an unstake that leaves 10 % of
# its Vault stake staked (E-7: USDC that reaches a Vault nobody stakes in goes to the first staker); the USDC at that
# ratio, from the deployer's balance and then the Faucet (the file's MockUSDC) (10,000 USDC per call, 20,000 per address), less the
# 2 USDC the smoke's paid spawn needs, and less PAVED when that cannot cover it. Recorded before anything is sent, so a rerun seeds the same amounts (not with
# --check-only, which writes nothing).
repoint_seed_plan() {
  if [[ -n "$(rp_get seed.paved)" ]]; then
    SEED_PAVED="$(rp_get seed.paved)"
    SEED_USDC="$(rp_get seed.usdc)"
    echo "   seed (recorded): $SEED_PAVED PAVED and $SEED_USDC USDC base units"
    return
  fi
  local old stake bal_paved bal_usdc minted plan raw
  v raw repoint_reserves "$OLD_ROUTER"; read -r -a old <<<"$raw"
  v raw call "$VAULT" staked "$DEPLOYER_ARG"; stake="$(u256_of $raw)"
  v raw call "$PAVED" balance_of "$DEPLOYER_ARG"; bal_paved="$(u256_of $raw)"
  v raw call "$USDC" balance_of "$DEPLOYER_ARG"; bal_usdc="$(u256_of $raw)"
  v raw call "$USDC" minted "$DEPLOYER_ARG"; minted="$(u256_of $raw)"
  plan="$(python3 -I - "${old[0]}" "${old[1]}" "$stake" "$bal_paved" "$bal_usdc" "$minted" <<'PY'
import sys
r_paved, r_usdc, stake, bal_paved, bal_usdc, minted = map(int, sys.argv[1:])
if r_paved == 0 or r_usdc == 0:
    sys.exit("the old pool is empty")
keep = -(-stake // 10)
paved = min(r_paved, bal_paved + stake - keep)
usdc = paved * r_usdc // r_paved
# The smoke's 2 USDC stay out of the seed: its paid spawn mints what the deployer lacks of them afterwards.
room = max(0, bal_usdc + max(0, 20_000 * 10**6 - minted) - 2 * 10**6)
if usdc > room:
    usdc = room
paved = usdc * r_paved // r_usdc
if usdc < 10**6 or paved == 0:
    sys.exit(f"the seed would be {paved} PAVED for {usdc} USDC base units: below 1 USDC")
print(paved, usdc, keep)
PY
)" || die "no seed for the new pool: $plan"
  read -r SEED_PAVED SEED_USDC _ <<<"$plan"
  python3 -I - "${old[@]}" "$stake" "$bal_paved" "$bal_usdc" "$minted" $plan <<'PY'
import sys
r_paved, r_usdc, stake, bal_paved, bal_usdc, minted, paved, usdc, keep = map(int, sys.argv[1:])
P, U = 10**18, 10**6
print(f"   old pool: {r_paved / P:,.6f} PAVED and {r_usdc / U:,.6f} USDC, {r_paved / P / (r_usdc / U):,.6f} PAVED per USDC")
print(f"   deployer: {bal_paved / P:,.6f} PAVED held, {stake / P:,.6f} staked (10 % kept: {keep / P:,.6f}), "
      f"{bal_usdc / U:,.6f} USDC held, {minted / U:,.6f} from the faucet so far")
print(f"   seed: {paved / P:,.6f} PAVED and {usdc / U:,.6f} USDC, {paved / P / (usdc / U):,.6f} PAVED per USDC, "
      f"{100 * usdc / r_usdc:.1f} % of the old pool's depth")
PY
  ((REPOINT_CHECK_ONLY)) ||
    rp_set "seed.paved=$SEED_PAVED" "seed.usdc=$SEED_USDC" "seed.old_reserve_paved=${old[0]}" "seed.old_reserve_usdc=${old[1]}"
}

# repoint_seed_calls: the seed multicall's calls (one spec per line), from the deployer's balances now: the unstake of
# the PAVED it lacks, the faucet mints of the USDC it lacks (10,000 USDC at most per call), both approvals and
# add_liquidity, in the router's token order. One transaction: it lands whole or not at all.
repoint_seed_calls() {
  local stake bal_paved bal_usdc unstake mint chunk raw
  v raw call "$VAULT" staked "$DEPLOYER_ARG"; stake="$(u256_of $raw)"
  v raw call "$PAVED" balance_of "$DEPLOYER_ARG"; bal_paved="$(u256_of $raw)"
  v raw call "$USDC" balance_of "$DEPLOYER_ARG"; bal_usdc="$(u256_of $raw)"
  read -r unstake mint <<<"$(python3 -I -c 'import sys;p,u,s,bp,bu=map(int,sys.argv[1:]);print(max(0,p-bp),max(0,u-bu))' \
    "$SEED_PAVED" "$SEED_USDC" "$stake" "$bal_paved" "$bal_usdc")"
  python3 -I -c 'import sys;n,s=map(int,sys.argv[1:]);sys.exit(0 if n<=s-(-(-s//10)) else 1)' "$unstake" "$stake" ||
    die "the seed needs an unstake of $unstake PAVED base units, more than 90 % of the deployer's stake ($stake)"
  [[ "$unstake" == 0 ]] || echo "$VAULT unstake $(u256 "$unstake")"
  while [[ "$mint" != 0 ]]; do
    chunk="$(python3 -I -c 'import sys;print(min(int(sys.argv[1]),10_000*10**6))' "$mint")"
    echo "$USDC mint $DEPLOYER_ARG $(u256 "$chunk")"
    mint="$(python3 -I -c 'import sys;print(int(sys.argv[1])-int(sys.argv[2]))' "$mint" "$chunk")"
  done
  echo "$PAVED approve $NEW_ROUTER $(u256 "$SEED_PAVED")"
  echo "$USDC approve $NEW_ROUTER $(u256 "$SEED_USDC")"
  if python3 -I -c 'import sys;sys.exit(0 if int(sys.argv[1],16)<int(sys.argv[2],16) else 1)' "$PAVED" "$USDC"; then
    echo "$NEW_ROUTER add_liquidity $(u256 "$SEED_PAVED") $(u256 "$SEED_USDC")"
  else
    echo "$NEW_ROUTER add_liquidity $(u256 "$SEED_USDC") $(u256 "$SEED_PAVED")"
  fi
}

# repoint_deployed_address <tx>: the new MockRouter a deploy transaction created, from its receipt (the first event
# datum that is a contract of the E-9 MockRouter class); nothing when it did not succeed or names none.
repoint_deployed_address() {
  local receipt candidate
  receipt="$(rpc starknet_getTransactionReceipt "[\"$1\"]")" || return 0
  [[ "$(pyj 'd.get("result",{}).get("execution_status","")' <<<"$receipt" 2>/dev/null)" == SUCCEEDED ]] || return 0
  while read -r candidate; do
    if [[ -n "$candidate" ]] && felt_eq "$(class_at "$candidate")" "$NEW_ROUTER_CLASS"; then
      echo "$candidate"
      return 0
    fi
  done < <(pyj '"\n".join(e["data"][0] for e in d["result"]["events"] if e.get("data"))' <<<"$receipt")
}

# repoint_run: declares, deploys and seeds the new MockRouter, repoints Economy (upgrade, set_router, set_pool in one
# multicall), records each step in the deployment file as it lands, then smokes. Each step reads what already landed
# first and is skipped when done, so a rerun sends only what is left; a complete one sends nothing.
repoint_run() {
  local tx k p pool calls=() spec need=() raw quoted
  if ((REPOINT_CHECK_ONLY)); then
    echo "== repoint: check only (nothing is sent, the file is not written)"
    if [[ -z "$NEW_ROUTER" ]]; then
      repoint_seed_plan
      echo "== repoint: check only: every check passed; a run would declare, deploy and seed a MockRouter, then repoint Economy"
    else
      v quoted repoint_quote "$NEW_ROUTER" 1400000
      echo "   new MockRouter quotes 1.4 USDC: $quoted PAVED base units"
      echo "== repoint: check only: every check passed; nothing was sent"
    fi
    exit 0
  fi
  # The previous router and Economy class and the commit of the run, once, before anything is sent.
  if [[ -z "$(rp_get previous.MockRouter.address)" ]]; then
    rp_set "previous.MockRouter.address=$(felt64 "$OLD_ROUTER")" \
      "previous.MockRouter.class_hash=$(felt64 "$OLD_ROUTER_CLASS")" \
      "previous.Economy.class_hash=$(felt64 "$OLD_ECONOMY_CLASS")" "at=$DEPLOYED_AT"
  fi

  echo "== repoint: declare"
  declare_class MockRouter >/dev/null
  declare_class Economy >/dev/null
  rp_set "MockRouter.class_hash=$(felt64 "$NEW_ROUTER_CLASS")" \
    "Economy.class_hash=$(felt64 "$NEW_ECONOMY_CLASS")"

  echo "== repoint: new MockRouter"
  if [[ -z "$NEW_ROUTER" && -n "$(rp_get MockRouter.deploy_tx)" ]]; then
    # A deploy sent by a run stopped before it recorded the address: the receipt tells, and no second deploy goes out
    # while it might have landed.
    tx="$(rp_get MockRouter.deploy_tx)"
    if repoint_settled MockRouter.deploy_tx; then
      NEW_ROUTER="$(repoint_deployed_address "$tx")"
      [[ -n "$NEW_ROUTER" ]] || die "the recorded MockRouter deploy $tx succeeded but created no MockRouter of class $NEW_ROUTER_CLASS: check it"
      echo "   deploy $tx (recorded) created $NEW_ROUTER"
    fi
  fi
  if [[ -z "$NEW_ROUTER" ]]; then
    # The salt is recorded before the deploy: a rerun deploys with the same one, so a second MockRouter could only land
    # at the same address, where the deployer's first one would make it revert.
    [[ -n "$(rp_get MockRouter.salt)" ]] || rp_set "MockRouter.salt=$SALT"
    RECORD_SENDING=MockRouter.deploy_tx
    tx="$(send deploy --class-hash "$NEW_ROUTER_CLASS" --salt "$(rp_get MockRouter.salt)" --calldata "$PAVED" "$USDC")" ||
      die "deploy MockRouter failed"
    RECORD_SENDING=""
    NEW_ROUTER="$(felt64 "$(pyj 'd["contract_address"]' <<<"$tx")")"
    rp_set "MockRouter.deploy_tx=$(pyj 'd["transaction_hash"]' <<<"$tx")"
    echo "   deploy MockRouter $NEW_ROUTER tx $(pyj 'd["transaction_hash"]' <<<"$tx")"
  else
    echo "   MockRouter $NEW_ROUTER deployed already"
  fi
  rp_set "MockRouter.address=$(felt64 "$NEW_ROUTER")"
  felt_eq "$(class_at "$NEW_ROUTER")" "$NEW_ROUTER_CLASS" || die "the new MockRouter $NEW_ROUTER is not of class $NEW_ROUTER_CLASS"
  repoint_check_router_tokens "$NEW_ROUTER"

  echo "== repoint: seed"
  # A seed a stopped run sent: its receipt first, so a seed still in flight is never sent twice.
  repoint_settled seed.tx || true
  v raw repoint_reserves "$NEW_ROUTER"; read -r -a p <<<"$raw"
  if [[ "${p[0]}" != 0 && "${p[1]}" != 0 ]]; then
    echo "   seeded already: ${p[0]} PAVED and ${p[1]} USDC base units$( [[ -n "$(rp_get seed.tx)" ]] && echo ", tx $(rp_get seed.tx)")"
  elif [[ "${p[0]}" != 0 || "${p[1]}" != 0 ]]; then
    die "the new MockRouter holds one token only (${p[0]} PAVED, ${p[1]} USDC base units): not seeded by this tool; check it"
  else
    repoint_seed_plan
    calls=()
    v raw repoint_seed_calls
    while IFS= read -r spec; do calls+=("$spec"); done <<<"$raw"
    RECORD_SENDING=seed.tx
    invoke_all "${calls[@]}"
    RECORD_SENDING=""
    rp_set "seed.tx=$LAST_TX"
    v raw repoint_reserves "$NEW_ROUTER"; read -r -a p <<<"$raw"
    [[ "${p[0]}" == "$SEED_PAVED" && "${p[1]}" == "$SEED_USDC" ]] || die "the new pool holds ${p[0]} PAVED and ${p[1]} USDC base units, not the seed"
    echo "   seeded: ${p[0]} PAVED and ${p[1]} USDC base units"
  fi

  echo "== repoint: Economy"
  # Before Economy points at it: the new router answers the quote Economy.quote_swap will ask (1.4 USDC, its pool key,
  # the limit 0 that set_pool stores), whole fill, PAVED out.
  v quoted repoint_quote "$NEW_ROUTER" 1400000
  echo "   new MockRouter quotes 1.4 USDC: $quoted PAVED base units"
  # A repoint multicall a stopped run sent: its receipt first, then what is missing is read again.
  repoint_settled multicall_tx || true
  v raw call "$NEW_ROUTER" pool_key; read -r -a k <<<"$raw"
  v raw call "$ECONOMY" pool; read -r -a pool <<<"$raw"
  need=()
  v raw class_of "$ECONOMY"
  felt_eq "$raw" "$NEW_ECONOMY_CLASS" || need+=("$ECONOMY upgrade $NEW_ECONOMY_CLASS")
  v raw call "$ECONOMY" addresses; read -r -a p <<<"$raw"
  # set_router, then set_pool with the new router's key and the limit 0 (OPERATIONS, step 4: a router serves the stored
  # key, so its own goes after it). set_pool goes alone only when a repointed Economy's stored pool is not that.
  if ! felt_eq "${p[3]}" "$NEW_ROUTER"; then
    need+=("$ECONOMY set_router $NEW_ROUTER" "$ECONOMY set_pool ${k[*]} 0 0")
  elif ! python3 -I - "${pool[@]}" "${k[@]}" <<'PY'
import sys
v = [int(x, 16) for x in sys.argv[1:]]
sys.exit(0 if len(v) == 12 and v[:5] == v[7:] and v[5:7] == [0, 0] else 1)
PY
  then
    need+=("$ECONOMY set_pool ${k[*]} 0 0")
  fi
  if [[ "${#need[@]}" == 0 ]]; then
    echo "   upgraded, repointed and on the new pool already$( [[ -n "$(rp_get multicall_tx)" ]] && echo ", tx $(rp_get multicall_tx)")"
  else
    RECORD_SENDING=multicall_tx
    invoke_all "${need[@]}"
    RECORD_SENDING=""
    rp_set "multicall_tx=$LAST_TX"
  fi
  v raw class_of "$ECONOMY"
  felt_eq "$raw" "$NEW_ECONOMY_CLASS" || die "Economy's class is not the E-9 class after the multicall"
  v raw call "$ECONOMY" router
  felt_eq "$raw" "$NEW_ROUTER" || die "Economy.router() is not the new MockRouter after the multicall"
  v raw call "$ECONOMY" pool; read -r -a pool <<<"$raw"
  python3 -I - "${pool[@]}" "${k[@]}" <<'PY' || die "Economy.pool() is not the new MockRouter's key and the limit 0 after the multicall"
import sys
v = [int(x, 16) for x in sys.argv[1:]]
sys.exit(0 if len(v) == 12 and v[:5] == v[7:] and v[5:7] == [0, 0] else 1)
PY
  echo "   Economy: E-9 class, router the new MockRouter, pool its key with the limit 0"

  # The deployment file: the new MockRouter and Economy's class where the client and the indexer read them (they read
  # addresses only, which do not change but the MockRouter's), every other field kept.
  python3 -I - "$REPOINT_FILE" "$NEW_ROUTER" "$NEW_ROUTER_CLASS" "$NEW_ECONOMY_CLASS" <<'PY'
import json, os, sys, tempfile
path, router, router_class, economy_class = sys.argv[1:]
d = json.load(open(path))
h = lambda x: "0x%064x" % int(x, 16)
d["contracts"]["MockRouter"] = {"address": h(router), "class_hash": h(router_class)}
d["contracts"]["Economy"]["class_hash"] = h(economy_class)
fd, tmp = tempfile.mkstemp(dir=os.path.dirname(path))
os.chmod(tmp, os.stat(path).st_mode & 0o777)
with os.fdopen(fd, "w") as f:
    json.dump(d, f, indent=2)
    f.write("\n")
os.replace(tmp, path)
PY
  echo "== repoint: wrote ${REPOINT_FILE#"$ROOT/"}"
  repoint_smoke
}

# repoint_spawned_game: the game id of the GameSpawned event of Daily in a receipt read on stdin; fails when the
# transaction did not succeed or spawned nothing.
repoint_spawned_game() {
  python3 -I -c '
import sys, json
d = json.load(sys.stdin)["result"]
assert d["execution_status"] == "SUCCEEDED"
daily = int(sys.argv[1], 16)
ids = [int(e["keys"][1], 16) for e in d["events"] if int(e["from_address"], 16) == daily and len(e["keys"]) == 3]
print(ids[0])' "$DAILY" 2>/dev/null
}

# repoint_surrender <game id>: surrenders the smoke's game unless Economy has recorded it (TermsView's `recorded`).
repoint_surrender() {
  local t raw
  # A surrender a stopped run sent: its receipt first, so it is not sent twice.
  repoint_settled smoke.surrender_tx || true
  v raw call "$ECONOMY" terms "$1"; read -r -a t <<<"$raw"
  if [[ "$(hex_int "${t[9]}")" == 1 ]]; then
    echo "   game $1 recorded by Economy already$( [[ -n "$(rp_get smoke.surrender_tx)" ]] && echo ", surrendered in tx $(rp_get smoke.surrender_tx)")"
    return
  fi
  RECORD_SENDING=smoke.surrender_tx
  invoke "$DAILY" surrender "$1" >/dev/null
  RECORD_SENDING=""
  v raw call "$ECONOMY" terms "$1"; read -r -a t <<<"$raw"
  [[ "$(hex_int "${t[9]}")" == 1 ]] || die "the surrender of game $1 was not recorded by Economy"
  echo "   daily game $1 surrendered (score 0), recorded"
}

# repoint_smoke: Economy.router() is the new MockRouter, Economy.quote_swap(1.4 USDC) answers above 0, owner() reads
# back on the five upgradable contracts, and a paid Daily spawn at stake 1 succeeds, then is surrendered as deploy.sh's
# smoke does (score 0: no trace in the day's figures, P-24). Each is sent once: the spawn is recorded and a rerun cites
# it instead of buying another game, and the surrender goes only while Economy has not recorded the game.
repoint_smoke() {
  local swap entry quote held min_out usdc_before usdc_after spawn_tx game_id="" player raw
  echo "== repoint: smoke"
  v raw call "$ECONOMY" router
  felt_eq "$raw" "$NEW_ROUTER" || die "Economy.router() is not the new MockRouter"
  echo "   Economy.router() is the new MockRouter $NEW_ROUTER"
  v raw call "$ECONOMY" quote_swap 1400000 0; read -r swap _ <<<"$raw"
  gt "$(hex_int "$swap")" 0 || die "Economy.quote_swap(1400000) is 0"
  echo "   Economy.quote_swap(1400000) = $(hex_int "$swap") PAVED base units"
  for entry in "Economy=$ECONOMY" "Account=$ACCOUNT" "Daily=$DAILY" "Tutorial=$TUTORIAL" "Collection=$COLLECTION"; do
    v raw call "${entry#*=}" owner
    [[ "$(hex_int "$raw")" == "$DEPLOYER_INT" ]] || die "${entry%%=*}.owner() is not the deployer"
  done
  echo "   owner() of Economy, Account, Daily, Tutorial and Collection: the deployer"
  if [[ -z "$(rp_get smoke.game_id)" ]] && repoint_settled smoke.spawn_tx; then
    # Sent by a run stopped before it recorded the game: the game from its receipt.
    spawn_tx="$(rp_get smoke.spawn_tx)"
    game_id="$(rpc starknet_getTransactionReceipt "[\"$spawn_tx\"]" | repoint_spawned_game)" ||
      die "the recorded smoke spawn $spawn_tx succeeded but spawned no Daily game: check it"
    rp_set "smoke.game_id=$game_id"
  fi
  if [[ -n "$(rp_get smoke.game_id)" ]]; then
    echo "   paid Daily spawn done already: game $(rp_get smoke.game_id), tx $(rp_get smoke.spawn_tx); not sent again"
    repoint_surrender "$(rp_get smoke.game_id)"
    echo "== repoint: smoke ok"
    return
  fi
  # The player: the deployer's account, created by the deploy's smoke; created here if not. Player is (id, name, master):
  # the id is the key, so the name says whether the player exists.
  v raw call "$ACCOUNT" player "$DEPLOYER_ARG"; read -r _ player _ <<<"$raw"
  [[ "$(hex_int "$player")" != 0 ]] || invoke "$ACCOUNT" create "$(python3 -I -c 'print(hex(int.from_bytes(b"smoke","big")))')" "$DEPLOYER_ARG" >/dev/null
  # The 2 USDC of the spawn: what the deployer lacks of them, from the faucet (the seed left that much room).
  v raw call "$USDC" balance_of "$DEPLOYER_ARG"; read -r held _ <<<"$raw"
  gt "$(hex_int "$held")" 1999999 ||
    invoke "$USDC" mint "$DEPLOYER_ARG" "$(python3 -I -c 'import sys;print(2000000-int(sys.argv[1],16))' "$held")" 0 >/dev/null
  invoke "$USDC" approve "$DAILY" 2000000 0 >/dev/null
  v raw call "$ECONOMY" quote 1; read -r -a quote <<<"$raw"
  v raw call "$ECONOMY" quote_swap "${quote[2]}" "${quote[3]}"; read -r swap _ <<<"$raw"
  min_out="$(python3 -I -c 'import sys;print(int(sys.argv[1],16)*99//100)' "$swap")"
  v raw call "$USDC" balance_of "$DEPLOYER_ARG"; usdc_before="$(hex_int "${raw%% *}")"
  RECORD_SENDING=smoke.spawn_tx
  spawn_tx="$(invoke "$DAILY" spawn 1 0 $(u256 "$min_out"))"
  RECORD_SENDING=""
  game_id="$(rpc starknet_getTransactionReceipt "[\"$spawn_tx\"]" | repoint_spawned_game)" ||
    die "no GameSpawned event in the Daily spawn receipt"
  rp_set "smoke.spawn_tx=$spawn_tx" "smoke.game_id=$game_id"
  v raw call "$USDC" balance_of "$DEPLOYER_ARG"; usdc_after="$(hex_int "${raw%% *}")"
  [[ $((usdc_before - usdc_after)) == 2000000 ]] || die "the spawn moved $((usdc_before - usdc_after)) USDC base units, expected 2000000"
  v raw call "$USDC" balance_of "$ECONOMY"
  [[ "$(hex_int "${raw%% *}")" == 0 ]] || die "Economy holds USDC after the purchase"
  v raw call "$PAVED" balance_of "$ECONOMY"
  [[ "$(hex_int "${raw%% *}")" == 0 ]] || die "Economy holds PAVED after the purchase"
  v raw call "$ECONOMY" terms "$game_id"; read -r player _ <<<"$raw"
  [[ "$(hex_int "$player")" == "$DEPLOYER_INT" ]] || die "Economy.terms($game_id) is not the player's"
  echo "   paid Daily game $game_id at stake 1 (min_out $min_out) through the new MockRouter, tx $spawn_tx; Economy holds nothing"
  repoint_surrender "$game_id"
  echo "== repoint: smoke ok"
}

# --d18 (D-18c): the storage address of `lobby_class` in Daily and Tutorial (sn_keccak("lobby_class"), as starknet.js's
# hash.starknetKeccak computes it): no view reads it, so the tool reads the storage. The slope of P-46.
D18_LOBBY_SLOT=0x1c0e9fda53e89cd336bc111e75bd8cf021d5625f837a8e56cbb7c31c545c7c7
D18_SLOPE_BPS=12220
D18_GAMES=(Daily Tutorial Account)

# d18_lobby_class <address>: the Lobby class that Daily or Tutorial runs, from its storage; fails unless the node answers
# a felt (through `v`, a failed read stops the run).
d18_lobby_class() {
  local answer
  # Named params: starknet-devnet 0.10.0 (spec 0.10.2) wants four positional ones here, the spec three.
  answer="$(rpc starknet_getStorageAt "{\"contract_address\":\"$1\",\"key\":\"$D18_LOBBY_SLOT\",\"block_id\":\"latest\"}")" || return 1
  python3 -I -c '
import json, re, sys
d = json.load(sys.stdin)
r = d.get("result") if isinstance(d, dict) and "error" not in d else None
sys.exit(1) if not isinstance(r, str) or not re.fullmatch("0x[0-9a-fA-F]+", r) else print(r)' <<<"$answer" 2>/dev/null
}

# d18_config_text <5 felts>: Economy's Config (burn_bps, sigma_bps signed, slope_bps, cap, target), for the log.
d18_config_text() {
  python3 -I -c '
import sys
p = 2**251 + 17 * 2**192 + 1
b, s, c, h, t = (int(x, 16) for x in sys.argv[1:])
s = s - p if s > p // 2 else s
print(f"burn_bps {b}, sigma_bps {s}, slope_bps {c}, cap {h}, target {t}")' "$@"
}

# d18_same_but_slope <5 felts> <5 felts>: the two configs are equal but for the slope.
d18_same_but_slope() {
  python3 -I -c '
import sys
a, b = [int(x, 16) for x in sys.argv[1:6]], [int(x, 16) for x in sys.argv[6:11]]
sys.exit(0 if len(sys.argv) == 11 and a[:2] + a[3:] == b[:2] + b[3:] else 1)' "$@"
}

# d18_state: reads the deployment file and the chain, checks what must hold before anything is sent, and sets what has
# landed already. Read-only: nothing is estimated, signed or sent here.
d18_state() {
  echo "== d18: state (read-only)"
  [[ -f "$REPOINT_FILE" ]] || die "no deployment file $REPOINT_FILE"
  local fields name raw
  fields="$(python3 -I - "$REPOINT_FILE" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
c, r, x = d.get("contracts", {}), d.get("repoint", {}), d.get("d18", {})
prev = x.get("previous", {})
def addr(name):
    return c.get(name, {}).get("address", "")
# Before the upgrade completes, the previous classes are the file's; after, the record keeps them.
def old(name):
    return prev.get(name, {}).get("class_hash", c.get(name, {}).get("class_hash", ""))
print(d.get("network", "-"), d.get("chain_id", "-"), addr("Economy"), addr("Account"), addr("Daily"), addr("Tutorial"),
      addr("Collection"), addr("PavedToken"), addr("MockUSDC"), addr("MockRouter") or "-",
      r.get("MockRouter", {}).get("address", "") or "-", r.get("multicall_tx", "") or "-",
      old("Daily"), old("Tutorial"), old("Account"),
      prev.get("Lobby", {}).get("class_hash", d.get("classes", {}).get("Lobby", "")))
PY
)" || die "$REPOINT_FILE is not a deployment file"
  read -r RP_NETWORK RP_CHAIN ECONOMY ACCOUNT DAILY TUTORIAL COLLECTION PAVED USDC FILE_ROUTER REPOINT_ROUTER \
    REPOINT_TX OLD_DAILY_CLASS OLD_TUTORIAL_CLASS OLD_ACCOUNT_CLASS OLD_LOBBY_CLASS <<<"$fields"
  [[ "$RP_NETWORK" == sepolia ]] || die "$REPOINT_FILE is a '$RP_NETWORK' deployment, not sepolia"
  [[ -n "$OLD_LOBBY_CLASS" ]] || die "$REPOINT_FILE lacks an address or class hash the D-18 upgrade needs"
  felt_eq "$RP_CHAIN" "$CHAIN_ID" || die "$REPOINT_FILE is for chain $RP_CHAIN, the node is $CHAIN_ID"

  # The order: R-1's repoint first (its record names the file's MockRouter, and Economy answers it).
  if [[ "$REPOINT_ROUTER" == - || "$REPOINT_TX" == - ]] || ! felt_eq "$REPOINT_ROUTER" "$FILE_ROUTER"; then
    die "R-1's repoint is not complete in ${REPOINT_FILE#"$ROOT/"} (its repoint key records no multicall and no new MockRouter that is contracts.MockRouter): D-18c runs after R-1 part B; nothing was sent"
  fi
  raw="$(call "$ECONOMY" router 2>/dev/null)" ||
    die "Economy.router() does not answer (its class predates E-9): R-1's repoint has not landed; D-18c runs after R-1 part B; nothing was sent"
  felt_eq "$raw" "$FILE_ROUTER" ||
    die "Economy.router() is $raw, not the file's MockRouter $FILE_ROUTER: R-1's repoint has not landed; D-18c runs after R-1 part B; nothing was sent"
  echo "   R-1's repoint: complete (multicall $REPOINT_TX), Economy.router() is the file's MockRouter $FILE_ROUTER"

  # The D-18 classes, from the release build (the hashes sncast computes, as declare_class checks the signer's).
  for name in Daily Tutorial Account Lobby; do
    raw="$(sc sncast utils class-hash --contract-name "$name" | pyj 'd["class_hash"]')" || die "class-hash $name failed"
    printf -v "NEW_$(tr '[:lower:]' '[:upper:]' <<<"$name")_CLASS" '%s' "$raw"
  done
  if [[ -z "$(rp_get previous.Daily.class_hash)" ]]; then
    for name in DAILY TUTORIAL ACCOUNT LOBBY; do
      local old="OLD_${name}_CLASS" new="NEW_${name}_CLASS"
      ! felt_eq "${!old}" "${!new}" || die "the built ${name,,} class is the file's (${!old}): nothing to upgrade to"
    done
  fi
  echo "   file ${REPOINT_FILE#"$ROOT/"}: Daily $DAILY, Tutorial $TUTORIAL, Account $ACCOUNT, Economy $ECONOMY"
  echo "   D-18 classes: Daily $NEW_DAILY_CLASS, Tutorial $NEW_TUTORIAL_CLASS, Account $NEW_ACCOUNT_CLASS, Lobby $NEW_LOBBY_CLASS"

  # The deployer owns the four contracts the multicall calls.
  local entry owner
  for entry in "Daily=$DAILY" "Tutorial=$TUTORIAL" "Account=$ACCOUNT" "Economy=$ECONOMY"; do
    v owner call "${entry#*=}" owner
    [[ "$(hex_int "$owner")" == "$DEPLOYER_INT" ]] || die "the deployer $DEPLOYER_LABEL is not ${entry%%=*}.owner()"
  done
  echo "   owner() of Daily, Tutorial, Account and Economy: the deployer"

  # Each class: the file's or the D-18 one, nothing else.
  local class old new
  D18_LEFT=0
  for name in DAILY TUTORIAL ACCOUNT; do
    local addr_var="$name" old="OLD_${name}_CLASS" new="NEW_${name}_CLASS"
    v class class_of "${!addr_var}"
    if felt_eq "$class" "${!new}"; then echo "   ${name,,}: D-18 class (upgraded)"
    elif felt_eq "$class" "${!old}"; then echo "   ${name,,}: class ${!old} (not upgraded)"; D18_LEFT=1
    else die "${name,,}'s class on the node is $class: neither the file's ${!old} nor the D-18 class"; fi
  done
  # The Lobby class Daily and Tutorial run: the file's or the D-18 one.
  for name in DAILY TUTORIAL; do
    v class d18_lobby_class "${!name}"
    if felt_eq "$class" "$NEW_LOBBY_CLASS"; then echo "   ${name,,}: runs the D-18 Lobby"
    elif felt_eq "$class" "$OLD_LOBBY_CLASS"; then echo "   ${name,,}: runs the Lobby $OLD_LOBBY_CLASS (not set)"; D18_LEFT=1
    else die "${name,,} runs the Lobby class $class: neither the file's $OLD_LOBBY_CLASS nor the D-18 one"; fi
  done

  # Economy's config: printed; the new one is the same with the slope of P-46. A recorded previous config (a stopped
  # run) must still match but for the slope.
  v raw call "$ECONOMY" config
  read -r -a D18_CONFIG <<<"$raw"
  [[ "${#D18_CONFIG[@]}" == 5 ]] || die "Economy.config() returned ${#D18_CONFIG[@]} felts, expected 5"
  echo "   Economy.config(): $(d18_config_text "${D18_CONFIG[@]}")"
  local previous
  previous="$(rp_get previous.config)"
  # shellcheck disable=SC2086
  [[ -z "$previous" ]] || d18_same_but_slope $previous "${D18_CONFIG[@]}" ||
    die "Economy.config() differs from the config recorded before the upgrade ($(d18_config_text $previous)) by more than the slope"
  D18_NEW_CONFIG=("${D18_CONFIG[0]}" "${D18_CONFIG[1]}" "$D18_SLOPE_BPS" "${D18_CONFIG[3]}" "${D18_CONFIG[4]}")
  if [[ "$(hex_int "${D18_CONFIG[2]}")" == "$D18_SLOPE_BPS" ]]; then
    echo "   slope: $D18_SLOPE_BPS bps already"
  else
    echo "   new config: $(d18_config_text "$(felt64 "${D18_NEW_CONFIG[0]}")" "$(felt64 "${D18_NEW_CONFIG[1]}")" \
      "$(printf '0x%x' "$D18_SLOPE_BPS")" "$(felt64 "${D18_NEW_CONFIG[3]}")" "$(felt64 "${D18_NEW_CONFIG[4]}")") (the slope alone changes)"
    D18_LEFT=1
  fi

  # The smoke's paid spawn needs 2 USDC: held, or within the faucet's cap (20,000 USDC per address), unless it is done.
  if [[ -z "$(rp_get smoke.game_id)" ]]; then
    local held minted
    v raw call "$USDC" balance_of "$DEPLOYER_ARG"; held="$(u256_of $raw)"
    v raw call "$USDC" minted "$DEPLOYER_ARG"; minted="$(u256_of $raw)"
    python3 -I -c 'import sys;h,m=map(int,sys.argv[1:]);sys.exit(0 if h>=2*10**6 or m+2*10**6-h<=20_000*10**6 else 1)' \
      "$held" "$minted" ||
      die "the smoke's paid spawn needs 2 USDC: the deployer holds $held base units and the faucet has minted $minted of its 20,000 USDC cap"
    echo "   smoke: the deployer holds $held USDC base units, the faucet has minted it $minted"
  fi
  d18_complete
}

# d18_complete: sets D18_COMPLETE when nothing is left to send (classes, Lobby and slope set, the smoke's game recorded
# with its build and surrender, every recorded transaction landed), so the funding check need not refuse a rerun that
# sends nothing. Read-only.
D18_COMPLETE=0
d18_complete() {
  local key raw t
  ((D18_LEFT == 0)) || return 0
  [[ -n "$(rp_get smoke.game_id)" && -n "$(rp_get smoke.build_tx)" ]] || return 0
  v raw call "$ECONOMY" terms "$(rp_get smoke.game_id)"; read -r -a t <<<"$raw"
  [[ "$(hex_int "${t[9]}")" == 1 ]] || return 0
  for key in declare.Account declare.Daily declare.Tutorial declare.Lobby multicall_tx smoke.spawn_tx smoke.build_tx \
      smoke.surrender_tx; do
    [[ -z "$(rp_get "$key")" || "$(repoint_tx_status "$(rp_get "$key")")" == SUCCEEDED ]] || return 0
  done
  D18_COMPLETE=1
  echo "   complete: upgraded, Lobby and slope set, smoke recorded; nothing is left to send"
}

# d18_calls: the multicall's calls still missing (one spec per line), read from the chain now, in the order of the
# brief: the three upgrades, the two Lobby classes, the configure.
d18_calls() {
  local name class
  for name in DAILY TUTORIAL ACCOUNT; do
    local new="NEW_${name}_CLASS"
    class="$(class_of "${!name}")" || return 1
    felt_eq "$class" "${!new}" || echo "${!name} upgrade ${!new}"
  done
  for name in DAILY TUTORIAL; do
    class="$(d18_lobby_class "${!name}")" || return 1
    felt_eq "$class" "$NEW_LOBBY_CLASS" || echo "${!name} set_lobby_class $NEW_LOBBY_CLASS"
  done
  local raw c
  raw="$(call "$ECONOMY" config)" || return 1
  read -r -a c <<<"$raw"
  [[ "$(hex_int "${c[2]}")" == "$D18_SLOPE_BPS" ]] || echo "$ECONOMY configure ${c[0]} ${c[1]} $D18_SLOPE_BPS ${c[3]} ${c[4]}"
}

# d18_run: declares the D-18 classes, sends the multicall, records each step in the deployment file as it lands, writes
# the new classes there, then smokes. Each step reads what already landed first and is skipped when done, so a rerun
# sends only what is left; a complete one sends nothing.
d18_run() {
  local name raw calls=() spec entry
  if ((REPOINT_CHECK_ONLY)); then
    echo "== d18: check only (nothing is sent, the file is not written)"
    for name in Account Daily Tutorial Lobby; do
      local new="NEW_$(tr '[:lower:]' '[:upper:]' <<<"$name")_CLASS"
      if rpc starknet_getClass "[\"latest\",\"${!new}\"]" | class_declared; then
        echo "   declare $name: declared already"
      else
        echo "   declare $name ${!new}: a run would send it"
      fi
    done
    v raw d18_calls
    if [[ -z "$raw" ]]; then
      echo "   multicall: nothing left to send"
    else
      echo "   multicall a run would send:"
      while IFS= read -r spec; do
        name=Economy
        for entry in "Daily=$DAILY" "Tutorial=$TUTORIAL" "Account=$ACCOUNT"; do
          [[ "${spec%% *}" != "${entry#*=}" ]] || name="${entry%%=*}"
        done
        echo "     $name.$(cut -d' ' -f2- <<<"$spec")"
      done <<<"$raw"
    fi
    echo "== d18: check only: every check passed; nothing was sent"
    exit 0
  fi
  # The previous classes and config and the commit of the run, once, before anything is sent.
  if [[ -z "$(rp_get previous.Daily.class_hash)" ]]; then
    rp_set "previous.Daily.class_hash=$(felt64 "$OLD_DAILY_CLASS")" \
      "previous.Tutorial.class_hash=$(felt64 "$OLD_TUTORIAL_CLASS")" \
      "previous.Account.class_hash=$(felt64 "$OLD_ACCOUNT_CLASS")" \
      "previous.Lobby.class_hash=$(felt64 "$OLD_LOBBY_CLASS")" \
      "previous.config=${D18_CONFIG[*]}" "at=$DEPLOYED_AT"
  fi

  echo "== d18: declare"
  for name in Account Daily Tutorial Lobby; do
    # A declare a stopped run sent: its receipt first, so it is not sent twice.
    repoint_settled "declare.$name" || true
    RECORD_SENDING="declare.$name"
    declare_class "$name" >/dev/null
    RECORD_SENDING=""
  done
  rp_set "Daily.class_hash=$(felt64 "$NEW_DAILY_CLASS")" "Tutorial.class_hash=$(felt64 "$NEW_TUTORIAL_CLASS")" \
    "Account.class_hash=$(felt64 "$NEW_ACCOUNT_CLASS")" "Lobby.class_hash=$(felt64 "$NEW_LOBBY_CLASS")"
  for name in Account Daily Tutorial Lobby; do
    local new="NEW_$(tr '[:lower:]' '[:upper:]' <<<"$name")_CLASS"
    rpc starknet_getClass "[\"latest\",\"${!new}\"]" | class_declared || die "the D-18 $name class ${!new} is not declared on the node"
  done

  echo "== d18: upgrade"
  # A multicall a stopped run sent: its receipt first, then what is missing is read again.
  repoint_settled multicall_tx || true
  v raw d18_calls
  if [[ -z "$raw" ]]; then
    echo "   upgraded, Lobby and slope set already$( [[ -n "$(rp_get multicall_tx)" ]] && echo ", tx $(rp_get multicall_tx)")"
  else
    calls=()
    while IFS= read -r spec; do calls+=("$spec"); done <<<"$raw"
    RECORD_SENDING=multicall_tx
    invoke_all "${calls[@]}"
    RECORD_SENDING=""
    rp_set "multicall_tx=$LAST_TX"
  fi
  v raw d18_calls
  [[ -z "$raw" ]] || die "after the multicall, still missing: $(cut -d' ' -f2 <<<"$raw" | tr '\n' ' ')"
  echo "   Daily, Tutorial and Account on the D-18 classes, Daily and Tutorial on the D-18 Lobby, slope $D18_SLOPE_BPS"

  # The deployment file: the new classes where the client and the indexer would read them, every other field kept.
  python3 -I - "$REPOINT_FILE" "$NEW_DAILY_CLASS" "$NEW_TUTORIAL_CLASS" "$NEW_ACCOUNT_CLASS" "$NEW_LOBBY_CLASS" <<'PY'
import json, os, sys, tempfile
path, daily, tutorial, account, lobby = sys.argv[1:]
d = json.load(open(path))
h = lambda x: "0x%064x" % int(x, 16)
d["contracts"]["Daily"]["class_hash"] = h(daily)
d["contracts"]["Tutorial"]["class_hash"] = h(tutorial)
d["contracts"]["Account"]["class_hash"] = h(account)
d["classes"]["Lobby"] = h(lobby)
fd, tmp = tempfile.mkstemp(dir=os.path.dirname(path))
os.chmod(tmp, os.stat(path).st_mode & 0o777)
with os.fdopen(fd, "w") as f:
    json.dump(d, f, indent=2)
    f.write("\n")
os.replace(tmp, path)
PY
  echo "== d18: wrote ${REPOINT_FILE#"$ROOT/"}"
  d18_smoke
}

# d18_first_build <game id>: the first of the 16 placements next to the starter, (CENTER +- 1, CENTER) and (CENTER,
# CENTER +- 1) in each orientation, whose fee estimate the node accepts (`signer estimate invoke`, read-only); prints
# `orientation x y`, fails when none is accepted.
d18_first_build() {
  local c=2147483647 o x y out line l spec
  for spec in "$c $((c + 1))" "$((c + 1)) $c" "$c $((c - 1))" "$((c - 1)) $c"; do
    read -r x y <<<"$spec"
    for o in 1 2 3 4; do
      out="$(run_signer estimate invoke --contract "$DAILY" --function build --calldata "$1" "$o" "$x" "$y")" || true
      line=""
      while IFS= read -r l; do [[ "$l" == "{"* ]] && line="$l"; done <<<"$out"
      if [[ -n "$line" && "$(pyj 'd.get("ok") is True' <<<"$line" 2>/dev/null)" == True ]]; then
        echo "$o $x $y"
        return 0
      fi
    done
  done
  return 1
}

# d18_smoke: the classes, the Lobby class of Daily and Tutorial, the config (slope 12,220, the rest as recorded),
# owner() on the five upgradable contracts; then a paid Daily spawn at stake 1, one D-18 build, the four fields of
# builder(), and the surrender (score as the build left it; P-24: a score under 100 enters no mean). Each is sent once:
# the spawn, the build and the surrender are recorded and a rerun cites them instead of sending again.
d18_smoke() {
  local name raw class entry quote swap min_out held player spawn_tx game_id g b t placement
  echo "== d18: smoke"
  for name in DAILY TUTORIAL ACCOUNT; do
    local new="NEW_${name}_CLASS"
    v class class_of "${!name}"
    felt_eq "$class" "${!new}" || die "${name,,}'s class is $class, not the D-18 class"
  done
  echo "   class of Daily, Tutorial and Account: the D-18 classes"
  for name in DAILY TUTORIAL; do
    v class d18_lobby_class "${!name}"
    felt_eq "$class" "$NEW_LOBBY_CLASS" || die "${name,,} runs the Lobby class $class, not the D-18 one"
  done
  echo "   lobby_class (storage $D18_LOBBY_SLOT) of Daily and Tutorial: the D-18 Lobby $NEW_LOBBY_CLASS"
  v raw call "$ECONOMY" config; read -r -a t <<<"$raw"
  [[ "$(hex_int "${t[2]}")" == "$D18_SLOPE_BPS" ]] || die "Economy's slope is $(hex_int "${t[2]}"), not $D18_SLOPE_BPS"
  # shellcheck disable=SC2046
  d18_same_but_slope $(rp_get previous.config) "${t[@]}" || die "Economy.config() differs from the previous one by more than the slope"
  echo "   Economy.config(): $(d18_config_text "${t[@]}"); the rest as before the upgrade"
  for entry in "Economy=$ECONOMY" "Account=$ACCOUNT" "Daily=$DAILY" "Tutorial=$TUTORIAL" "Collection=$COLLECTION"; do
    v raw call "${entry#*=}" owner
    [[ "$(hex_int "$raw")" == "$DEPLOYER_INT" ]] || die "${entry%%=*}.owner() is not the deployer"
  done
  echo "   owner() of Economy, Account, Daily, Tutorial and Collection: the deployer"

  # The paid spawn, once: a spawn a stopped run sent is read from its receipt.
  if [[ -z "$(rp_get smoke.game_id)" ]] && repoint_settled smoke.spawn_tx; then
    spawn_tx="$(rp_get smoke.spawn_tx)"
    game_id="$(rpc starknet_getTransactionReceipt "[\"$spawn_tx\"]" | repoint_spawned_game)" ||
      die "the recorded smoke spawn $spawn_tx succeeded but spawned no Daily game: check it"
    rp_set "smoke.game_id=$game_id"
  fi
  if [[ -n "$(rp_get smoke.game_id)" ]]; then
    game_id="$(rp_get smoke.game_id)"
    echo "   paid Daily spawn done already: game $game_id, tx $(rp_get smoke.spawn_tx); not sent again"
  else
    # Player is (id, name, master): the id is the key, so the name says whether the player exists.
    v raw call "$ACCOUNT" player "$DEPLOYER_ARG"; read -r _ player _ <<<"$raw"
    [[ "$(hex_int "$player")" != 0 ]] || invoke "$ACCOUNT" create "$(python3 -I -c 'print(hex(int.from_bytes(b"smoke","big")))')" "$DEPLOYER_ARG" >/dev/null
    v raw call "$USDC" balance_of "$DEPLOYER_ARG"; read -r held _ <<<"$raw"
    gt "$(hex_int "$held")" 1999999 ||
      invoke "$USDC" mint "$DEPLOYER_ARG" "$(python3 -I -c 'import sys;print(2000000-int(sys.argv[1],16))' "$held")" 0 >/dev/null
    invoke "$USDC" approve "$DAILY" 2000000 0 >/dev/null
    v raw call "$ECONOMY" quote 1; read -r -a quote <<<"$raw"
    v raw call "$ECONOMY" quote_swap "${quote[2]}" "${quote[3]}"; read -r swap _ <<<"$raw"
    min_out="$(python3 -I -c 'import sys;print(int(sys.argv[1],16)*99//100)' "$swap")"
    RECORD_SENDING=smoke.spawn_tx
    spawn_tx="$(invoke "$DAILY" spawn 1 0 $(u256 "$min_out"))"
    RECORD_SENDING=""
    game_id="$(rpc starknet_getTransactionReceipt "[\"$spawn_tx\"]" | repoint_spawned_game)" ||
      die "no GameSpawned event in the Daily spawn receipt"
    rp_set "smoke.spawn_tx=$spawn_tx" "smoke.game_id=$game_id"
    echo "   paid Daily game $game_id at stake 1 (min_out $min_out), tx $spawn_tx"
  fi

  # One D-18 build, once: a build a stopped run sent is awaited first; a game with a tile placed besides the starter
  # (or over) has had it.
  repoint_settled smoke.build_tx || true
  v raw call "$DAILY" game "$game_id"; read -r -a g <<<"$raw"
  if [[ "$(hex_int "${g[5]}")" == 0 && "$(hex_int "${g[7]}")" == 1 ]]; then
    v placement d18_first_build "$game_id"
    read -r -a b <<<"$placement"
    echo "   build(game $game_id, orientation ${b[0]}, x ${b[1]}, y ${b[2]}): the first placement next to the starter the node estimates"
    RECORD_SENDING=smoke.build_tx
    raw="$(invoke "$DAILY" build "$game_id" "${b[@]}")" || die "the smoke's build failed"
    RECORD_SENDING=""
    rp_set "smoke.build_tx=$raw"
    v raw call "$DAILY" game "$game_id"; read -r -a g <<<"$raw"
    [[ "$(hex_int "${g[7]}")" == 2 ]] || die "game $game_id has $(hex_int "${g[7]}") tiles placed after the build, expected 2"
  else
    echo "   build done already$( [[ -n "$(rp_get smoke.build_tx)" ]] && echo ", tx $(rp_get smoke.build_tx)"); not sent again"
  fi
  echo "   game $game_id: score $(hex_int "${g[4]}"), placed_count $(hex_int "${g[7]}"), over $(hex_int "${g[5]}")"
  # The D-18 builder view: four fields (game_id, player_id, tile_id, plan), the player the deployer.
  v raw call "$DAILY" builder "$game_id" "$DEPLOYER_ARG"; read -r -a b <<<"$raw"
  [[ "${#b[@]}" == 4 ]] || die "Daily.builder() returned ${#b[@]} felts, expected the four of D-18"
  [[ "$(hex_int "${b[0]}")" == "$game_id" && "$(hex_int "${b[1]}")" == "$DEPLOYER_INT" ]] ||
    die "Daily.builder($game_id) does not name the game and the player"
  echo "   builder(): game_id $(hex_int "${b[0]}"), player_id the deployer, tile_id $(hex_int "${b[2]}"), plan $(hex_int "${b[3]}")"

  # The surrender, once (the game is recorded by Economy then).
  repoint_settled smoke.surrender_tx || true
  v raw call "$ECONOMY" terms "$game_id"; read -r -a t <<<"$raw"
  if [[ "$(hex_int "${t[9]}")" == 1 ]]; then
    echo "   game $game_id recorded by Economy already$( [[ -n "$(rp_get smoke.surrender_tx)" ]] && echo ", surrendered in tx $(rp_get smoke.surrender_tx)")"
  else
    RECORD_SENDING=smoke.surrender_tx
    invoke "$DAILY" surrender "$game_id" >/dev/null
    RECORD_SENDING=""
    v raw call "$ECONOMY" terms "$game_id"; read -r -a t <<<"$raw"
    [[ "$(hex_int "${t[9]}")" == 1 ]] || die "the surrender of game $game_id was not recorded by Economy"
    echo "   daily game $game_id surrendered, recorded (score $(hex_int "${t[8]}"))"
  fi
  echo "== d18: smoke ok"
}

# --upgrade-challenge (G6, D-17): the contracts whose class must not change, with Challenge's address, class and the
# smoke game of F read from the deployment file.
UC_OTHERS=(Setup Collection Economy PavedToken Vault Faucet MockRouter)

# uc_guardian_label <felt>: what Challenge.guardian() answers, as printed: `none`, `the deployer`, or `another address`.
# The address itself is never printed (compared on stdin, `hex_int`).
uc_guardian_label() {
  local n
  n="$(hex_int "$1")"
  if [[ "$n" == 0 ]]; then echo none
  elif [[ "$n" == "$DEPLOYER_INT" ]]; then echo "the deployer"
  else echo "another address (not printed)"; fi
}

# uc_old_game: F's smoke game, spawned before the upgrade (the file's `fresh.smoke.game_id`), read back: its id, its
# player the deployer. Prints nothing when the file records none.
uc_old_game() {
  local raw g
  [[ "$UC_OLD_GAME" != - ]] || { echo "   no game before the upgrade in the file's record (fresh.smoke.game_id): none read"; return 0; }
  v raw call "$CHALLENGE" game "$UC_OLD_GAME"
  read -r -a g <<<"$raw"
  [[ "${#g[@]}" -ge 16 && "$(hex_int "${g[0]}")" == "$UC_OLD_GAME" && "$(hex_int "${g[1]}")" == "$DEPLOYER_INT" ]] ||
    die "Challenge.game($UC_OLD_GAME), F's smoke game, does not read back as the deployer's game $UC_OLD_GAME"
  echo "   game $UC_OLD_GAME (F's smoke game, spawned before the upgrade): readable, the deployer's, score $(hex_int "${g[4]}"), placed_count $(hex_int "${g[7]}"), over $(hex_int "${g[5]}")"
}

# uc_state: reads the deployment file and the chain, checks what must hold before anything is sent, and sets what has
# landed already. Read-only: nothing is estimated, signed or sent here.
uc_state() {
  echo "== upgrade-challenge: state (read-only)"
  [[ -f "$REPOINT_FILE" ]] || die "no deployment file $REPOINT_FILE"
  local fields others i name addr file_class built class raw pairs
  fields="$(python3 -I - "$REPOINT_FILE" "${UC_OTHERS[@]}" <<'PY'
import json, sys
path, *others = sys.argv[1:]
d = json.load(open(path))
c, u = d.get("contracts", {}), d.get("upgrade_g1g4", {})
f = d.get("fresh") if isinstance(d.get("fresh"), dict) else {}
def get(name, key):
    return c.get(name, {}).get(key, "") or "-"
# Before the upgrade completes, the previous class is the file's; after, the record keeps it.
old = u.get("previous", {}).get("Challenge", {}).get("class_hash", "") or get("Challenge", "class_hash")
print(d.get("network") or "-", d.get("chain_id") or "-", get("Challenge", "address"), old,
      f.get("smoke", {}).get("game_id", "") or "-", " ".join(get(n, "address") + " " + get(n, "class_hash") for n in others))
PY
)" || die "$REPOINT_FILE is not a deployment file"
  read -r RP_NETWORK RP_CHAIN CHALLENGE OLD_CHALLENGE_CLASS UC_OLD_GAME others <<<"$fields"
  [[ "$RP_NETWORK" == sepolia ]] || die "$REPOINT_FILE is a '$RP_NETWORK' deployment, not sepolia"
  [[ "$CHALLENGE" != - && "$OLD_CHALLENGE_CLASS" != - ]] || die "$REPOINT_FILE lacks Challenge's address or class hash"
  felt_eq "$RP_CHAIN" "$CHAIN_ID" || die "$REPOINT_FILE is for chain $RP_CHAIN, the node is $CHAIN_ID"
  # The new class, from the release build (the hash sncast computes, as declare_class checks the signer's).
  NEW_CHALLENGE_CLASS="$(sc sncast utils class-hash --contract-name Challenge | pyj 'd["class_hash"]')" || die "class-hash Challenge failed"
  [[ -n "$(rp_get previous.Challenge.class_hash)" ]] || ! felt_eq "$NEW_CHALLENGE_CLASS" "$OLD_CHALLENGE_CLASS" ||
    die "the built Challenge class is the file's ($OLD_CHALLENGE_CLASS): nothing to upgrade to"
  # A complete record: nothing is read but what cannot drift (uc_complete_record), and nothing is sent.
  if [[ "$(rp_get complete)" == yes ]] && { ((UC_GUARDIAN_DEPLOYER == 0)) || [[ "$(rp_get guardian)" == deployer ]]; }; then
    uc_complete_record
    return 0
  fi
  echo "   file ${REPOINT_FILE#"$ROOT/"}: Challenge $CHALLENGE, class $OLD_CHALLENGE_CLASS"
  echo "   new Challenge class (G1, G4): $NEW_CHALLENGE_CLASS"

  # Every other contract: the build's class is the file's, and so is the node's. Only Challenge is upgraded.
  read -r -a pairs <<<"$others"
  i=0
  for name in "${UC_OTHERS[@]}"; do
    addr="${pairs[2 * i]:--}" file_class="${pairs[2 * i + 1]:--}"
    i=$((i + 1))
    [[ "$addr" != - && "$file_class" != - ]] || die "$REPOINT_FILE lacks contracts.$name (its address and class hash)"
    built="$(sc sncast utils class-hash --contract-name "$name" | pyj 'd["class_hash"]')" || die "class-hash $name failed"
    felt_eq "$built" "$file_class" ||
      die "the build's $name class $built is not the file's $file_class: this tool upgrades Challenge alone; nothing was sent"
    v class class_of "$addr"
    felt_eq "$class" "$file_class" || die "$name's class on the node is $class, not the file's $file_class; nothing was sent"
    case "$name" in
      Economy) ECONOMY="$addr" ;; Faucet) USDC="$addr" ;;
    esac
  done
  echo "   ${UC_OTHERS[*]}: unchanged (the build's class is the file's and the node's)"

  # The deployer owns Challenge (its upgrade and set_guardian are the owner's).
  v raw call "$CHALLENGE" owner
  [[ "$(hex_int "$raw")" == "$DEPLOYER_INT" ]] || die "the deployer $DEPLOYER_LABEL is not Challenge.owner()"
  echo "   Challenge.owner() is the deployer"
  # Challenge's class: the file's or the new one, nothing else.
  v class class_of "$CHALLENGE"
  if felt_eq "$class" "$NEW_CHALLENGE_CLASS"; then UC_UPGRADED=1
  elif felt_eq "$class" "$OLD_CHALLENGE_CLASS"; then UC_UPGRADED=0
  else die "Challenge's class on the node is $class: neither the file's $OLD_CHALLENGE_CLASS nor the new one"; fi
  UC_LEFT=0
  ((UC_UPGRADED)) || UC_LEFT=1
  echo "   Challenge: $( ((UC_UPGRADED)) && echo "the new class (upgraded)" || echo "class $OLD_CHALLENGE_CLASS (not upgraded)")"
  # The guardian and the pause exist on the new class only: before the upgrade, no guardian and no pause.
  UC_GUARDIAN=none UC_PAUSED=0
  if ((UC_UPGRADED)); then
    v raw call "$CHALLENGE" guardian
    UC_GUARDIAN="$(uc_guardian_label "$raw")"
    v raw call "$CHALLENGE" spawn_paused
    UC_PAUSED="$(hex_int "$raw")"
  fi
  echo "   Challenge.guardian(): $UC_GUARDIAN; spawn_paused(): $( ((UC_PAUSED)) && echo true || echo false)"
  if ((UC_GUARDIAN_DEPLOYER)); then
    case "$UC_GUARDIAN" in
      none) UC_LEFT=1 ;;
      "the deployer") ;;
      *) die "Challenge.guardian() is another address: --guardian deployer would replace it; nothing was sent" ;;
    esac
  fi
  uc_old_game

  # The smoke's paid spawn needs 2 USDC: held, or within the faucet's cap (20,000 USDC per address), unless it is done.
  if [[ -z "$(rp_get smoke.game_id)" ]]; then
    local held minted
    v raw call "$USDC" balance_of "$DEPLOYER_ARG"; held="$(u256_of $raw)"
    v raw call "$USDC" minted "$DEPLOYER_ARG"; minted="$(u256_of $raw)"
    python3 -I -c 'import sys;h,m=map(int,sys.argv[1:]);sys.exit(0 if h>=2*10**6 or m+2*10**6-h<=20_000*10**6 else 1)' \
      "$held" "$minted" ||
      die "the smoke's paid spawn needs 2 USDC: the deployer holds $held base units and the faucet has minted $minted of its 20,000 USDC cap"
    echo "   smoke: the deployer holds $held USDC base units, the faucet has minted it $minted"
  fi
  uc_nothing_left
  # A paused spawn would fail the smoke's: the owner unpauses first (unpause_spawn).
  ((UC_PAUSED == 0)) ||
    die "Challenge's spawn is paused: the smoke's paid spawn would fail; the owner unpauses it (unpause_spawn) first; nothing was sent"
}

# uc_complete_record: a record whose run completed (`complete: yes`, written once the smoke passed; with --guardian
# deployer, `guardian: deployer` too). Its rerun sends nothing, ever (no set_guardian, no smoke: F's lesson, #358), and
# asserts only what cannot drift: Challenge's class on the node is the one the record declared, and each recorded
# transaction is SUCCEEDED. The owner, the guardian, the pause and the other contracts' classes are live state since
# (a two-step transfer, the guardian's pause, the owner's set_guardian, a later upgrade), so they are not read.
UC_COMPLETE=0
uc_complete_record() {
  local new class key tx
  new="$(rp_get Challenge.class_hash)"
  [[ -n "$new" ]] || new="$NEW_CHALLENGE_CLASS"
  NEW_CHALLENGE_CLASS="$new"
  v class class_of "$CHALLENGE"
  felt_eq "$class" "$new" ||
    die "the record is complete, but Challenge's class on the node is $class, not the recorded $new: check it; nothing was sent"
  for key in declare_tx upgrade_tx guardian_tx smoke.spawn_tx smoke.build_tx; do
    tx="$(rp_get "$key")"
    [[ -n "$tx" ]] || continue
    [[ "$(repoint_tx_status "$tx")" == SUCCEEDED ]] ||
      die "the record is complete, but its $key $tx is not SUCCEEDED on the node: check it; nothing was sent"
  done
  UC_COMPLETE=1
  echo "   file ${REPOINT_FILE#"$ROOT/"}: Challenge $CHALLENGE; complete record (key upgrade_g1g4)"
  echo "   Challenge's class: $new (the recorded one); every recorded transaction SUCCEEDED"
  echo "   complete: nothing is sent; the owner, the guardian, the pause and the other classes are live state since, not read"
}

# uc_nothing_left: sets UC_NOTHING_LEFT when a resume has nothing left to send (Challenge on the new class, the guardian
# set when asked, the smoke's game and build recorded, every recorded transaction landed) but the record is not marked
# complete yet (a run stopped after its last send): the funding check need not refuse it. Read-only.
UC_NOTHING_LEFT=0
uc_nothing_left() {
  local key
  ((UC_LEFT == 0)) || return 0
  [[ -n "$(rp_get smoke.game_id)" && -n "$(rp_get smoke.build_tx)" ]] || return 0
  for key in declare_tx upgrade_tx guardian_tx smoke.spawn_tx smoke.build_tx; do
    [[ -z "$(rp_get "$key")" || "$(repoint_tx_status "$(rp_get "$key")")" == SUCCEEDED ]] || return 0
  done
  UC_NOTHING_LEFT=1
  echo "   nothing is left to send: the smoke reads back and marks the record complete"
}

# uc_run: declares the new Challenge class, upgrades Challenge, sets the guardian when asked, records each step in the
# deployment file as it lands, writes the new class there, then smokes. Each step reads what already landed first and
# is skipped when done, so a rerun sends only what is left; a complete one sends nothing.
uc_run() {
  local raw class tx
  if ((UC_COMPLETE)); then
    if ((REPOINT_CHECK_ONLY)); then
      echo "== upgrade-challenge: check only: the record is complete, a run would send nothing"
      echo "== upgrade-challenge: check only: every check passed; nothing was sent"
    else
      echo "== upgrade-challenge: the record is complete; nothing was sent"
    fi
    exit 0
  fi
  if ((REPOINT_CHECK_ONLY)); then
    echo "== upgrade-challenge: check only (nothing is sent, the file is not written)"
    if rpc starknet_getClass "[\"latest\",\"$NEW_CHALLENGE_CLASS\"]" | class_declared; then
      echo "   declare Challenge: declared already"
    else
      echo "   declare Challenge $NEW_CHALLENGE_CLASS: a run would send it"
    fi
    if ((UC_UPGRADED)); then echo "   Challenge.upgrade: done already"
    else echo "   Challenge.upgrade($NEW_CHALLENGE_CLASS): a run would send it"; fi
    if ((UC_GUARDIAN_DEPLOYER)); then
      if [[ "$UC_GUARDIAN" == "the deployer" ]]; then echo "   Challenge.set_guardian: the deployer is the guardian already"
      else echo "   Challenge.set_guardian(\$STARKNET_ACCOUNT_ADDRESS): a run would send it"; fi
    else
      echo "   Challenge.set_guardian: not asked (--guardian deployer sets the deployer)"
    fi
    if [[ -n "$(rp_get smoke.game_id)" ]]; then echo "   smoke: game $(rp_get smoke.game_id) recorded; its spawn is not sent again"
    else echo "   smoke: a run would send a paid spawn at stake 1 and one build on the new class"; fi
    echo "== upgrade-challenge: check only: every check passed; nothing was sent"
    exit 0
  fi
  # The previous class and the commit of the run, once, before anything is sent.
  [[ -n "$(rp_get previous.Challenge.class_hash)" ]] ||
    rp_set "previous.Challenge.class_hash=$(felt64 "$OLD_CHALLENGE_CLASS")" "at=$DEPLOYED_AT"

  echo "== upgrade-challenge: declare"
  # A declare a stopped run sent: its receipt first, so it is not sent twice.
  repoint_settled declare_tx || true
  RECORD_SENDING=declare_tx
  declare_class Challenge >/dev/null
  RECORD_SENDING=""
  rpc starknet_getClass "[\"latest\",\"$NEW_CHALLENGE_CLASS\"]" | class_declared ||
    die "the new Challenge class $NEW_CHALLENGE_CLASS is not declared on the node"
  rp_set "Challenge.class_hash=$(felt64 "$NEW_CHALLENGE_CLASS")"

  echo "== upgrade-challenge: upgrade"
  # An upgrade a stopped run sent: its receipt first, then the class is read again.
  repoint_settled upgrade_tx || true
  v class class_of "$CHALLENGE"
  if felt_eq "$class" "$NEW_CHALLENGE_CLASS"; then
    echo "   Challenge on the new class already$( [[ -n "$(rp_get upgrade_tx)" ]] && echo ", tx $(rp_get upgrade_tx)")"
  else
    RECORD_SENDING=upgrade_tx
    tx="$(invoke "$CHALLENGE" upgrade "$NEW_CHALLENGE_CLASS")" || die "Challenge.upgrade failed"
    RECORD_SENDING=""
    rp_set "upgrade_tx=$tx"
    v class class_of "$CHALLENGE"
    felt_eq "$class" "$NEW_CHALLENGE_CLASS" || die "after the upgrade, Challenge's class is $class, not $NEW_CHALLENGE_CLASS"
    echo "   Challenge upgraded to $NEW_CHALLENGE_CLASS"
  fi

  if ((UC_GUARDIAN_DEPLOYER)); then
    echo "== upgrade-challenge: guardian"
    # A set_guardian a stopped run sent: its receipt first. The deployer's address is the signer's (`@account`): in no
    # argv, and never printed.
    repoint_settled guardian_tx || true
    v raw call "$CHALLENGE" guardian
    case "$(uc_guardian_label "$raw")" in
      "the deployer")
        echo "   Challenge.guardian() is the deployer already$( [[ -n "$(rp_get guardian_tx)" ]] && echo ", tx $(rp_get guardian_tx)")" ;;
      none)
        RECORD_SENDING=guardian_tx
        tx="$(invoke "$CHALLENGE" set_guardian "$DEPLOYER_ARG")" || die "Challenge.set_guardian failed"
        RECORD_SENDING=""
        rp_set "guardian_tx=$tx" "guardian=deployer"
        v raw call "$CHALLENGE" guardian
        [[ "$(uc_guardian_label "$raw")" == "the deployer" ]] || die "after set_guardian, Challenge.guardian() is not the deployer"
        echo "   Challenge.set_guardian(\$STARKNET_ACCOUNT_ADDRESS): the deployer is the guardian" ;;
      *) die "Challenge.guardian() is another address: not replaced; nothing more was sent" ;;
    esac
  fi

  # The deployment file: the new class where the client and the indexer read it, every other field kept.
  python3 -I - "$REPOINT_FILE" "$NEW_CHALLENGE_CLASS" <<'PY'
import json, os, sys, tempfile
path, new = sys.argv[1:]
d = json.load(open(path))
d["contracts"]["Challenge"]["class_hash"] = "0x%064x" % int(new, 16)
fd, tmp = tempfile.mkstemp(dir=os.path.dirname(path))
os.chmod(tmp, os.stat(path).st_mode & 0o777)
with os.fdopen(fd, "w") as f:
    json.dump(d, f, indent=2)
    f.write("\n")
os.replace(tmp, path)
PY
  echo "== upgrade-challenge: wrote ${REPOINT_FILE#"$ROOT/"} (contracts.Challenge.class_hash)"
  uc_smoke
}

# uc_smoke: the class read back, owner(), the guardian (the deployer, compared and never printed) and the pause (false)
# unless the record is complete (live state since), F's smoke game read back; then a paid spawn at stake 1 and one
# build on the new class. Each is sent once: the spawn and the build are recorded and a rerun cites them.
uc_smoke() {
  local raw class held quote swap min_out spawn_tx game_id g b build
  echo "== upgrade-challenge: smoke"
  v class class_of "$CHALLENGE"
  felt_eq "$class" "$NEW_CHALLENGE_CLASS" || die "Challenge's class is $class, not $NEW_CHALLENGE_CLASS"
  echo "   Challenge's class: $NEW_CHALLENGE_CLASS"
  v raw call "$CHALLENGE" owner
  [[ "$(hex_int "$raw")" == "$DEPLOYER_INT" ]] || die "Challenge.owner() is not the deployer"
  echo "   Challenge.owner(): the deployer"
  v raw call "$CHALLENGE" guardian
  if ((UC_GUARDIAN_DEPLOYER)); then
    [[ "$(uc_guardian_label "$raw")" == "the deployer" ]] || die "Challenge.guardian() is not the deployer"
    echo "   Challenge.guardian(): the deployer"
  else
    echo "   Challenge.guardian(): $(uc_guardian_label "$raw") (not asked)"
  fi
  v raw call "$CHALLENGE" spawn_paused
  [[ "$(hex_int "$raw")" == 0 ]] || die "Challenge.spawn_paused() is true"
  echo "   Challenge.spawn_paused(): false"
  uc_old_game

  # The paid spawn, once: a spawn a stopped run sent is read from its receipt.
  if [[ -z "$(rp_get smoke.game_id)" ]] && repoint_settled smoke.spawn_tx; then
    spawn_tx="$(rp_get smoke.spawn_tx)"
    game_id="$(rpc starknet_getTransactionReceipt "[\"$spawn_tx\"]" | fresh_spawned_game)" ||
      die "the recorded smoke spawn $spawn_tx succeeded but spawned no Challenge game: check it"
    rp_set "smoke.game_id=$game_id"
  fi
  if [[ -n "$(rp_get smoke.game_id)" ]]; then
    game_id="$(rp_get smoke.game_id)"
    echo "   paid spawn done already: game $game_id, tx $(rp_get smoke.spawn_tx); not sent again"
  else
    v raw call "$USDC" balance_of "$DEPLOYER_ARG"; read -r held _ <<<"$raw"
    gt "$(hex_int "$held")" 1999999 ||
      invoke "$USDC" mint "$DEPLOYER_ARG" "$(python3 -I -c 'import sys;print(2000000-int(sys.argv[1],16))' "$held")" 0 >/dev/null
    invoke "$USDC" approve "$CHALLENGE" 2000000 0 >/dev/null
    v raw call "$ECONOMY" quote 1; read -r -a quote <<<"$raw"
    v raw call "$ECONOMY" quote_swap "${quote[2]}" "${quote[3]}"; read -r swap _ <<<"$raw"
    min_out="$(python3 -I -c 'import sys;print(int(sys.argv[1],16)*99//100)' "$swap")"
    RECORD_SENDING=smoke.spawn_tx
    spawn_tx="$(invoke "$CHALLENGE" spawn 1 0 $(u256 "$min_out"))" || die "the smoke's spawn failed"
    RECORD_SENDING=""
    game_id="$(rpc starknet_getTransactionReceipt "[\"$spawn_tx\"]" | fresh_spawned_game)" ||
      die "no GameSpawned event in the Challenge spawn receipt"
    rp_set "smoke.spawn_tx=$spawn_tx" "smoke.game_id=$game_id"
    echo "   paid game $game_id at stake 1 (min_out $min_out), tx $spawn_tx"
  fi

  # One build, once: a build a stopped run sent is awaited first; a game with a tile placed besides the starter (or
  # over) has had it.
  repoint_settled smoke.build_tx || true
  v raw call "$CHALLENGE" game "$game_id"; read -r -a g <<<"$raw"
  if [[ "$(hex_int "${g[5]}")" == 0 && "$(hex_int "${g[7]}")" == 1 ]]; then
    v build fresh_first_build "$game_id"
    read -r tx build <<<"$build"
    rp_set "smoke.build_tx=$tx"
    v raw call "$CHALLENGE" game "$game_id"; read -r -a g <<<"$raw"
    [[ "$(hex_int "${g[7]}")" == 2 ]] || die "game $game_id has $(hex_int "${g[7]}") tiles placed after the build, expected 2"
    echo "   build(game $game_id, $build), tx $tx"
  else
    echo "   build done already$( [[ -n "$(rp_get smoke.build_tx)" ]] && echo ", tx $(rp_get smoke.build_tx)"); not sent again"
  fi
  v raw call "$CHALLENGE" builder "$game_id" "$DEPLOYER_ARG"; read -r -a b <<<"$raw"
  [[ "${#b[@]}" == 4 && "$(hex_int "${b[0]}")" == "$game_id" && "$(hex_int "${b[1]}")" == "$DEPLOYER_INT" ]] ||
    die "Challenge.builder($game_id) is not the four fields of the game and the player"
  echo "   game $game_id: score $(hex_int "${g[4]}"), placed_count $(hex_int "${g[7]}"); builder(): the deployer, tile $(hex_int "${b[2]}"), plan $(hex_int "${b[3]}")"
  rp_set complete=yes
  v raw call "$STRK_TOKEN" balance_of "$DEPLOYER_ARG"
  echo "   deployer STRK balance after: $(python3 -I -c 'import sys;l,h=sys.argv[1:3];print(f"{(int(l,16)+(int(h,16)<<128))/1e18:.6f}")' $raw) STRK"
  echo "== upgrade-challenge: smoke ok; complete, a rerun sends nothing (record ${REPOINT_FILE#"$ROOT/"}, key upgrade_g1g4)"
}

# The fresh path (F): devnet, sepolia and its rehearsal share it. Through the signer (sepolia and its rehearsal) it keeps
# a record under the deployment file's `fresh` key (FRESH_RECORD): the salt, the commit, each class hash and each
# transaction hash as the signer sends it. fr_get, fr_set and fr_settled are rp_get, rp_set and repoint_settled on that
# record; devnet keeps none (a fresh node every run), so they read nothing, write nothing and find nothing settled.
fr_get() { if ((FRESH_RECORD)); then rp_get "$1"; fi; }
fr_set() { if ((FRESH_RECORD)); then rp_set "$@"; fi; }
fr_settled() { ((FRESH_RECORD)) || return 1; repoint_settled "$1"; }

# The quests.md set, as Setup-owner calls: v1 (P-22, "The list"; of its four dailies only Daily Run, quest 1, is defined: the
# PM's ruling of 2026-10-14 is four dailies a day, Daily Run plus the three rotating ones, so quests 2 to 4 stay unused ids;
# their tasks (STRUCTURE_SCORED, FOREST_SCORED, POINTS) are the three families of the rotation, which does not change)
# and v2a (quests-v2.md, "Catalogue additions", class (A):
# definitions only, no reward). Quests: `id task total start duration interval`, no end, no prerequisite; achievements:
# `id task total points`, no window (start = end = 0). Seconds: DAY 86,400; the rotating dailies (5 to 13) last a day in
# a 3-day interval (259,200), their start offset 0, 1 or 2 days (the day number mod 3 picks the live one); the weekly
# quests (14 to 16) last 604,800 in an interval of 604,800, from 345,600 (Monday 1970-01-05 00:00 UTC), so a week runs
# Monday to Sunday UTC. Setup needs `start % 86400 == 0` for a recurring quest. Tasks (constants.cairo): 1 GAME_FINISHED,
# 2 STRUCTURE_SCORED, 3 POINTS, 4 FOREST_SCORED, 5 WONDER_SCORED, 6 BIG_STRUCTURE, 7 HIGH_SCORE, 8 PODIUM (reported by the
# indexer), 10 TUTORIAL_FINISHED (claim_tutorial). Task 9 (WIN) has no definition: Champion is not in the list; 11 to 18 are
# reserved, none is defined. Every target is a first guess "to be calibrated" (quests.md, Q-4).
FRESH_QUEST_IDS="1 and 5 to 16"   # the ids FRESH_QUESTS defines, as the messages say them (ids 2 to 4 are never defined)
FRESH_QUESTS=(
  "1 1 1 0 86400 86400"
  "5 2 4 0 86400 259200" "6 2 8 86400 86400 259200" "7 2 12 172800 86400 259200"
  "8 4 2 0 86400 259200" "9 4 3 86400 86400 259200" "10 4 4 172800 86400 259200"
  "11 3 2000 0 86400 259200" "12 3 5000 86400 86400 259200" "13 3 8000 172800 86400 259200"
  "14 4 5 345600 604800 604800" "15 2 30 345600 604800 604800" "16 3 20000 345600 604800 604800"
)
FRESH_ACHIEVEMENTS=(
  "1 10 1 10" "2 1 1 10" "3 1 10 20" "4 1 50 40" "5 6 1 20" "6 4 10 20" "7 5 1 30" "8 7 1 30" "9 8 1 50"
  "10 4 50 40" "11 5 10 50" "12 6 10 40" "13 7 10 50" "14 7 25 80" "15 1 250 60" "16 1 1000 80"
)
# Cobbles v1, part 1 (P-61, docs/architecture/cobbles-v1.md, 3.1 and 6.4): the cobbles of each quest, in FRESH_QUESTS' order (5, 10
# or 15 by the family's target, Daily Run 5, the weeklies 15), and of each achievement, in FRESH_ACHIEVEMENTS' order (its
# points; On the Podium, 9, has none in v1: 0, no call). Set by Setup's owner (set_quest_cobbles, set_achievement_cobbles) in the
# definitions' multicall, after them, and read back through the views quest_cobbles and achievement_cobbles.
FRESH_QUEST_COBBLES=(5 5 10 15 5 10 15 5 10 15 15 15 15)
FRESH_ACHIEVEMENT_COBBLES=(10 10 20 40 20 20 30 30 0 40 50 40 50 80 60 80)
# Cobbles v1, part 2 (P-61, cobbles-v1.md 2.1 and 6.4): the owner's four packs, `id cobbles price` (USDC base units, 6
# decimals), all active: 50 cobbles for $5, 100 for $9, 500 for $40, 1,000 for $70. Set by Setup's owner (set_pack) in the
# definitions' multicall, after Economy.set_seller(Setup), and read back through the views pack and seller.
FRESH_PACKS=("1 50 5000000" "2 100 9000000" "3 500 40000000" "4 1000 70000000")
# Story mode (#546, #548, docs/architecture/story-mode.md): the campaigns and levels set on Story by its owner (set_campaign,
# set_level) after the wiring, one multicall of what Story lacks, and read back through its views campaign and level.
# Campaigns: `id level_count unlock_average`. Levels: `campaign level target plans placed`, the plans by Plan code in draw
# order (comma-separated), the placed tiles `plan:orientation:dx:dy` relative to the starter (comma-separated, `-` for
# none); every level starts from the usual starter, RFFFRFCFR facing South at the centre, and since #721 from it alone (no
# level of the plan has placed tiles). The Tutorial campaign of the plan (packages/game-core/src/story/plan.ts,
# docs/client/story-mode.md; target = its exact optimum or best known score; a game-core test keeps both in step): 12
# levels. Open Country and Dark Forest are added here with the wiring (#548), which sends the runs that earn their stars.
FRESH_STORY_CAMPAIGNS=("1 12 2")
FRESH_STORY_LEVELS=(
  "1 1 321 17,17 -"
  "1 2 643 4,13,8 -"
  "1 3 419 1,5,18 -"
  "1 4 788 5,1,14,17 -"
  "1 5 740 5,4,4 -"
  "1 6 1066 17,10,3,19,8 -"
  "1 7 1285 15,14,19,7,17 -"
  "1 8 1515 6,12,3,3,1 -"
  "1 9 971 10,2,18,3,3 -"
  "1 10 1543 18,13,14,7,7,5,13,3 -"
  "1 11 2250 15,3,3,6,7 -"
  "1 12 1578 7,15,6,17,6,4 -"
)
# The avatar on chain (#627, docs/architecture/avatar-chain.md): the defaults Avatar's owner sets after the wiring, one multicall
# of what Avatar lacks, read back through its views parts, price_bounds and item. Every value stays the owner's to change
# (set_price_bounds, set_item, withdraw_item; set_parts may only add parts). The owner's answers of 2026-10-20 (#627): paid
# items at 20 to 100 Cobbles each (rebalanced later with the economy), rare items seasonal (listed for their season with
# `until`, no quantity limit at launch). The parts are the avatar's nine traits (AVATAR-LIVING,
# packages/renderer/src/core/avatar/avatar-look.ts: skin, hair colour, eyes, outfit, pauldrons, hair style, beard, headwear,
# accessory), one byte each after the format's version. The free items are set per trait (2026-10-31, in place of items 0 to 3
# of every part): FRESH_AVATAR_FREE[p] is how many of part p's first items are free, every option of what a player is (skin,
# hair colour, eyes, hair style, beard) and of the plain gear (outfits, pauldrons, accessories), and the crown, none, the
# helmet and the hood of the headwear; the Wizard hat and the Feathered cap (headwear 4 and 5) are paid. No paid item is
# listed here: the owner lists them (set_item) with their art and seasons.
FRESH_AVATAR_PARTS=9
FRESH_AVATAR_PRICE_MIN=20
FRESH_AVATAR_PRICE_MAX=100
FRESH_AVATAR_FREE=(5 5 5 5 4 3 5 4 4)
# Cobbles v1, part 3 (P-61, cobbles-v1.md 5.2 and 6.4): the themes whose 19 skins the fresh deployment prices, by the rarity
# table. Theme 1 is Forest, the only theme with art (the PM's ruling of 2026-10-15); the other themes get no id here and
# stay unpriced until their art ships (the owner's set_skin_price). Add a theme id to this one list to price it too.
FRESH_SKIN_THEMES=(1)
# The price in cobbles of the skin of each plan, by Plan code 1 to 19: 50 + 50 x (9 - c) / 8 rounded to 5, c the plan's
# count among the 72 tiles (cobbles-v1.md 5.2: a whole theme is 1,580). Set by Setup's owner (set_skin_price), read back
# through the view skin_price.
FRESH_SKIN_PRICES=(100 80 90 90 90 95 75 75 80 55 75 90 50 90 90 80 100 80 95)
# Slots A and B of each definition in Setup's storage (quiver 0.2.0: `Quest_definitions`, `Quest_tasks` and
# `Achievement_definitions`, maps of u32 to a packed felt, flat in Setup): pedersen(sn_keccak(name), id) mod 2^251 - 256,
# as starknet.js's hash.starknetKeccak and hash.computePedersenHash compute it. A quest's slot A holds its schedule, its
# task count and the `defined` bit (bit 197), slot B its task and total; an achievement's slot A holds all of it, its
# window, its task, total and points, and the `defined` bit (bit 130). Both are zero until defined. No view of Setup reads a
# definition, so the tool reads the storage, as tests::e2e::quests does, and compares each slot with the packing of the
# table above (fresh_expected_slots).
FRESH_QUEST_SLOTS=(
  0x33c1fcb56930cd6e9dd8478a6522250393a86ef360281e1171a3cf668e03282
  0x6d232969d2c9d01e002de2b79d034a1c9660515f3296861e3a41da66e0ef571
  0x19b8f5aba683655ac6b8a41dbca006ccd6a1072ae33216593e08ac1903808d6
  0x339e3b655ff8f5618479ac25b60a8058609483398727752d5a75cf4f2a9e0c6
  0x47237e6430e8b3fe39cf8632f6b64fec5142ed8bb9b3fc370a5a2961df538b2
  0x3e9d34d670cded591e9f80ef3eaa80de4f4dba43a1783d668af8dd4ad6514a0
  0x4a2a79ead7f9c027d02f4a37a66417b2314061c52655c72a0e1859e7ae9bd19
  0x37d94cd5758a50e13aadfe3c9211993a1ec813c4094b2a580c937c34976ef7f
  0x7b859ead501d1fa32f40c9ccf83a975bad10768a97b27395adf8f26e8bc44e8
  0x39cf720b4a8cdf5581f662efc5e05befb4683dde0ea98bb61314616aa3c9634
  0x7cd86420cd4cb26c671b39d3cb731d41e668b36710eedd584d79a49a8858c2e
  0x75771ddfedf68c07e136fca6ae675c832b29808adbbdc70380878695956812f
  0x5565bcdddfa12bb259bb7ea028c8e46c9544a0570cd7e6deec38200f6108c42
)
FRESH_QUEST_TASK_SLOTS=(
  0x5490f80b4047b68c6480bcf5d2466d9bb148ad22e7da13aa1c8c858e0bff9a3
  0x36482336199426dd6522bc80e124cd93ee2dbb5f5bdd56c9e1d526a833cadc3
  0x18e0b90ab9dacc26b0befb009bb59f066054f00ae75fcb92f2ed9ea4d1b8093
  0x7da9a4b0c5e0f88c8e7f2729c46492a000402d4a2dea5b0d0da2d48a5f00692
  0x6320ebf9cfe8450adc0af4905ff71e8b9377eb1262adc46a0c95cc7876038ad
  0x45590282fa4b781ac49726369251a47ee7422437eab9018000cc8b97079b649
  0x145724c2e8f02ba589e1ce74fb181fcbf2b2cb4737e97c87b2bb0cced4ac15d
  0x55044099ca330bef4671b7081c0aac6029c4f58ca3383b5cb753199b422a581
  0x259aac59151fbb2d2deab6725664d55ed74d425aab6038068076857b46b4a15
  0x4008be93932270b1a9cf198c3853e9b0568d8e3605e11dcc4c2b29ae9396fdc
  0x77c72989f56dce56dbd9d2293e9755c553d78875bc36c261b0b9c842b35724d
  0x6254f8c26a90e19026cc006711c658f454133d21573c4afa30b7144a4ceecdf
  0x19bc7b582692c130d4e5272fb0af08c8c44a1ea1ba5fe1e6907e472341f8e11
)
# Slot A of quests 2, 3 and 4, which this set leaves undefined: "id slot". A Setup that holds one (a run started with the
# earlier script, which defined them, and resumed with this one) would show seven dailies, so the read-back fails on it.
FRESH_UNDEFINED_QUEST_SLOTS=(
  "2 0x14f2ac8d624f3f4cfa315541e6dfc1a43598189563e8a70ad92709f431075c9"
  "3 0x818fbcf87531854f5035d878d7b2217f6eaa1881f46994a791ea8e8ed9b4bf"
  "4 0x936bc3bf3390e4e6c62b1c245b42a629837936fea3ce24488ffe1d0803c9e9"
)
FRESH_ACHIEVEMENT_SLOTS=(
  0x7a9f291f9177d1c0c517a1cd46595136ef9491d7b5463671e67e5d48a030ee7
  0x74243985a962d46eba5b34bb84cb2364765f9f48ea15a82696df560f5a8e58f
  0x5edf71d348110e690b76f4df3463d591af8f7c51438e5ec575489144f58b72f
  0x264be5a4738a4e1983a16c2bd36905ea6ac7a8858185e4b69f6f80dfd1bb448
  0x69ffb5fa3e9cde90b588a258994babf6e5d4ecfda1ecb3841e9977a84d4e712
  0xe7f915ca121faa312d3b9ebb055374f39c524834b820402476efd5dd302b51
  0x7f4750cd7bab860c78de4d88d29436c411f41edf4b334c336c24e8717e09a1c
  0x431e059e7f6588b694e35a298d670837729574558c17261c1cc2693869d9d0
  0x40c16e33ae02f26f51eb1f6832e7d22d3074f70f7dfc5a528d52be3d4589fee
  0x7d13ff0539ba10b1a00bb4d26b4f9a722828fdeb6d3eaebce310125d3a37072
  0x555619bff9cd1444c2c87f06d72535808ea534bd8f34106de0e94ef69b1a294
  0x26831aae472ebf903df8afc01aae15a9cb012552f48a3fcaabd49b562a36270
  0x2c16c7fac4661cd28d4bbff666ca684d6f9a5d2d5b510a8e698991f9cf0e033
  0x73930a8bc6ce406343f415585085b7979b59f2b7289cef87912bb546e94e743
  0x48f155e839535270ea08af60ed4c3cba1b6e2b4519ba33da4a7a2e45bf03d9e
  0x41dc899e51ab7d1f909dd20440f8500c218eca9312795052f965ed4f7e0bd3
)

# fresh_storage <address> <key>: the felt stored there; fails unless the node answers one.
fresh_storage() {
  local answer
  # Named params: starknet-devnet 0.10.0 (spec 0.10.2) wants four positional ones here, the spec three.
  answer="$(rpc starknet_getStorageAt "{\"contract_address\":\"$1\",\"key\":\"$2\",\"block_id\":\"latest\"}")" || return 1
  python3 -I -c '
import json, re, sys
d = json.load(sys.stdin)
r = d.get("result") if isinstance(d, dict) and "error" not in d else None
sys.exit(1) if not isinstance(r, str) or not re.fullmatch("0x[0-9a-fA-F]+", r) else print(r)' <<<"$answer" 2>/dev/null
}

# fresh_expected_slots <quest|achievement> <table entry fields...>: the values quiver 0.2.0 stores for a definition, in
# decimal, one per line (a quest: slot A, slot B; an achievement: slot A). quiver_quest's HeadPacking and TasksPacking:
# start | end << 64 | duration << 128 | interval << 160 | task_count << 192 | defined << 197, and task | total << 32;
# quiver_achievement's HeadPacking: start | end << 64 | task_count << 128 | defined << 130 | task << 132 | total << 164 |
# points << 196. One task each, no end, no prerequisite, not retired.
fresh_expected_slots() {
  python3 -I -c '
import sys
kind, *f = sys.argv[1:]
if kind == "quest":
    _, task, total, start, duration, interval = map(int, f)
    print(start + (duration << 128) + (interval << 160) + (1 << 192) + (1 << 197))
    print(task + (total << 32))
else:
    _, task, total, points = map(int, f)
    print((1 << 128) + (1 << 130) + (task << 132) + (total << 164) + (points << 196))' "$@"
}

# fresh_slot_matches <label> <slot read> <expected, decimal> [retired bit]: fails, on stderr, when a slot holds something
# else. The retired bit (quest slot A bit 198, achievement slot A bit 131) is live state, the owner's retire_*: a retired
# definition is still the one specified, so a rerun after a retirement does not die on it.
fresh_slot_matches() {
  [[ "$(python3 -I -c 'import sys;print(int(sys.argv[1],16) & ~((1 << int(sys.argv[2])) if sys.argv[2] else 0))' "$2" "${4:-}")" == "$3" ]] && return 0
  echo "deploy.sh: $1 is defined, but not as specified (slot $(hex_int "$2"), expected $3): a definition cannot be edited; nothing more was sent" >&2
  return 1
}

# fresh_definition_calls: the definitions Setup does not hold yet (slot A zero), one call spec per line, quests then
# achievements, then the cobbles (cobbles v1) Setup does not hold yet; nothing when it holds them all, each as specified. Fails
# when a read fails (through `v`, so a lost read never reads as "defined") and when a defined slot is not the table's
# (quiver refuses to define an id twice, so a wrong one stays: the run dies, never sends over it).
# The cobbles of a quest or achievement (cobbles v1): none (0) -> its set_*_cobbles call, after the definitions (the same multicall,
# so a quest defined in it has its cobbles set after it), but on a complete record, where 0 is the owner's setting since
# (set_*_cobbles(id, 0)) and is kept like any other; the table's -> nothing; another non-zero amount -> the owner's
# setting since on a complete record (kept, never sent over: cobbles are calibrated by the owner, cobbles-v1.md 3.1), a stop
# otherwise. A retired one has none and gets none (set_*_cobbles refuses a retired id; retire_* clears the cobbles).
# The shop (cobbles v1, part 2), before the cobbles: Economy's seller none -> Economy.set_seller(Setup); Setup -> nothing;
# another address -> a stop (set once). Each pack of FRESH_PACKS: never set (0 cobbles) -> its set_pack call, but on a
# complete record; the table's, active -> nothing; anything else (another amount or price, or stopped) -> the owner's
# setting since on a complete record (kept), a stop otherwise. The skin prices (part 3), after the packs: each plan of each theme
# of FRESH_SKIN_THEMES, never priced (0) -> its set_skin_price call, but on a complete record (0 is then the owner's withdrawal,
# kept); the table's -> nothing; another price -> the owner's setting since on a complete record (kept), a stop otherwise.
# The seller (part 2's review note p3) is sent like the packs: never on a complete record.
fresh_definition_calls() {
  local i id task total start duration interval points slot want entry cobbles have retired price raw theme plan
  local cobble_calls=() shop_calls=() held=() skin_calls=()
  # Quests 2 to 4 stay undefined (four dailies a day): one that is defined and not retired makes seven dailies live.
  for entry in "${FRESH_UNDEFINED_QUEST_SLOTS[@]}"; do
    read -r id slot <<<"$entry"
    slot="$(fresh_storage "$SETUP" "$slot")" || return 1
    if [[ "$(python3 -I -c 'import sys;n=int(sys.argv[1],16);print(1 if (n >> 197) & 1 and not (n >> 198) & 1 else 0)' "$slot")" == 1 ]]; then
      echo "deploy.sh: quest $id is defined on Setup, but this set leaves quests 2 to 4 undefined (four dailies a day): it would show seven dailies; nothing more was sent" >&2
      return 1
    fi
  done
  for i in "${!FRESH_QUESTS[@]}"; do
    read -r id task total start duration interval <<<"${FRESH_QUESTS[i]}"
    slot="$(fresh_storage "$SETUP" "${FRESH_QUEST_SLOTS[i]}")" || return 1
    cobbles="${FRESH_QUEST_COBBLES[i]}"
    if [[ "$(hex_int "$slot")" == 0 ]]; then
      echo "$SETUP define_quest $id $start 0 $duration $interval 1 $task $total 0"
      cobble_calls+=("$SETUP set_quest_cobbles $id $cobbles")
      continue
    fi
    retired="$(python3 -I -c 'import sys;print((int(sys.argv[1],16) >> 198) & 1)' "$slot")"
    # shellcheck disable=SC2086 # the table entry is split into its fields
    want="$(fresh_expected_slots quest ${FRESH_QUESTS[i]})" || return 1
    fresh_slot_matches "quest $id" "$slot" "$(sed -n 1p <<<"$want")" 198 || return 1
    slot="$(fresh_storage "$SETUP" "${FRESH_QUEST_TASK_SLOTS[i]}")" || return 1
    fresh_slot_matches "quest $id (its task)" "$slot" "$(sed -n 2p <<<"$want")" || return 1
    [[ "$retired" == 0 ]] || continue
    have="$(call "$SETUP" quest_cobbles "$id")" || return 1
    have="$(hex_int "$(cut -d' ' -f1 <<<"$have")")"
    fresh_cobbles_match "quest $id" "$have" "$cobbles" || return 1
    [[ "$have" != 0 ]] || ((FRESH_COMPLETE)) || cobble_calls+=("$SETUP set_quest_cobbles $id $cobbles")
  done
  for i in "${!FRESH_ACHIEVEMENTS[@]}"; do
    read -r id task total points <<<"${FRESH_ACHIEVEMENTS[i]}"
    slot="$(fresh_storage "$SETUP" "${FRESH_ACHIEVEMENT_SLOTS[i]}")" || return 1
    cobbles="${FRESH_ACHIEVEMENT_COBBLES[i]}"
    if [[ "$(hex_int "$slot")" == 0 ]]; then
      echo "$SETUP define_achievement $id 0 0 1 $task $total $points"
      [[ "$cobbles" == 0 ]] || cobble_calls+=("$SETUP set_achievement_cobbles $id $cobbles")
      continue
    fi
    # shellcheck disable=SC2086
    want="$(fresh_expected_slots achievement ${FRESH_ACHIEVEMENTS[i]})" || return 1
    fresh_slot_matches "achievement $id" "$slot" "$want" 131 || return 1
    [[ "$cobbles" != 0 && "$(python3 -I -c 'import sys;print((int(sys.argv[1],16) >> 131) & 1)' "$slot")" == 0 ]] || continue
    have="$(call "$SETUP" achievement_cobbles "$id")" || return 1
    have="$(hex_int "$(cut -d' ' -f1 <<<"$have")")"
    fresh_cobbles_match "achievement $id" "$have" "$cobbles" || return 1
    [[ "$have" != 0 ]] || ((FRESH_COMPLETE)) || cobble_calls+=("$SETUP set_achievement_cobbles $id $cobbles")
  done
  raw="$(call "$ECONOMY" seller)" || return 1
  if [[ "$(hex_int "$raw")" == 0 ]]; then
    ((FRESH_COMPLETE)) || shop_calls+=("$ECONOMY set_seller $SETUP")
  elif ! felt_eq "$raw" "$SETUP"; then
    echo "deploy.sh: Economy.seller() is another address than Setup: the seller is set once, not sent over; nothing more was sent" >&2
    return 1
  fi
  for entry in "${FRESH_PACKS[@]}"; do
    read -r id cobbles price <<<"$entry"
    raw="$(call "$SETUP" pack "$id")" || return 1
    read -r -a held <<<"$raw"
    have="$(hex_int "${held[0]:-0x0}")"
    if [[ "$have" == 0 ]]; then
      ((FRESH_COMPLETE)) || shop_calls+=("$SETUP set_pack $id $cobbles $price 1")
    elif [[ "$have" != "$cobbles" || "$(hex_int "${held[1]:-0x0}")" != "$price" || "$(hex_int "${held[2]:-0x0}")" != 1 ]]; then
      ((FRESH_COMPLETE)) && continue
      echo "deploy.sh: pack $id is $have cobbles for $(hex_int "${held[1]:-0x0}") (active $(hex_int "${held[2]:-0x0}")), not the table's $cobbles for $price, active: not sent over; nothing more was sent" >&2
      return 1
    fi
  done
  for theme in "${FRESH_SKIN_THEMES[@]}"; do
    for plan in $(seq 1 19); do
      cobbles="${FRESH_SKIN_PRICES[plan - 1]}"
      raw="$(call "$SETUP" skin_price "$theme" "$plan")" || return 1
      have="$(hex_int "$raw")"
      if [[ "$have" == 0 ]]; then
        ((FRESH_COMPLETE)) || skin_calls+=("$SETUP set_skin_price $theme $plan $cobbles")
      else
        fresh_cobbles_match "the skin of plan $plan in theme $theme" "$have" "$cobbles" || return 1
      fi
    done
  done
  [[ "${#shop_calls[@]}" == 0 ]] || printf '%s\n' "${shop_calls[@]}"
  [[ "${#skin_calls[@]}" == 0 ]] || printf '%s\n' "${skin_calls[@]}"
  [[ "${#cobble_calls[@]}" == 0 ]] || printf '%s\n' "${cobble_calls[@]}"
}

# fresh_cobbles_match <label> <cobbles held> <the table's>: none held, or the table's, passes; another amount passes on a complete
# record (the owner's calibration since, kept) and stops a run otherwise, on stderr.
fresh_cobbles_match() {
  [[ "$2" == 0 || "$2" == "$3" ]] && return 0
  ((FRESH_COMPLETE)) && return 0
  echo "deploy.sh: $1 has $2 cobbles, not the table's $3: not sent over; nothing more was sent" >&2
  return 1
}

# fresh_wiring_calls: the wiring calls still missing, one spec per line: Setup's reporter (Challenge), Economy's game,
# Setup's economy and collection, Collection's minter. Fails when a read fails.
fresh_wiring_calls() {
  local raw w
  raw="$(call "$SETUP" is_reporter "$CHALLENGE")" || return 1
  [[ "$(hex_int "$raw")" == 1 ]] || echo "$SETUP set_reporter $CHALLENGE 1"
  raw="$(call "$SETUP" is_reporter "$STORY")" || return 1
  [[ "$(hex_int "$raw")" == 1 ]] || echo "$SETUP set_reporter $STORY 1"
  raw="$(call "$SETUP" is_spender "$AVATAR")" || return 1
  [[ "$(hex_int "$raw")" == 1 ]] || echo "$SETUP set_spender $AVATAR 1"
  raw="$(call "$ECONOMY" addresses)" || return 1
  read -r -a w <<<"$raw"
  felt_eq "${w[4]:-}" "$CHALLENGE" || echo "$ECONOMY set_game $CHALLENGE"
  raw="$(call "$SETUP" wiring)" || return 1
  read -r -a w <<<"$raw"
  felt_eq "${w[0]:-}" "$ECONOMY" || echo "$SETUP set_economy $ECONOMY"
  felt_eq "${w[1]:-}" "$COLLECTION" || echo "$SETUP set_collection $COLLECTION"
  raw="$(call "$COLLECTION" challenge)" || return 1
  felt_eq "$raw" "$CHALLENGE" || echo "$COLLECTION set_minters $CHALLENGE 0"
}

# fresh_story_level_args <campaign> <level> <target> <plans> <placed>: the calldata of set_level after its two ids (the
# plans span, the starter, the placed span, the target), which is also what Story's view `level` answers.
fresh_story_level_args() {
  python3 -I -c '
import sys
target, plans, placed = sys.argv[1:4]
center = 0x7fffffff
out = [len(plans.split(","))] + [int(p) for p in plans.split(",")]
out += [9, 3, center, center]
tiles = [] if placed == "-" else [t.split(":") for t in placed.split(",")]
out.append(len(tiles))
for plan, orientation, dx, dy in tiles:
    out += [int(plan), int(orientation), center + int(dx), center + int(dy)]
out.append(int(target))
print(" ".join(str(v) for v in out))
' "$3" "$4" "$5"
}

# fresh_story_calls: the Story calls still missing, one spec per line: each campaign whose view is not as specified, then
# each level whose view is not (a level set otherwise is set again: set_level corrects). Fails when a read fails.
fresh_story_calls() {
  local entry id count unlock raw campaign level target plans placed want
  for entry in "${FRESH_STORY_CAMPAIGNS[@]}"; do
    read -r id count unlock <<<"$entry"
    raw="$(call "$STORY" campaign "$id")" || return 1
    # shellcheck disable=SC2086 # the view's felts, one argument each
    [[ "$(python3 -I -c 'import sys;print(" ".join(str(int(x,16)) for x in sys.argv[1:]))' $raw)" == "$count $unlock" ]] ||
      echo "$STORY set_campaign $id $count $unlock"
  done
  for entry in "${FRESH_STORY_LEVELS[@]}"; do
    read -r campaign level target plans placed <<<"$entry"
    want="$(fresh_story_level_args "$campaign" "$level" "$target" "$plans" "$placed")" || return 1
    raw="$(call "$STORY" level "$campaign" "$level")" || return 1
    # shellcheck disable=SC2086 # the view's felts, one argument each
    [[ "$(python3 -I -c 'import sys;print(" ".join(str(int(x,16)) for x in sys.argv[1:]))' $raw)" == "$want" ]] ||
      echo "$STORY set_level $campaign $level $want"
  done
}

# fresh_story_step: the campaigns and levels on Story, as its owner, in one multicall of what it lacks (its hash recorded as
# story_tx), then read back; a rerun sends only what is missing and a complete record nothing.
fresh_story_step() {
  local spec
  fr_settled story_tx || true
  STORY_CALLS=()
  v STORY_RAW fresh_story_calls
  while IFS= read -r spec; do [[ -n "$spec" ]] && STORY_CALLS+=("$spec"); done <<<"$STORY_RAW"
  if [[ "${#STORY_CALLS[@]}" == 0 ]]; then
    echo "   set already: ${#FRESH_STORY_CAMPAIGNS[@]} campaign(s), ${#FRESH_STORY_LEVELS[@]} level(s)$( [[ -n "$(fr_get story_tx)" ]] && echo ", tx $(fr_get story_tx)")"
  else
    echo "   ${#STORY_CALLS[@]} campaign and level call(s) to send"
    RECORD_SENDING=story_tx
    invoke_all "${STORY_CALLS[@]}"
    RECORD_SENDING=""
  fi
  fresh_story_smoke
}

# fresh_story_smoke: Story's Setup is Setup, Setup allows it as a reporter (it pays the stars), and every campaign and level
# reads back as specified. Read on a complete record too: the owner corrects a level through the table, not by hand.
fresh_story_smoke() {
  [[ "$(hex_int "$(call "$STORY" setup)")" == "$(hex_int "$SETUP")" ]] || die "Story.setup() is not Setup"
  [[ "$(hex_int "$(call "$SETUP" is_reporter "$STORY")")" == 1 ]] || die "Setup does not allow Story as a reporter"
  v STORY_RAW fresh_story_calls
  [[ -z "$STORY_RAW" ]] || die "Story lacks: $(cut -d' ' -f2,3,4 <<<"$STORY_RAW" | tr '\n' ' ')"
  echo "   Story: setup() is Setup, a reporter of Setup; campaign(s) ${FRESH_STORY_CAMPAIGNS[*]%% *} and ${#FRESH_STORY_LEVELS[@]} level(s) as specified (views campaign and level)"
}

# fresh_avatar_calls: the Avatar calls still missing, one spec per line: the parts when the view is below FRESH_AVATAR_PARTS
# (more parts set by the owner are kept: they only grow), the price bounds when no bounds are set, then each free item of every
# part that is not listed (an item the owner changed since is kept). Fails when a read fails.
fresh_avatar_calls() {
  local raw part id
  raw="$(call "$AVATAR" parts)" || return 1
  (( $(hex_int "$raw") >= FRESH_AVATAR_PARTS )) || echo "$AVATAR set_parts $FRESH_AVATAR_PARTS"
  raw="$(call "$AVATAR" price_bounds)" || return 1
  # shellcheck disable=SC2086 # the view's felts, one argument each
  [[ "$(python3 -I -c 'import sys;print(" ".join(str(int(x,16)) for x in sys.argv[1:]))' $raw)" != "0 0" ]] ||
    echo "$AVATAR set_price_bounds $FRESH_AVATAR_PRICE_MIN $FRESH_AVATAR_PRICE_MAX"
  for ((part = 0; part < FRESH_AVATAR_PARTS; part++)); do
    for ((id = 0; id < FRESH_AVATAR_FREE[part]; id++)); do
      raw="$(call "$AVATAR" item "$part" "$id")" || return 1
      read -r -a raw <<<"$raw"
      [[ "$(hex_int "${raw[0]:-0x0}")" != 0 ]] || echo "$AVATAR set_item $part $id 0 0 0"
    done
  done
}

# fresh_avatar_step: Avatar's defaults, as its owner, in one multicall of what it lacks (its hash recorded as avatar_tx),
# then read back; a rerun sends only what is missing and a complete record nothing.
fresh_avatar_step() {
  local spec
  fr_settled avatar_tx || true
  AVATAR_CALLS=()
  v AVATAR_RAW fresh_avatar_calls
  while IFS= read -r spec; do [[ -n "$spec" ]] && AVATAR_CALLS+=("$spec"); done <<<"$AVATAR_RAW"
  if [[ "${#AVATAR_CALLS[@]}" == 0 ]]; then
    echo "   set already: the parts, the price bounds and the free items$( [[ -n "$(fr_get avatar_tx)" ]] && echo ", tx $(fr_get avatar_tx)")"
  else
    echo "   ${#AVATAR_CALLS[@]} parts, bounds and free item call(s) to send"
    RECORD_SENDING=avatar_tx
    invoke_all "${AVATAR_CALLS[@]}"
    RECORD_SENDING=""
  fi
  fresh_avatar_smoke
}

# fresh_avatar_smoke: Avatar's Setup is Setup, Setup allows it as a spender (it spends the Cobbles of an item), and the
# parts, the bounds and the free items read back as set. Read on a complete record too.
fresh_avatar_smoke() {
  [[ "$(hex_int "$(call "$AVATAR" setup)")" == "$(hex_int "$SETUP")" ]] || die "Avatar.setup() is not Setup"
  [[ "$(hex_int "$(call "$SETUP" is_spender "$AVATAR")")" == 1 ]] || die "Setup does not allow Avatar as a spender"
  v AVATAR_RAW fresh_avatar_calls
  [[ -z "$AVATAR_RAW" ]] || die "Avatar lacks: $(cut -d' ' -f2,3,4 <<<"$AVATAR_RAW" | tr '\n' ' ')"
  echo "   Avatar: setup() is Setup, a spender of Setup; $FRESH_AVATAR_PARTS parts, bounds set, the first ${FRESH_AVATAR_FREE[*]} items of each part listed free (views parts, price_bounds and item)"
}

# fresh_guardian_step: Challenge's guardian is the deployer (PM, 2026-10-14), set in the run that deploys it, with the
# same call and checks as --upgrade-challenge's: guardian() none -> set_guardian(@account) sent (its hash recorded as
# guardian_tx) and read back; already the deployer -> nothing sent; another address -> the run dies (never replaced, never
# printed). A complete record's rerun sends nothing and does not read it (the owner may have moved it since).
fresh_guardian_step() {
  ((FRESH_COMPLETE == 0)) || return 0
  fr_settled guardian_tx || true
  v RAW call "$CHALLENGE" guardian
  case "$(uc_guardian_label "$RAW")" in
    "the deployer") echo "   Challenge.guardian() is the deployer already$( [[ -n "$(fr_get guardian_tx)" ]] && echo ", tx $(fr_get guardian_tx)")" ;;
    none)
      RECORD_SENDING=guardian_tx
      invoke "$CHALLENGE" set_guardian "$DEPLOYER_ARG" >/dev/null || die "Challenge.set_guardian failed"
      RECORD_SENDING=""
      v RAW call "$CHALLENGE" guardian
      [[ "$(uc_guardian_label "$RAW")" == "the deployer" ]] || die "after set_guardian, Challenge.guardian() is not the deployer"
      echo "   Challenge.set_guardian(the deployer): the deployer is the guardian" ;;
    *) die "Challenge.guardian() is another address: not replaced; nothing more was sent" ;;
  esac
}

# fresh_vrf_step (#645, docs/architecture/challenge-vrf.md): Challenge draws every tile from a VRF provider, which its owner
# sets. Until it is set, every spawn reverts ('VRF: no provider'), so it is set before the smoke: the devnet's
# MockVrfProvider, on devnet and, for the smoke only, on Sepolia (the owner's ruling of 2026-10-21, option A). Cartridge's
# provider proves a seed only inside its server's VRF wrapper, which the smoke's plain invokes do not have. On Sepolia
# fresh_vrf_final_step then sets Cartridge's provider (CARTRIDGE_VRF_PROVIDER) once the smoke has passed. The provider is
# read back first: one already set is not sent again (Cartridge's on a rerun after the smoke: the smoke is over); another
# address stops the run. The hash is recorded as vrf_tx.
CARTRIDGE_VRF_PROVIDER=0x051fea4450da9d6aee758bdeba88b2f665bcbf549d2c61421aa724e9ac0ced8f
fresh_vrf_step() {
  ((FRESH_COMPLETE == 0)) || return 0
  local provider="$VRF"
  [[ -n "$provider" ]] || die "no VRF provider for Challenge's smoke on $NETWORK"
  fr_settled vrf_tx || true
  v RAW call "$CHALLENGE" vrf_provider
  if [[ "$(hex_int "$RAW")" == "$(hex_int "$provider")" ]]; then
    echo "   Challenge.vrf_provider() is set already$( [[ -n "$(fr_get vrf_tx)" ]] && echo ", tx $(fr_get vrf_tx)")"
  elif [[ "$NETWORK" == "sepolia" && "$(hex_int "$RAW")" == "$(hex_int "$CARTRIDGE_VRF_PROVIDER")" ]]; then
    echo "   Challenge.vrf_provider() is Cartridge's already: the smoke passed, its provider was replaced"
  elif [[ "$(hex_int "$RAW")" == 0 ]]; then
    RECORD_SENDING=vrf_tx
    invoke "$CHALLENGE" set_vrf_provider "$provider" >/dev/null || die "Challenge.set_vrf_provider failed"
    RECORD_SENDING=""
    v RAW call "$CHALLENGE" vrf_provider
    [[ "$(hex_int "$RAW")" == "$(hex_int "$provider")" ]] || die "after set_vrf_provider, Challenge.vrf_provider() is not $provider"
    echo "   Challenge.set_vrf_provider(MockVrfProvider): set$( [[ "$NETWORK" == "sepolia" ]] && echo ", for the smoke only")"
  else
    die "Challenge.vrf_provider() is another address: not replaced; nothing more was sent"
  fi
}

# fresh_vrf_final_step (#645, Sepolia only): once the smoke passed, Challenge draws from Cartridge's provider: the mock's
# provider is replaced and Cartridge's read back. The hash is recorded as smoke.provider_tx. A run that stops before it leaves
# the mock set: the rerun's smoke is done already, and this step sends it.
fresh_vrf_final_step() {
  [[ "$NETWORK" == "sepolia" ]] || return 0
  fr_settled smoke.provider_tx || true
  v RAW call "$CHALLENGE" vrf_provider
  if [[ "$(hex_int "$RAW")" == "$(hex_int "$CARTRIDGE_VRF_PROVIDER")" ]]; then
    echo "   Challenge.vrf_provider() is Cartridge's$( [[ -n "$(fr_get smoke.provider_tx)" ]] && echo ", tx $(fr_get smoke.provider_tx)")"
    return 0
  fi
  [[ "$(hex_int "$RAW")" == "$(hex_int "$VRF")" ]] || die "Challenge.vrf_provider() is neither the smoke's mock nor Cartridge's: not replaced"
  RECORD_SENDING=smoke.provider_tx
  invoke "$CHALLENGE" set_vrf_provider "$CARTRIDGE_VRF_PROVIDER" >/dev/null || die "Challenge.set_vrf_provider(Cartridge's) failed"
  RECORD_SENDING=""
  v RAW call "$CHALLENGE" vrf_provider
  [[ "$(hex_int "$RAW")" == "$(hex_int "$CARTRIDGE_VRF_PROVIDER")" ]] || die "after set_vrf_provider, Challenge.vrf_provider() is not Cartridge's"
  echo "   Challenge.set_vrf_provider(Cartridge's provider): the smoke's mock is replaced"
}

# fresh_guardian_smoke: the smoke reads guardian() (the deployer) and spawn_paused() (false) and fails otherwise. A
# complete record's rerun reads neither (the owner's set_guardian and the guardian's pause are live state since).
fresh_guardian_smoke() {
  if ((FRESH_COMPLETE)); then
    echo "   Challenge.guardian() and spawn_paused() not read (complete record: live state since)"
    return 0
  fi
  v RAW call "$CHALLENGE" guardian
  [[ "$(uc_guardian_label "$RAW")" == "the deployer" ]] || die "Challenge.guardian() is not the deployer"
  v RAW call "$CHALLENGE" spawn_paused
  [[ "$(hex_int "$RAW")" == 0 ]] || die "Challenge.spawn_paused() is true"
  echo "   Challenge.guardian(): the deployer; spawn_paused(): false"
}

# fresh_definitions_step: the quests.md v1 and v2a sets on Setup, as its owner (D-24), in one multicall. Each definition is
# read from Setup's storage first: a defined one is not sent again (quiver refuses an id defined twice), so a rerun sends
# only what is missing and a complete record sends nothing; one defined otherwise than specified stops the run
# (fresh_definition_calls). The multicall's hash is recorded as definitions_tx.
fresh_definitions_step() {
  local spec
  fr_settled definitions_tx || true
  DEFINE_CALLS=()
  v DEFINE_RAW fresh_definition_calls
  while IFS= read -r spec; do [[ -n "$spec" ]] && DEFINE_CALLS+=("$spec"); done <<<"$DEFINE_RAW"
  if [[ "${#DEFINE_CALLS[@]}" == 0 ]]; then
    echo "   defined already: quests $FRESH_QUEST_IDS, achievements 1 to ${#FRESH_ACHIEVEMENTS[@]}$( [[ -n "$(fr_get definitions_tx)" ]] && echo ", tx $(fr_get definitions_tx)")"
  else
    echo "   ${#DEFINE_CALLS[@]} definition, shop and cobbles call(s) to send"
    RECORD_SENDING=definitions_tx
    invoke_all "${DEFINE_CALLS[@]}"
    RECORD_SENDING=""
  fi
  v DEFINE_RAW fresh_definition_calls
  [[ -z "$DEFINE_RAW" ]] || die "after the definitions, Setup still lacks: $(cut -d' ' -f2,3 <<<"$DEFINE_RAW" | tr '\n' ' ')"
  echo "   Setup holds quests $FRESH_QUEST_IDS and achievements 1 to ${#FRESH_ACHIEVEMENTS[@]}, v1 and v2a, each as specified (slots read from its storage), with their cobbles (13 quests, 15 achievements; views quest_cobbles and achievement_cobbles)"
  echo "   the shop: Economy.seller() is Setup; Setup holds packs 1 to ${#FRESH_PACKS[@]} (50 for 5 USDC, 100 for 9, 500 for 40, 1,000 for 70; view pack); skins: theme(s) ${FRESH_SKIN_THEMES[*]} priced for the 19 plans by the rarity table (view skin_price)"
}

# fresh_definitions_smoke: the smoke reads every definition back from Setup's storage and fails on one that is missing or
# is not as specified. Read on a complete record too (a definition cannot be edited; a retirement is not a change of it).
fresh_definitions_smoke() {
  v DEFINE_RAW fresh_definition_calls
  [[ -z "$DEFINE_RAW" ]] || die "Setup lacks a definition: $(cut -d' ' -f2,3 <<<"$DEFINE_RAW" | tr '\n' ' ')"
  echo "   Setup holds every definition, each as specified: quests $FRESH_QUEST_IDS, achievements 1 to ${#FRESH_ACHIEVEMENTS[@]} (v1 and v2a), and their cobbles; Economy's seller is Setup, packs 1 to ${#FRESH_PACKS[@]} and the skin prices of theme(s) ${FRESH_SKIN_THEMES[*]} as specified"
}

# fresh_deployed_address <tx> <class>: the contract of that class a deploy transaction created, from its receipt (the
# first event datum that is a contract of the class); nothing when it did not succeed or names none.
fresh_deployed_address() {
  local receipt candidate
  receipt="$(rpc starknet_getTransactionReceipt "[\"$1\"]")" || return 0
  [[ "$(pyj 'd.get("result",{}).get("execution_status","")' <<<"$receipt" 2>/dev/null)" == SUCCEEDED ]] || return 0
  while read -r candidate; do
    if [[ -n "$candidate" ]] && felt_eq "$(class_at "$candidate")" "$2"; then
      echo "$candidate"
      return 0
    fi
  done < <(pyj '"\n".join(e["data"][0] for e in d["result"]["events"] if e.get("data"))' <<<"$receipt")
}

# fresh_deploy <Name> <class hash> [constructor calldata...]: the contract's address. A deploy a stopped run recorded is
# awaited and its address read from its receipt, not sent again; otherwise `deploy`, its hash recorded as it is sent.
# Only the hash is recorded, never the address: so no address reaches the deployment file before step 5 writes
# `contracts`, after the definitions.
fresh_deploy() {
  local name="$1" class="$2" tx addr
  if fr_settled "$name.deploy_tx" >&2; then
    tx="$(fr_get "$name.deploy_tx")"
    addr="$(fresh_deployed_address "$tx" "$class")"
    [[ -n "$addr" ]] || die "the recorded $name deploy $tx succeeded but created no contract of class $class: check it"
    echo "   $name $(felt64 "$addr") deployed already, tx $tx; not sent again" >&2
    echo "$addr"
    return
  fi
  RECORD_SENDING="$name.deploy_tx"
  addr="$(deploy "$@")"
  RECORD_SENDING=""
  fr_set "$name.deploy_tx=$(tail -1 "$WORK_DIR/deploy-txs")"
  echo "$addr"
}

# fresh_spawned_game: the game id of Challenge's GameSpawned in a receipt read on stdin; fails when the transaction did
# not succeed or spawned nothing.
fresh_spawned_game() {
  python3 -I -c '
import sys, json
d = json.load(sys.stdin)["result"]
assert d["execution_status"] == "SUCCEEDED"
challenge = int(sys.argv[1], 16)
ids = [int(e["keys"][1], 16) for e in d["events"] if int(e["from_address"], 16) == challenge and len(e["keys"]) == 3]
print(ids[0])' "$CHALLENGE" 2>/dev/null
}

# fresh_first_build <game id>: sends the first of the 16 placements next to the starter, (CENTER +- 1, CENTER) and
# (CENTER, CENTER +- 1) in each orientation, that the node accepts: through the signer the first whose fee estimate
# passes (`signer estimate invoke`, read-only), its hash recorded as smoke.build_tx as it is sent; on devnet the first
# whose sncast invoke passes (sncast estimates first, so a refused placement sends nothing). Prints `<tx> <placement>`;
# fails when none is accepted.
fresh_first_build() {
  local c=2147483647 o x y out line l spec tx
  for spec in "$c $((c + 1))" "$((c + 1)) $c" "$c $((c - 1))" "$((c - 1)) $c"; do
    read -r x y <<<"$spec"
    for o in 1 2 3 4; do
      if ((USE_SIGNER)); then
        out="$(run_signer estimate invoke --contract "$CHALLENGE" --function build --calldata "$1" "$o" "$x" "$y")" || true
        line=""
        while IFS= read -r l; do [[ "$l" == "{"* ]] && line="$l"; done <<<"$out"
        [[ -n "$line" && "$(pyj 'd.get("ok") is True' <<<"$line" 2>/dev/null)" == True ]] || continue
        RECORD_SENDING=smoke.build_tx
        tx="$(invoke "$CHALLENGE" build "$1" "$o" "$x" "$y")" || return 1
        RECORD_SENDING=""
      else
        tx="$(sc sncast --wait "${ACCOUNTS[@]}" --account dev invoke --url "$RPC_URL" --contract-address "$CHALLENGE" \
          --function build --calldata "$1" "$o" "$x" "$y" 2>/dev/null | pyj 'd["transaction_hash"]' 2>/dev/null)" || continue
      fi
      echo "$tx orientation $o, x $x, y $y"
      return 0
    done
  done
  return 1
}

# fresh_file_check (sepolia and its rehearsal): the deployment file the run writes, before anything is built or sent. No
# file: a run starts one. A file with this path's record (`fresh`) for this network and chain: the run resumes it (a
# complete one sends nothing). Anything else, a live deployment included (contracts/deployments/sepolia.json of the old
# Sepolia deployment), is refused: name a new output path with --out.
FRESH_COMPLETE=0
fresh_file_check() {
  local fields net chain record complete
  if [[ ! -e "$OUT" ]]; then
    echo "== fresh: no deployment file at ${OUT#"$ROOT/"}: a run starts one"
    return 0
  fi
  fields="$(python3 -I - "$OUT" <<'PY'
import json, sys
try:
    d = json.load(open(sys.argv[1]))
except Exception:
    sys.exit(1)
if not isinstance(d, dict):
    sys.exit(1)
f = d.get("fresh")
record = isinstance(f, dict)
print(d.get("network") or "-", d.get("chain_id") or "-", "yes" if record else "no",
      "yes" if record and f.get("complete") == "yes" else "no")
PY
)" || die "${OUT#"$ROOT/"} is not a deployment file: it is not overwritten; name a new output path with --out <file>; nothing was sent"
  read -r net chain record complete <<<"$fields"
  [[ "$record" == yes ]] ||
    die "${OUT#"$ROOT/"} holds a live deployment (no fresh record): it is not overwritten; name a new output path with --out <file>; nothing was sent"
  [[ "$net" == "$NETWORK" ]] || die "${OUT#"$ROOT/"} records a '$net' deployment, not $NETWORK; nothing was sent"
  felt_eq "$chain" "$CHAIN_ID" || die "${OUT#"$ROOT/"} records chain $chain, the node is $CHAIN_ID; nothing was sent"
  [[ "$complete" == yes ]] && FRESH_COMPLETE=1
  echo "== fresh: resuming ${OUT#"$ROOT/"} ($( ((FRESH_COMPLETE)) && echo "complete: a run sends nothing" || echo "a run sends only what has not landed"))"
}

# fresh_classes_check: a resumed record's classes are the ones built now (a rerun from other sources would deploy a
# second system); read before anything is estimated or sent.
fresh_classes_check() {
  local name recorded built
  [[ -e "$OUT" ]] || return 0
  for name in Challenge Setup Faucet PavedToken MockRouter Vault Economy Collection Story Avatar; do
    recorded="$(fr_get "classes.$name")"
    [[ -n "$recorded" ]] || continue
    built="$(sc sncast utils class-hash --contract-name "$name" | pyj 'd["class_hash"]')" || die "class-hash $name failed"
    felt_eq "$recorded" "$built" ||
      die "the record's $name class is $recorded, the build's $built: resume from the sources of the first run; nothing was sent"
  done
}

# fresh_check_only: what a run would send, from the record and the chain; nothing is sent and the file is not written.
fresh_check_only() {
  local name key tx
  echo "== fresh: check only (nothing is sent, the file is not written)"
  if [[ ! -e "$OUT" ]]; then
    echo "   no record: a run would declare 10 classes, deploy Faucet, PavedToken, MockRouter, Vault, Economy, Setup,"
    echo "   Challenge, Collection, Story, Avatar and the smoke's VRF mock, seed the pool, stake, wire, define quests $FRESH_QUEST_IDS and achievements 1 to ${#FRESH_ACHIEVEMENTS[@]} on Setup (v1 and v2a) with the shop"
    echo "   (Economy.set_seller(Setup), set_pack x 4), the skin prices of theme(s) ${FRESH_SKIN_THEMES[*]} (set_skin_price x 19 each) and their cobbles, write ${OUT#"$ROOT/"}, then smoke (a paid spawn, a build, a"
    echo "   surrender reported to Setup, claim_tutorial once, pack 1 bought, a skin bought, all drawing from the mock), then set"
    echo "   Challenge's VRF provider to Cartridge's"
  else
    echo "   definitions (definitions_tx): quests $FRESH_QUEST_IDS and achievements 1 to ${#FRESH_ACHIEVEMENTS[@]} on Setup, v1 and v2a, then the shop (Economy.set_seller(Setup), set_pack x 4: 50 cobbles for 5 USDC, 100 for 9, 500 for 40, 1,000 for 70), then the skin prices (set_skin_price x 19 for each of the theme(s) ${FRESH_SKIN_THEMES[*]}, the rarity table), then their cobbles (set_quest_cobbles x 13, set_achievement_cobbles x 15); a run sends the ones Setup lacks and reads each back as specified"
    echo "   story (story_tx): campaign(s) ${FRESH_STORY_CAMPAIGNS[*]%% *} and ${#FRESH_STORY_LEVELS[@]} level(s) on Story (set_campaign, set_level); a run sends the ones Story lacks and reads each back"
    echo "   avatar (avatar_tx): the parts ($FRESH_AVATAR_PARTS), the price bounds $FRESH_AVATAR_PRICE_MIN to $FRESH_AVATAR_PRICE_MAX and the first ${FRESH_AVATAR_FREE[*]} items of each part free on Avatar; a run sends what Avatar lacks and reads it back"
    for key in declare_tx Faucet.deploy_tx PavedToken.deploy_tx MockRouter.deploy_tx Vault.deploy_tx pool_tx stake_tx \
        Economy.deploy_tx minter_tx Setup.deploy_tx Challenge.deploy_tx Collection.deploy_tx Story.deploy_tx Avatar.deploy_tx wiring_tx guardian_tx \
        vrf_tx definitions_tx story_tx avatar_tx \
        smoke.spawn_tx smoke.build_tx smoke.surrender_tx smoke.claim_tx smoke.pack_tx smoke.skin_tx smoke.settle_tx smoke.provider_tx; do
      tx="$(fr_get "$key")"
      if [[ -n "$tx" ]]; then echo "   $key $tx: $(repoint_tx_status "$tx")"; else echo "   $key: not sent; a run would send it unless what it sends has landed"; fi
    done
    if ((FRESH_COMPLETE)); then echo "   complete: a run would send nothing"; fi
  fi
  echo "== fresh: check only: every check passed; nothing was sent"
}

SPEC_VERSION="$(rpc starknet_specVersion '[]')" || die "no node answers at $RPC_LABEL; start: starknet-devnet --host 127.0.0.1 --port 5050 --seed 42"
# The spec version, not the URL, tells runs on different endpoints apart (printed on every estimate line too).
SPEC_VERSION="$(pyj 'd["result"] if isinstance(d.get("result"), str) and len(d["result"]) < 40 else "unknown"' <<<"$SPEC_VERSION" 2>/dev/null || echo unknown)"
echo "== node $RPC_LABEL, spec $SPEC_VERSION"
CHAIN_ID="$(rpc starknet_chainId '[]' | pyj 'd["result"]')"
# Sepolia's chain id is SN_SEPOLIA (starknet-devnet answers the same, so the rehearsal passes this check too).
[[ "$NETWORK" != "sepolia" || "$CHAIN_ID" == "0x534e5f5345504f4c4941" ]] || die "the node's chain id $CHAIN_ID is not SN_SEPOLIA"
# The deployer: on sepolia the funded account, which must already be deployed on the node; on devnet and the
# rehearsal the node's first predeployed account (public dev keys): its key goes to sncast's temporary accounts file
# (devnet) or to the signer's environment (--rehearse).
TEST_ACCOUNTS=()
if [[ "$NETWORK" == "sepolia" && "$REHEARSE" == 0 ]]; then
  DEPLOYER="$SEND_ADDRESS"
  DEPLOYER_LABEL="\$STARKNET_ACCOUNT_ADDRESS"
  rpc starknet_getClassHashAt "[\"latest\",\"$DEPLOYER\"]" | class_hash_answer ||
    die "the deployer account $DEPLOYER_LABEL is not deployed on $RPC_LABEL"
else
  read -r DEPLOYER KEY < <(rpc devnet_getPredeployedAccounts '{"with_balance":false}' |
    pyj 'd["result"][0]["address"]+" "+d["result"][0]["private_key"]') ||
    die "node has no predeployed accounts (not a starknet-devnet?)"
  # The other predeployed accounts get the devnet test PAVED (P-38, devnet only); only addresses are read, never keys.
  if [[ "$NETWORK" == "devnet" ]]; then
    while read -r addr; do
      [[ -n "$addr" ]] && TEST_ACCOUNTS+=("$addr")
    done < <(rpc devnet_getPredeployedAccounts '{"with_balance":false}' | pyj '"\n".join("0x%064x" % int(a["address"], 16) for a in d["result"][1:])')
  fi
  if ((USE_SIGNER)); then
    SEND_ADDRESS="$DEPLOYER"
    SEND_KEY="$KEY"
    SEND_NETWORK=devnet
  else
    sncast "${ACCOUNTS[@]}" account import --url "$RPC_URL" --name dev --address "$DEPLOYER" \
      --private-key "$KEY" --type oz --silent >/dev/null
  fi
  KEY=""
  DEPLOYER_LABEL="$DEPLOYER"
fi
# The deployer as the signer's calldata (`@account`: its address from the signer's environment) or sncast's, and as an
# integer for the comparisons below (read on stdin: no python3 argv).
if ((USE_SIGNER)); then DEPLOYER_ARG="@account"; else DEPLOYER_ARG="$DEPLOYER"; fi
DEPLOYER_INT="$(printf '%s' "$DEPLOYER" | python3 -I -c 'import sys;print(int(sys.stdin.read(),16))')"
echo "   chain id $CHAIN_ID, deployer $DEPLOYER_LABEL"
# The fresh path: the deployment file it writes, before anything is built or sent (a live one is refused).
if ((FRESH_RECORD)); then fresh_file_check; fi

# deployed_at: the main commit whose contract sources are deployed. The build compiles the working
# tree, so the working tree (not HEAD) must equal the merge base with origin/main on the contract
# sources, with no untracked source file either.
if [[ "$UNMERGED" == 1 || "$REHEARSE" == 1 ]]; then
  DEPLOYED_AT="unmerged-$(git -C "$ROOT" rev-parse HEAD)"
  if ((ESTIMATE_ONLY)); then
    echo "== unmerged, sepolia rehearsal on a local node: the working tree's classes are estimated, nothing is deployed"
  elif ((REPOINT)); then
    echo "== unmerged, sepolia rehearsal on a local node: the working tree's classes repoint the deployment of $REPOINT_FILE"
  elif ((D18)); then
    echo "== unmerged, sepolia rehearsal on a local node: the working tree's D-18 classes upgrade the deployment of $REPOINT_FILE"
  elif ((UPGRADE_CHALLENGE)); then
    echo "== unmerged, sepolia rehearsal on a local node: the working tree's Challenge class upgrades the deployment of $REPOINT_FILE"
  else
    echo "== unmerged$( ((REHEARSE)) && echo ', sepolia rehearsal on a local node'): the working tree is deployed, the file goes to $OUT"
  fi
else
  DEPLOYED_AT="$(git -C "$ROOT" merge-base HEAD origin/main)" || die "no merge base of HEAD with origin/main (git fetch origin main)"
  git -C "$ROOT" diff --quiet "$DEPLOYED_AT" -- contracts/src contracts/Scarb.toml contracts/Scarb.lock ||
    die "contract sources differ from origin/main (merge base ${DEPLOYED_AT:0:12}): deploy from main-equivalent sources (or --unmerged)"
  [[ -z "$(git -C "$ROOT" ls-files --others --exclude-standard -- contracts/src)" ]] ||
    die "untracked files in contracts/src: deploy from main-equivalent sources (or --unmerged)"
fi

if ((USE_SIGNER)); then
  echo "== signer"
  [[ -n "$NODE_BIN" && "$("$NODE_BIN" --version 2>/dev/null)" == v24.* ]] || die "the signer needs Node 24 on the PATH"
  # Inside scripts/signer/ only, from its lockfile, without install scripts: never a global install.
  (cd "$ROOT/scripts/signer" && npm ci --ignore-scripts --no-audit --no-fund --loglevel=error >/dev/null) ||
    die "npm ci in scripts/signer failed"
  echo "   scripts/signer installed (npm ci), SIGNER_NETWORK=$SEND_NETWORK"
fi

echo "== build"
cd "$ROOT/contracts"
RAYON_NUM_THREADS=1 scarb --release build >/dev/null
# --repoint: what is deployed and what already landed, read before anything is estimated or sent.
((REPOINT)) && repoint_state
((D18)) && d18_state
((UPGRADE_CHALLENGE)) && uc_state
if ((FRESH_RECORD)); then fresh_classes_check; fi
if [[ -n "$FRESH_GUARDIAN_HOOK" ]]; then
  CHALLENGE="$FRESH_GUARDIAN_CHALLENGE"
  "fresh_guardian_$FRESH_GUARDIAN_HOOK"
  exit 0
fi
if [[ -n "$FRESH_DEFINITIONS_HOOK" ]]; then
  SETUP="$FRESH_DEFINITIONS_SETUP"
  ECONOMY="$FRESH_DEFINITIONS_ECONOMY"
  "fresh_definitions_$FRESH_DEFINITIONS_HOOK"
  exit 0
fi

# Funding (S-1c, S-1d), sepolia and its rehearsal: the deployer's STRK balance, a public read (balance_of of `@account`,
# so the address stays out of argv and output), printed as an amount only. Before its first declare, a real run
# estimates the declare of each class the node does not have yet (`signer estimate declare`, read-only, as in
# --estimate-only) and needs a balance of at least 1.25 x the sum of those estimates + FUNDING_MARGIN_STRK, the
# deploys, invokes and smoke that follow (see below). A rerun after a partial deploy then needs only what is left. When
# an estimate cannot be had (the signer's retries spent, or the node's error), the need falls back to
# FUNDING_FLOOR_STRK: 200 STRK, about 1.4 x the 142.6 STRK that Sepolia's estimates of the nine undeclared classes
# added up to on 2026-10-11 (Daily alone 38.8). Below the need, the run stops before it sends anything. --estimate-only
# prints the same need and balance and sends nothing either way.
# Each declare is also sent with resource bounds above its estimate: starknet.js 10.8 adds 50% to the amount and 50% to
# the price of each resource (2.25 x the estimate), and the tip is paid on the bounded L2 gas (about 1% more on Sepolia
# in S-1c), so the node wants up to MAX_FEE_FACTOR = 2.3 x the estimate in the balance when it is sent. The need is
# raised to the largest of those moments when one is above the rule (a rerun left with Tutorial and Lobby only: 1.25 x
# their 69.4 STRK + 20 is 106.8 STRK, but Lobby's bounds want 76.1 STRK after Tutorial's 36.3).
# FUNDING_MARGIN_STRK, the deploys, invokes and smoke after the declares: the --rehearse run of S-1d on starknet-devnet
# 0.10.0 sent 24 of them for 137,224,560 L2 gas and 12,384 L1 data gas in all, about 1.1 STRK at the 8.2 x 10^9 FRI per
# L2 gas of Sepolia's declare estimates on 2026-10-11 (Tutorial: 36.32 STRK for 4,430,587,392 L2 gas). 20 STRK leaves
# room for a gas price about 18 times higher.
STRK_TOKEN=0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d
FUNDING_FLOOR_STRK=200
FUNDING_MARGIN_STRK=20
# Test hook (scripts/test-deploy-url.sh), --estimate-only alone: the class files come from ESTIMATE_RELEASE_DIR. It
# changes what is estimated, never what is sent: nothing is sent in that mode. A real run estimates and declares the
# files of RELEASE_DIR, whatever the environment says.
ESTIMATE_DIR="$RELEASE_DIR"
if [[ "$ESTIMATE_ONLY" == 1 && -n "${ESTIMATE_RELEASE_DIR:-}" ]]; then ESTIMATE_DIR="$ESTIMATE_RELEASE_DIR"; fi
# The classes a run declares, in deploy order; --repoint declares the E-9 MockRouter and Economy only, --d18 the D-18
# Account, Daily, Tutorial and Lobby, --upgrade-challenge the new Challenge.
FUNDING_CLASSES=(Challenge Setup Faucet PavedToken MockRouter Vault Economy Collection Story Avatar)
((REPOINT)) && FUNDING_CLASSES=(MockRouter Economy)
((D18)) && FUNDING_CLASSES=(Account Daily Tutorial Lobby)
((UPGRADE_CHALLENGE)) && FUNDING_CLASSES=(Challenge)
if ((USE_SIGNER)); then
  v STRK_RAW call "$STRK_TOKEN" balance_of "$DEPLOYER_ARG"
  read -r BAL_LOW BAL_HIGH <<<"$STRK_RAW"
  STRK_BALANCE="$(python3 -I -c 'import sys;print(int(sys.argv[1],16)+(int(sys.argv[2],16)<<128))' "$BAL_LOW" "$BAL_HIGH")"
  echo "== funding: deployer STRK balance $(python3 -I -c 'import sys;print(f"{int(sys.argv[1])/1e18:.2f}")' "$STRK_BALANCE") STRK"
  : >"$WORK_DIR/fees"
  if ((ESTIMATE_ONLY)); then
    echo "== estimate only (nothing is sent): each declare in deploy order, spec $SPEC_VERSION${ESTIMATE_ARGS[*]:+, diagnostic: ${ESTIMATE_ARGS[*]}}"
  else
    echo "== funding: estimating each declare still to send, in deploy order (read-only, nothing is sent)"
  fi
  # The class-hash call below discards stderr (and runs in a subshell), so without sncast every class would read
  # "declared unknown" and the run would end without the cause: resolve sncast once here, bare, so it is printed.
  sncast_resolve || exit
  failed=0
  for name in "${FUNDING_CLASSES[@]}"; do
    sierra="$ESTIMATE_DIR/paved_$name.contract_class.json"
    casm="$ESTIMATE_DIR/paved_$name.compiled_contract_class.json"
    [[ -f "$sierra" && -f "$casm" ]] || die "no release class files for $name in ${ESTIMATE_DIR#"$ROOT/"}"
    sizes="sierra $(wc -c <"$sierra" | tr -d ' ') B, casm $(pyj 'len(d["bytecode"])' <"$casm") felts"
    # The class hash sncast computes, to ask the node whether it has the class (unknown when sncast gives none).
    class_hash="$( { sc sncast utils class-hash --contract-name "$name" | pyj 'd["class_hash"]'; } 2>/dev/null || true)"
    declared=unknown
    if [[ "$class_hash" =~ ^0x[0-9a-fA-F]+$ ]]; then
      if rpc starknet_getClass "[\"latest\",\"$class_hash\"]" | class_declared; then declared=yes; else declared=no; fi
    fi
    # A real run skips a class the node has: declareIfNot will not send it.
    if [[ "$ESTIMATE_ONLY" == 0 && "$declared" == yes ]]; then
      echo "   estimate $name: declared already, nothing to send"
      continue
    fi
    status=0
    out="$(run_signer estimate declare --sierra "$sierra" --casm "$casm" ${ESTIMATE_ARGS[@]+"${ESTIMATE_ARGS[@]}"})" || status=$?
    out="$(redact_text "$out")"
    line=""
    while IFS= read -r l; do [[ "$l" == "{"* ]] && line="$l"; done <<<"$out"
    if [[ -z "$line" ]]; then
      (( ${#out} <= 800 )) || out="${out: -800}"
      echo "   estimate $name: spec $SPEC_VERSION, $sizes, declared $declared: signer failed (exit $status): ${out//$'\n'/ | }"
      failed=$((failed + 1))
      continue
    fi
    python3 -I - "$name" "$SPEC_VERSION" "$sizes" "$declared" "$line" "$WORK_DIR/fees" <<'PY' || failed=$((failed + 1))
import json, sys
name, spec, sizes, declared, raw, fees = sys.argv[1:]
d = json.loads(raw)
r = d.get("request", {})
head = f"   estimate {name}: spec {spec}, {sizes}, request {r.get('request_bytes', '?')} B, declared {declared}"
if d.get("ok"):
    e = d["estimate"]
    n = lambda k: int(e.get(k, "0x0"), 16)
    print(f"{head}: ok, overall_fee {n('overall_fee')} {e.get('unit', '?')} (l1_gas {n('l1_gas_consumed')}, "
          f"l1_data_gas {n('l1_data_gas_consumed')}, l2_gas {n('l2_gas_consumed')})")
    # Only a class still to declare counts toward the need.
    if declared != "yes":
        with open(fees, "a") as f:
            f.write(f"{n('overall_fee')}\n")
    sys.exit(0)
answer = {k: d[k] for k in ("http_status", "error", "body", "body_bytes", "transport") if k in d}
# A class the node has already: nothing to declare, and a real run skips it (declareIfNot). Not a failure.
if "is already declared" in json.dumps(answer.get("error", {})):
    print(f"{head}: already declared on the node (a real run skips it): {json.dumps(answer)[:300]}")
    sys.exit(0)
print(f"{head}: error {json.dumps(answer)[:1500]}")
sys.exit(1)
PY
  done
  # The need: 1.25 x the estimates of the classes still to declare + the margin, or the floor when an estimate failed.
  # Integers in FRI (1 STRK = 10^18); exit 1 when the balance is below the need.
  funded=0
  python3 -I - "$WORK_DIR/fees" "$STRK_BALANCE" "$FUNDING_FLOOR_STRK" "$FUNDING_MARGIN_STRK" "$failed" <<'PY' || funded=$?
import sys
fees = [int(x) for x in open(sys.argv[1]).read().split()]
balance, floor, margin, failed = int(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5])
strk = lambda fri: f"{fri / 10**18:.2f} STRK"
total = sum(fees)
if failed:
    need = floor * 10**18
    print(f"== funding: {failed} estimate(s) could not be had: the need falls back to the {floor} STRK floor")
else:
    need = -(-total * 5 // 4) + margin * 10**18
    print(f"== funding: {len(fees)} class(es) to declare, estimated at {strk(total)}; "
          f"need 1.25 x {strk(total)} + {margin} STRK margin = {strk(need)}")
    # The peak: when each declare is sent, what is left (the balance less 1.25 x the declares before it) must cover
    # its bounds, 2.3 x its estimate (MAX_FEE_FACTOR above), with the margin still kept for what follows.
    peak, before = 0, 0
    for fee in fees:
        peak = max(peak, -(-before * 5 // 4) + -(-fee * 23 // 10))
        before += fee
    peak += margin * 10**18
    if peak > need:
        print(f"   the bounds of one declare need more: 2.3 x its estimate, after 1.25 x the declares before it, + the margin = {strk(peak)}")
        need = peak
print(f"   deployer STRK balance {strk(balance)}: {'covers' if balance >= need else 'BELOW'} the need of {strk(need)}")
sys.exit(0 if balance >= need else 1)
PY
  if ((ESTIMATE_ONLY)); then
    if [[ "$failed" != 0 ]]; then
      echo "== estimate only: $failed of ${#FUNDING_CLASSES[@]} classes failed (neither an estimate nor already declared); nothing was sent"
      exit 1
    fi
    echo "== estimate only: each of the ${#FUNDING_CLASSES[@]} classes estimated or already declared; nothing was sent"
    exit 0
  fi
  if [[ "$funded" != 0 && "$REPOINT" == 1 && "$RP_COMPLETE" == 1 ]]; then
    echo "   --repoint: nothing is left to send, so the need does not apply"
  elif [[ "$funded" != 0 && "$D18" == 1 && "$D18_COMPLETE" == 1 ]]; then
    echo "   --d18: nothing is left to send, so the need does not apply"
  elif [[ "$funded" != 0 && "$UPGRADE_CHALLENGE" == 1 && ( "$UC_COMPLETE" == 1 || "$UC_NOTHING_LEFT" == 1 ) ]]; then
    echo "   --upgrade-challenge: nothing is left to send, so the need does not apply"
  elif [[ "$funded" != 0 && "$FRESH_COMPLETE" == 1 ]]; then
    echo "   fresh: the record is complete, nothing is left to send, so the need does not apply"
  else
    [[ "$funded" == 0 ]] || die "the deployer's STRK balance is below the need above: fund it before deploying; nothing was sent"
  fi
fi
if ((REPOINT)); then
  repoint_run
  exit 0
fi
if ((D18)); then
  d18_run
  exit 0
fi
if ((UPGRADE_CHALLENGE)); then
  uc_run
  exit 0
fi

if ((FRESH_CHECK_ONLY)); then
  fresh_check_only
  exit 0
fi
# The record, before the first send (sepolia and its rehearsal): the file holds `network`, `chain_id` and `fresh` alone
# until step 5 (no `contracts` key: nothing a client reads), and the salt is kept for every rerun.
if ((FRESH_RECORD)); then
  if [[ ! -e "$OUT" ]]; then
    mkdir -p "$(dirname "$OUT")"
    python3 -I - "$OUT" "$NETWORK" "$CHAIN_ID" <<'PY'
import json, sys
path, network, chain_id = sys.argv[1:]
with open(path, "w") as f:
    json.dump({"network": network, "chain_id": chain_id, "fresh": {}}, f, indent=2)
    f.write("\n")
PY
  fi
  [[ -n "$(fr_get salt)" ]] || rp_set "salt=$SALT" "at=$DEPLOYED_AT"
  SALT="$(fr_get salt)"
  echo "== fresh: record ${OUT#"$ROOT/"} (salt and each transaction kept there as it is sent)"
fi

echo "== declare"
# A declare a stopped run sent: its receipt first (the declares go one at a time, so only the last can be in flight).
fr_settled declare_tx || true
RECORD_SENDING=declare_tx
CHALLENGE_CLASS="$(declare_class Challenge)"
SETUP_CLASS="$(declare_class Setup)"
USDC_CLASS="$(declare_class Faucet)"
PAVED_CLASS="$(declare_class PavedToken)"
ROUTER_CLASS="$(declare_class MockRouter)"
VAULT_CLASS="$(declare_class Vault)"
ECONOMY_CLASS="$(declare_class Economy)"
COLLECTION_CLASS="$(declare_class Collection)"
STORY_CLASS="$(declare_class Story)"
# The VRF mock (#638): devnet only.
VRF_CLASS=""
# The VRF mock: devnet's provider; on Sepolia the smoke's only, never in the deployment file (#645, fresh_vrf_step)
if [[ "$NETWORK" == "devnet" || "$NETWORK" == "sepolia" ]]; then VRF_CLASS="$(declare_class MockVrfProvider)"; fi
AVATAR_CLASS="$(declare_class Avatar)"
RECORD_SENDING=""
fr_set "classes.Challenge=$(felt64 "$CHALLENGE_CLASS")" "classes.Setup=$(felt64 "$SETUP_CLASS")" \
  "classes.Faucet=$(felt64 "$USDC_CLASS")" "classes.PavedToken=$(felt64 "$PAVED_CLASS")" \
  "classes.MockRouter=$(felt64 "$ROUTER_CLASS")" "classes.Vault=$(felt64 "$VAULT_CLASS")" \
  "classes.Economy=$(felt64 "$ECONOMY_CLASS")" "classes.Collection=$(felt64 "$COLLECTION_CLASS")" \
  "classes.Story=$(felt64 "$STORY_CLASS")" "classes.Avatar=$(felt64 "$AVATAR_CLASS")"

USDC_UNIT=1000000
PAVED_UNIT=1000000000000000000
POOL_USDC=$((10000 * USDC_UNIT))
POOL_PAVED="$(python3 -I -c "print(800000 * $PAVED_UNIT)")"
# The devnet test PAVED (P-38, O-54): 1,000 PAVED per predeployed account other than the deployer, from the owner's
# stake (never the pool: it sets the launch rate). Devnet only; no faucet exists.
TEST_PAVED="$(python3 -I -c "print(1000 * $PAVED_UNIT)")"
(( 1000 * ${#TEST_ACCOUNTS[@]} < 199000 )) ||
  die "${#TEST_ACCOUNTS[@]} predeployed accounts would take 1,000 PAVED each, the owner's whole 199,000 stake: use fewer than 199"
# The Vault (vPAVED, P-56): 1,000 PAVED of dead shares for the Vault itself (the inflation defence: nothing can redeem
# them), then the owner's stake, 199,000 - 1,000 x N; its exit fee at the default, 500 bps (owner, 2026-10-14).
DEAD_PAVED="$(python3 -I -c "print(1000 * $PAVED_UNIT)")"
STAKE_PAVED="$(python3 -I -c "print((199000 - 1000 * ${#TEST_ACCOUNTS[@]}) * $PAVED_UNIT)")"
VAULT_PAVED="$(python3 -I -c "print($DEAD_PAVED + $STAKE_PAVED)")"
EXIT_FEE=500
# Economy: the decided configuration (burn 7,368 bps, so 70 % of the price burned after the pool's 5 %, sigma 0,
# slope 12,220 bps, cap 5, target 1,000,000 PAVED; P-46; the referral 500 bps of the price, out of the Vault's
# 2,632, P-56), the initial mean (3,980 points x 1,000) and the launch rate after the pool's fee (economy.md
# section 5). The wiring step reads each back.
CONFIG=(7368 0 12220 5 "$(python3 -I -c "print(1000000 * $PAVED_UNIT)")" 500)
MEAN0=3980000
LAUNCH_RATE=76000000000000000000000000000000

echo "== deploy"
USDC="$(fresh_deploy Faucet "$USDC_CLASS")"
PAVED="$(fresh_deploy PavedToken "$PAVED_CLASS" "$DEPLOYER_ARG" "$DEPLOYER_ARG")"
ROUTER="$(fresh_deploy MockRouter "$ROUTER_CLASS" "$PAVED" "$USDC")"
VAULT="$(fresh_deploy Vault "$VAULT_CLASS" "$DEPLOYER_ARG" "$PAVED" "$EXIT_FEE")"
VRF=""
if [[ "$NETWORK" == "devnet" || "$NETWORK" == "sepolia" ]]; then VRF="$(fresh_deploy MockVrfProvider "$VRF_CLASS")"; fi
# The file names the mock on devnet only: on Sepolia the client draws through Cartridge's provider (`vrfProvider`)
VRF_FILE=""
[[ "$NETWORK" == "devnet" ]] && VRF_FILE="$VRF"

echo "== pool and stake"
# The launch pool, in the router's token order, from the initial supply and the Faucet's premint to the deployer (its
# constructor, outside the faucet's caps: S-1's audit). A pool a stopped run sent: its receipt first; a seeded pool is
# not seeded again.
# A complete record (FRESH_COMPLETE) sends nothing and reads no launch state: its rerun keeps only what always holds
# (addresses, classes, owners, wiring(), router(), the definitions), since live play and the keeper move the rest.
fr_settled pool_tx || true
if ((FRESH_COMPLETE)); then
  RESERVES=()
else
  v RAW call "$ROUTER" reserves
  read -r -a RESERVES <<<"$RAW"
fi
if ((FRESH_COMPLETE)); then
  echo "   pool: complete record, not read again (tx $(fr_get pool_tx))"
elif [[ "$(hex_int "${RESERVES[0]}")" != 0 && "$(hex_int "${RESERVES[2]}")" != 0 ]]; then
  echo "   pool seeded already$( [[ -n "$(fr_get pool_tx)" ]] && echo ", tx $(fr_get pool_tx)")"
else
  read -r PREMINT_LOW PREMINT_HIGH <<<"$(call "$USDC" balance_of "$DEPLOYER_ARG")"
  python3 -I -c 'import sys;sys.exit(0 if int(sys.argv[1],16)+(int(sys.argv[2],16)<<128)>=int(sys.argv[3]) else 1)' \
    "$PREMINT_LOW" "$PREMINT_HIGH" "$POOL_USDC" ||
    die "the deployer does not hold the Faucet's 10,000 USDC premint"
  # The approvals and the pool: one multicall through the signer, one invoke each on devnet.
  if python3 -I -c 'import sys;sys.exit(0 if int(sys.argv[1],16)<int(sys.argv[2],16) else 1)' "$PAVED" "$USDC"; then
    LIQUIDITY="$(u256 "$POOL_PAVED") $(u256 "$POOL_USDC")"
  else
    LIQUIDITY="$(u256 "$POOL_USDC") $(u256 "$POOL_PAVED")"
  fi
  RECORD_SENDING=pool_tx
  invoke_all "$PAVED approve $ROUTER $(u256 "$POOL_PAVED")" "$USDC approve $ROUTER $(u256 "$POOL_USDC")" \
    "$ROUTER add_liquidity $LIQUIDITY"
  RECORD_SENDING=""
fi
# The Vault's dead shares and the owner's stake, one multicall, before Economy can buy anything (E1's audit; P-56: the
# margin's PAVED reaches the Vault from the first purchase, and the dead shares keep its supply from ever being 0).
fr_settled stake_tx || true
DEAD=""
STAKED=""
if ((FRESH_COMPLETE == 0)); then
  v RAW call "$VAULT" balance_of "$VAULT"
  DEAD="$(u256_of $RAW)"
  v RAW call "$VAULT" balance_of "$DEPLOYER_ARG"
  STAKED="$(u256_of $RAW)"
fi
if ((FRESH_COMPLETE)); then
  echo "   stake: complete record, not read again (tx $(fr_get stake_tx))"
elif [[ "$DEAD" == "$DEAD_PAVED" && "$STAKED" == "$STAKE_PAVED" ]]; then
  echo "   dead shares and stake made already$( [[ -n "$(fr_get stake_tx)" ]] && echo ", tx $(fr_get stake_tx)")"
elif [[ "$DEAD" == 0 && "$STAKED" == 0 ]]; then
  RECORD_SENDING=stake_tx
  invoke_all "$PAVED approve $VAULT $(u256 "$VAULT_PAVED")" "$VAULT deposit $(u256 "$DEAD_PAVED") $VAULT" \
    "$VAULT deposit $(u256 "$STAKE_PAVED") $DEPLOYER_ARG"
  RECORD_SENDING=""
else
  die "the Vault holds $DEAD dead and $STAKED staked vPAVED base units, neither none nor the launch amounts"
fi
# P-38: the test PAVED, from what the owner keeps outside the stake. Devnet only: off devnet the list is empty, and a
# non-empty one is refused here as well.
[[ "$NETWORK" == "devnet" || "${#TEST_ACCOUNTS[@]}" == 0 ]] || die "refusing to transfer test PAVED on $NETWORK (devnet only)"
if [[ "$NETWORK" == "devnet" ]]; then
  for acct in ${TEST_ACCOUNTS[@]+"${TEST_ACCOUNTS[@]}"}; do
    invoke "$PAVED" transfer "$acct" $(u256 "$TEST_PAVED") >/dev/null
  done
  echo "   test PAVED: 1,000 to each of ${#TEST_ACCOUNTS[@]} predeployed accounts, stake $((199000 - 1000 * ${#TEST_ACCOUNTS[@]})) PAVED"
fi
read -r -a POOL_KEY <<<"$(call "$ROUTER" pool_key)"
[[ "${#POOL_KEY[@]}" == 5 ]] || die "MockRouter.pool_key returned ${#POOL_KEY[@]} felts, expected 5"

ECONOMY="$(fresh_deploy Economy "$ECONOMY_CLASS" "$DEPLOYER_ARG" "$PAVED" "$USDC" "$VAULT" "$ROUTER" \
  "${POOL_KEY[@]}" 0 0 "${CONFIG[@]}" "$MEAN0" $(u256 "$LAUNCH_RATE"))"
fr_settled minter_tx || true
v RAW call "$PAVED" minter
if [[ "$(hex_int "$RAW")" != "$(hex_int "$ECONOMY")" ]]; then
  RECORD_SENDING=minter_tx
  invoke "$PAVED" set_minter "$ECONOMY" >/dev/null
  RECORD_SENDING=""
fi
[[ "$(hex_int "$(call "$PAVED" minter)")" == "$(hex_int "$ECONOMY")" ]] || die "PavedToken.minter() is not Economy"
[[ "$(hex_int "$(call "$PAVED" admin)")" == 0 ]] || die "PavedToken.admin() is not zero after set_minter"
echo "   PavedToken: minter Economy, admin 0"
# The whole initial supply is in the pool and the Vault: 1,000,000 PAVED, none left with the deployer. A launch-state
# check: a rerun after the smoke's game (minted, swapped and burned since) skips it.
if [[ -z "$(fr_get smoke.spawn_tx)" ]]; then
  read -r SUPPLY_LOW SUPPLY_HIGH <<<"$(call "$PAVED" total_supply)"
  [[ "$(python3 -I -c 'import sys;print(int(sys.argv[1],16)+(int(sys.argv[2],16)<<128))' "$SUPPLY_LOW" "$SUPPLY_HIGH")" == "$(python3 -I -c "print(1000000 * $PAVED_UNIT)")" ]] ||
    die "PavedToken.total_supply() is not 1,000,000 PAVED"
  read -r HELD_LOW HELD_HIGH <<<"$(call "$PAVED" balance_of "$DEPLOYER_ARG")"
  [[ "$(hex_int "$HELD_LOW")" == 0 && "$(hex_int "$HELD_HIGH")" == 0 ]] || die "the deployer still holds PAVED after the pool and the stake"
  for acct in ${TEST_ACCOUNTS[@]+"${TEST_ACCOUNTS[@]}"}; do
    read -r B_LOW B_HIGH <<<"$(call "$PAVED" balance_of "$acct")"
    [[ "$(python3 -I -c 'import sys;print(int(sys.argv[1],16)+(int(sys.argv[2],16)<<128))' "$B_LOW" "$B_HIGH")" == "$TEST_PAVED" ]] ||
      die "test account $acct does not hold 1,000 PAVED"
    echo "   test account $acct holds 1,000 PAVED"
  done
  echo "   PavedToken: total supply 1,000,000 PAVED, deployer holds 0"
else
  echo "   launch supply checks skipped: the smoke's game has moved PAVED since (tx $(fr_get smoke.spawn_tx))"
fi
if ((FRESH_COMPLETE == 0)); then
  read -r STAKED_LOW STAKED_HIGH <<<"$(call "$VAULT" balance_of "$DEPLOYER_ARG")"
  [[ "$(python3 -I -c 'import sys;print(int(sys.argv[1],16)+(int(sys.argv[2],16)<<128))' "$STAKED_LOW" "$STAKED_HIGH")" == "$STAKE_PAVED" ]] ||
    die "the owner's stake in the Vault is not 199,000 - 1,000 x ${#TEST_ACCOUNTS[@]} vPAVED"
  read -r DEAD_LOW DEAD_HIGH <<<"$(call "$VAULT" balance_of "$VAULT")"
  [[ "$(python3 -I -c 'import sys;print(int(sys.argv[1],16)+(int(sys.argv[2],16)<<128))' "$DEAD_LOW" "$DEAD_HIGH")" == "$DEAD_PAVED" ]] ||
    die "the Vault's dead shares are not 1,000 vPAVED"
  echo "   Vault: dead shares 1,000 vPAVED, owner's stake $((199000 - 1000 * ${#TEST_ACCOUNTS[@]})) vPAVED"
fi

# The quests and achievements (D-24): Challenge reports each game over to Setup, which accepts reporters only.
SETUP="$(fresh_deploy Setup "$SETUP_CLASS" "$DEPLOYER_ARG")"
CHALLENGE="$(fresh_deploy Challenge "$CHALLENGE_CLASS" "$DEPLOYER_ARG" "$USDC" "$SETUP")"
# The game NFT: without it every spawn reverts ('Challenge: collection not set'), so it is wired before the smoke.
COLLECTION="$(fresh_deploy Collection "$COLLECTION_CLASS" "$DEPLOYER_ARG")"
# Story mode (docs/architecture/story-mode.md): the levels and the runs; Setup pays its stars, so it is a reporter.
STORY="$(fresh_deploy Story "$STORY_CLASS" "$DEPLOYER_ARG" "$SETUP")"
# The avatar (docs/architecture/avatar-chain.md): the items and the avatars; Setup debits the Cobbles of an item for it,
# so it is a spender (ISetupSpend).
AVATAR="$(fresh_deploy Avatar "$AVATAR_CLASS" "$DEPLOYER_ARG" "$SETUP")"

echo "== wire"
# Setup's reporter (Challenge), Economy's game (after the stake), Setup's wiring (D-25 E: Economy and Collection, read by
# Challenge in one call at spawn and at game over), Collection's minter (Challenge; no Tutorial minter since D-21). One
# multicall through the signer of what is still missing, one invoke each on devnet.
fr_settled wiring_tx || true
WIRING_CALLS=()
v WIRING_RAW fresh_wiring_calls
while IFS= read -r spec; do [[ -n "$spec" ]] && WIRING_CALLS+=("$spec"); done <<<"$WIRING_RAW"
if [[ "${#WIRING_CALLS[@]}" == 0 ]]; then
  echo "   wired already$( [[ -n "$(fr_get wiring_tx)" ]] && echo ", tx $(fr_get wiring_tx)")"
else
  RECORD_SENDING=wiring_tx
  invoke_all "${WIRING_CALLS[@]}"
  RECORD_SENDING=""
fi
v WIRING_RAW fresh_wiring_calls
[[ -z "$WIRING_RAW" ]] || die "after the wiring, still missing: $(cut -d' ' -f2 <<<"$WIRING_RAW" | tr '\n' ' ')"
[[ "$(hex_int "$(call "$CHALLENGE" setup)")" == "$(hex_int "$SETUP")" ]] || die "Challenge.setup() is not Setup"
echo "   Setup: its reporters Challenge (game overs) and Story (the stars of the levels), its spender Avatar (the items' Cobbles); Challenge.setup() is Setup"
echo "   Setup: wiring Economy and Collection; Collection: minter Challenge; Economy: game Challenge"
# Challenge's guardian (PM, 2026-10-14): the deployer, set in this run (fresh_guardian_step).
fresh_guardian_step
# Challenge's VRF provider (#645): the mock, on devnet and for the Sepolia smoke (fresh_vrf_step; Cartridge's after it).
fresh_vrf_step
# Economy's router and pool (its constructor's): the MockRouter, its key and the limit 0; the P-46 configuration and
# the initial mean, read back.
[[ "$(hex_int "$(call "$ECONOMY" router)")" == "$(hex_int "$ROUTER")" ]] || die "Economy.router() is not MockRouter"
if ((FRESH_COMPLETE)); then
  echo "   Economy: router MockRouter; pool, config and mean not read again (complete record: the owner and play may move them)"
else
read -r -a ECONOMY_POOL <<<"$(call "$ECONOMY" pool)"
python3 -I - "${ECONOMY_POOL[@]}" "${POOL_KEY[@]}" <<'PY' || die "Economy.pool() is not the MockRouter's key and the limit 0"
import sys
v = [int(x, 16) for x in sys.argv[1:]]
sys.exit(0 if len(v) == 12 and v[:5] == v[7:] and v[5:7] == [0, 0] else 1)
PY
read -r -a ECONOMY_CONFIG <<<"$(call "$ECONOMY" config)"
python3 -I - "${ECONOMY_CONFIG[@]}" "${CONFIG[@]}" <<'PY' || die "Economy.config() is not the P-46 configuration"
import sys
v = sys.argv[1:]
sys.exit(0 if len(v) == 12 and [int(x, 16) for x in v[:6]] == [int(x) for x in v[6:]] else 1)
PY
# The initial mean is a launch-state check: after the smoke's game a closed day may have moved it (a rerun).
read -r -a EMA_VIEW <<<"$(call "$ECONOMY" ema)"
if [[ -z "$(fr_get smoke.spawn_tx)" ]]; then
  [[ "$(hex_int "${EMA_VIEW[2]}")" == "$MEAN0" ]] || die "Economy.ema() mean is $(hex_int "${EMA_VIEW[2]}"), not MEAN0 $MEAN0"
fi
echo "   Economy: router MockRouter, pool its key with the limit 0, config burn 7368 sigma 0 slope 12220 cap 5 target 1,000,000 PAVED referral 500, mean $(hex_int "${EMA_VIEW[2]}") (MEAN0 $MEAN0)"
fi

echo "== definitions"
# The quests.md v1 and v2a sets on Setup, as its owner (D-24), in one multicall, before Setup's address reaches the deployment file's `contracts`
# (claim_tutorial is one-shot: #346's audit). Each definition is read from Setup's storage first: a defined one is
# not sent again (a definition cannot be sent twice: quiver refuses an id already defined).
fresh_definitions_step

echo "== story"
# The campaigns and levels on Story (FRESH_STORY_CAMPAIGNS, FRESH_STORY_LEVELS), as its owner, before its address reaches
# the deployment file.
fresh_story_step

echo "== avatar"
# The parts, the price bounds and the free base set on Avatar (FRESH_AVATAR_*), as its owner, before its address reaches
# the deployment file.
fresh_avatar_step

FIRST_DEPLOY_TX="$(fr_get Faucet.deploy_tx)"
[[ -n "$FIRST_DEPLOY_TX" ]] || FIRST_DEPLOY_TX="$(head -1 "$WORK_DIR/deploy-txs")"
DEPLOYED_BLOCK="$(rpc starknet_getTransactionReceipt "[\"$FIRST_DEPLOY_TX\"]" | pyj 'd["result"]["block_number"]')"
DECIMALS="$(hex_int "$(call "$USDC" decimals)")"
[[ "$DECIMALS" == 6 ]] || die "the Faucet has $DECIMALS decimals, expected 6"
SYMBOL="USDC"
echo "   token Faucet, $DECIMALS decimals, first deploy in block $DEPLOYED_BLOCK"

# The deployment file (F, the PM's rulings): the Faucet keyed `contracts.Faucet`, the game `contracts.Challenge`. Through
# the signer the record (`fresh`) is kept and the file replaced through a rename; devnet writes it whole. `deployed_at`
# is the commit of the first run (the record's `at`).
[[ -z "$(fr_get at)" ]] || DEPLOYED_AT="$(fr_get at)"
mkdir -p "$(dirname "$OUT")"
python3 -I - "$OUT" "$NETWORK" "$CHAIN_ID" "$RPC_LABEL" "$DEPLOYED_AT" "$DEPLOYED_BLOCK" \
  "$DECIMALS" "$SYMBOL" "Faucet=$USDC=$USDC_CLASS" \
  "PavedToken=$PAVED=$PAVED_CLASS" "MockRouter=$ROUTER=$ROUTER_CLASS" "Vault=$VAULT=$VAULT_CLASS" \
  "Economy=$ECONOMY=$ECONOMY_CLASS" "Challenge=$CHALLENGE=$CHALLENGE_CLASS" "Setup=$SETUP=$SETUP_CLASS" \
  "Collection=$COLLECTION=$COLLECTION_CLASS" "Story=$STORY=$STORY_CLASS" "MockVrfProvider=$VRF_FILE=$VRF_CLASS" \
  "Avatar=$AVATAR=$AVATAR_CLASS" \
  "test_paved=$TEST_PAVED" "${TEST_ACCOUNTS[@]}" <<'PY'
import json, os, sys, tempfile
out, network, chain_id, rpc_url, commit, block, decimals, symbol, *rest = sys.argv[1:]
items = [r for r in rest if r.count("=") == 2]
test_paved = next(r for r in rest if r.startswith("test_paved=")).split("=")[1]
test_accounts = [r for r in rest if "=" not in r]
c = {}
for item in items:
    name, address, class_hash = item.split("=")
    if address:
        # O-19: `0x` and 64 hex digits.
        c[name] = {"address": "0x%064x" % int(address, 16), "class_hash": "0x%064x" % int(class_hash, 16)}
# One key per contract (F): devnet and Sepolia both run the Faucet and MockRouter (P-39); no old mock Token since F.
names = ["Challenge", "Setup", "Collection", "Economy", "PavedToken", "Vault", "Faucet", "MockRouter", "Story", "Avatar"]
# The VRF mock (#638): devnet only, so only when deployed.
names += [k for k in ["MockVrfProvider"] if k in c]
doc = {
    "network": network,
    "chain_id": chain_id,
    "rpc_url": rpc_url,
    "deployed_at": commit,
    "deployed_block": int(block),
    # The ERC20 Challenge charges: USDC (the Faucet, on devnet and Sepolia).
    "token": {**c["Faucet"], "decimals": int(decimals), "symbol": symbol},
    "contracts": {k: c[k] for k in names},
}
if network == "devnet":
    # P-38: the PAVED each predeployed account (other than the deployer) received, in base units (18 decimals).
    doc["test_paved"] = {a: test_paved for a in test_accounts}
# The fresh path's record, kept after the keys a client reads.
if os.path.exists(out):
    previous = json.load(open(out))
    if "fresh" in previous:
        doc["fresh"] = previous["fresh"]
fd, tmp = tempfile.mkstemp(dir=os.path.dirname(out))
os.chmod(tmp, 0o644)
with os.fdopen(fd, "w") as f:
    json.dump(doc, f, indent=2)
    f.write("\n")
os.replace(tmp, out)
PY
echo "== wrote ${OUT#"$ROOT/"}"

# Reads `Economy.terms(game_id)` and prints `player recorded settled reward` (TermsView, E2's felt order:
# player, time, day, stake, reference, sigma, slope, cap, score, recorded, expired, settled, reward).
terms() {
  read -r -a T <<<"$(call "$ECONOMY" terms "$1")"
  echo "$(hex_int "${T[0]}") $(hex_int "${T[9]}") $(hex_int "${T[11]}") $(hex_int "${T[12]}")"
}

# Reads the owner and the token_uri of a game token and checks both: the owner is the deployer and the URI
# decodes to section 9's JSON for this id (name, Score, Over, Day attributes). Args: <token id> <expected over>.
check_token() {
  local id="$1" over="$2" owner uri
  owner="$(call "$COLLECTION" owner_of $(u256 "$id"))"
  [[ "$(hex_int "$owner")" == "$DEPLOYER_INT" ]] || die "Collection.owner_of($id) is not the player"
  uri="$(call "$COLLECTION" token_uri $(u256 "$id"))"
  python3 -I -c '
import sys, json, base64
felts = [int(x, 16) for x in sys.argv[1].split()]
n = felts[0]
data = b"".join(f.to_bytes(31, "big") for f in felts[1:1 + n])
pending, plen = felts[1 + n], felts[2 + n]
data += pending.to_bytes(plen, "big") if plen else b""
prefix = b"data:application/json;base64,"
assert data.startswith(prefix), "token_uri prefix"
doc = json.loads(base64.b64decode(data[len(prefix):]))
attrs = {a["trait_type"]: a["value"] for a in doc["attributes"]}
assert doc["name"] == "Paved Games #" + sys.argv[2], doc["name"]
assert attrs["Over"] == (sys.argv[3] == "true"), attrs
assert isinstance(attrs["Score"], int) and isinstance(attrs["Day"], int), attrs
print("   token", sys.argv[2], "owner the player, token_uri", json.dumps(attrs, sort_keys=True))
' "$uri" "$id" "$over" || die "Collection.token_uri($id) is not section 9's JSON"
}

echo "== smoke"
# Each transaction of the smoke is sent once: through the signer it is recorded (`fresh.smoke`), and a rerun reads what
# landed (the game, its tiles, Economy's terms, Setup's flag) and cites it instead of sending again.
# P-42, P-56: the upgrade owner of every ownable contract is the deployer. PavedToken has no owner.
for entry in "Economy=$ECONOMY" "Challenge=$CHALLENGE" "Setup=$SETUP" "Collection=$COLLECTION" "Vault=$VAULT" "Story=$STORY" "Avatar=$AVATAR"; do
  [[ "$(hex_int "$(call "${entry#*=}" owner)")" == "$DEPLOYER_INT" ]] || die "${entry%%=*}.owner() is not the deployer"
done
echo "   owner() of Economy, Challenge, Setup, Collection, Vault, Story and Avatar: the deployer"
# The VRF mock (#638, devnet only): no consume counted outside a transaction, and a salt's consume is not 0.
if [[ "$NETWORK" == "devnet" ]]; then
  [[ "$(hex_int "$(call "$VRF" get_consume_count)")" == 0 ]] || die "MockVrfProvider.get_consume_count() is not 0"
  [[ "$(hex_int "$(call "$VRF" consume_random 1 1)")" != 0 ]] || die "MockVrfProvider.consume_random(Salt(1)) is 0"
  echo "   MockVrfProvider: consume count 0, a salt's consume not 0"
fi
fresh_story_smoke
fresh_avatar_smoke
# The guardian and the pause (PM, 2026-10-14): read by fresh_guardian_smoke.
fresh_guardian_smoke
# The Vault's exit fee: the default at launch; the owner may have moved it since, within its bound
VAULT_FEE="$(hex_int "$(call "$VAULT" exit_fee)")"
if ((FRESH_COMPLETE)); then
  ((VAULT_FEE <= 1000)) || die "Vault.exit_fee() is $VAULT_FEE bps, above its 1,000 bps bound"
else
  [[ "$VAULT_FEE" == "$EXIT_FEE" ]] || die "Vault.exit_fee() is $VAULT_FEE bps, not the default $EXIT_FEE"
fi
echo "   Vault: exit fee $VAULT_FEE bps"
read -r WIRED_ECONOMY WIRED_COLLECTION <<<"$(call "$SETUP" wiring)"
[[ "$(hex_int "$WIRED_ECONOMY")" == "$(hex_int "$ECONOMY")" && "$(hex_int "$WIRED_COLLECTION")" == "$(hex_int "$COLLECTION")" ]] ||
  die "Setup.wiring() is not (Economy, Collection)"
echo "   Setup.wiring(): Economy and Collection"
fresh_definitions_smoke
read -r PRICE_TOKEN PRICE_LOW PRICE_HIGH <<<"$(call "$CHALLENGE" entry_price)"
[[ "$(hex_int "$PRICE_TOKEN")" == "$(hex_int "$USDC")" ]] || die "entry_price token $PRICE_TOKEN is not the Faucet"
[[ "$(hex_int "$PRICE_LOW")" == 2000000 && "$(hex_int "$PRICE_HIGH")" == 0 ]] || die "entry_price amount is not 2 USDC"
echo "   entry_price: 2 USDC per stake unit"
# The router (E-9, F0): Economy.router() is the file's MockRouter (the key the client reads), the router of the E-9 class
# (quote_swap), its pool the launch seed (800,000 PAVED and 10,000 USDC, D-16, P-39, less what paid games have swapped
# since), Economy's quote_swap(1.4 USDC) through it, and the guard rate (7.6e31 at launch; a purchase moves it).
FILE_ROUTER="$(python3 -I -c 'import json,sys;print(json.load(open(sys.argv[1]))["contracts"]["MockRouter"]["address"])' "$OUT")"
[[ "$(hex_int "$(call "$ECONOMY" router)")" == "$(hex_int "$FILE_ROUTER")" ]] || die "Economy.router() is not the file's MockRouter $FILE_ROUTER"
if ((FRESH_COMPLETE)); then
  echo "   Economy.router() is the file's MockRouter; pool, quote and rate not read again (complete record)"
else
  v RAW call "$ROUTER" reserves
  read -r -a RESERVES <<<"$RAW"
  v RAW call "$ECONOMY" quote_swap 1400000 0
  read -r SWAP_LOW _ <<<"$RAW"
  gt "$(hex_int "$SWAP_LOW")" 0 || die "Economy.quote_swap(1400000) is 0"
  v RAW call "$ECONOMY" rate
  read -r RATE_LOW RATE_HIGH <<<"$RAW"
  # Before the smoke's spawn (a first run, or a resume that has not spawned), the launch values are asserted: the pool
  # is the seed and the guard rate is LAUNCH_RATE. After it, play has moved both: printed only.
  LAUNCH=0
  [[ -n "$(fr_get smoke.spawn_tx)" ]] || LAUNCH=1
  python3 -I - "$PAVED" "$USDC" "${RESERVES[@]}" "$SWAP_LOW" "$RATE_LOW" "$RATE_HIGH" "$LAUNCH" "$POOL_PAVED" "$POOL_USDC" \
      "$LAUNCH_RATE" <<'PY2' || die "the launch pool or rate is not the seed: see above"
import sys
paved, usdc, r0l, r0h, r1l, r1h, swap, rl, rh, launch, pool_paved, pool_usdc, launch_rate = sys.argv[1:]
r0, r1 = int(r0l, 16) + (int(r0h, 16) << 128), int(r1l, 16) + (int(r1h, 16) << 128)
p, u = (r0, r1) if int(paved, 16) < int(usdc, 16) else (r1, r0)
rate = int(rl, 16) + (int(rh, 16) << 128)
print(f"   Economy.router() is the file's MockRouter; its pool: {p / 10**18:,.6f} PAVED and {u / 10**6:,.6f} USDC")
print(f"   Economy.quote_swap(1.4 USDC) = {int(swap, 16)} PAVED base units; Economy.rate() = {rate} ({rate / 10**18 / 10**12:,.4f} PAVED per USDC)")
if launch == "1":
    ok = (p, u, rate) == (int(pool_paved), int(pool_usdc), int(launch_rate))
    print(f"   launch values: pool {p} PAVED and {u} USDC base units, rate {rate}: "
          + ("the seed and LAUNCH_RATE" if ok else f"NOT the seed ({pool_paved}, {pool_usdc}) and LAUNCH_RATE {launch_rate}"))
    sys.exit(0 if ok else 1)
PY2
fi

# A paid Challenge game at stake 1, with the client's min_out: the pool's quote of the whole swap, less 1 % (no referrer:
# the burn quote and the margin, one swap since P-56, so the whole price). Its margin's PAVED reaches the Vault, which
# mints no share for it. The 2 USDC come
# from the faucet, unless the deployer already holds them: on Sepolia anyone may have filled its faucet cap, and
# that USDC is then on the deployer. A spawn a stopped run sent is read from its receipt.
if [[ -z "$(fr_get smoke.game_id)" ]] && fr_settled smoke.spawn_tx; then
  PAID_ID="$(rpc starknet_getTransactionReceipt "[\"$(fr_get smoke.spawn_tx)\"]" | fresh_spawned_game)" ||
    die "the recorded smoke spawn $(fr_get smoke.spawn_tx) succeeded but spawned no Challenge game: check it"
  rp_set "smoke.game_id=$PAID_ID"
fi
if [[ -n "$(fr_get smoke.game_id)" ]]; then
  PAID_ID="$(fr_get smoke.game_id)"
  EMA_BEFORE="$(fr_get smoke.ema_before)"
  echo "   paid challenge spawn done already: game $PAID_ID, tx $(fr_get smoke.spawn_tx); not sent again"
else
  read -r HELD_LOW HELD_HIGH <<<"$(call "$USDC" balance_of "$DEPLOYER_ARG")"
  if python3 -I -c 'import sys;sys.exit(0 if int(sys.argv[1],16)+(int(sys.argv[2],16)<<128)<2000000 else 1)' "$HELD_LOW" "$HELD_HIGH"; then
    invoke "$USDC" mint "$DEPLOYER_ARG" 2000000 0 >/dev/null
  fi
  invoke "$USDC" approve "$CHALLENGE" 2000000 0 >/dev/null
  read -r -a QUOTE <<<"$(call "$ECONOMY" quote 1)"
  read -r SWAP_LOW _ <<<"$(call "$ECONOMY" quote_swap "${QUOTE[0]}" "${QUOTE[1]}")"
  VAULT_BEFORE="$(hex_int "$(call "$PAVED" balance_of "$VAULT" | cut -d' ' -f1)")"
  SHARES_BEFORE="$(hex_int "$(call "$VAULT" total_supply | cut -d' ' -f1)")"
  MIN_OUT="$(python3 -I -c 'import sys;print(int(sys.argv[1],16)*99//100)' "$SWAP_LOW")"
  EMA_BEFORE="$(call "$ECONOMY" ema)"
  fr_set "smoke.ema_before=$EMA_BEFORE"
  USDC_BEFORE="$(hex_int "$(call "$USDC" balance_of "$DEPLOYER_ARG" | cut -d' ' -f1)")"
  RECORD_SENDING=smoke.spawn_tx
  CHALLENGE_TX="$(invoke "$CHALLENGE" spawn 1 0 $(u256 "$MIN_OUT"))"
  RECORD_SENDING=""
  PAID_ID="$(rpc starknet_getTransactionReceipt "[\"$CHALLENGE_TX\"]" | fresh_spawned_game)" ||
    die "no GameSpawned event in the Challenge spawn receipt"
  fr_set "smoke.spawn_tx=$CHALLENGE_TX" "smoke.game_id=$PAID_ID"
  USDC_AFTER="$(hex_int "$(call "$USDC" balance_of "$DEPLOYER_ARG" | cut -d' ' -f1)")"
  [[ $((USDC_BEFORE - USDC_AFTER)) == 2000000 ]] || die "the spawn moved $((USDC_BEFORE - USDC_AFTER)) USDC base units, expected 2000000"
  # USDC the router held before the purchase comes back to Economy (`clear`) and waits for the next margin (P-56): anyone
  # can send some to the router, so it is printed, not refused (security audit note 1 of #382)
  STRAY_USDC="$(hex_int "$(call "$USDC" balance_of "$ECONOMY" | cut -d' ' -f1)")"
  [[ "$STRAY_USDC" == 0 ]] || echo "   Economy holds $STRAY_USDC USDC base units the router gave back: the next purchase's margin"
  [[ "$(hex_int "$(call "$PAVED" balance_of "$ECONOMY" | cut -d' ' -f1)")" == 0 ]] || die "Economy holds PAVED after the purchase"
  VAULT_AFTER="$(hex_int "$(call "$PAVED" balance_of "$VAULT" | cut -d' ' -f1)")"
  gt "$VAULT_AFTER" "$VAULT_BEFORE" || die "the purchase sent no PAVED to the Vault"
  [[ "$(hex_int "$(call "$VAULT" total_supply | cut -d' ' -f1)")" == "$SHARES_BEFORE" ]] || die "the purchase minted vPAVED"
  [[ "$(hex_int "$(call "$USDC" balance_of "$VAULT" | cut -d' ' -f1)")" == 0 ]] || die "the Vault holds USDC after the purchase"
  echo "   challenge game $PAID_ID bought at stake 1 (min_out $MIN_OUT), tx $CHALLENGE_TX; Economy holds no PAVED;"
  echo "   the Vault's PAVED grew by $((VAULT_AFTER - VAULT_BEFORE)) base units, its shares unchanged"
fi
DAY="$(python3 -I -c 'import sys;print(int(sys.argv[1],16)//86400)' "$(call "$CHALLENGE" game "$PAID_ID" | cut -d' ' -f14)")"
read -r T_PLAYER T_RECORDED T_SETTLED T_REWARD <<<"$(terms "$PAID_ID")"
[[ "$T_PLAYER" == "$DEPLOYER_INT" ]] || die "Economy.terms($PAID_ID) is not the player's"
echo "   challenge game $PAID_ID on day $DAY, the player's"

# One D-18 build(game_id, orientation, x, y) next to the starter, once: a game with a second tile placed (or over) has
# had it.
fr_settled smoke.build_tx || true
read -r -a GAME <<<"$(call "$CHALLENGE" game "$PAID_ID")"
if [[ "$(hex_int "${GAME[5]}")" == 0 && "$(hex_int "${GAME[7]}")" == 1 ]]; then
  BUILD_TX="$(fresh_first_build "$PAID_ID")" || die "no placement next to the starter is accepted for game $PAID_ID"
  read -r BUILD_TX BUILD_AT <<<"$BUILD_TX"
  fr_set "smoke.build_tx=$BUILD_TX"
  read -r -a GAME <<<"$(call "$CHALLENGE" game "$PAID_ID")"
  [[ "$(hex_int "${GAME[7]}")" == 2 ]] || die "game $PAID_ID has $(hex_int "${GAME[7]}") tiles placed after the build, expected 2"
  echo "   build(game $PAID_ID, $BUILD_AT), tx $BUILD_TX"
else
  echo "   build done already$( [[ -n "$(fr_get smoke.build_tx)" ]] && echo ", tx $(fr_get smoke.build_tx)"); not sent again"
fi
read -r -a BUILDER <<<"$(call "$CHALLENGE" builder "$PAID_ID" "$DEPLOYER_ARG")"
[[ "${#BUILDER[@]}" == 4 && "$(hex_int "${BUILDER[0]}")" == "$PAID_ID" && "$(hex_int "${BUILDER[1]}")" == "$DEPLOYER_INT" ]] ||
  die "Challenge.builder($PAID_ID) is not the four D-18 fields of the game and the player"
echo "   game $PAID_ID: score $(hex_int "${GAME[4]}"), placed_count $(hex_int "${GAME[7]}"); builder(): the player, tile $(hex_int "${BUILDER[2]}"), plan $(hex_int "${BUILDER[3]}")"

# The game over, reported to Setup: its QuestProgressed and AchievementProgressed (task 1, the game finished).
fr_settled smoke.surrender_tx || true
read -r T_PLAYER T_RECORDED T_SETTLED T_REWARD <<<"$(terms "$PAID_ID")"
if [[ "$T_RECORDED" == 1 ]]; then
  SURRENDER_TX="$(fr_get smoke.surrender_tx)"
  [[ -n "$SURRENDER_TX" ]] || die "game $PAID_ID is recorded by Economy but no surrender is recorded: check it"
  echo "   game $PAID_ID surrendered already, tx $SURRENDER_TX; not sent again"
else
  RECORD_SENDING=smoke.surrender_tx
  SURRENDER_TX="$(invoke "$CHALLENGE" surrender "$PAID_ID")"
  RECORD_SENDING=""
  fr_set "smoke.surrender_tx=$SURRENDER_TX"
  read -r T_PLAYER T_RECORDED T_SETTLED T_REWARD <<<"$(terms "$PAID_ID")"
  [[ "$T_RECORDED" == 1 ]] || die "the surrender of game $PAID_ID was not recorded by Economy"
fi
REPORTED="$(rpc starknet_getTransactionReceipt "[\"$SURRENDER_TX\"]" | python3 -I -c '
import sys, json
d = json.load(sys.stdin)["result"]
setup = int(sys.argv[1], 16)
print(sum(1 for e in d["events"] if int(e["from_address"], 16) == setup))' "$SETUP")" ||
  die "no receipt for the surrender of game $PAID_ID"
[[ "$REPORTED" -ge 2 ]] || die "the surrender of game $PAID_ID emitted $REPORTED events from Setup, expected 2 or more"
echo "   challenge game $PAID_ID surrendered, recorded by Economy, reported to Setup ($REPORTED events), tx $SURRENDER_TX"
check_token "$PAID_ID" true

# The tutorial is off chain (D-21): its achievement is claimed on Setup, once per player. A claimed flag is not claimed
# again; devnet claims a second time, which does nothing (one flag).
fr_settled smoke.claim_tx || true
if [[ "$(hex_int "$(call "$SETUP" tutorial_claimed "$DEPLOYER_ARG")")" == 1 ]]; then
  echo "   tutorial claimed already$( [[ -n "$(fr_get smoke.claim_tx)" ]] && echo ", tx $(fr_get smoke.claim_tx)"); not sent again"
else
  RECORD_SENDING=smoke.claim_tx
  CLAIM_TX="$(invoke "$SETUP" claim_tutorial)"
  RECORD_SENDING=""
  fr_set "smoke.claim_tx=$CLAIM_TX"
  [[ "$(hex_int "$(call "$SETUP" tutorial_claimed "$DEPLOYER_ARG")")" == 1 ]] || die "Setup.tutorial_claimed(player) is not true"
  if [[ "$NETWORK" == "devnet" ]]; then
    invoke "$SETUP" claim_tutorial >/dev/null
    echo "   tutorial claimed on Setup, twice: one flag"
  else
    echo "   tutorial claimed on Setup once, tx $CLAIM_TX"
  fi
fi

# A pack (cobbles v1, part 2, cobbles-v1.md 2.3): pack 1 bought by the player for itself, with the client's min_out (the
# pool's quote of the whole price, less 1 %; no referrer). Setup pulls the price into Economy, whose `sell` runs the game's
# split (Sold beside PackBought in the receipt), and credits the cobbles; Setup holds no USDC after it, Economy no PAVED.
# The USDC comes from the faucet unless the deployer holds it. Recorded as smoke.pack_tx; a rerun cites it. A complete
# record without one (a record from before part 2) sends nothing.
fr_settled smoke.pack_tx || true
if [[ -n "$(fr_get smoke.pack_tx)" ]]; then
  echo "   pack 1 bought already, tx $(fr_get smoke.pack_tx); not sent again"
elif ((FRESH_COMPLETE)); then
  echo "   no pack bought in this record (complete: a rerun sends nothing)"
else
  read -r -a PACK <<<"$(call "$SETUP" pack 1)"
  PACK_COBBLES="$(hex_int "${PACK[0]}")"
  PACK_PRICE="$(hex_int "${PACK[1]}")"
  [[ "$PACK_COBBLES" == 50 && "$PACK_PRICE" == 5000000 && "$(hex_int "${PACK[2]}")" == 1 ]] ||
    die "Setup.pack(1) is $PACK_COBBLES cobbles for $PACK_PRICE, not the table's 50 for 5000000, active"
  read -r HELD_LOW HELD_HIGH <<<"$(call "$USDC" balance_of "$DEPLOYER_ARG")"
  if python3 -I -c 'import sys;sys.exit(0 if int(sys.argv[1],16)+(int(sys.argv[2],16)<<128)<int(sys.argv[3]) else 1)' "$HELD_LOW" "$HELD_HIGH" "$PACK_PRICE"; then
    invoke "$USDC" mint "$DEPLOYER_ARG" $(u256 "$PACK_PRICE") >/dev/null
  fi
  invoke "$USDC" approve "$SETUP" $(u256 "$PACK_PRICE") >/dev/null
  read -r SWAP_LOW _ <<<"$(call "$ECONOMY" quote_swap $(u256 "$PACK_PRICE"))"
  MIN_OUT="$(python3 -I -c 'import sys;print(int(sys.argv[1],16)*99//100)' "$SWAP_LOW")"
  COBBLES_BEFORE="$(hex_int "$(call "$SETUP" account "$DEPLOYER_ARG" | cut -d' ' -f1)")"
  USDC_BEFORE="$(hex_int "$(call "$USDC" balance_of "$DEPLOYER_ARG" | cut -d' ' -f1)")"
  VAULT_BEFORE="$(hex_int "$(call "$PAVED" balance_of "$VAULT" | cut -d' ' -f1)")"
  RECORD_SENDING=smoke.pack_tx
  PACK_TX="$(invoke "$SETUP" buy_pack 1 0 $(u256 "$MIN_OUT"))"
  RECORD_SENDING=""
  fr_set "smoke.pack_tx=$PACK_TX"
  USDC_AFTER="$(hex_int "$(call "$USDC" balance_of "$DEPLOYER_ARG" | cut -d' ' -f1)")"
  [[ $((USDC_BEFORE - USDC_AFTER)) == "$PACK_PRICE" ]] || die "buy_pack moved $((USDC_BEFORE - USDC_AFTER)) USDC base units, expected $PACK_PRICE"
  COBBLES_AFTER="$(hex_int "$(call "$SETUP" account "$DEPLOYER_ARG" | cut -d' ' -f1)")"
  [[ $((COBBLES_AFTER - COBBLES_BEFORE)) == "$PACK_COBBLES" ]] || die "buy_pack credited $((COBBLES_AFTER - COBBLES_BEFORE)) cobbles, expected $PACK_COBBLES"
  [[ "$(hex_int "$(call "$USDC" balance_of "$SETUP" | cut -d' ' -f1)")" == 0 ]] || die "Setup holds USDC after buy_pack"
  [[ "$(hex_int "$(call "$PAVED" balance_of "$ECONOMY" | cut -d' ' -f1)")" == 0 ]] || die "Economy holds PAVED after buy_pack"
  VAULT_AFTER="$(hex_int "$(call "$PAVED" balance_of "$VAULT" | cut -d' ' -f1)")"
  gt "$VAULT_AFTER" "$VAULT_BEFORE" || die "buy_pack sent no PAVED to the Vault"
  # PackBought from Setup and Sold from Economy, in the same receipt
  SHOP_EVENTS="$(rpc starknet_getTransactionReceipt "[\"$PACK_TX\"]" | python3 -I -c '
import sys, json
d = json.load(sys.stdin)["result"]
setup, economy = int(sys.argv[1], 16), int(sys.argv[2], 16)
print(sum(1 for e in d["events"] if int(e["from_address"], 16) == setup), sum(1 for e in d["events"] if int(e["from_address"], 16) == economy))' "$SETUP" "$ECONOMY")" ||
    die "no receipt for buy_pack"
  read -r SETUP_EVENTS ECONOMY_EVENTS <<<"$SHOP_EVENTS"
  [[ "$SETUP_EVENTS" -ge 1 && "$ECONOMY_EVENTS" -ge 1 ]] || die "buy_pack emitted $SETUP_EVENTS events from Setup and $ECONOMY_EVENTS from Economy, expected 1 or more of each"
  echo "   pack 1 bought (min_out $MIN_OUT), tx $PACK_TX: $PACK_PRICE USDC base units through Economy's split, $PACK_COBBLES cobbles"
  echo "   credited ($COBBLES_BEFORE -> $COBBLES_AFTER), the Vault's PAVED grew by $((VAULT_AFTER - VAULT_BEFORE)) base units; Setup holds no USDC, Economy no PAVED"
fi

# A skin (cobbles v1, part 3, cobbles-v1.md 5.3): the plan of theme 1 priced 50 (plan 13, the commonest) bought with the pack's
# cobbles, which are exactly its price, so the balance falls to what it was before the pack. Buying does not activate it.
# Recorded as smoke.skin_tx; a rerun cites it. A complete record without one sends nothing.
SKIN_THEME="${FRESH_SKIN_THEMES[0]}"
SKIN_PLAN=13
fr_settled smoke.skin_tx || true
if [[ -n "$(fr_get smoke.skin_tx)" ]]; then
  echo "   skin bought already, tx $(fr_get smoke.skin_tx); not sent again"
elif ((FRESH_COMPLETE)); then
  echo "   no skin bought in this record (complete: a rerun sends nothing)"
else
  SKIN_PRICE="$(hex_int "$(call "$SETUP" skin_price "$SKIN_THEME" "$SKIN_PLAN")")"
  [[ "$SKIN_PRICE" == "${FRESH_SKIN_PRICES[SKIN_PLAN - 1]}" ]] || die "Setup.skin_price($SKIN_THEME, $SKIN_PLAN) is $SKIN_PRICE, not the table's ${FRESH_SKIN_PRICES[SKIN_PLAN - 1]}"
  COBBLES_BEFORE="$(hex_int "$(call "$SETUP" account "$DEPLOYER_ARG" | cut -d' ' -f1)")"
  [[ "$COBBLES_BEFORE" -ge "$SKIN_PRICE" ]] || die "the deployer holds $COBBLES_BEFORE cobbles, under the skin's $SKIN_PRICE"
  RECORD_SENDING=smoke.skin_tx
  SKIN_TX="$(invoke "$SETUP" buy_skin "$SKIN_THEME" "$SKIN_PLAN")"
  RECORD_SENDING=""
  fr_set "smoke.skin_tx=$SKIN_TX"
  COBBLES_AFTER="$(hex_int "$(call "$SETUP" account "$DEPLOYER_ARG" | cut -d' ' -f1)")"
  [[ $((COBBLES_BEFORE - COBBLES_AFTER)) == "$SKIN_PRICE" ]] || die "buy_skin spent $((COBBLES_BEFORE - COBBLES_AFTER)) cobbles, expected $SKIN_PRICE"
  [[ "$(hex_int "$(call "$SETUP" skins "$DEPLOYER_ARG" "$SKIN_THEME")")" == $((1 << SKIN_PLAN)) ]] || die "Setup.skins(deployer, $SKIN_THEME) is not the bit of plan $SKIN_PLAN"
  echo "   skin of plan $SKIN_PLAN in theme $SKIN_THEME bought, tx $SKIN_TX: $SKIN_PRICE cobbles ($COBBLES_BEFORE -> $COBBLES_AFTER), not activated"
fi

# Settlement on a later day: from (D + 2) x 86400 (P-34). A keeper settles each day then (README). Only a local
# node can move its time: on Sepolia the smoke leaves its paid game to the keeper, settleable from (D + 2) x 86400.
SETTLE_AT=$(((DAY + 2) * 86400))
if [[ "$NETWORK" == "devnet" || "$REHEARSE" == 1 ]]; then
  fr_settled smoke.settle_tx || true
  if [[ "$T_SETTLED" != 1 && "$FRESH_COMPLETE" == 0 ]]; then
    rpc devnet_setTime "{\"time\":$SETTLE_AT,\"generate_block\":true}" >/dev/null || die "devnet_setTime failed"
    RECORD_SENDING=smoke.settle_tx
    SETTLE_TX="$(invoke "$ECONOMY" settle 1 "$PAID_ID")"
    RECORD_SENDING=""
    fr_set "smoke.settle_tx=$SETTLE_TX"
  fi
  read -r T_PLAYER T_RECORDED T_SETTLED T_REWARD <<<"$(terms "$PAID_ID")"
  [[ "$T_SETTLED" == 1 ]] || die "game $PAID_ID was not settled at $SETTLE_AT"
  echo "   challenge game $PAID_ID settled at (D + 2) x 86400 = $SETTLE_AT: reward $T_REWARD"
else
  echo "   challenge game $PAID_ID left for the keeper: settleable from (D + 2) x 86400 = $SETTLE_AT"
fi

# The day's figures (P-24): a score under 100 enters no mean, so the day closes on its prior and the EMA does not move;
# the smoke's build usually scores 100 or more, and the game then enters the day's mean like any other (no prize and
# no on-chain ranking since D-20). On Sepolia the day is still open (its time cannot move): its close is the keeper's.
read -r -a DAYVIEW <<<"$(call "$ECONOMY" day "$DAY")"
read -r -a T <<<"$(call "$ECONOMY" terms "$PAID_ID")"
# A complete record: the day and the EMA belong to live play and the keeper since; printed, never asserted.
SCORE="$(hex_int "${T[8]}")"
EMA_AFTER="$(call "$ECONOMY" ema)"
if ((FRESH_COMPLETE)); then
  echo "   day $DAY: score $SCORE, weight $(hex_int "${DAYVIEW[2]}"), closed $(hex_int "${DAYVIEW[4]}"); not asserted (complete record)"
elif (( SCORE < 100 )); then
  [[ "$EMA_AFTER" == "$EMA_BEFORE" ]] || die "the EMA moved"
  if [[ "$NETWORK" == "devnet" || "$REHEARSE" == 1 ]]; then
    [[ "$(hex_int "${DAYVIEW[2]}")" == 0 && "$(hex_int "${DAYVIEW[4]}")" == 1 ]] || die "day $DAY has a weight or is not closed"
    echo "   day $DAY: score $SCORE, closed with weight 0, EMA unchanged"
  else
    [[ "$(hex_int "${DAYVIEW[2]}")" == 0 ]] || die "day $DAY has a weight"
    echo "   day $DAY: score $SCORE, weight 0 while open, EMA unchanged"
  fi
elif [[ "$NETWORK" == "devnet" || "$REHEARSE" == 1 ]]; then
  [[ "$(hex_int "${DAYVIEW[2]}")" -ge 1 && "$(hex_int "${DAYVIEW[4]}")" == 1 ]] || die "day $DAY is not closed with the game's weight"
  echo "   day $DAY: score $SCORE (100 or more: in the day's mean), closed with weight $(hex_int "${DAYVIEW[2]}"); EMA $(python3 -I -c 'import sys;print(" ".join(str(int(x,16)) for x in sys.argv[1:]))' $EMA_BEFORE) -> $(python3 -I -c 'import sys;print(" ".join(str(int(x,16)) for x in sys.argv[1:]))' $EMA_AFTER)"
else
  echo "   day $DAY: score $SCORE (100 or more: it enters the day's mean when the keeper closes the day)"
fi
# The smoke drew from the mock (#645): on Sepolia Challenge now draws from Cartridge's provider
fresh_vrf_final_step
fr_set complete=yes
echo "== smoke ok"
if ((FRESH_RECORD)); then
  echo "== fresh: complete; a rerun sends nothing (record ${OUT#"$ROOT/"})"
fi
if [[ "$UNMERGED" == 1 || "$REHEARSE" == 1 ]]; then
  echo "== unmerged deployment file ($OUT):"
  cat "$OUT"
fi
