# Hosting the indexer for the Sepolia client

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

## Runbook: this VPS (Sepolia)

Dated 2026-10-10. Decisions D-16 and P-41. This is the owner's exact procedure to serve the Sepolia client **and** its indexer
from this VPS. **Nothing here is done or running**: the agents prepared it and ran no root act. It replaces, for this VPS,
the nginx block of section 3 and the unit of section 6 (the files below are the unit and the proxy of record). Files:
`deploy/indexer/` (`paved-indexer.service`, `Caddyfile`, `watch.sh`, `paved-indexer-watch.{service,timer}`,
`publish.sh`, `switch.sh`).

**The indexer unit starts only once `contracts/deployments/sepolia.json` is merged** (CORE, task S-1): the indexer reads its
addresses and `deployed_block`, and the client build reads the same file. Everything before step 8 can be done earlier.

### What runs where

| What | Name | Where |
|---|---|---|
| Client (static build) | `https://paved.bal7hazar.com` | Caddy reads `/var/www/paved/current`, written by the deploy user `paved-deploy` |
| API | `https://api.paved.bal7hazar.com` | Caddy → `127.0.0.1:8787`, `/v1/*`, GET and OPTIONS only |
| Indexer | `paved-indexer.service` | user `paved-indexer`, code `/opt/paved-indexer/current` (root-owned), db `/var/lib/paved-indexer/sepolia.db` |
| RPC | `https://api.cartridge.gg/x/starknet/sepolia/rpc/v0_10` | spec 0.10.2, `SN_SEPOLIA`, `l1_accepted` and `getEvents` answer (checked by the PM). It carries no key: plain `Environment=` in the unit, no secret file. |

DNS is **done** (owner, 2026-10-10): both names resolve to this VPS, `31.97.36.234`. Caddy gets each certificate (Let's Encrypt,
HTTP-01 on port 80) when it first serves the name, so 80 and 443 must be reachable first (step 6 before step 7).

### What this VPS has today (read-only checks, 2026-10-10, no root)

| Question | Answer |
|---|---|
| Who listens on 80 and 443 | `*:80` and `*:443` (IPv4 and IPv6), both **already taken** by a process whose name `ss -ltnp` does not show: without root `ss` names only the caller's own processes. It is almost certainly the existing **Caddy** (see next row), which serves other sites of the team. Nothing listens on **8787**. |
| Proxy installed | **Caddy 2.11.4** (`/usr/bin/caddy`, the apt package), with a live `/etc/caddy/Caddyfile` (root:caddy 0640, unreadable here) and seven dated backups. No nginx. `systemctl is-active` was refused in this session, so "running" is inferred from the listeners. |
| OS | Ubuntu 24.04.4 LTS, systemd 255 (255.4-1ubuntu8.17) |
| Runtime | `/usr/bin/node` v24.21.0, the `nodesource` apt package `24.21.0-1nodesource1`: **system-wide, nothing to install**. bun is **not** system-wide (`/usr/local/bin` holds only `asdf`): step 2 installs it. `jq`, `curl`, `logger` are in `/usr/bin`. |
| Firewall | `ufw status`, `nft`, `iptables`: all need root ("You need to be root"). Unknown. Step 6 reads it first. |

**Consequence: Caddy is shared.** The runbook adds two site blocks through an `import` and reloads; it never replaces the main
Caddyfile, and it does not start a second Caddy (it could not bind 80/443).

### Rate limiting (P-43)

Caddy's core has no rate limiter, and a firewall limit on 80/443 would hit every other site on this VPS (and is a machine
security setting, the owner's). So the limit lives **in the indexer**: a per-address token bucket, flags `--rate <req/s>` and
`--burst <n>` (`--rate 0` disables), added by a parallel PR. **The unit's `ExecStart` leaves both flags out, so the indexer's
defaults apply**; add `--rate` and `--burst` to it only to change them.

