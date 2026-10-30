# The client release at F (the fresh Sepolia deployment)

> History note: `packages/app-web`, which this document names, was removed in P-70; see git history. Until 2026-10-17 the VPS
> served the client and the Storybook (see git history).

Written 2026-10-14 (F0, track CLIENT). P-53: one fresh Sepolia deployment after D-23b (#354). At F the Sepolia client and the
indexer are released **together**, against F's deployment file, with a single indexer rebuild at schema 11. This is the
checklist of that release. It is a description: **nothing is sent, deployed or changed on the VPS until CORE's F part B has merged**
and the PM gives the go. The PM copies the commands into the one root script for the owner; each says who runs it (root, or the
indexer's operator). No line holds a secret.

Related: the indexer's commands are "Release at F" in `docs/client/indexer-hosting.md`; the client is served by Vercel ("Vercel"
below).

## Inputs

| Input | Where it comes from | Used for |
|---|---|---|
| F's deployment file | `contracts/deployments/sepolia.json`, as CORE's F part B writes it and merges it to `main` | the client build (`import.meta.glob`), the indexer (`--deployment`), the checks below |
| F's commit | the full 40-character commit of `main` that contains that file **and** the client change below | one checkout for the indexer release and the client build |
| The Sepolia RPC URL | `https://api.cartridge.gg/x/starknet/sepolia/rpc/v0_10` (no key) | the checks, the build (`VITE_RPC_URL`), the indexer |
| The indexer's public URL | `https://api.paved.bal7hazar.com` | the build (`VITE_INDEXER_URL`) |

**The client reads F's keys.** CORE's F writes the test USDC as `contracts.Faucet` (devnet.json included) and the game as
`contracts.Challenge`, one key per contract, with no `Token`, `MockUSDC`, `Daily` or `Account`. The client reads `contracts.Challenge`
(D-23b, #354) and `contracts.Faucet` only (W1f, PR #357, on CORE's F branch; PM's ruling 2026-10-14), with no `MockUSDC` fallback:
the faucet is `deployment.faucet` and the economy's USDC is the same value: `contracts.Faucet` on devnet and Sepolia (`contracts.USDC` and
`VITE_USDC_ADDRESS` are ignored there), with no env override of the faucet (`VITE_MOCK_USDC_ADDRESS` is gone and `VITE_FAUCET_ADDRESS` does not exist). The old `Token` is gone from the client too (`ContractName`, `VITE_TOKEN_ADDRESS`): the entry token is the
address `Challenge.entry_price` names (the Faucet, on devnet and Sepolia), and its balance is read there with the Faucet's ABI.
**F's commit must contain that PR.** Check 2 below fails a file whose `Faucet` is absent, and the smoke (faucet) fails a build that
does not read it.

## Checks against the file

Run before anything is released, and again once F is on `main`. Every check is read-only: JSON-RPC reads (`starknet_chainId`,
`starknet_blockNumber`, `starknet_getClassHashAt`, `starknet_call` of view functions). No transaction is built.

All of them in one command, from a checkout of F's commit (Node 24, no install needed):

```bash
CHECK_RPC_URL=https://api.cartridge.gg/x/starknet/sepolia/rpc/v0_10 \
  node scripts/client/check-deployment.mjs --file contracts/deployments/sepolia.json
```

Expected: one `PASS` line per check below and the last line `every check passed; nothing was sent`, exit 0. A `FAIL` line names the
key and the two values that differ, exit 1. A file **without a `MockRouter`** prints `SKIP MockRouter`, then `FAIL Economy.router() ...,
but the file has no MockRouter to compare with`, and exits 1: on Sepolia that is a failure, not a skip. The RPC URL is read from the
environment, not from an argument, because an argument shows in `ps`; `--rpc <url>` exists for a local node and **wins** over
`CHECK_RPC_URL` when both are set. The first output line says whether the selectors were derived with starknet.js (a full
`bun install`) or are the pinned values (a host with only the indexer installed); they are the same values.

| # | Check | Command (by hand) | Expected |
|---|---|---|---|
| 1 | The chain id | `curl -s -X POST "$RPC" -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"starknet_chainId","params":[]}' \| jq -r .result` | `0x534e5f5345504f4c4941` (`SN_SEPOLIA`), and `jq -r .chain_id contracts/deployments/sepolia.json` is the same value |
| 2 | The keys the client reads exist | `jq '.contracts \| {Challenge, Setup, Economy, PavedToken, Vault, Collection, Faucet, MockRouter}' contracts/deployments/sepolia.json` | each of `Challenge`, `Setup`, `Economy`, `PavedToken`, `Vault`, `Collection` and `Faucet` has a non-zero `address` and a `class_hash`; `MockRouter` has both **if the file has one** (the client refuses every purchase on Sepolia without it: `expectedRouter` is empty). No `Daily`, no `Account`, no `Tutorial`, no `Lobby` key is read |
| 3 | Every address answers with the file's class hash | for each key `K`: `curl -s -X POST "$RPC" -H 'content-type: application/json' -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"starknet_getClassHashAt\",\"params\":{\"block_id\":\"latest\",\"contract_address\":\"$(jq -r .contracts.$K.address contracts/deployments/sepolia.json)\"}}" \| jq -r .result` | equals `jq -r .contracts.$K.class_hash contracts/deployments/sepolia.json` (compared as numbers: leading zeros do not count). An RPC error `Contract not found` means the address is not deployed on this chain |
| 4 | `Setup.wiring()` names the file's Economy and Collection | `starknet_call` of `wiring` on `Setup` (selector `0x181ce878c45381d5be10e5505af16363d8e99e447e64fe9ae455468e4163bab`, no calldata) | the result is `[economy, collection]`: the file's `Economy` and `Collection` addresses |
| 5 | `Economy`'s router is the file's router | `starknet_call` of `router` on `Economy` (selector `0x36d4e9bb70c9d2aa50e18560b4cdd1b23b30d62b60873d5f23b103e5d7d0185`) | the file's `MockRouter` address. The client pins the same value (`expectedRouter`) and refuses a purchase for any other |
| 6 | `Economy.addresses()` is the file's economy | `starknet_call` of `addresses` on `Economy` (selector `0x210e5b5e314de2f302893e9e54a8d74cdb13aabc4483e34a1abb30c0ae64e1b`) | `[paved, usdc, vault, router, game]` = the file's `PavedToken`, `Faucet`, `Vault`, `MockRouter`, `Challenge` |
| 7 | The start block | `jq .deployed_block contracts/deployments/sepolia.json` and `starknet_blockNumber` | an integer at or below the tip. The indexer starts there |

The call form is `{"jsonrpc":"2.0","id":1,"method":"starknet_call","params":{"request":{"contract_address":"<addr>","entry_point_selector":"<selector>","calldata":[]},"block_id":"latest"}}`.
The selectors are `starknet_keccak` of the entry point's name (`hash.getSelectorFromName` of starknet.js). The script checks 1 to 7;
checks 4 to 6 are the ones that a wrong `Setup` or `Economy` wiring fails, and the file alone cannot show them.

## Building the client

Vercel builds the client (`packages/app`, project `paved`); there is no build or publish step on the VPS ("Vercel" below). Until
2026-10-17 the VPS served the client and the Storybook (see git history).

Env (nothing here is secret; the bundle is public). It is set in `packages/app/vercel.json`, `build.env`:

| Variable | Value |
|---|---|
| `VITE_NETWORK` | `sepolia` |
| `VITE_INDEXER_URL` | `https://api.paved.bal7hazar.com` (no `/v1`, no trailing slash) |
| `VITE_RPC_URL` | `https://starknet-sepolia-rpc.publicnode.com` (Cartridge's Sepolia RPC answers 410 since 2026-10-30, #918; the file's `rpc_url` is the placeholder `$STARKNET_RPC_URL`; without this the build is "not connected") |

Leave every `VITE_*_ADDRESS` and `VITE_SUPPORTS_TOKEN_MINT` unset: the file supplies the addresses, and the faucet is offered on
Sepolia by default. A production deploy of `main` at F's commit carries F's `contracts/deployments/sepolia.json`; a rollback is a
promotion of an earlier production deployment in Vercel (the owner's dashboard). Rolling the client back to a build made for the old
contracts does not help once the indexer is rebuilt for F: the two go together.

## Host compression of the renderer assets

A release-day step for the host; this PR changes no host config. The paths are those of `packages/app/vite/renderer-assets.ts`
under the app's base (`<base>` is `/` unless the build sets another), as the build writes them into `dist/`
(`<client-root>` is the host's folder for the built client).

| Path under `<client-root>` | Content type | Compress | Cache-Control |
|---|---|---|---|
| `renderer-assets/models/<plan>.<hash>.glb` (19 files, 10 hex digits of the file's SHA-256 in the name) | `model/gltf-binary` | yes | `public, max-age=31536000, immutable` |
| `renderer-assets/manifest.json` | `application/json` | yes | `no-cache` (`AssetLoader` asks with `cache: "no-cache"` too) |
| the app's own JavaScript and CSS (Vite's default `assets/` folder, hashed names) | `text/javascript`, `text/css` | yes, if the host does not already | as the host sets them today |
| `renderer-assets/assets/tiles/*.png` | `image/png` | no, already compressed | `no-cache` or a short `max-age` (plain names) |

The 19 models are 1,089,624 B as files; gzip (level 6) takes them to about 665,212 B and brotli to 618,540 B. These figures
were measured on the files, not over the network. `vite preview` compresses only text and JavaScript, so the figures in
`v2-architecture.md` 4.2 are the files as they are. The cache headers are those of 4.2.

## Vercel

Three Vercel projects exist; two build from this repository, and their settings live in `vercel.json` files, changed by reviewed pull
request. A Vercel project reads the `vercel.json` of **its own root directory**, so each file below touches only its project.

| Project | Root directory (dashboard) | Settings file | Builds | Production URL |
|---|---|---|---|---|
| `paved-storybook` | empty (the repository root) | `vercel.json` | `bun run build --filter @paved/app^...`, then `build-storybook` with a 3072 MB heap; serves `packages/app/storybook-static` | `https://paved-storybook.vercel.app` |
| `paved` (web client) | `packages/app` | `packages/app/vercel.json` | the app's workspace dependencies, then the app's own `build` script (FA-subset check, `tsc -b`, `vite build`, bundle budget) from the workspace root; serves `dist` | `https://paved-bay.vercel.app` |
| `paved-doc` (docs) | `book` | `book/vercel.json` | `npm ci`, `npm run build`; serves `docs/dist`; an ignore step (`vercel-ignore-build.sh`); deploys of `main` only. Not touched: linked for reading only | `https://docs.paved.gg` (alias `https://paved-doc.vercel.app`) |

The web client is the Client v2, `packages/app`. The legacy client, `packages/app-web`, was removed in P-70 (see git history); no Vercel
project built it. The docs
project's `book/vercel.json` is another project's file; it is not read by these two. (The legacy `app/vercel.json` left with `app/` in #591.)

What the files set:

- **Install and build.** The Storybook's run from the repository root. The client's run from `packages/app`, so they `cd ../..`
  first: bun resolves the workspaces (`workspace:*`) from the root `package.json` and `bun.lock`, and turbo builds the client's
  packages (`game-core`, `chain`, `renderer`) before the app's `build` script, which is not bypassed. This needs the dashboard
  setting **Include files outside of the Root Directory in the Build Step** on (Vercel's default for new projects).
- **The file wins over the dashboard.** `installCommand`, `buildCommand`, `outputDirectory` and `framework` in `vercel.json` override
  the project's settings of the same names (Vercel: <https://vercel.com/docs/project-configuration>, "vercel.json" overrides the
  Project Settings). The client's file sets `"framework": null`, so the dashboard's preset and build override cannot shadow it.
- **Client build variables, public, in `build.env`:** `VITE_NETWORK=sepolia` (nothing in the build checks it: without it a production build has no network and its pages say "Not connected"),
  `VITE_INDEXER_URL=https://api.paved.bal7hazar.com` and `VITE_RPC_URL=https://starknet-sepolia-rpc.publicnode.com` (the
  deployment file's `rpc_url` is a placeholder). The Challenge and Setup addresses and the deployed block come from the committed
  `contracts/deployments/sepolia.json`: `VITE_CHALLENGE_ADDRESS`, `VITE_SETUP_ADDRESS` and `VITE_DEPLOYED_BLOCK` stay unset (each only
  overrides the file). `VITE_PLAYER_ADDRESS` and `VITE_PLAYER_PRIVATE_KEY` (the devnet burner) are never set, in a file or in the
  dashboard; the app reads them only behind a devnet build, so a Sepolia bundle holds neither. No other variable, and no secret.
- **Client routes:** every path without a file extension, and outside `assets/`, `renderer-assets/`, `fontawesome/` and `backgrounds/`,
  is rewritten to `/index.html` (the single-page app); a missing file is a 404, not the page.
- **Cache-Control.** Hashed paths are `public, max-age=31536000, immutable`: Vite's `assets/*`, `renderer-assets/models/*` (the
  hashed models, `forest/` included) and `renderer-assets/tiles/*` (the `<plan>.256.<hash>.png` images). `/`, `index.html`,
  `renderer-assets/manifest.json`, `THIRD_PARTY_NOTICES.txt`, `fontawesome/*` and `backgrounds/*` (unhashed) are `no-cache`. The
  Storybook adds `iframe.html`, `index.json` and `project.json` to the `no-cache` list. Everything else keeps Vercel's default.
- **Previews, on demand (2026-10-21).** Both files set `git.deploymentEnabled` to `{ "main": true, "**": false }`: a push deploys
  `main` only, and no branch or pull request gets a preview by itself (every push to a branch deployed both projects, about 145
  previews a day from 2026-10-17, and the CI job below already builds them). The label `preview` on a pull request deploys its head commit to both projects, and so does every later push
  while the label stays (`.github/workflows/preview.yaml`, triggered on `opened`, `reopened`, `labeled` and `synchronize`, so a pull
  request always gets a run: without the label the job is skipped; it runs `scripts/vercel/preview.sh` with the repository secret
  `VERCEL_TOKEN`, a token of the Vercel team); the job comments the URLs on the pull request. The script also runs by hand
  (`VERCEL_TOKEN=<token> sh scripts/vercel/preview.sh <branch> <sha>`). It deploys through Vercel's git source, so the ignore step
  below still runs: a project whose inputs did not change ends CANCELED. Previews stay behind Vercel Authentication. A preview of the
  client shows no indexer data: its `*.vercel.app` origin is not in the indexer's `--allow-origin` (CORS refuses it;
  `indexer-hosting.md`).
- **Build machine (dashboard, 2026-10-21).** Both projects build on a fixed Standard machine (4 vCPU, 8 GB; Build and Deployment,
  "Build Machine"), not Elastic, and the team's on-demand concurrent builds stay off. Vercel bills Standard builds by the CPU minute
  only when Elastic machines or on-demand concurrency are on: Elastic, the team's default, billed about 4 USD a day of builds from
  2026-10-17. The Storybook's 3072 MB heap fits in the 8 GB.
- **Ignore step (GUARDS, P-71).** Each file's `ignoreCommand` runs `scripts/vercel/ignore-build.sh client` or `storybook`: a
  deployment builds only when one of its project's inputs changed since the merge base with `main` (a pull request) or the last
  production build (`main`); on any doubt it builds. The Storybook's inputs are `packages/app`, `game-core`, `renderer`, `chain`,
  `ui`, `contracts/abis`, `contracts/deployments`, `bun.lock`, the root `package.json`, `turbo.json`,
  `tsconfig.base.json` and the root `vercel.json`, without any `*.md`; the client's are the same without the stories
  (`*.stories.tsx`, `src/stories/`, `.storybook/`) and the root `vercel.json` (`--paths <project>` prints them). Docs, the
  indexer, Cairo sources, `.github/` and `.claude/` build neither; the docs project builds on `book/` only.
  `scripts/vercel/ignore-build.test.sh` judges all three on real commits of `main`.
- **Before the merge (GUARDS, P-71).** The CI job `Vercel build (Sepolia)` runs both projects' install and build commands, read from
  these files with the client's `build.env`, on every pull request that touches their inputs; `bun run check` runs the same locally
  (`node scripts/check/vercel-build.mts <client|storybook>`), then `bun run budget` (each limit, the measured size, the margin).

**Release.** The client release is a Vercel production deploy of `packages/app` from `main`, after the release gates (the value
re-check of the diff first). `paved.bal7hazar.com` is served by the `paved` project and `storybook.paved.bal7hazar.com` by
`paved-storybook` (published from `main` on every merge, previews on demand with the label `preview`; `storybook-hosting.md`). Only
`api.paved.bal7hazar.com` stays on the VPS. CORS: the indexer's `--allow-origin` is `https://paved.bal7hazar.com`; a preview's
`*.vercel.app` origin is not in it, so previews show no indexer data. Domains are never deleted by an agent and DNS is the owner's.
Until 2026-10-17 the VPS served the client and the Storybook (see git history).

What only the dashboard can hold (the owner sets it): the root directory itself, the Include-files-outside-the-root setting, the
production branch, the preview deployments, the Node.js version (24.x, from `engines`; the docs project is on 18.x), the domains and
the Git connection.

**No secret env, anywhere.** The `vercel` CLI may be used, by plain `vercel` from `PATH` only (no other binary path, no `--token`, no
`--scope`, no credential file read). `vercel login`, `logout`, `teams` and `billing` are refused by the shim. Reserved to the owner,
never done by an agent: deleting a project or a domain, billing, the team, DNS, adding a domain, any secret env var. A refused
command is reported verbatim, not retried by another form.

## The order, with the indexer

The client and the indexer read the same file from the same commit, and the leaderboard needs both, so the order is:

1. **Before F:** CORE's F part B merged (F's `sepolia.json` on `main`); the CLIENT PR that reads `contracts.Faucet` merged; F's commit
   named by the PM. Nothing below starts earlier.
2. **Checks** against the file and the chain (above): all pass. A failure here is CORE's (a wrong deployment), not the client's;
   stop and report.
3. **Indexer** ("Release at F" in `indexer-hosting.md`): stop the service and the watch, release F's commit, `bun install --frozen-lockfile`,
   move the schema 6 database aside, `rebuild` in the foreground until `/v1/head` says `status ok`, `state ok` and `behind 0`, start
   the service and the watch. The single rebuild is this one, at schema 11 (it covers schemas 7 to 11: D-20, step E's 9, N1's 10, D-23b's 11).
4. **Client:** the Vercel production deploy of `main` at the same commit, with the env above. Done only after step 3 is done: a client published
   first would show "unavailable" for the leaderboard, the player pages and the quests. Every merge to `main` deploys production through
   Vercel's Git integration, and step 1 merges F's `sepolia.json`, a client input, so step 4 is held like this:
   1. **Before step 1** (the owner, in the dashboard): on the `paved` project, Settings, Environments, Production, Branch Tracking, turn off
      "Auto-assign Custom Production Domains". Vercel then builds the production deployment of F's merge commit as staged, without moving
      `paved.bal7hazar.com` (https://vercel.com/docs/deployments/environments, https://vercel.com/docs/deployments/promoting-a-deployment).
      If the dashboard names the setting differently, the owner uses its name and tells the PM.
   2. **After step 3** (a session allowed to run `vercel`, plain `vercel` from `PATH`): find the deployment of F's merge commit with
      `vercel api /v6/deployments` filtered to the `paved` project, target `production`, that commit's SHA and state `READY` (never
      `vercel ls`), then `vercel promote <deployment url>`.
   3. **After the promote** (the owner): turn "Auto-assign Custom Production Domains" back on. Until then no merge to `main` reaches the domain.
5. **Smoke** in a browser (below), against `https://paved.bal7hazar.com`.
6. **Done** (below). Report to the PM with the commit, the deployment and the smoke result.

## Smoke in a browser

Desktop Chrome, a fresh profile, `https://paved.bal7hazar.com`. Nothing is skipped silently: a step that cannot be done is a failure to
report.

| # | Step | Expected |
|---|---|---|
| 1 | Landing, not connected | the Challenge, Training and Tutorial cards show with no wallet; no console error about a missing deployment (`missing` is empty); the Challenge card shows today's top 3 or "no games yet" |
| 2 | Training: the Training card, Play | `/game?mode=training` opens, a tile can be placed, no wallet prompt, no transaction |
| 3 | `/tutorial` | the scripted tutorial plays to its end; the claim link is offered (`/tutorial/claim` needs a connected wallet) |
| 4 | Connect (Cartridge Controller) | the Controller opens, a username is created or chosen, the Landing says `Welcome, <username>` |
| 5 | Faucet: "Mint Test Tokens" | one signed transaction; the USDC balance rises by 100 (the faucet's per-call amount); a second press may hit the address cap and says so in plain words, never `MockUSDC` or an address |
| 6 | A purchase: the Challenge card, stake `1`, "Buy for ...", "Confirm purchase" | the quote shows, the router named is the file's `MockRouter`, one transaction is signed, the page moves to `/game?...&id=<n>` and the game loads with `0/38` placed |
| 7 | A move and the surrender | a tile is placed (one transaction), then Surrender / Confirm surrender ends the game with its score |
| 8 | Leaderboard: `/leaderboard` | the day's board lists the game with the player's Controller username (the connected player first), others by short address until their name resolves; the Landing's top 3 matches |
| 9 | Player page and quests | `/player/<address>` and `/quests` load from the indexer with no "unavailable" |

`scripts/e2e-sepolia/part-b.mjs` drives steps 4 to 8 headless with a virtual authenticator, for the owner to run; it targets Sepolia and
spends test funds, so it is not run by CI or by a thread. It clicks the Challenge card by `data-testid="mode-card-challenge"`. It also
writes `latency.json` and `latency.md` for steps 5 to 7 ("Latency", below); run it with `--extra-mint --purchases 2 --moves 5` for the release figures.

## Latency: what a player feels (S1, D-28)

D-28 (PM, 2026-10-14): no VRF, the mainnet questions are deferred, Sepolia stays, and an L3 is possible if performance is not enough.
The release smoke therefore produces the figures of two waits, a move and a purchase, each from the click to the confirmed state, and
the faucet mint measured the same way as a cheap control. The same run of `part-b.mjs` writes them; nobody reads a stopwatch. The code is `scripts/e2e-sepolia/latency.mjs`.

### What "confirmed" means in the client

Read from `packages/chain/src/writer.ts` (`sendNow`) and `session.ts` (`write`), not assumed:

1. `account.execute(calls)` returns the transaction hash once the transaction is signed and accepted by the node (**t1**).
2. `provider.waitForTransaction(hash, { retryInterval: 250 })` asks `starknet_getTransactionStatus` every 250 ms (`RECEIPT_POLL_MS`).
   starknet.js 8.9 has no `successStates` option set here, so its default holds: it waits for a `finality_status` of
   **`ACCEPTED_ON_L2`** (or `ACCEPTED_ON_L1`), then fetches the receipt with `starknet_getTransactionReceipt`. A rejected transaction is not an error state here (`errorStates` defaults to empty in 8.9): the wait ends in its timeout or a not-found error. It does **not**
   stop at `RECEIVED` or `PRE_CONFIRMED`: the client waits for a closed L2 block, not for the pre-confirmed one. A receipt with
   `execution_status: REVERTED` is an error, and the tile drawn at once is taken back.
3. The receipt's events move the board and the score (`Session.apply`, no read), then one read of `game` reconciles the next tile and the
   exact score (`Session.reconcile`), then `pending` is cleared. The Game page shows the label `Working...` (the Surrender button's text)
   for the whole of `pending`.

What the player sees for a move is therefore: the tile appears **at the click** (drawn pending, so the click itself feels instant), and
the move is **confirmed** when `Working...` goes away: after L2 acceptance, the receipt and the reconcile read. That state is **t2** of a move.
The 250 ms poll adds up to 250 ms to every wait for a receipt; it is the client's own and is part of the figure.

### The marks

All times are the host's `Date.now()` in ms, taken by the driver and by a probe inside the page that looks at the page every 20 ms (so
the page's marks have a resolution of 20 ms). The hashes, statuses and receipts come from the JSON-RPC answers the page receives (the driver reads
the hash, the status and that a receipt arrived, and keeps nothing else of an answer).

| Flow | t0 | t1 | t2 | t3 | Reported |
|---|---|---|---|---|---|
| **Move** | the C key press that the Game page accepts (the same as a click on Confirm: the hotkey calls the same handler) | the transaction hash is known, after signing | `Working...` is gone: board and score updated from the receipt, the state the UI treats as done | none | `t1-t0`, `t2-t1`, `t2-t0` |
| **Purchase** | the click on "Confirm purchase" | the hash | the receipt reached the page (the first answered `starknet_getTransactionReceipt` for the hash) | the address is `/game?...&id=<n>` | `t1-t0`, `t2-t1`, `t3-t2`, `t3-t0` |
| **Faucet mint** (control) | the click on "Mint Test Tokens" | the hash | the receipt reached the page | `Minting...` is gone, the button is back | `t1-t0`, `t2-t1`, `t3-t2`, `t3-t0` |

Extras, in the same files: for a move, `uiFeedback` (t0 to `Working...` shown), `accepted` (first time the node answered `ACCEPTED_ON_L2` for the
hash, since t0) and `receipt` (the receipt in the page, since t0); for a purchase, `board` (t0 to the `0 / 38` counter shown, the game
loaded). `latency.json` also lists, for each transaction, the first time each finality status was answered (`RECEIVED`, `PRE_CONFIRMED`,
`ACCEPTED_ON_L2`, since t0): the gap between the first `PRE_CONFIRMED` and `ACCEPTED_ON_L2` is what waiting for the pre-confirmed block
would save, if the answer to "is it enough?" is no. A status the page's poll never saw is absent, not zero.

**Fee and gas (S2).** After the run, before the files are written, `part-b.mjs` reads each sample's transaction from the node (`--rpc`, default the Sepolia RPC URL above), with reads only and no transaction:
`starknet_getTransactionReceipt` for `block_number`, `actual_fee` and `execution_resources`, and `starknet_getBlockWithTxHashes` for the block's `timestamp` (one read per block).
Each sample of `latency.json` then carries `tx` (the hash), `block`, `blockTimestamp` (seconds), `fee` as `{ amount, unit }` (`amount` a decimal string of the felt, `unit` `FRI` or `WEI`) and `resources`
(the receipt's `execution_resources` as given: `l1_gas`, `l1_data_gas`, `l2_gas`); the summary of each kind adds the median `fee` and `l2Gas` over the samples that were not prompted.
`latency.md` shows block, fee (STRK, 6 decimals, from FRI) and L2 gas beside the times, and a line per kind with the median fee and the median L2 gas. A read that fails leaves `null` (`n/a` in the table)
and a note; it never fails the run. The faucet mint is read the same way. These are what a player pays on chain, to set against the test and release profiles (the L3 question).

A sample is **prompted** when the Controller's frame was shown at any point between t0 and its end: the wait then includes a person's approval,
which the session is meant to avoid. It stays in the table and the JSON, and out of median and max.

### Samples and report

- **5 moves, 2 purchases, 1 faucet mint**, in one run: `bun scripts/e2e-sepolia/part-b.mjs --out <dir> --confirmed --username <name> --player <name> --extra-mint --purchases 2 --moves 5`.
  The order is: faucet mint, **purchase 1**, the 5 moves, **surrender** that game, back to the landing, **purchase 2**. A second purchase cannot happen while the
  first game is active: the Landing then offers "Resume" and hides the stake picker (`Landing.tsx`, `hasActiveGame`; `start-game.ts` resumes the active game).
  The second game is bought and left unplayed; both purchases cost the lowest stake of test funds. A run with `--purchases 1` (the default) measures one purchase;
  a second run then gives the second sample.
  The faucet's second press is not sampled: it may hit the address cap (smoke step 5).
- **Median and max** per column, over the samples that were not prompted (two purchases: the median is their mean, so read the max too).
- **Time of day**: `latency.md` carries the run's start in UTC and the time of each sample. Sepolia's load varies with the hour: a run at a quiet hour
  and one at a busy hour are not the same figure. The release run is one run at the hour it happens, said in the report; a second run at another
  hour is welcome and is a separate folder.
- **Output**, in the run's `--out` folder: `latency.json` (the raw samples with every mark and the statuses, and the summary) and `latency.md`
  (the tables). Both are written as samples arrive, so a run that stops half-way keeps what it measured. The evidence check of `part-b.mjs` covers them.
- **Not run by CI or by a thread**: `part-b.mjs` spends test funds on Sepolia. The code is exercised without Sepolia by `bun test scripts/e2e-sepolia/latency.test.mjs`
  (synthetic traffic) and by `scripts/e2e-sepolia/latency-devnet.mjs`, the same code driven against a devnet and the client's dev server (see its header:
  fresh `starknet-devnet --seed 42`, `scripts/deploy.sh devnet`, the client with `VITE_PLAYER_*`). A devnet seals a block per transaction at once, so its figures prove
  the instrumentation and are not release figures.

## Release notes

- **The controller's session is a wildcard.** The controller registers its session key as a wildcard. The keychain filters a
  session call client-side by (target, method), and never by calldata. The client keeps no token approve in the session (P-65),
  so each paid entry prompts once.
- **Sessions from before P-65 keep their old policies until they expire.** The controller's session is approved once, with the
  policies of the build that connected, and kept in the browser. A session created before the no-approve change (SESSION-NOAPPROVE,
  #487) still lists the paid `Challenge.spawn` and `Setup.buy_pack`, and the connect that created it ran the entry's approve to
  Challenge (up to 10 stakes): until that session expires, it can sign a bare `spawn` or `buy_pack` without a prompt, and a
  bare `spawn` can spend that standing allowance. The client no longer sends either one bare (each goes with its approve, in one
  multicall that prompts), so nothing it sends uses them; a player who wants them gone disconnects and connects again, which
  approves a session with the current policies. The allowance stays on chain until it is spent or set to 0.

## Release gates

- LIGHT-GPU: per-effect GPU frame times on both profiles, tier defaults set from them, and the flicker re-check with
  outlines on. The v2 app is not published to players before it lands (PM, 2026-10-15). **Done in #485**
  (`docs/client/v2-architecture.md` 5.5): "auto" is Medium (AO and soft shadows, no bloom) on every device, measured.
- Client value-path audit: before the v2 app is published on any public network (Sepolia included), one audit lens, Opus, read-only on the release commit, of the client's value paths: purchase and stake, packs, skins, claims, settle, spawn_free, the session policies and the referrer (PM, 2026-10-16).

## What "done" means

All of:

- the checks above pass on F's file, and `check-deployment.mjs` ends `every check passed; nothing was sent`;
- the indexer is `active`, `/v1/head` says `status ok`, `state ok`, a small `behind`, `chain_id` and `from_block` as the file's, and the
  names lookup is reachable (details in "Release at F");
- the Vercel production deployment of the `paved` project is F's commit (Ready);
- the smoke steps 1 to 9 pass, with the leaderboard showing a name;
- the PM has the commit, the deployment, the head block of the indexer and the smoke result.

## Open points

- **Faucet key:** settled by the PM and done in W1f (PR #357): `contracts.Faucet`, read alone, no `Token`. What stays: the cap-revert
  prefix `MockUSDC:` in `writer.ts` (recognised beside `Faucet:`, for the old Sepolia contract until F replaces it); it can go in a
  later cleanup once F is live. `sepolia.json` on `main` keys `MockUSDC` until F part B writes it.
- **`MockRouter`:** check 5 needs it. If F's file has none on Sepolia, the client cannot buy; that is a CORE question, not a skip.
- **Mac or VPS:** the smoke is a browser run by a person; a headless Mac run follows the project's browser rules (`--headless=new`,
  never a visible window while the owner uses the machine).
