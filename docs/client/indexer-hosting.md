# Hosting the indexer for the Sepolia client

> History note: `packages/app-web`, which this document names, was removed in P-70; see git history. Until 2026-10-17 the VPS
> served the client and the Storybook (see git history); today Vercel does, and the VPS keeps the indexer and its API only.

Dated 2026-10-10. Decision D-16 (public test deployment of Paved on Starknet Sepolia, for playtests). This is what
`packages/indexer` needs to serve the public client. It is a description, not a deployment: nothing here is running, and
**where it runs is the owner's choice** (section 5; the exact procedure for this VPS is "Runbook: this VPS (Sepolia)" below). Options and rules of the process: `packages/indexer/README.md`; design:
`docs/architecture/indexer.md`.

The indexer is display only. It holds no key, sends no transaction, and its database can be deleted at any time (`rebuild`
makes it again from the chain). If it is down the game is still playable: the client reads the games, the prizes and the
claims from the contracts, and only the leaderboard, the player pages and the quests need the indexer (section 7).

## What the owner provides

1. **A Sepolia JSON-RPC URL** for the indexer (a provider's endpoint, usually with a key in it), speaking JSON-RPC **0.10**
   (section 2). It is a secret: it goes in the host's env file, never in the repository.
2. **A place to run one small process** (section 5): about 512 MB of memory for it, a few hundred MB of disk, outbound HTTPS to
   the RPC. One of: this VPS, a small VM, a PaaS.
3. **A public HTTPS name for the API** (a subdomain, e.g. `indexer.<domain>`) with a TLS certificate, since the client is served
   over HTTPS and a browser blocks plain-HTTP calls from an HTTPS page. A free Let's Encrypt certificate is enough.
4. **The exact origin the client is served from** (`https://<host>`, no path, no trailing slash): it goes in `--allow-origin`.
5. Not the owner's: `contracts/deployments/sepolia.json` (CORE, task S-1; the indexer reads its four addresses, `Collection` if
   present, `deployed_block` and `chain_id`).

## 1. The process

```bash
INDEXER_RPC_URL=<from the env file> node packages/indexer/src/main.ts run \
  --deployment contracts/deployments/sepolia.json \
  --db /var/lib/paved-indexer/sepolia.db \
  --host 127.0.0.1 --port 8787 \
  --allow-origin https://<the client's origin> \
  --depth l1 --poll 3000 --recheck 5 --recheck-every 60000
```

Node 24 runs the TypeScript directly (no build). `INDEXER_RPC_URL` is required: the deployment file's `rpc_url` is used only for
`network: devnet` at localhost. The indexer refuses to start if the node's chain id is not the file's (`SN_SEPOLIA` is
`0x534e5f5345504f4c4941`), or if the database was built for another deployment (then `rebuild`, section 6). Pass the RPC URL in
the environment, not as `--rpc`: an argument shows in `ps`. The indexer never logs the URL (a log line carries an 8-hex hash).

| Option | On Sepolia | Why |
|---|---|---|
| `--depth` | `l1` (the default) | The history of block headers kept below the tip goes down to the last block accepted on L1, which is final, so a replaced block can always be followed back to its fork point. A fixed number (`--depth 1000`) is the fallback if the provider refuses the `l1_accepted` block tag; check it first (section 2). |
| `--poll` | `3000` (ms; default 1000) | The idle wait between steps. Each step asks the node for its tip and one header. At 1 s that is about 3 calls per second all day (see the estimate below); a leaderboard that is 3 s late is not noticed, and the free tier of a provider is. Lower it only to watch a test. |
| `--recheck`, `--recheck-every` | `5`, `60000` | Rereads the last blocks below the tip for a replaced block. The code says this guards a devnet case (a replacement keeping the old hash); on a real network a replacement changes the hash and the tip check sees it. Keep a small window anyway (5 headers a minute); `--recheck 0` turns it off. |
| `--batch` | default `100` | Blocks applied per step near the tip (block by block). Leave it. |
| `--range` | default `10000` | With `--depth l1`: the blocks at or below the last L1-accepted block are final and are caught up by ranges of up to this many blocks (I1, `packages/indexer/README.md`, "Catching up"). Leave it. **Escape hatch:** `--range 0` goes back to block by block everywhere, for a chain whose block times are not non-decreasing or a node that refuses ranges. |
| `--concurrency` | default `8` | Above the L1-accepted block: blocks read at once, applied in order with the same checks (I2), and the most reads in flight. A rate limit (HTTP 429, JSON-RPC -32011) is waited out (`Retry-After`, at most 30 s) and lowers it for a while. Leave it. **Escape hatch:** `--concurrency 1` reads the tail one block after the other, as before I2; a rate limit is waited out and the read retried there too (before I2 it failed the step). |
| `--allow-origin` | the client's origin, once | Without it a browser blocks every answer. Exact string match (`https://a.b` is not `https://a.b/` nor `http://a.b`). Repeatable (one per origin, e.g. a staging page). |
| `--host`, `--port` | `127.0.0.1`, `8787` | Keep the loopback: the proxy is the public face (section 3). |

Stop it with `SIGTERM` (it closes the database cleanly). A decode failure or a database contradicting the chain **halts** it: the
process stays up and every route answers `503 halted`; it does not exit, so a process manager does not restart it. Watch
`/v1/head` (section 6).

RPC load near the tip, an **estimate from reading the code** (`indexer.ts`, `chain.ts`, not measured on a real node): per step,
`blockHashAndNumber` and one header check (2 calls); per new block, a header, one `getEvents` per contract (4, or 5 with
`Collection`), and one check of the previous block (about 8 calls per block); plus the recheck. At `--poll 3000` and `--recheck 5`
every minute that is under one call per second when idle, and about 8 more per block when blocks carry no events either.

**Catch-up** (I1): with `--depth l1`, the blocks at or below the last L1-accepted block are read by range, `getEvents` over the
range per contract and a header only for the blocks that carry an event, the day boundaries and the range's edge; the blocks
above it, near the tip, block by block as above. Measured on Sepolia on 2026-10-14 (VPS, the public Cartridge RPC, 2,000 blocks
from F's `deployed_block` 16559258, read-only, a scratch database; both databases identical table by table):

| Mode | Rate | RPC calls per 1,000 blocks | Wall time | Peak RSS |
|---|---|---|---|---|
| Block by block (main at b33bdb5) | 89.2 blocks/min | 6,131 | 22 min 26 s | 127 MB |
| By range (I1, `--range 10000`) | 29,460 blocks/min | 11 | 4.1 s | 131 MB |

A catch-up's time is then set by the blocks above the L1-accepted block (on Sepolia it lagged the tip by 774 to 1,035 blocks on
2026-10-14). Since I2 they are read 8 at a time (`--concurrency 8`) and applied in order. Measured on Sepolia on 2026-10-14 (VPS,
the public Cartridge RPC `.../sepolia/rpc/v0_10`, read-only, scratch databases, Node 24.21.0, heap capped at 384 MB, the runs
one after the other; the first two over the same 300 blocks above the L1 block 16569175):

| Tail above the L1 block | Rate | RPC calls per 1,000 blocks | Rate-limit answers | Peak RSS (largest process) |
|---|---|---|---|---|
| `--concurrency 1`, 300 blocks | 81.0 blocks/min | 6,103 | 0 | 131,728 kB (128.6 MiB) |
| `--concurrency 8`, the same 300 blocks | 481.7 blocks/min (5.9x) | 6,103 | 0 | 176,320 kB (172.2 MiB) |
| `--concurrency 8`, the whole tail to `behind 0` (989 blocks) | 445.1 blocks/min | 6,160 | 0 | 236,240 kB (230.7 MiB) |

A full `rebuild` from `deployed_block` 16559258, the real process with the defaults (`--range 10000 --concurrency 8`): the
range catch-up reached the L1 block 16569175 in 2.1 s, and `/v1/head` said `behind 0` at block 16570291 after **140.4 s**
(1,116 blocks of tail, 484 blocks/min); peak RSS **237,404 kB (231.8 MiB)** (`/usr/bin/time -v`), under the 384 MB heap cap and the
512 MB `MemoryMax` of section 2. At the tip it keeps up as before (Sepolia makes about 35 blocks a minute). The rates depend on
the node's latency more than on the VPS: at concurrency 1 a block's 6 calls, one after the other, took 0.74 s on average.

