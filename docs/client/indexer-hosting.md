# Hosting the indexer for the Sepolia client

Dated 2026-10-10. Decision D-16 (public test deployment of Paved on Starknet Sepolia, for playtests). This is what
`packages/indexer` needs to serve the public client. It is a description, not a deployment: nothing here is running, and
**where it runs is the owner's choice** (section 5). Options and rules of the process: `packages/indexer/README.md`; design:
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
| `--batch` | default `100` | Blocks applied per step during catch-up. Leave it. |
| `--allow-origin` | the client's origin, once | Without it a browser blocks every answer. Exact string match (`https://a.b` is not `https://a.b/` nor `http://a.b`). Repeatable (one per origin, e.g. a staging page). |
| `--host`, `--port` | `127.0.0.1`, `8787` | Keep the loopback: the proxy is the public face (section 3). |

Stop it with `SIGTERM` (it closes the database cleanly). A decode failure or a database contradicting the chain **halts** it: the
process stays up and every route answers `503 halted`; it does not exit, so a process manager does not restart it. Watch
`/v1/head` (section 6).

RPC load, an **estimate from reading the code** (`indexer.ts`, `chain.ts`, not measured on a real node): per step, `blockHashAndNumber`
and one header check (2 calls); per new block, a header, one `getEvents` per contract (4, or 5 with `Collection`), and one
check of the previous block (about 8 calls per block); plus the recheck. At `--poll 3000` and `--recheck 5` every minute that is
under one call per second when idle, and about 8 more per block when blocks carry no events either. **Catch-up** from
`deployed_block` costs the same per block, one after the other: its speed is the RPC round-trip time divided into 8 calls per
block (on the local devnet, 149 blocks took about 2 s, round trip under 1 ms; at 80 ms per call expect about one block a
second). Keep `deployed_block` as late as the contracts allow, and ask the provider about its request limits.

## 2. What it needs from the host

| Need | Figure | Basis |
|---|---|---|
| Runtime | Node 24.x (the package's `engines`) with the repository checked out and `bun install --frozen-lockfile` run (one dependency, `starknet`, plus the workspace). bun 1.4.2 is only the installer; the service runs `node`. | `packages/indexer/package.json` |
| Memory | **159 MB** peak resident, heap capped at 384 MB (a rebuild of 149 blocks, then 50 s of requests). **217 MB** peak for a long-lived indexer with no heap cap, through restarts of the scenario. Set `--max-old-space-size=384`; give the process **512 MB** (`MemoryMax`), so 1 GB total for a small VM with the proxy. | Measured, appendix |
| CPU | One core is plenty. The run above used 28 s of CPU in 72 s of wall time, 50 s of which were load (section 4: five runs of 10 s, one of them a mistyped route that answered 400). Idle use was not measured separately. | Measured |
| Disk | **224 KiB** for 149 blocks, 74 events, 9 games, 3 players (devnet scenario). Rows: blocks about 0.5 KB each (149 rows, 72 KiB), events about 0.28 KB each (74 rows, 20 KiB); the other tables are one 4 KiB page each at this size. | Measured |
| Disk growth | **Estimate**, not measured on Sepolia: a game is on the order of ten events with its derived rows, so a few KB; 100,000 games would be a few hundred MB. A playtest is far below it. Block headers do not accumulate: `--depth l1` forgets those below the last L1-accepted block. Give it **1 GB** and the WAL file's few MB of headroom. | Estimate from the measured row sizes |
| Backup | None needed: `rebuild` makes the same tables from the chain. Keeping the file only saves the catch-up. | `README.md` |
| Network, out | HTTPS to the RPC host only. | |
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
authentication, no rate limit and no TLS of its own, and its routes are GET-only and read-only (anything else is `405`); the data
is public chain data. What the proxy adds:

- **TLS** (HTTPS only; redirect or refuse port 80), with a certificate for the API's name.
- **CORS stays in the indexer**: it answers `access-control-allow-origin: <origin>` only for the origins of `--allow-origin`,
  and `Vary: Origin`. The client sends a plain `GET` with an `Accept` header, which is not preflighted. The proxy must pass the
  `Origin` header through and **must not add CORS headers of its own** (two `allow-origin` values make the browser refuse).
  CORS does not stop `curl`; it only says which web pages may read the answers.
- **Rate limiting** per client address, so a script cannot keep the single Node thread busy. One page view of the client makes a
  handful of requests and the client has no polling timer (it reads on page load, on a manual refresh and when the tab becomes
  visible again), so 10 requests per second per address with a burst of 20 is generous. Measured capacity is in section 4.
- **Only `/v1/` and only GET** are forwarded; anything else is `404` at the proxy.
- **Pass the indexer's answers through**, errors included: the client reads the JSON envelope of a `503` (`loading`, `rewinding`,
  `halted`) and shows a precise message. When the process is down the proxy's own `502` page is also handled (the client treats a
  non-JSON gateway answer as "cannot be reached").