The indexer sees only Caddy's loopback address, so it takes the client address from `X-Forwarded-For`, and **trusts that header
only when the connection comes from 127.0.0.1**. Caddy must therefore pass the client address. Checked on this VPS's Caddy
(v2.11.4), with a throwaway `reverse_proxy` to a header-echoing backend on loopback: the backend received
`x-forwarded-for: 127.0.0.1` (the connecting address, here a local curl) and `x-forwarded-proto: http`, and a request carrying a
forged `X-Forwarded-For: 1.2.3.4` still arrived with `127.0.0.1`: Caddy replaces a header from an untrusted client, so a caller
cannot pick its own bucket. `deploy/indexer/Caddyfile` sets no `trusted_proxies`, which keeps it so; do not add one without
rereading this. Step 9 checks it on the real site.

What Caddy still caps before the indexer: `/v1/*` only, GET and OPTIONS only (405 otherwise), a 1 KB request body, 2 s dial and 15 s
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
| `checks.last_mismatch` not null | Logs at `err` | The replayed prize slots differ from the contract's view. |
| `loading`, `rewinding` | Logs at `info` | Catch-up and rewind are normal. |

At most one restart per 10 minutes, so a provider outage is not a restart loop. Read it with `journalctl -t paved-indexer-watch`.

### The client side

`VITE_INDEXER_URL=https://api.paved.bal7hazar.com` **at build time**. `createIndexerClient` (`packages/chain/src/indexer.ts`) trims
the value and strips trailing slashes, then calls `${base}/v1/...` with `fetch`; a blank value means "no indexer" (screens say
"unavailable"). Here the API has its own name, so it is a cross-origin call from `https://paved.bal7hazar.com` and CORS applies:
the indexer answers `access-control-allow-origin: https://paved.bal7hazar.com` because of `--allow-origin`, and Caddy adds no
CORS header of its own. The client's plain `GET` with an `Accept` header is not preflighted.

The Sepolia build env, from what `packages/app-web` reads today (`src/utils/network.ts`, `economy-network.ts`, `main.tsx`):