Ask the provider about its request limits all the same: the public node caps a `getEvents` page at 1024 events, which the
indexer uses, and bounds each answer's scan itself (continuation tokens). No rate limit was answered in the runs above; one
would be waited out (I2, `packages/indexer/README.md`, "Catching up").

## 2. What it needs from the host

| Need | Figure | Basis |
|---|---|---|
| Runtime | Node 24.x (the package's `engines`) with the repository checked out and `bun install --frozen-lockfile` run (one dependency, `starknet`, plus the workspace). bun 1.4.2 is only the installer; the service runs `node`. | `packages/indexer/package.json` |
| Memory | **159 MB** peak resident, heap capped at 384 MB (a rebuild of 149 blocks, then 50 s of requests). **217 MB** peak for a long-lived indexer with no heap cap, through restarts of the scenario. Set `--max-old-space-size=384`; give the process **512 MB** (`MemoryMax`), so 1 GB total for a small VM with the proxy. | Measured, appendix |
| CPU | One core is plenty. The run above used 28 s of CPU in 72 s of wall time, 50 s of which were load (section 4: five runs of 10 s, one of them a mistyped route that answered 400). Idle use was not measured separately. | Measured |
| Disk | **224 KiB** for 149 blocks, 74 events, 9 games, 3 players (devnet scenario). Rows: blocks about 0.5 KB each (149 rows, 72 KiB), events about 0.28 KB each (74 rows, 20 KiB); the other tables are one 4 KiB page each at this size. | Measured |
| Disk growth | **Estimate**, not measured on Sepolia: a game is on the order of ten events with its derived rows, so a few KB; 100,000 games would be a few hundred MB. A playtest is far below it. Block headers do not accumulate: `--depth l1` forgets those below the last L1-accepted block. Give it **1 GB** and the WAL file's few MB of headroom. | Estimate from the measured row sizes |
| Backup | None needed: `rebuild` makes the same tables from the chain. Keeping the file only saves the catch-up. | `README.md` |
| Network, out | HTTPS to the RPC host, and (N1, display names; off with `--no-names`) to `api.cartridge.gg` port 443, `POST /lookup`, at most one small request every 5 s. Reachable from this VPS on 2026-10-14 (HTTP 200 on a read-only request). | `names.ts` |
| Network, in | Loopback only for the indexer; 443 on the proxy (section 3). | |
| RPC | JSON-RPC **0.10** (`starknet_specVersion`): the events must carry `transaction_index` and `event_index`, and `starknet_getBlockWithTxHashes` must accept the block tag `l1_accepted`. Read-only methods only: `chainId`, `blockHashAndNumber`, `getBlockWithTxHashes`, `getEvents` (by block hash), `call`. | `chain.ts` |

Check a candidate provider before the first start (the URL stays in the shell variable, not in a file or a log):

```bash
for body in '{"jsonrpc":"2.0","id":1,"method":"starknet_specVersion","params":[]}' \
            '{"jsonrpc":"2.0","id":2,"method":"starknet_getBlockWithTxHashes","params":{"block_id":"l1_accepted"}}'; do
  curl -s -X POST -H 'content-type: application/json' -d "$body" "$INDEXER_RPC_URL" | head -c 200; echo
done
```

The first must answer `0.10.x`; the second a block (an error 24, "block not found", is also fine: the indexer then keeps
everything until one is final).

**The RPC URL.** `INDEXER_RPC_URL` is read from the process environment. On a host it lives in a file readable by root only
(`/etc/paved-indexer/env`, mode `0600`, one line `INDEXER_RPC_URL=https://...`), which systemd reads before it drops to the service
user. It is never committed, never pasted in a PR, a log or a chat.

## 3. Exposure

The API listens on `127.0.0.1:8787`. A reverse proxy on the same host terminates TLS and forwards to it. The indexer has no
authentication and no TLS of its own (it rate-limits per address itself, see the first bullet below), and its routes are GET-only and read-only (anything else is `405`); the data
is public chain data. What the proxy adds:

- **TLS** (HTTPS only; redirect or refuse port 80), with a certificate for the API's name.
- **CORS stays in the indexer**: it answers `access-control-allow-origin: <origin>` only for the origins of `--allow-origin`,
  and `Vary: Origin`. The client sends a plain `GET` with an `Accept` header, which is not preflighted. The proxy must pass the
  `Origin` header through and **must not add CORS headers of its own** (two `allow-origin` values make the browser refuse).
  CORS does not stop `curl`; it only says which web pages may read the answers.
- **Rate limiting is the indexer's own, per client address**, so a script cannot keep the single Node thread busy (ruling P-43).
  There is **no limit at the proxy or at the firewall**: the indexer holds a token bucket per address, `--rate` 10 requests per
  second refilled and `--burst` 20 by default (`--rate 0` turns it off); every request takes a token, whatever its method. Over
  it the answer is `429` with `Retry-After` (whole seconds) and CORS headers, and the client waits that long, once, before it
  falls back (section 7). One page view of the client makes a handful of requests and the client has no polling timer (it reads
  on page load, on a manual refresh and when the tab becomes visible again), so the defaults are generous. Measured capacity
  is in section 4.
- **The proxy must set `X-Forwarded-For`.** Behind the proxy the indexer sees only the proxy's address, so it reads the client
  from the **right-most `X-Forwarded-For` entry**, the one the proxy appended, and **only when the connection comes from
  `127.0.0.1`, `::1` or `::ffff:127.0.0.1`** (not any other `127.x` address: the proxy must dial `127.0.0.1` or `::1`); from any
  other peer the header is ignored. **Without `X-Forwarded-For` from a local proxy, every client counts as the proxy's one
  address and they all share one bucket**: ten playtesters would then be limited together. Caddy's `reverse_proxy` sets it by
  default (and replaces one sent by an untrusted client; see "Rate limiting (P-43)" in the runbook). nginx needs the line in the
  block below. Do not add a second limiter at the proxy: it would count the same traffic twice.
- **Only `/v1/` and only GET** are forwarded; anything else is `404` at the proxy.
- **Pass the indexer's answers through**, errors included: the client reads the JSON envelope of a `503` (`loading`, `rewinding`,
  `halted`) and shows a precise message. When the process is down the proxy's own `502` page is also handled (the client treats a
  non-JSON gateway answer as "cannot be reached").
- Optional: the indexer sends `cache-control: no-store` and already caches its answers per served block; a 2 s proxy cache of
  GET would only add a delay.

An nginx server block (the certificate lines are those `certbot --nginx` writes):

```nginx
server {
  listen 443 ssl;
  server_name indexer.example.org;                 # the owner's name
  ssl_certificate     /etc/letsencrypt/live/indexer.example.org/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/indexer.example.org/privkey.pem;

  location /v1/ {
    limit_except GET { deny all; }
    proxy_pass http://127.0.0.1:8787;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;   # the indexer's rate limit keys on this (right-most entry)
    proxy_read_timeout 15s;                        # the client gives up after 10 s
  }
  location / { return 404; }
}
server { listen 80; server_name indexer.example.org; return 301 https://$host$request_uri; }
```

A smoke test from outside: `curl -si -H 'Origin: https://<the client origin>' https://indexer.example.org/v1/head` answers `200`
(or `503` while loading) with `access-control-allow-origin: https://<the client origin>`; the same with another origin has no
such header.

## 4. Measured capacity (devnet)

On the VPS, 2026-10-10, bun 1.4.2, Node v24.21.0, a local `starknet-devnet` 0.10.0 on 127.0.0.1, the database of the devnet
scenario (head at block 160, 3 players, 9 games, 3 days), the indexer under `--max-old-space-size=384`, a load client in Node
(8 connections, same machine, so client and server share the cores):

| Route | Connections | Requests in 10 s | Req/s | p50 / p99 (ms) |
|---|---|---|---|---|
| `/v1/head` | 1 | 14,106 | 1,411 | 0.53 / 2.75 |
| `/v1/head` | 8 | 52,739 | 5,254 | 1.09 / 8.35 |
| `/v1/tournaments?limit=20` (a list) | 8 | 35,677 | 3,568 | 1.32 / 17.21 |
| `/v1/tournaments/20739/leaderboard?limit=20` | 8 | 56,313 | 5,632 | 1.08 / 7.22 |