- Optional: the indexer sends `cache-control: no-store` and already caches its answers per served block; a 2 s proxy cache of
  GET would only add a delay.

An nginx server block (the certificate lines are those `certbot --nginx` writes):

```nginx
limit_req_zone $binary_remote_addr zone=indexer:10m rate=10r/s;

server {
  listen 443 ssl;
  server_name indexer.example.org;                 # the owner's name
  ssl_certificate     /etc/letsencrypt/live/indexer.example.org/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/indexer.example.org/privkey.pem;

  location /v1/ {
    limit_except GET { deny all; }
    limit_req zone=indexer burst=20 nodelay;
    limit_req_status 429;
    proxy_pass http://127.0.0.1:8787;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_set_header Host $host;
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
proxy's rate limit, not the indexer, is the limit to set. A Sepolia database with many players was not measured.

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
A database of another schema version is refused too (`SchemaMismatch`: `rebuild` it).

**Health.** `curl -s http://127.0.0.1:8787/v1/head`: `state` is `ok` (not `loading`, `rewinding`, `halted`), `behind` is a few
blocks at most, `checks.last_mismatch` is `null` (a day whose replayed prize slots differ from the contract's `tournament` view
shows there), `chain_id` is `0x534e5f5345504f4c4941`. `halted` needs a person: read the journal, then `rebuild`.

## 7. How the client points at it, and when it is down

`packages/app-web` reads **`VITE_INDEXER_URL`** (`src/utils/network.ts` into `createIndexerClient` of `@paved/chain`). It is the
base URL **without `/v1`** and without a trailing slash, e.g. `VITE_INDEXER_URL=https://indexer.example.org`. It is a Vite
build-time variable: it is baked into the bundle, so changing the indexer's address means building and serving the app again.
Unset or blank, the client has no indexer and the screens say "unavailable" without asking anything. Use an `https://` URL: a
page served over HTTPS cannot call `http://`. The origin the page is served from is the one `--allow-origin` names.

When the indexer is out of reach (the process down, the host down, a `5xx` page, no answer within the client's 10 s timeout, a
CORS refusal), the screens that use it say so (the leaderboard and the player page with a Retry button): the leaderboard "Leaderboard unavailable: the indexer cannot be
reached", the quests and the player page the same with their name. While it is `loading`, `rewinding` or `halted` they say it is
starting, catching up or halted; when it is more blocks behind than the client's `maxLag` the rows are marked late with "Updated
N blocks behind". The rest of the app is untouched, because it does not use the indexer: playing, buying a game, claiming a prize,
the prizes and the Vault read the contracts through the RPC node. One exception, only when the build has neither
`VITE_COLLECTION_ADDRESS` nor a deployment file with `contracts.Collection`: the client then asks `/v1/head` for the Collection's
address, and shows no NFT while the indexer is out. The deployment file of the build has it, so this does not occur on a normal
build.

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
