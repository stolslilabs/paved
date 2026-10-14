# Hosting the Storybook

Dated 2026-10-14. F5 of Client v2 (`docs/client/v2-architecture.md`, section 4.2). The Storybook of `packages/app` is
served at `https://storybook.paved.bal7hazar.com`, a static site: fixtures only, no secret, no RPC URL, no controller.

## The one-time install (done by the owner's root block)

The web root, the Caddy site and the first release were installed once, as root, by the owner's block
`9-storybook.sh` (prepared by the PM, run by the owner; it built main at 7366c69). This document repeats none of its
root steps. What it left on the VPS, for reference:

| What | Where |
|---|---|
| Web root, owned by `claude` since the owner's block 10 (by `paved-deploy` before) | `/var/www/paved-storybook/` (`releases/`, and `current` -> the live release) |
| Caddy site, imported by the main Caddyfile | `/etc/caddy/paved-storybook.caddy`, the same text as `deploy/storybook/paved-storybook.caddy` |
| Publish and rollback scripts | `/usr/local/lib/paved/publish.sh` and `switch.sh`, the copies of `deploy/indexer/publish.sh` and `switch.sh` (they take their root from `WWW_ROOT`) |
| Checkout of the repository | `~paved-deploy/paved` |

A change to the Caddy site is a change to `deploy/storybook/paved-storybook.caddy` and a root step of the owner; it is
not part of a release.

## A release (as `claude`, no root)

Since the owner's block 10, `/var/www/paved-storybook` is owned by `claude`: the `claude` user (an agent of the
client track) publishes Storybook updates itself, with the same publish command; no root step and no other user is
needed. Every later Storybook release is this sequence, run from a clean checkout of the commit to publish (for
`claude`, a detached worktree of `/home/claude/projects/paved`, never a working branch). Replace `<commit>` with the
commit to publish (a SHA on `main`) and `<checkout>` with that worktree.

```bash
cd /home/claude/projects/paved
git fetch origin
git worktree add --detach <checkout> <commit>
cd <checkout>
bun install --frozen-lockfile
(cd packages/app && NODE_OPTIONS=--max-old-space-size=3072 bun run build-storybook)
test -f packages/app/storybook-static/index.html
WWW_ROOT=/var/www/paved-storybook /usr/local/lib/paved/publish.sh packages/app/storybook-static \
  "$(date +%Y%m%d-%H%M)-$(git rev-parse --short HEAD)"
readlink /var/www/paved-storybook/current
```

Notes:

- `bun run --filter @paved/app build-storybook` is the same build from the repository root; it runs `storybook build -o
  storybook-static`, so the output directory is `packages/app/storybook-static/` (ignored by git). The block runs it
  from `packages/app` with a heap cap, which this sequence keeps (`NODE_OPTIONS=--max-old-space-size=3072`: the
  Storybook build has no measured peak yet; 3072 MB is the block's value, not a measurement).
- `publish.sh` copies the build to `releases/<name>`, replaces `current` by one atomic rename and keeps the newest five
  releases (`KEEP`). The release name is `YYYYMMDD-HHMM-<short sha>`; it refuses a name that already exists.
- Caddy needs no reload: it reads `current` on each request.

### Check

```bash
curl -sI https://storybook.paved.bal7hazar.com/ | head -1      # HTTP/2 200
readlink /var/www/paved-storybook/current                       # releases/<the name just published>
```

### Rollback

`switch.sh` supports it, and honours `WWW_ROOT` like `publish.sh` (`ROOT=${WWW_ROOT:-/var/www/paved}`):

```bash
WWW_ROOT=/var/www/paved-storybook /usr/local/lib/paved/switch.sh --list         # releases, newest first, then current
WWW_ROOT=/var/www/paved-storybook /usr/local/lib/paved/switch.sh <release-name> # atomic swap of current
```

It only switches to an existing release that has an `index.html`, and does not delete anything.

## What the repository scripts confirm

- `deploy/indexer/publish.sh` and `switch.sh` both read `ROOT=${WWW_ROOT:-/var/www/paved}`, as the root block relies on.
  Nothing in the block needs a change in a repository script.
- `publish.sh` requires `$ROOT/releases` to exist (the block creates it) and `<dist>/index.html`; Storybook's output has
  both.
- That `/usr/local/lib/paved/*.sh` are copies of the repository's scripts was not checked here (no VPS access in this
  task); if the repository's scripts change, the copies are a root step.

## The Caddy site against `deploy/indexer/Caddyfile`

`deploy/storybook/paved-storybook.caddy` is the text the block installs, unchanged. Against the client's site in
`deploy/indexer/Caddyfile`:

| | Client (`paved.bal7hazar.com`) | Storybook |
|---|---|---|
| Compression | `encode zstd gzip` | same |
| Headers | `X-Content-Type-Options nosniff`, `Referrer-Policy strict-origin-when-cross-origin`, `-Server` | same three |
| Content-Security-Policy etc. | none (the Cartridge iframe needs WebAuthn and a popup) | none; the Storybook has no controller, so a CSP could be added later (it would need to allow the preview iframe, which is same origin) |
| Cache | `/assets/*`: `public, max-age=31536000, immutable`; the rest `no-cache` | `no-cache` on everything |
| Fallback | `try_files {path} /index.html` (single-page app) | none: a missing file is a 404 (Storybook is `index.html` + `iframe.html`, not a router) |
| Structure | `handle` blocks with `root` inside each | one `root` and `file_server` |
| TLS | automatic (Let's Encrypt) | same, automatic |
| Header comments | explains each choice | none (the file is byte-identical to the block's) |

The two differences that matter: no long cache on assets, and no SPA fallback. Neither is wrong. `no-cache` means the
browser revalidates (ETag) every file, so a new release is seen at once, at the cost of a conditional request per
asset. Storybook's `assets/` files are hashed, so the client's immutable rule would work here too; section 4.2 of
`v2-architecture.md` proposed it, and the block does not do it. Adding it is a change of the Caddy site, a root step of
the owner, left undone.