| Variable | Value | Note |
|---|---|---|
| `VITE_NETWORK` | `sepolia` | Picks `contracts/deployments/sepolia.json`, read at build time by `import.meta.glob` (addresses, `chain_id`, `deployed_block`, `contracts.Collection`, the economy's addresses). Without that file the build is "not connected" (`missing` lists it in the console). |
| `VITE_INDEXER_URL` | `https://api.paved.bal7hazar.com` | Above. |
| `VITE_RPC_URL` | `https://api.cartridge.gg/x/starknet/sepolia/rpc/v0_10` | Overrides the file's `rpc_url`; same value the indexer uses. No key, so it may sit in a public bundle. |
| not set | `VITE_PLAYER_*` | Devnet only (a key in a bundle is public); other networks ignore them. |
| not set | `VITE_*_ADDRESS` | The file supplies them; an override is for an operator patch only. |
| not set | `VITE_SUPPORTS_TOKEN_MINT` | Unset means the faucet is offered on devnet only, and `resolveDeployment` resolves a MockUSDC for `devnet` only. A Sepolia test-USDC faucet is a later client task (D-16, P-39), not this runbook. |

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
`"origin": "https://paved.bal7hazar.com"` and the Sepolia contracts and methods of `CONTROLLER_ENTRY_POINTS`, then passing `preset`
to the controller; it needs Cartridge's review.)

### Commands for the owner (root), in order

Run as root on this VPS (`sudo -i`). `<commit>` is a full 40-character commit of `main` that contains `deploy/indexer/` (this PR) and
`contracts/deployments/sepolia.json` (S-1). Each step ends with its check; stop at the first one that does not match.

**1. Users and directories**

```bash
useradd --system --user-group --no-create-home --home-dir /var/lib/paved-indexer --shell /usr/sbin/nologin paved-indexer
useradd --system --user-group --create-home --home-dir /var/lib/paved-deploy --shell /bin/bash paved-deploy
install -d -o paved-indexer -g paved-indexer -m 0750 /var/lib/paved-indexer
install -d -o root -g root -m 0755 /opt/paved-indexer /opt/paved-indexer/releases
install -d -o paved-deploy -g paved-deploy -m 0755 /var/www/paved /var/www/paved/releases
```

Verify: `id paved-indexer paved-deploy` (two different uids, no shared group); `ls -ld /var/lib/paved-indexer /opt/paved-indexer /var/www/paved`
(owners `paved-indexer`, `root`, `paved-deploy`); `getent passwd paved-indexer` ends in `/usr/sbin/nologin`.

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
ln -s releases/$COMMIT /opt/paved-indexer/current.new && mv -T /opt/paved-indexer/current.new /opt/paved-indexer/current
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
install -d -m 0755 /usr/local/lib/paved && install -m 0755 $D/publish.sh $D/switch.sh /usr/local/lib/paved/
systemctl daemon-reload
```

Verify: `systemd-analyze verify /etc/systemd/system/paved-indexer.service /etc/systemd/system/paved-indexer-watch.service /etc/systemd/system/paved-indexer-watch.timer`
prints nothing; `grep -n 'allow-origin\|INDEXER_RPC_URL' /etc/systemd/system/paved-indexer.service` shows
`https://paved.bal7hazar.com` and the Cartridge Sepolia URL.

**5. Caddy: already installed, add the two sites**

```bash
caddy version                                  # v2.11.4 here (apt). Already installed: skip the install below.
# Only if absent (official repository, pinned):
#   apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl gnupg
#   curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
#   curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt > /etc/apt/sources.list.d/caddy-stable.list
#   apt-get update && apt-get install -y caddy=2.11.4
cp -a /etc/caddy/Caddyfile /etc/caddy/Caddyfile.bak-$(date +%F)-paved
grep -n 'paved\|^import\|admin' /etc/caddy/Caddyfile     # read it: other imports, an `admin off`, any block for these names
printf '\nimport /etc/caddy/paved.caddy\n' >> /etc/caddy/Caddyfile
runuser -u caddy -- caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
```

Verify: the last command ends with `Valid configuration`. An "ambiguous site definition" means the main Caddyfile already has a block
for one of the two names: remove that block (the backup keeps it). Nothing is loaded yet.

**6. Firewall: 80 and 443 open, 8787 not exposed**

```bash
ufw status verbose                                  # if "Status: inactive", do not enable it here: the ports are already reachable
# only if the status is active:
ufw allow 80/tcp && ufw allow 443/tcp && ufw deny 8787/tcp
```

Verify: `ufw status | grep -E '80|443|8787'` (if active); `ss -ltn 'sport = :8787'` prints nothing yet (the indexer listens on
loopback only, never on `0.0.0.0`, once started). From another machine: `curl -sI http://paved.bal7hazar.com` answers (Caddy already
holds port 80). No rate limit is set at the firewall (P-43).

**7. Caddy: load the sites (certificates)**

```bash
systemctl reload caddy
```

`reload` talks to Caddy's admin endpoint; if it succeeds, nothing else is interrupted. **If the main Caddyfile has `admin off`** (the dated backup names in `/etc/caddy` suggest
one was set once; step 5 greps for it), `reload` fails and **only a restart applies the change. A restart briefly interrupts
every other site this VPS serves through Caddy**, so the owner chooses the moment, and only then runs
`systemctl restart caddy`.

Verify: `dig +short paved.bal7hazar.com` and `dig +short api.paved.bal7hazar.com` both print `31.97.36.234`;
`journalctl -u caddy -n 40 --no-pager | grep -i 'certificate obtained'` shows both names;
`curl -sI https://api.paved.bal7hazar.com/v1/head` answers over TLS (a `502` until step 8, because nothing listens on 8787 yet);
`curl -sI https://paved.bal7hazar.com/` answers `404` until the deploy user publishes the first release (list B).

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

### Commands for the deploy user (no root), to publish a client build

The deploy user is `paved-deploy`; the owner gives it access once (`sudo -iu paved-deploy`, or an `authorized_keys` line for
`ssh paved-deploy@…`; its home is `/var/lib/paved-deploy`). It never needs root: it writes only `/var/www/paved` and its home.
Caddy only reads `/var/www/paved`. A release is a directory; `current` is a symlink swapped in one atomic rename.