Read these as an upper bound, not a promise: the rows of an answer are kept per served block, so after the first request of a
block nearly every one of these is a cache hit (the cache miss, a SQLite read, was not timed separately); the database is tiny;
there is no TLS and no proxy in the path. They say that a handful of playtesters will not load the process, and that the
indexer's own per-address limit (section 3), not a proxy limit, is the one to set. A Sepolia database with many players was not measured.

## 5. Where it can run (the owner's choice)

Nothing below is chosen or started. Each option needs the same four things from section "What the owner provides"; the
differences are these.

| Option | What it takes from the owner | Notes |
|---|---|---|
| **This VPS, behind a proxy** | A subdomain with a DNS record to the VPS, port 443 open to the internet, a TLS certificate (Let's Encrypt, free). No new cost. | The fastest, but the VPS is a shared machine for the team's agents (memory pressure, reboots, no uptime promise), so it suits a short playtest more than a standing service. A proxy (nginx or Caddy) is installed on it. |
| **A small VM** (any cloud, 1 vCPU, 1 GB, 10 GB disk) | An account and a monthly fee (small, set by the provider), a subdomain, a certificate. | The unit of section 6 as it is, on a machine that only runs this. A fixed address. |
| **A PaaS** (a container platform) | An account and a fee, the RPC URL as a platform secret, a persistent volume for the SQLite file if the platform has one. The platform terminates TLS on its own `*.app` name; a custom subdomain is optional. | One always-on instance (no scale to zero, one replica: each replica would index on its own). Without a persistent volume the database is lost at every restart and the indexer catches up again from `deployed_block` (RPC calls, section 1): acceptable for a short playtest. The container sketch of section 6 applies. |

## 6. Process manager, redeploy, health

A systemd unit (a dedicated user, the env file, the heap cap, restart on failure). Paths assume a checkout at `/opt/paved` and
`bun install --frozen-lockfile` run there:

```ini
# /etc/systemd/system/paved-indexer.service
[Unit]
Description=Paved indexer (Sepolia)
After=network-online.target
Wants=network-online.target

[Service]
User=paved-indexer
Group=paved-indexer
WorkingDirectory=/opt/paved
EnvironmentFile=/etc/paved-indexer/env
Environment=NODE_OPTIONS=--max-old-space-size=384
ExecStart=/usr/bin/node packages/indexer/src/main.ts run \
  --deployment contracts/deployments/sepolia.json \
  --db /var/lib/paved-indexer/sepolia.db \
  --host 127.0.0.1 --port 8787 \
  --allow-origin https://CLIENT_ORIGIN \
  --depth l1 --poll 3000 --recheck 5 --recheck-every 60000
Restart=on-failure
RestartSec=5
RestartPreventExitStatus=2
TimeoutStopSec=15
StateDirectory=paved-indexer
MemoryMax=512M
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=/var/lib/paved-indexer

[Install]
WantedBy=multi-user.target
```

`useradd --system --no-create-home --shell /usr/sbin/nologin paved-indexer`; the env file is `root:root 0600`. Exit code 2 is a
configuration error (a missing option, a refused database, a wrong chain id): `RestartPreventExitStatus=2` stops the restart
loop and leaves the message in `journalctl -u paved-indexer`.

**A container**, if the platform wants one (a sketch, not built or run): an image of Node 24 with the checkout and the
dependencies installed, `ENV NODE_OPTIONS=--max-old-space-size=384`, `ENTRYPOINT ["node","packages/indexer/src/main.ts"]`,
`CMD` the arguments of section 1 with `--host 0.0.0.0` (inside the container; publish the port only to the platform's proxy),
the database on a volume at `--db`, and `INDEXER_RPC_URL` as a runtime secret, not a build argument.

**After a redeploy of the contracts** (new addresses in `sepolia.json`): `run` refuses a database built for another deployment,
on purpose. Stop the service, then either delete the three files (`sepolia.db`, `-wal`, `-shm`) and start it, or run the
`rebuild` command (the same arguments with `rebuild` instead of `run`) in the foreground until `/v1/head` says `state: "ok"` and
`behind: 0`, stop it with Ctrl-C, and start the service. A `rebuild` also serves the API while it catches up; the routes answer
`503 loading` until it has. For new code only (the same contracts), `git pull`, `bun install --frozen-lockfile`, `systemctl restart`.
A database of another schema version is refused too (`SchemaMismatch`: `rebuild` it). Schema 7 (D-20) needs a `rebuild` at the next deployment: the running database is schema 6, which the D-20 indexer refuses; the rebuild happens with the fresh Sepolia deployment (P-53), not before. Schema 11 (D-23b) is the one F rebuilds into: the exact commands are "Release at F" in the runbook below.

**Health.** `curl -s http://127.0.0.1:8787/v1/head`: `state` is `ok` (not `loading`, `rewinding`, `halted`), `behind` is a few
blocks at most, `checks.last_mismatch` is `null` (a day whose replayed prize slots differ from the contract's `tournament` view
shows there), `chain_id` is `0x534e5f5345504f4c4941`. `halted` needs a person: read the journal, then `rebuild`.

## 7. How the client points at it, and when it is down

Until 2026-10-17, `packages/app-web` read **`VITE_INDEXER_URL`** (`src/utils/network.ts` into `createIndexerClient` of `@paved/chain`); `packages/app`
reads the same variable (`src/routes/sources.ts`). It is the
base URL **without `/v1`** and without a trailing slash, e.g. `VITE_INDEXER_URL=https://indexer.example.org`. It is a Vite
build-time variable: it is baked into the bundle, so changing the indexer's address means building and serving the app again.
Unset or blank, the client has no indexer and the screens say "unavailable" without asking anything. Use an `https://` URL: a
page served over HTTPS cannot call `http://`. The origin the page is served from is the one `--allow-origin` names.

When the indexer answers `429` (its per-address rate limit, section 3) the client waits the `Retry-After` seconds, at most 10 s, and
asks once more; a second `429`, or a `429` without a numeric `Retry-After`, is handled as an indexer failure below (the bounded RPC
scans where the screen has them). It never loops.

When the indexer is out of reach (the process down, the host down, a `5xx` page, no answer within the client's 10 s timeout, a
CORS refusal), the screens that use it say so (the leaderboard and the player page with a Retry button): the leaderboard "Leaderboard unavailable: the indexer cannot be
reached", the quests and the player page the same with their name. While it is `loading`, `rewinding` or `halted` they say it is
starting, catching up or halted; when it is more blocks behind than the client's `maxLag` the rows are marked late with "Updated
N blocks behind". The rest of the app is untouched, because it does not use the indexer: playing, buying a game, claiming a prize,
the prizes and the Vault read the contracts through the RPC node. One exception, only when the build has neither
`VITE_COLLECTION_ADDRESS` nor a deployment file with `contracts.Collection`: the client then asks `/v1/head` for the Collection's
address, and shows no NFT while the indexer is out. The deployment file of the build has it, so this does not occur on a normal
build.

## Runbook: this VPS (Sepolia)

Dated 2026-10-10. Decisions D-16 and P-41. This is the owner's exact procedure to serve the Sepolia indexer's API
from this VPS. **Nothing here is done or running**: the agents prepared it and ran no root act. It replaces, for this VPS,
the nginx block of section 3 and the unit of section 6 (the files below are the unit and the proxy of record). Files:
`deploy/indexer/` (`paved-indexer.service`, `Caddyfile`, `watch.sh`, `paved-indexer-watch.{service,timer}`).

**The indexer unit starts only once `contracts/deployments/sepolia.json` is merged** (CORE, task S-1): the indexer reads its
addresses and `deployed_block`, and the client build reads the same file. Everything before step 8 can be done earlier.

### What runs where

| What | Name | Where |
|---|---|---|
| Client (static build) | `https://paved.bal7hazar.com` | Vercel (`docs/client/f-release.md`, "Vercel"); not on this VPS |
| API | `https://api.paved.bal7hazar.com` | Caddy → `127.0.0.1:8787`, `/v1/*`, GET only |
| Indexer | `paved-indexer.service` | user `paved-indexer`, code `/opt/paved-indexer/current` (root-owned), db `/var/lib/paved-indexer/sepolia.db` |
| RPC | `https://api.cartridge.gg/x/starknet/sepolia/rpc/v0_10` | spec 0.10.2, `SN_SEPOLIA`, `l1_accepted` and `getEvents` answer (checked by the PM). It carries no key: plain `Environment=` in the unit, no secret file. |

DNS of the API name is **done** (owner, 2026-10-10): `api.paved.bal7hazar.com` resolves to this VPS, `31.97.36.234`. Caddy gets its certificate (Let's Encrypt,
HTTP-01 on port 80) when it first serves the name, so 80 and 443 must be reachable first (step 6 before step 7).

### What this VPS has today (read-only checks, 2026-10-10, no root)

| Question | Answer |
|---|---|
| Who listens on 80 and 443 | `*:80` and `*:443` (IPv4 and IPv6), both **already taken** by a process whose name `ss -ltnp` does not show: without root `ss` names only the caller's own processes. It is almost certainly the existing **Caddy** (see next row), which serves other sites of the team. Nothing listens on **8787**. |
| Proxy installed | **Caddy 2.11.4** (`/usr/bin/caddy`, the apt package), with a live `/etc/caddy/Caddyfile` (root:caddy 0640, unreadable here) and seven dated backups. No nginx. `systemctl is-active` was refused in this session, so "running" is inferred from the listeners. |
| OS | Ubuntu 24.04.4 LTS, systemd 255 (255.4-1ubuntu8.17) |
| Runtime | `/usr/bin/node` v24.21.0, the `nodesource` apt package `24.21.0-1nodesource1`: **system-wide, nothing to install**. bun is **not** system-wide (`/usr/local/bin` holds only `asdf`): step 2 installs it. `jq`, `curl`, `logger` are in `/usr/bin`. |
| Firewall | `ufw status`, `nft`, `iptables`: all need root ("You need to be root"). Unknown. Step 6 reads it first. |

**Consequence: Caddy is shared.** The runbook adds one site block through an `import` and reloads; it never replaces the main
Caddyfile, and it does not start a second Caddy (it could not bind 80/443).

### Rate limiting (P-43)

Caddy's core has no rate limiter, and a firewall limit on 80/443 would hit every other site on this VPS (and is a machine
security setting, the owner's). So the limit lives **in the indexer**: a per-address token bucket, flags `--rate <req/s>` and
`--burst <n>` (`--rate 0` disables; defaults 10 and 20; over it `429` with `Retry-After`). **The unit's `ExecStart` leaves both flags out, so the indexer's
defaults apply**; add `--rate` and `--burst` to it only to change them.

The indexer sees only Caddy's loopback address, so it takes the client address from `X-Forwarded-For`, and **trusts that header
only when the connection comes from 127.0.0.1**. Caddy must therefore pass the client address. Checked on this VPS's Caddy
(v2.11.4), with a throwaway `reverse_proxy` to a header-echoing backend on loopback: the backend received
`x-forwarded-for: 127.0.0.1` (the connecting address, here a local curl) and `x-forwarded-proto: http`, and a request carrying a
forged `X-Forwarded-For: 1.2.3.4` still arrived with `127.0.0.1`: Caddy replaces a header from an untrusted client, so a caller
cannot pick its own bucket. `deploy/indexer/Caddyfile` sets no `trusted_proxies`, which keeps it so; do not add one without
rereading this. Step 9 checks it on the real site.

What Caddy still caps before the indexer: `/v1/*` only, GET only (405 otherwise; the client sends simple GETs with no preflight, and the indexer would answer an OPTIONS with 405 anyway), a 1 KB request body, 2 s dial and 15 s
response timeouts. The main Caddyfile's global `servers { timeouts }` belong to the shared global block, which this runbook does not
touch; set them there if wanted.

### What each hardening directive costs the indexer

The process reads its checkout, writes the database and its `-wal`/`-shm` files, opens outbound HTTPS to the RPC, and listens on
`127.0.0.1:8787` (`main.ts`, `store.ts`). Nothing else.

| Directive | Why it does not break it |
|---|---|
| `User=paved-indexer`, `CapabilityBoundingSet=` (empty), `NoNewPrivileges` | Port 8787 is above 1024; no capability is used. |
| `ProtectSystem=strict`, `ReadWritePaths=/var/lib/paved-indexer` | The whole file system is read-only except the state dir, where SQLite creates `sepolia.db-wal` and `-shm` (the directory must be writable, not only the file). The checkout under `/opt` is read. |
| `ProtectHome`, `PrivateTmp`, `PrivateDevices`, `ProtectKernel*`, `ProtectControlGroups`, `RestrictSUIDSGID`, `LockPersonality` | The process uses no home, no `/tmp` file, `/dev/null` and `/dev/urandom` only (both kept by `PrivateDevices`). |
| `MemoryMax=512M` with `--max-old-space-size=384` | Heap capped below the limit; measured peak 217 MB (section 2). |
| `RestartPreventExitStatus=2` | Exit 2 is a configuration error; restarting cannot fix it. |
| **Not set**: `MemoryDenyWriteExecute`, `RestrictAddressFamilies`, `SystemCallFilter` | V8 needs executable memory; the resolver may need netlink/unix sockets; not tested on this host, and an untested filter can fail a start. |
| `halted` | The process stays up and answers 503 `halted` (`main.ts` waits for a signal): systemd never sees an exit. The watch timer (step 8) logs it. |

### `/v1/head` watch

`watch.sh`, run every minute by `paved-indexer-watch.timer` as root (it may restart the indexer). Fields, from `server.ts`/`api.ts`:
a **200** is `{"status":"ok","state":"ok","head":{"number":N,"hash":…,"timestamp":…},"behind":B,"checks":{"last_mismatch":null|{…}},…}`;
a **503** is `{"status":"loading"|"rewinding"|"halted","reason":…,"head":…|null}` (the key is `status`; `state` is only on the 200).

| Condition | Action | Why |
|---|---|---|
| `status` = `halted` | **Logs at `err`, every minute; no restart** | A restart replays the same blocks and halts again (decode failure, or a database contradicting the chain). It needs a person: `journalctl -u paved-indexer`, then rebuild. |
| No answer (process up but not serving, curl fails) for 3 minutes | Restart | A hung start or dead listener. A stopped or failed unit is left to systemd. |
| `status` = `ok` and `head.number` unchanged for 5 minutes | Restart | A stalled RPC connection. |
| `status` = `error` (an HTTP 500: a bug in the indexer, not a state) | Counts as **no usable answer**: logged at `warning`, restart after 3 minutes in a row | The state is unknown and the process may be wedged; the cooldown still applies. |
| `checks.last_mismatch` not null | Logs at `err` | The replayed prize slots differ from the contract's view. |
| `loading`, `rewinding` | Logs at `info` | Catch-up and rewind are normal. |

At most one restart per 10 minutes, so a provider outage is not a restart loop. Read it with `journalctl -t paved-indexer-watch`.

### The client side

`VITE_INDEXER_URL=https://api.paved.bal7hazar.com` **at build time**. `createIndexerClient` (`packages/chain/src/indexer.ts`) trims
the value and strips trailing slashes, then calls `${base}/v1/...` with `fetch`; a blank value means "no indexer" (screens say
"unavailable"). Here the API has its own name, so it is a cross-origin call from `https://paved.bal7hazar.com` and CORS applies:
the indexer answers `access-control-allow-origin: https://paved.bal7hazar.com` because of `--allow-origin`, and Caddy adds no
CORS header of its own. The client's plain `GET` with an `Accept` header is not preflighted.

The Sepolia build env, from what `packages/app-web` read until 2026-10-17 (`src/utils/network.ts`, `economy-network.ts`, `main.tsx`):

| Variable | Value | Note |
|---|---|---|
| `VITE_NETWORK` | `sepolia` | Picks `contracts/deployments/sepolia.json`, read at build time by `import.meta.glob` (addresses, `chain_id`, `deployed_block`, `contracts.Collection`, the economy's addresses). Without that file the build is "not connected" (`missing` lists it in the console). |
| `VITE_INDEXER_URL` | `https://api.paved.bal7hazar.com` | Above. |
| `VITE_RPC_URL` | `https://starknet-sepolia-rpc.publicnode.com` | Overrides the file's `rpc_url`, which on Sepolia is the placeholder `$STARKNET_RPC_URL` and is never called: **without this variable the build is "not connected"**. Cartridge's Sepolia RPC, the earlier value, answers 410 to every request since 2026-10-30 (a failed CORS preflight: "Failed to fetch" in the browser, #918). No key, so it may sit in a public bundle. |
| not set | `VITE_PLAYER_*` | Devnet only (a key in a bundle is public); other networks ignore them. |
| not set | `VITE_*_ADDRESS` | The file supplies them; an override is for an operator patch only. |
| not set | `VITE_SUPPORTS_TOKEN_MINT` | Unset means the faucet is offered on devnet and Sepolia (the test-USDC faucet, D-16, P-39), and `resolveDeployment` resolves a Faucet for those two networks only, never mainnet. The controller's session holds `Faucet.mint` on Sepolia. |

### The client is served by Vercel

The client (`https://paved.bal7hazar.com`) and the Storybook are served by Vercel (projects, deploys and ignore steps:
`docs/client/f-release.md`, "Vercel"); only `api.paved.bal7hazar.com` (this proxy and the indexer) is on the VPS. Until 2026-10-17
the VPS served the client and the Storybook (see git history). The indexer's `--allow-origin` is `https://paved.bal7hazar.com`:
the same name, served by Vercel, so the app on that domain reaches the API. Vercel preview URLs (`*.vercel.app`) are not in
`--allow-origin`, so the browser refuses their reads by CORS: **preview builds show no indexer data** (the leaderboard and the
player page say the indexer is unavailable). An origin is added to `--allow-origin` only by the owner's service-file change.

### Cartridge controller: does it need this origin registered?

**Finding: no registration, allow-list or redirect entry is required to connect the controller with the client's own
policies from `https://paved.bal7hazar.com` on Sepolia; nothing in the package or the docs asks for one.** What is not
obtained that way is *verification*: the approval screen shows the policies as unverified. Evidence:

- The client builds the controller with `chains: [{ rpcUrl }]`, `defaultChainId`, **`policies`** and no `preset`
  (`packages/chain/src/auth/controller.ts`). `@cartridge/controller` 0.13.16, `src/controller.ts:542`, accepts either
  `policies` or `preset` ("Either `policies` or `preset` must be provided"), and `policies.ts:30` (`parsePolicies`) marks
  policies given directly `verified: false`. The package has no origin allow-list: its `origin` references are `revoke(origin)`,
  the keychain's own `origin` option, and the toast's message checks. The keychain it loads is `https://x.cartridge.gg`
  (`constants.ts`), which sees the embedding page's origin; what that server does with it is not in the package.
- Docs, https://docs.cartridge.gg/controller/sessions: "Both verified and unverified policies follow the same approval flow,
  with verified policies providing enhanced trust indicators"; verified configs are committed to the `configs` folder of
  `@cartridge/presets`, with Cartridge's review. Unverified policies list each token on the spending-limit screen
  instead of a compact summary. Nothing there mentions an origin to register for web use.
- Docs, https://docs.cartridge.gg/controller/presets: a preset's `origin` field "specifies which origins are authorized to use
  your preset" (a string or an array, e.g. production and staging). That scopes **a preset**, which this client does not use.
  `redirectUrl`/`disconnectRedirectUrl` belong to the native/redirect flow, not the iframe flow of a web page.
- Requirement met by the plan: a secure context (HTTPS, for WebAuthn). The proxy sends no CSP or Permissions-Policy that could
  block the iframe.

Not proven: no browser ran (this task has none), and the keychain's server side is not readable. **The headless run of the real
controller on Sepolia (D-16, CLIENT, after `sepolia.json` merges) is the test.** If it were refused for this origin, the error
would come from `x.cartridge.gg`; the owner's route would then be Cartridge's channel for adding the origin. **Decision (P-43): no preset now.** Unverified policies are acceptable for playtests; revisit before mainnet. (What it would be, for
then: a nicer approval screen, not needed to play: a PR to `cartridge-gg/presets` adding a config under `configs/` with
`"origin": "https://paved.bal7hazar.com"` and the Sepolia contracts and methods of `CONTROLLER_ENTRY_POINTS` (and the faucet's `Faucet.mint`), then passing `preset`
to the controller; it needs Cartridge's review.)

### Commands for the owner (root), in order

Run as root on this VPS (`sudo -i`). `<commit>` is a full 40-character commit of `main` that contains `deploy/indexer/` (this PR) and
`contracts/deployments/sepolia.json` (S-1). Each step ends with its check; stop at the first one that does not match.

**1. Users and directories**

```bash
useradd --system --user-group --no-create-home --home-dir /var/lib/paved-indexer --shell /usr/sbin/nologin paved-indexer
install -d -o paved-indexer -g paved-indexer -m 0750 /var/lib/paved-indexer
install -d -o root -g root -m 0755 /opt/paved-indexer /opt/paved-indexer/releases
```

Verify: `id paved-indexer`; `ls -ld /var/lib/paved-indexer /opt/paved-indexer`
(owners `paved-indexer`, `root`); `getent passwd paved-indexer` ends in `/usr/sbin/nologin`.

**2. Runtime**

```bash
node --version        # must print v24.x; on this VPS v24.21.0 (/usr/bin/node, apt nodejs 24.21.0-1nodesource1): nothing to install
# If node were absent: apt-get install -y nodejs=24.21.0-1nodesource1   (needs the NodeSource repository already configured)
# bun 1.4.2 (the repository's packageManager): installer of the checkout and builder of the client, not run by the service.
d=$(mktemp -d) && cd "$d"
curl -fsSLO https://github.com/oven-sh/bun/releases/download/bun-v1.4.2/bun-linux-x64.zip
curl -fsSLO https://github.com/oven-sh/bun/releases/download/bun-v1.4.2/SHASUMS256.txt
grep ' bun-linux-x64.zip$' SHASUMS256.txt | sha256sum -c -
unzip -q bun-linux-x64.zip && install -m 0755 bun-linux-x64/bun /usr/local/bin/bun
cd / && rm -rf "$d"
```

Verify: `node --version`, `/usr/local/bin/bun --version` prints `1.4.2`, and `sha256sum -c` printed `OK`. (The release URL pattern is bun's;
it was not downloaded in this session. If `unzip` is missing: `apt-get install -y unzip`.)

**3. The code: a checkout of `<commit>`, root-owned**

```bash
COMMIT=<commit>
git clone --no-checkout https://github.com/stolslilabs/paved.git /opt/paved-indexer/releases/$COMMIT
git -C /opt/paved-indexer/releases/$COMMIT checkout --detach $COMMIT
cd /opt/paved-indexer/releases/$COMMIT
bun install --frozen-lockfile --ignore-scripts --filter @paved/indexer
chmod -R go-w .
ln -sfnT releases/$COMMIT /opt/paved-indexer/current.new && mv -T /opt/paved-indexer/current.new /opt/paved-indexer/current
```

Verify: `git -C /opt/paved-indexer/current rev-parse HEAD` equals `<commit>`; `ls /opt/paved-indexer/current/deploy/indexer`
lists the files; `cd /opt/paved-indexer/current/packages/indexer && node --input-type=module -e "await import('starknet'); console.log('starknet ok')"`;
`ls -l /opt/paved-indexer/current/contracts/deployments/sepolia.json` (needed from step 8; if the repository is private, clone with
the owner's credentials).

**4. Install the units and the Caddy site (nothing started)**

```bash
D=/opt/paved-indexer/current/deploy/indexer
install -m 0644 $D/paved-indexer.service $D/paved-indexer-watch.service $D/paved-indexer-watch.timer /etc/systemd/system/
install -m 0644 -o root -g caddy $D/Caddyfile /etc/caddy/paved.caddy
systemctl daemon-reload
```

Verify: `systemd-analyze verify /etc/systemd/system/paved-indexer.service /etc/systemd/system/paved-indexer-watch.service /etc/systemd/system/paved-indexer-watch.timer`
prints nothing; `grep -n 'allow-origin\|INDEXER_RPC_URL' /etc/systemd/system/paved-indexer.service` shows
`https://paved.bal7hazar.com` and the Cartridge Sepolia URL.

**5. Caddy: already installed, add the API site**

```bash
systemctl is-active caddy                      # must print "active"; if not, stop: the shared Caddy is another unit (caddy-api?) or down
caddy version                                  # v2.11.4 here (apt). Already installed: skip the install below.
# Only if absent (official repository, pinned):
#   apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl gnupg
#   curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
#   curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt > /etc/apt/sources.list.d/caddy-stable.list
#   apt-get update && apt-get install -y caddy=2.11.4
grep -n 'paved\|^import\|admin' /etc/caddy/Caddyfile   # read it: other imports, an `admin off`, any block or import for these names
BAK=/etc/caddy/Caddyfile.bak-$(date +%Y%m%d-%H%M%S)-paved
# One branch does all three, and only while the import is absent: back up (never overwriting), note the backup, append the import.
grep -qxF 'import /etc/caddy/paved.caddy' /etc/caddy/Caddyfile || { cp -an /etc/caddy/Caddyfile "$BAK" && echo "$BAK" > /root/paved-caddy-backup && printf '\nimport /etc/caddy/paved.caddy\n' >> /etc/caddy/Caddyfile; }
runuser -u caddy -- caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
```

Verify: `systemctl is-active caddy` printed `active`, the last command ends with `Valid configuration`, and
`grep -c '^import /etc/caddy/paved.caddy$' /etc/caddy/Caddyfile` prints `1`. An "ambiguous site definition" has two possible
causes: check the import count first (a double import gives it; the line is added only once by the command above, so a second one
means it was added by hand or by an earlier run: delete the extra line), and only then look for a block in the main file for
the API name (remove that block; the backup keeps it). Nothing is loaded yet: the running Caddy still has its old config.

**Revert, if validate failed or a reload is rejected and you stop here** (the running config never changed, so no reload is needed).
It takes the one import line out of the main file and then removes the site file, so it does not depend on which backup is recorded
(a re-run of step 5 while the import is there makes no new backup and does not move the note):

```bash
sed -i '\#^import /etc/caddy/paved.caddy$#d' /etc/caddy/Caddyfile      # that exact line only; first, so the file never imports a missing file
rm -f /etc/caddy/paved.caddy
runuser -u caddy -- caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile     # Valid configuration: back to how it was
```

Never restore a backup and then delete `paved.caddy` without this `sed`: if the backup holds the import line, the main file would
import a missing file (`File to import not found`) and the next restart or reboot would take every site down. The backup named in
`/root/paved-caddy-backup` is for reference only (`diff` it against the main file). A block you removed from the main file *after* the
first run exists only in the first backup, and only `cp -a` of that one brings it back. Same commands, simulated on scratch copies
(one imported site file and one main file; `validate` replaced by "every import exists"), what the disk holds:

| Sequence | Import lines in main | `paved.caddy` | Backups | Note points at | Main file imports a missing file? |
|---|---|---|---|---|---|
| Step 5 once, then revert | 1, then 0 | yes, then no | 1 (the original) | that backup | no |
| Step 5 twice, then revert | 1 after both (the second run does nothing), then 0 | yes, then no | 1 (no second backup) | the first backup | no |
| Validation fails; fix the main file (keep the import line); step 5 again; validate | 1 | yes | 1 (made by the first run, holds the pre-fix file) | that backup | no |
| Revert twice | 0 | no | unchanged | unchanged | no (the second revert changes nothing) |

**6. Firewall: 80 and 443 open, 8787 not exposed**

```bash
ufw status verbose                                  # if "Status: inactive", do not enable it here: the ports are already reachable
# only if the status is active:
ufw allow 80/tcp && ufw allow 443/tcp && ufw deny 8787/tcp
```

Note, for each rule, whether ufw printed `Rule added` or `Skipping adding existing rule`: the removal deletes only the rules this step added.

Verify: `ufw status | grep -E '80|443|8787'` (if active); `ss -ltn 'sport = :8787'` prints nothing yet (the indexer listens on
loopback only, never on `0.0.0.0`, once started). From another machine: `curl -sI http://api.paved.bal7hazar.com` answers (Caddy already
holds port 80). No rate limit is set at the firewall (P-43).

**7. Caddy: load the site (certificate)**

Branch on what step 5's `grep -n admin /etc/caddy/Caddyfile` printed. **Never run a restart because a reload failed**: a rejected
reload leaves every site on its old, working config, while a restart would load the rejected config and take all of them down.

- **No `admin off`** (the admin endpoint is on): reload only.

  ```bash
  systemctl reload caddy
  ```

  If it fails, stop. The old configuration is still serving; read why with `journalctl -u caddy -n 50 --no-pager`, fix the file, run
  the `caddy validate` of step 5 again, and reload again. Do not restart.

- **`admin off`** (the dated backup names in `/etc/caddy` suggest one was set once): `reload` cannot work, and only a restart applies
  the change. **A restart briefly interrupts every other site this VPS serves through Caddy**, so the owner chooses the moment. Two
  separate commands, the second only if the first printed `Valid configuration`:

  ```bash
  runuser -u caddy -- caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
  systemctl restart caddy
  ```

Verify: `dig +short api.paved.bal7hazar.com` prints `31.97.36.234`;
`journalctl -u caddy -n 40 --no-pager | grep -i 'certificate obtained'` shows the name;
`curl -s -o /dev/null -w '%{http_code}\n' https://api.paved.bal7hazar.com/v1/head` answers over TLS (`502` until step 8, because nothing listens on 8787 yet; use GET, not `curl -I`: a HEAD request is a `405` at the proxy);

**8. Start the indexer (only once `sepolia.json` is merged and in the checkout) and the watch**

```bash
F=/opt/paved-indexer/current/contracts/deployments/sepolia.json
if [ -f "$F" ]; then
  jq '{network, chain_id, deployed_block}' "$F"          # chain_id 0x534e5f5345504f4c4941
  systemctl enable --now paved-indexer.service
  sleep 10
  systemctl enable --now paved-indexer-watch.timer
else
  echo "sepolia.json is not in this commit: do not start the indexer"
fi
```

Verify: `systemctl status paved-indexer --no-pager` (active, running); `journalctl -u paved-indexer -n 20 --no-pager` ends with
`serving on http://127.0.0.1:8787, following <hash> from block …` (the log shows an 8-hex hash of the RPC URL, never the URL);
`ss -ltn 'sport = :8787'` shows `127.0.0.1:8787` only; `curl -fsS http://127.0.0.1:8787/v1/head | jq '{status, head, behind}'` is
`loading` while it catches up (503, so `-f` fails: read it without `-f`), then `ok` with `behind` a few blocks.
`systemctl list-timers paved-indexer-watch.timer` shows the next run; `journalctl -t paved-indexer-watch -n 5 --no-pager`.
Exit 2 in the journal is a configuration error (wrong chain id, refused database); it does not retry.

**9. End to end**

```bash
curl -fsS https://api.paved.bal7hazar.com/v1/head | jq '{status, behind}'                                   # status "ok"
curl -si -H 'Origin: https://paved.bal7hazar.com' https://api.paved.bal7hazar.com/v1/head | grep -i '^access-control-allow-origin'
curl -si -H 'Origin: https://example.org' https://api.paved.bal7hazar.com/v1/head | grep -ci '^access-control-allow-origin'   # 0
curl -si -X POST https://api.paved.bal7hazar.com/v1/head | head -1                                          # 405
curl -si https://api.paved.bal7hazar.com/anything | head -1                                                 # 404
```

The indexer's token bucket keys on the address Caddy forwards in `X-Forwarded-For` (see "Rate limiting"). Once a build with
`--rate` is deployed, a quick loop shows it: `for i in $(seq 60); do curl -s -o /dev/null -w '%{http_code} ' https://api.paved.bal7hazar.com/v1/head; done`
ends in `429`s when the defaults are low enough to trip, and the same loop with `-H 'X-Forwarded-For: 1.2.3.4'` must not get a fresh bucket.

### Release at F (the fresh Sepolia deployment, schema 11)

Written 2026-10-14 (F0). **Nothing here is run until CORE's F part B has merged** and the PM gives the go. At F the client and the
indexer are released together against F's `contracts/deployments/sepolia.json`; the checklist of the whole release is
`docs/client/f-release.md`, and this section is its indexer part. The PM copies the lines into the root script; each one says who
runs it: **root**. No line holds a secret value.

What changes for the indexer, and why a plain restart is not enough:

- **Schema 11.** The running database is schema 6. `run` refuses any database of another schema (exit 2, `SchemaMismatch`), so
  the old file cannot be reused; it is moved aside, and `rebuild` makes a new one from the chain.
- **New contracts, new start block.** F's file has new addresses and a new `deployed_block`. The indexer takes its start block from
  the file's `deployed_block`; **there is no flag for it** (the usage has none), so "set the start block" means "the release
  contains F's file". The unit's `--deployment` is `/opt/paved-indexer/current/contracts/deployments/sepolia.json`, a path inside
  the release: a release made from F's commit points at F's file with no change to the unit.
- **Keys it reads:** `contracts.Challenge`, `Setup` and `Economy` are required, `Collection` is read when present, and the file's
  `network` (`sepolia`) turns the display-name lookup on. A file that still keys `Daily` is refused at start.
- **Names (N1).** On for `network: sepolia` with no flag. It needs outbound HTTPS to `api.cartridge.gg` port 443 (`POST /lookup`).

Flags were checked on main at 382a2411 against the usage that `node packages/indexer/src/main.ts` prints (there is no `--help`
flag; with no command it prints the usage and exits 2): `run|rebuild --deployment --db [--port] [--host] [--poll] [--depth]
[--batch] [--range] [--recheck] [--recheck-every] [--allow-origin]... [--rate] [--burst] [--rpc] [--no-names|--names] [--names-url]`. The
unit's `ExecStart` is unchanged; the `rebuild` below is that line with `rebuild` for `run`. `--range` (I1, after 382a2411) needs
no flag: its default applies under `--depth l1`, and makes the rebuild's catch-up below the L1-accepted block take seconds.

```bash
# --- Release at F: <F-commit> is the full 40-character commit that contains F's contracts/deployments/sepolia.json ---
NEW=<F-commit>                                                   # (root)
STAMP=$(date +%Y%m%d-%H%M)                                       # (root)

# 1. Put the release in place WITHOUT touching the running service: the same steps as "Upgrade"           (root)
git clone --no-checkout https://github.com/stolslilabs/paved.git /opt/paved-indexer/releases/$NEW
git -C /opt/paved-indexer/releases/$NEW checkout --detach $NEW
(cd /opt/paved-indexer/releases/$NEW && bun install --frozen-lockfile --ignore-scripts --filter @paved/indexer && chmod -R go-w .)

# 2. F's file and the chain, checked from the new release directory, before anything is stopped          (root)
F=/opt/paved-indexer/releases/$NEW/contracts/deployments/sepolia.json
jq '{network, chain_id, deployed_block, keys: (.contracts | keys)}' "$F"
#   network "sepolia", chain_id "0x534e5f5345504f4c4941", deployed_block an integer, keys include Challenge, Setup, Economy,
#   Collection, Faucet (and no Daily). Stop here if any of it differs: nothing has been changed yet.
RPC=$(systemctl show paved-indexer -p Environment --value | tr ' ' '\n' | sed -n 's/^INDEXER_RPC_URL=//p')   # the unit's own value, never printed
test -n "$RPC" || echo "INDEXER_RPC_URL is not in the unit's Environment: take it from the unit's EnvironmentFile instead"
# The read-only checks of docs/client/f-release.md against the chain (they send nothing):
CHECK_RPC_URL="$RPC" /usr/bin/node /opt/paved-indexer/releases/$NEW/scripts/client/check-deployment.mjs --file "$F"   # ends: every check passed; nothing was sent
#   Stop here if it fails: the service still runs the old release; remove /opt/paved-indexer/releases/$NEW and report.

# 3. Stop the service, and the watch so that nothing restarts it during the rebuild                       (root)
systemctl stop paved-indexer-watch.timer
systemctl stop paved-indexer
systemctl is-active paved-indexer || true                        # inactive

# 4. Switch `current` to the release (the unit's --deployment is inside it)                               (root)
ln -sfnT releases/$NEW /opt/paved-indexer/current.new && mv -T /opt/paved-indexer/current.new /opt/paved-indexer/current
test "$(jq -r .deployed_block /opt/paved-indexer/current/contracts/deployments/sepolia.json)" = "$(jq -r .deployed_block "$F")"

# 5. Move the old database aside (schema 6, refused anyway); `rebuild` would drop it, this keeps it       (root)
for s in "" -wal -shm; do
  [ -e /var/lib/paved-indexer/sepolia.db$s ] && mv /var/lib/paved-indexer/sepolia.db$s /var/lib/paved-indexer/sepolia.db$s.schema6-$STAMP
done
ls -l /var/lib/paved-indexer/                                    # no sepolia.db left, the .schema6-* files

# 6. Rebuild in the foreground, as the service user and with the unit's flags (names are on by the file's network)   (root)
cd /opt/paved-indexer/current && runuser -u paved-indexer -- env \
  INDEXER_RPC_URL="$RPC" NODE_OPTIONS=--max-old-space-size=384 \
  /usr/bin/node packages/indexer/src/main.ts rebuild \
  --deployment /opt/paved-indexer/current/contracts/deployments/sepolia.json \
  --db /var/lib/paved-indexer/sepolia.db \
  --host 127.0.0.1 --port 8787 \
  --allow-origin https://paved.bal7hazar.com \
  --depth l1 --poll 3000 --recheck 5 --recheck-every 60000
#   The log says "rebuild: the database is empty; following from block <deployed_block>".
#   In a second shell (root), until it says status ok, state ok and behind 0, then Ctrl-C in the first:
#     curl -s http://127.0.0.1:8787/v1/head | jq '{status, state, behind, from_block}'
#   While it loads the answer is 503 {"status":"loading"}. Exit 2 in the first shell is a configuration error: read the message.

# 7. Start the service and the watch                                                                     (root)
systemctl start paved-indexer
sleep 10
systemctl start paved-indexer-watch.timer
```

Checks after, all read-only:

```bash
# (root) the service is the one that was rebuilt
systemctl is-active paved-indexer                                # active
curl -s http://127.0.0.1:8787/v1/head | jq '{status, state, behind, chain_id, from_block}'
#   status "ok", state "ok", behind a few blocks at most, chain_id 0x534e5f5345504f4c4941, from_block = the file's deployed_block
jq .deployed_block /opt/paved-indexer/current/contracts/deployments/sepolia.json
curl -s http://127.0.0.1:8787/v1/head | jq -c '.contracts'       # the Challenge, Setup, Economy (and Collection) of F's file
journalctl -u paved-indexer -n 20 --no-pager                     # "serving on http://127.0.0.1:8787, following <hash> from block …", no "halted"

# (root) names: on for sepolia, and the lookup host is reachable (any HTTP code means reachable; no address is sent)
curl -sS -o /dev/null -w '%{http_code}\n' --max-time 10 https://api.cartridge.gg/
# Once games exist (the F smoke game is one), a leaderboard entry carries a `name` (a Controller username, else null):
curl -s 'http://127.0.0.1:8787/v1/tournaments?limit=1' | jq -c '.tournaments[0]'
#   take its id as <day>:  curl -s http://127.0.0.1:8787/v1/tournaments/<day>/leaderboard | jq -c '[.. | objects | select(has("name")) | .name]'
#   null at first is normal: the lookup runs in the background, one request per 5 s at most.

# (anyone) through the proxy, as in step 9 of the commands above
curl -fsS https://api.paved.bal7hazar.com/v1/head | jq '{status, behind}'                          # status "ok"
curl -si -H 'Origin: https://paved.bal7hazar.com' https://api.paved.bal7hazar.com/v1/head | grep -i '^access-control-allow-origin'
systemctl list-timers paved-indexer-watch.timer --no-pager      # (root) the watch is back
```

"Done" for the indexer: `/v1/head` says `status "ok"`, `state "ok"` and a small `behind`; `from_block` and `chain_id` are the file's;
the service is `active` and the watch timer is listed; the proxy answers the same. Only then does the client release go out
(`docs/client/f-release.md`, "Order"). **If the rebuild fails:** the previous release directory and the `.schema6-*` files are
still there, but they only serve the old contracts, which F replaces; the recovery is to read the message and run step 6 again
(it starts from an empty database each time).

### Upgrade the indexer, rebuild, roll back, remove

Schema 6 (#290): a database of another schema is refused at start (exit 2, `SchemaMismatch`); so is one built for other contracts
or another start block. A rebuild makes the same tables from the chain (a Sepolia catch-up: section 1 has the call estimate).

```bash
# Upgrade to <new-commit> (root)
NEW=<new-commit>
git clone --no-checkout https://github.com/stolslilabs/paved.git /opt/paved-indexer/releases/$NEW
git -C /opt/paved-indexer/releases/$NEW checkout --detach $NEW
(cd /opt/paved-indexer/releases/$NEW && bun install --frozen-lockfile --ignore-scripts --filter @paved/indexer && chmod -R go-w .)
systemctl stop paved-indexer
ln -sfnT releases/$NEW /opt/paved-indexer/current.new && mv -T /opt/paved-indexer/current.new /opt/paved-indexer/current
D=/opt/paved-indexer/current/deploy/indexer          # unit files changed? install them again and `systemctl daemon-reload`
# Only for a schema change, or new contracts in sepolia.json: empty the database (the same as `rebuild`, supervised):
rm -f /var/lib/paved-indexer/sepolia.db /var/lib/paved-indexer/sepolia.db-wal /var/lib/paved-indexer/sepolia.db-shm
systemctl start paved-indexer
```

Verify as in step 8; after an emptied database `/v1/head` is 503 `loading` until `behind` is a few blocks.

A `rebuild` as a command (what the hosting text calls the same arguments with `rebuild` instead of `run`), with the unit stopped:

```bash
systemctl stop paved-indexer
cd /opt/paved-indexer/current && runuser -u paved-indexer -- env \
  INDEXER_RPC_URL=https://api.cartridge.gg/x/starknet/sepolia/rpc/v0_10 NODE_OPTIONS=--max-old-space-size=384 \
  /usr/bin/node packages/indexer/src/main.ts rebuild \
  --deployment /opt/paved-indexer/current/contracts/deployments/sepolia.json \
  --db /var/lib/paved-indexer/sepolia.db \
  --host 127.0.0.1 --port 8787 \
  --allow-origin https://paved.bal7hazar.com \
  --depth l1 --poll 3000 --recheck 5 --recheck-every 60000
# in a second shell: curl -s http://127.0.0.1:8787/v1/head | jq '{status, behind}'
# press Ctrl-C once it says "ok" and behind 0, then:
systemctl start paved-indexer
```

(If the unit's flags change, change them here too: they are the unit's `ExecStart`, with `rebuild` for `run`.)

```bash
# Roll back the code (root): the previous release directory is still there
systemctl stop paved-indexer
ln -sfnT releases/<previous-commit> /opt/paved-indexer/current.new && mv -T /opt/paved-indexer/current.new /opt/paved-indexer/current
systemctl start paved-indexer          # if the schema had changed, empty the database first (rm line above)

# Remove everything (root); the chain is untouched, the database can always be rebuilt
systemctl disable --now paved-indexer-watch.timer paved-indexer.service
rm -f /etc/systemd/system/paved-indexer.service /etc/systemd/system/paved-indexer-watch.service /etc/systemd/system/paved-indexer-watch.timer
systemctl daemon-reload
sed -i '\#^import /etc/caddy/paved.caddy$#d' /etc/caddy/Caddyfile && rm -f /etc/caddy/paved.caddy
runuser -u caddy -- caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
systemctl reload caddy          # with `admin off`: restart instead, at a moment the owner chooses (step 7); never restart after a failed reload
rm -rf /opt/paved-indexer /var/lib/paved-indexer
rm -f /usr/local/bin/bun                                  # installed in step 2; skip if something else on this VPS uses it
userdel paved-indexer
# Leftovers of the retired web hosting (root's). Root block 11 (2026-10-17) retired the deploy user, its two scripts and the web roots;
# a VPS where block 11 did not run, or only partly, may still have them. Remove what is left, by these exact names:
# userdel -r paved-deploy ; rm -f /usr/local/lib/paved/publish.sh /usr/local/lib/paved/switch.sh ; rmdir /usr/local/lib/paved
# rm -rf /var/www/paved.retired-20261017-135147 /var/www/paved-storybook.retired-20261017-135147    # the roots block 11 moved aside
# ufw: delete a rule only if step 6 printed "Rule added" for it ("Skipping adding existing rule" means it was there before):
# ufw delete allow 80/tcp ; ufw delete allow 443/tcp ; ufw delete deny 8787/tcp
```

(Never delete the 80/443 rules if Caddy still serves anything else: they would close the other sites' ports too.)

## Appendix: how the figures were made

Nothing was left running: the node, the scenario's two indexers and the capped indexer were all stopped by PID (the scenario's
own teardown, and `kill -TERM` for the capped one); `contracts/deployments/devnet.json` was restored by the scenario; the
temporary change to the scenario below was reverted and is not committed.

```bash
# 1. the repository's devnet scenario (deploy.sh, 3 accounts, 2 days, restart, a rebuilt second indexer), held open at its end
#    by a temporary, uncommitted 3-line change to packages/indexer/test/devnet/scenario.test.ts that waits for a file
#    before it stops its indexers; a poller read VmHWM from /proc/<pid>/status every 0.5 s
PAVED_DEVNET=1 PAVED_HOLD=<file> NODE_OPTIONS=--max-old-space-size=1536 bun x vitest run --config vitest.devnet.config.ts
#    -> 7 passed, 294 s; peak resident of the two scenario indexers 217,384 kB (followed) and 192,568 kB (rebuilt), no heap cap

# 2. while the scenario's node (127.0.0.1:5072, block 160) was still up: a rebuild, heap capped, under /usr/bin/time -v
NODE_OPTIONS=--max-old-space-size=384 INDEXER_RPC_URL=http://127.0.0.1:5072 /usr/bin/time -v \
  node packages/indexer/src/main.ts rebuild --deployment <devnet.json of the run> --db <scratch>/c.db --port 8790 --poll 1000
#    -> status ok 2.1 s after the start (blocks 12-160); Maximum resident set size 158,844 kB; user 20.65 s, system 7.36 s;
#       elapsed 1:11.88 (five runs of 10 s below, and the waits)

# 3. the load client (no dependency), 10 s each, on port 8790
node load.mjs http://127.0.0.1:8790/v1/head 10 1     # connections: the 3rd argument
```

```js
// load.mjs
const [url, secs, conc] = [process.argv[2], Number(process.argv[3]), Number(process.argv[4])];
let n = 0, bad = 0; const lat = []; const end = Date.now() + secs * 1000;
async function worker() {
  while (Date.now() < end) {
    const t = performance.now();
    const r = await fetch(url); await r.arrayBuffer();
    lat.push(performance.now() - t); if (r.status !== 200) bad++; n++;
  }
}
const t0 = performance.now();
await Promise.all(Array.from({ length: conc }, worker));
const s = (performance.now() - t0) / 1000; lat.sort((a, b) => a - b);
const p = (q) => lat[Math.floor(q * (lat.length - 1))].toFixed(2);
console.log(`${url} conc=${conc} ${n} requests in ${s.toFixed(1)} s = ${(n / s).toFixed(0)} req/s, non-200: ${bad}, latency ms p50 ${p(.5)} p99 ${p(.99)}`);
```

The database size is that of the capped indexer's file after `SIGTERM` (the WAL is then folded into the file): 229,376 bytes;
rows per table from `dbstat`. Not measured: idle CPU, a cache miss, a database with many players, a real RPC node.
