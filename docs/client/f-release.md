# The client release at F (the fresh Sepolia deployment)

Written 2026-10-14 (F0, track CLIENT). P-53: one fresh Sepolia deployment after D-23b (#354). At F the Sepolia client and the
indexer are released **together**, against F's deployment file, with a single indexer rebuild at schema 11. This is the
checklist of that release. It is a description: **nothing is sent, deployed or changed on the VPS until CORE's F part B has merged**
and the PM gives the go. The PM copies the commands into the one root script for the owner; each says who runs it (root, or the
deploy user `paved-deploy`). No line holds a secret.

Related: the indexer's commands are "Release at F" in `docs/client/indexer-hosting.md`; the hosting layout, the build env and
`publish.sh` are in the same file.

## Inputs

| Input | Where it comes from | Used for |
|---|---|---|
| F's deployment file | `contracts/deployments/sepolia.json`, as CORE's F part B writes it and merges it to `main` | the client build (`import.meta.glob`), the indexer (`--deployment`), the checks below |
| F's commit | the full 40-character commit of `main` that contains that file **and** the client change below | one checkout for the indexer release and the client build |
| The Sepolia RPC URL | `https://api.cartridge.gg/x/starknet/sepolia/rpc/v0_10` (no key) | the checks, the build (`VITE_RPC_URL`), the indexer |
| The indexer's public URL | `https://api.paved.bal7hazar.com` | the build (`VITE_INDEXER_URL`) |

**The client must read F's keys before F's commit is built.** CORE's F writes the test USDC as `contracts.Faucet` (devnet.json
included), and the game as `contracts.Challenge`. Main already reads `contracts.Challenge` (D-23b, #354). The faucet key is **not**
read yet: `packages/chain` still reads `contracts.MockUSDC` (`deployment.ts`, `economy/deployment.ts`). PM's ruling (2026-10-14): the
client reads `contracts.Faucet` only, with no `MockUSDC` fallback, in **a separate CLIENT PR on CORE's F branch** (as W1a to W1e were),
so that `main` never reads a key its own `devnet.json` lacks. F0 does not touch `packages/chain`. Until that PR is merged, a client
built from F's file has no faucet (`deployment.mockUsdc` is empty) and resolves the Economy's USDC as missing, so the economy is not
configured. **F's commit must contain that PR.** Check 2 below fails a file whose `Faucet` is absent, and the smoke (faucet) fails a
build that does not read it.

## Checks against the file

Run before anything is released, and again once F is on `main`. Every check is read-only: JSON-RPC reads (`starknet_chainId`,
`starknet_blockNumber`, `starknet_getClassHashAt`, `starknet_call` of view functions). No transaction is built.

All of them in one command, from a checkout of F's commit (Node 24, no install needed):

```bash
CHECK_RPC_URL=https://api.cartridge.gg/x/starknet/sepolia/rpc/v0_10 \
  node scripts/client/check-deployment.mjs --file contracts/deployments/sepolia.json
```

Expected: one `PASS` line per check below and the last line `every check passed; nothing was sent`, exit 0. A `FAIL` line names the
key and the two values that differ, exit 1. (`SKIP MockRouter` is printed when the file has none.) The RPC URL is read from the
environment, not from an argument, because an argument shows in `ps`; `--rpc <url>` exists for a local node.

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

Done by the deploy user (`paved-deploy`) from a checkout of F's commit; see "Commands for the deploy user" in `indexer-hosting.md`.

Env (nothing here is secret; the bundle is public):

| Variable | Value |
|---|---|
| `VITE_NETWORK` | `sepolia` |
| `VITE_INDEXER_URL` | `https://api.paved.bal7hazar.com` (no `/v1`, no trailing slash) |
| `VITE_RPC_URL` | `https://api.cartridge.gg/x/starknet/sepolia/rpc/v0_10` (the file's `rpc_url` is the placeholder `$STARKNET_RPC_URL`; without this the build is "not connected") |

Leave every `VITE_*_ADDRESS` and `VITE_SUPPORTS_TOKEN_MINT` unset: the file supplies the addresses, and the faucet is offered on
Sepolia by default.

```bash
# (deploy user)
cd ~/paved && git fetch --all --prune && git checkout --detach <F-commit>
git log -1 --format=%H -- contracts/deployments/sepolia.json          # (read) F's file is in this commit
bun install --frozen-lockfile
VITE_NETWORK=sepolia \
VITE_INDEXER_URL=https://api.paved.bal7hazar.com \
VITE_RPC_URL=https://api.cartridge.gg/x/starknet/sepolia/rpc/v0_10 \
  bun run build --filter @paved/app-web
grep -rl 'api.paved.bal7hazar.com' packages/app-web/dist/assets | head -1   # must print a file: the URL is in the bundle
grep -rlF "$(jq -r .contracts.Challenge.address contracts/deployments/sepolia.json)" packages/app-web/dist/assets | head -1   # must print a file: F's Challenge is in the bundle
```

Expected: the build ends without error (Sepolia production build, VPS, 2026-10-11, commit 1235607: peak RSS 1.06 GB, 8 s, measured by
the owner); both `grep` lines print a file. If the first prints nothing, turbo dropped the `VITE_*` variables: rebuild with
`bun x turbo build --filter @paved/app-web --env-mode=loose` and the same variables. If the second prints nothing, the build read
another file (a stale checkout, or an address written in another form).

**Where it is published:** `/usr/local/lib/paved/publish.sh packages/app-web/dist "$(date +%Y%m%d-%H%M)-$(git rev-parse --short HEAD)"` (deploy
user), which copies the build to `/var/www/paved/releases/<name>` and swaps `/var/www/paved/current` in one atomic rename. Caddy serves
`https://paved.bal7hazar.com` from `current`. Rollback is `/usr/local/lib/paved/switch.sh <older-release>` (list with `--list`); it
needs no Caddy reload. Check: `curl -sI https://paved.bal7hazar.com/ | head -1` is `200`; `readlink /var/www/paved/current` is the new release.
Rolling the client back to a release built for the old contracts does not help once the indexer is rebuilt for F: the two go together.

## The order, with the indexer

The client and the indexer read the same file from the same commit, and the leaderboard needs both, so the order is:

1. **Before F:** CORE's F part B merged (F's `sepolia.json` on `main`); the CLIENT PR that reads `contracts.Faucet` merged; F's commit
   named by the PM. Nothing below starts earlier.
2. **Checks** against the file and the chain (above): all pass. A failure here is CORE's (a wrong deployment), not the client's;
   stop and report.
3. **Indexer** ("Release at F" in `indexer-hosting.md`): stop the service and the watch, release F's commit, `bun install --frozen-lockfile`,
   move the schema 6 database aside, `rebuild` in the foreground until `/v1/head` says `status ok`, `state ok` and `behind 0`, start
   the service and the watch. The single rebuild is this one, at schema 11 (it covers schemas 7 to 11: D-20, step E's 9, N1's 10, D-23b's 11).
4. **Client:** build from the same commit, with the env above, and publish. Done only after step 3 is done: a client published first
   would show "unavailable" for the leaderboard, the player pages and the quests.
5. **Smoke** in a browser (below), against `https://paved.bal7hazar.com`.
6. **Done** (below). Report to the PM with the commit, the release name and the smoke result.

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
spends test funds, so it is not run by CI or by a thread. It clicks the Challenge card by `data-testid="mode-card-challenge"`.

## What "done" means

All of:

- the checks above pass on F's file, and `check-deployment.mjs` ends `every check passed; nothing was sent`;
- the indexer is `active`, `/v1/head` says `status ok`, `state ok`, a small `behind`, `chain_id` and `from_block` as the file's, and the
  names lookup is reachable (details in "Release at F");
- `readlink /var/www/paved/current` is the release built from F's commit, and both bundle `grep` lines printed a file;
- the smoke steps 1 to 9 pass, with the leaderboard showing a name;
- the PM has the commit, the release name, the head block of the indexer and the smoke result.

## Open points

- **Faucet key:** settled by the PM (above): `contracts.Faucet`, read alone, in a separate CLIENT PR on CORE's F branch. What the PR
  must change in `packages/chain` (not done by F0): `deployment.ts` (`contracts.MockUSDC` to `contracts.Faucet`, the `DeploymentFile`
  type), `economy/deployment.ts` (the `USDC` pick), their tests, and `app-web`'s fixtures that key `MockUSDC`; `VITE_MOCK_USDC_ADDRESS`
  and the `MockUSDC` strings in `writer.ts` (the old reasons stay recognised) are its call. Until it merges, main reads
  `MockUSDC` and its devnet.json still keys it.
- **`MockRouter`:** check 5 needs it. If F's file has none on Sepolia, the client cannot buy; that is a CORE question, not a skip.
- **Mac or VPS:** the smoke is a browser run by a person; a headless Mac run follows the project's browser rules (`--headless=new`,
  never a visible window while the owner uses the machine).