```bash
# First time: the source
git clone https://github.com/stolslilabs/paved.git ~/paved
# Every release: <commit> contains sepolia.json (S-1)
cd ~/paved && git fetch --all --prune && git checkout --detach <commit>
bun install --frozen-lockfile
VITE_NETWORK=sepolia \
VITE_INDEXER_URL=https://api.paved.bal7hazar.com \
VITE_RPC_URL=https://api.cartridge.gg/x/starknet/sepolia/rpc/v0_10 \
  bun run build --filter @paved/app-web
grep -rl 'api.paved.bal7hazar.com' packages/app-web/dist/assets | head -1       # must print a file: the URL is in the bundle
/usr/local/lib/paved/publish.sh packages/app-web/dist "$(date +%Y%m%d-%H%M)-$(git rev-parse --short HEAD)"
```

- The `grep` guards against turbo dropping the `VITE_*` variables (strict env mode); if it prints nothing, rebuild with
  `bun x turbo build --filter @paved/app-web --env-mode=loose` and the same variables.
- **Build memory is not measured** (`app-web` tests peak at 1.0 GB; a `tsc -b` plus `vite build` of the workspace is not
  figured). Measure the first build with `NODE_OPTIONS=--max-old-space-size=3072 /usr/bin/time -v bun run build …` and record the
  peak; do not build on this VPS while agents are working there if it passes about 8 GB, build on the Mac or in CI and copy
  `packages/app-web/dist` to the deploy user (`scp -r dist paved-deploy@…:~/dist`), then run `publish.sh ~/dist <name>`.
- `publish.sh <dist> <name>` copies to `/var/www/paved/releases/<name>`, swaps `current`, keeps the newest 5 releases.
- Rollback: `/usr/local/lib/paved/switch.sh --list`, then `/usr/local/lib/paved/switch.sh <older-release>`. No Caddy reload is
  needed: `index.html` is `no-cache`, and the assets are named by hash.
- Check: `curl -sI https://paved.bal7hazar.com/ | head -1` is `200`; `readlink /var/www/paved/current` is the new release.

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
ln -s releases/$NEW /opt/paved-indexer/current.new && mv -T /opt/paved-indexer/current.new /opt/paved-indexer/current
D=/opt/paved-indexer/current/deploy/indexer          # unit files changed? install them again and `systemctl daemon-reload`
# Only for a schema change, or new contracts in sepolia.json: empty the database (the same as `rebuild`, supervised):
rm -f /var/lib/paved-indexer/sepolia.db /var/lib/paved-indexer/sepolia.db-wal /var/lib/paved-indexer/sepolia.db-shm
systemctl start paved-indexer
```

Verify as in step 8; after an emptied database `/v1/head` is 503 `loading` until `behind` is a few blocks. The `rebuild` command
itself is the same arguments as the unit with `rebuild` instead of `run`, run as `runuser -u paved-indexer --` with the unit's two
`Environment=` values, in the foreground until `/v1/head` is `ok`, stopped with Ctrl-C, then `systemctl start paved-indexer`.

```bash
# Roll back the code (root): the previous release directory is still there
systemctl stop paved-indexer
ln -s releases/<previous-commit> /opt/paved-indexer/current.new && mv -T /opt/paved-indexer/current.new /opt/paved-indexer/current
systemctl start paved-indexer          # if the schema had changed, empty the database first (rm line above)

# Remove everything (root); the chain is untouched, the database can always be rebuilt
systemctl disable --now paved-indexer-watch.timer paved-indexer.service
rm -f /etc/systemd/system/paved-indexer.service /etc/systemd/system/paved-indexer-watch.service /etc/systemd/system/paved-indexer-watch.timer
systemctl daemon-reload
sed -i '\#^import /etc/caddy/paved.caddy$#d' /etc/caddy/Caddyfile && rm -f /etc/caddy/paved.caddy
runuser -u caddy -- caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile && systemctl reload caddy
rm -rf /opt/paved-indexer /var/lib/paved-indexer /var/www/paved /usr/local/lib/paved
userdel paved-indexer; userdel -r paved-deploy
ufw delete allow 80/tcp; ufw delete allow 443/tcp; ufw delete deny 8787/tcp   # only if step 6 added them AND no other site needs 80/443
```

(`ufw delete allow 80/tcp` would close the other sites' ports too: leave 80/443 if Caddy still serves anything else.)

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
