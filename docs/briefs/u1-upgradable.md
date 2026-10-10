# U-1 brief: upgradable contracts (D-17, P-42)

Track CORE of Paved, P8. Commit this brief as `docs/briefs/u1-upgradable.md`, as the first commit of your PR.

Owner request D-17 (2026-10-10): since Dojo is gone, contracts must be upgradable without a full redeploy. PM ruling
P-42 fixes the design; it touches access and value, so a security audit follows the review. What stays immutable is
the PM's ruling. This PR must merge BEFORE the Sepolia deployment, so that the Sepolia contracts are upgradable from
day one and playtest data survives fixes.

## Starting point (main, after #293)

- The repository has its own `paved::components::ownable::OwnableComponent`, which is two-step (it has
  `pending_owner`). `Account` already has an owner-only `upgrade` entry point.
- OpenZeppelin is pinned at `openzeppelin_token =4.0.1` and `openzeppelin_interfaces =2.2.0`. `openzeppelin_upgrades`
  is not a dependency yet.
- `Lobby` is a library class. Its class hash is stored as `lobby_class`, set at construction and immutable (P-26).
- `Daily` is at 72,607 CASM felts, 88.6 % of the cap and exactly the cap the PM set. It has 183 felts less than its
  prototype bound, and no room.

## Goal

1. **Upgradable:** `Daily`, `Tutorial`, `Account`, `Economy` and `Collection`.
   - Use OpenZeppelin's `UpgradeableComponent`, pinned exactly at the version that matches `openzeppelin_token
     =4.0.1`. The `upgrade` entry point emits OZ's `Upgraded` event.
   - Gate it by the owner. Use the repository's own two-step `OwnableComponent` where a contract already embeds it
     (Daily, Tutorial and Account do), unless OZ's is smaller or needed; say which and why.
   - The owner is the deployer or owner account, transferable in two steps. Contracts with no owner today (check
     `Economy` and `Collection`) gain one, set at construction.
   - `Account` already upgrades: move it to the same component if that is free, or keep it and say why.
2. **The Lobby path:** make `lobby_class` settable by the owner (`set_lobby_class`, owner only, non-zero, with an
   event), instead of constructor-only. This reverses P-26's "immutable" by the PM's ruling. If a cleaner way exists,
   say so with figures before choosing it: for example, `Lobby` called through a stored class that `upgrade` itself
   could carry.
3. **NOT upgradable, by design:** `PavedToken` (a standard ERC20, minter = Economy, admin cleared) and `Vault` (no
   owner; it holds stakers' PAVED and USDC dividends, so an upgrade key there would be a custody key). A fix to either
   is a documented migration. Write the migration outline in the docs. If you find a hard reason otherwise, report it
   with figures, and do not make them upgradable yourself.
4. **Deploy:** `scripts/deploy.sh` passes the owner to every new constructor argument, on devnet and in the Sepolia
   path. Its smoke reads `owner()` back on each upgradable contract. The Sepolia sending steps stay as they are:
   another thread wires the signer later. Edit only the constructor arguments and the smoke.
5. **Storage layout discipline:** a short section in `docs/architecture/native-storage.md` (or a new
   `docs/architecture/upgrades.md`):
   - never rename or retype a storage variable;
   - add new fields only;
   - components keep their substorage names;
   - Lobby and Daily/Tutorial share one layout (P-26).
   If it is cheap, extend the existing storage-layout pin tests (`test_lobby_and_daily_pin_every_shared_storage_variable_by_name`)
   to the key structs of Economy and Account.
6. **Mainnet gate:** in economy.md "Gates before a real-money game on mainnet": the upgrade owner on mainnet is the
   owner's account, later a multisig or timelock (the owner's act).
7. **DECISIONS.md:** record D-17 and P-42.

## Tests

- For each upgradable contract:
  - `upgrade` by a non-owner reverts;
  - `upgrade` by the owner to a new class hash works, emits `Upgraded`, and keeps the state (one stored value read
    back after the upgrade, through the new class);
  - `upgrade` to class hash 0 reverts.
- Two-step ownership transfer (propose, accept; a stranger cannot accept).
- `set_lobby_class`: owner only, non-zero, emits its event, and a spawn after it runs the new Lobby class.
- `PavedToken` and `Vault` have no `upgrade` entry point (an ABI check).
- The goldens are unchanged; the gas of moves a0 to l is unchanged, or changed by the cause stated.

## Sizes: report before trimming

`scripts/class-sizes.sh` before and after, for every class. **If `Daily` passes 72,607 CASM felts, or any class
passes 90 %, stop and report the figures to me before trimming anything.** A trim of `Daily` is the PM's call.
Possible levers, to name with figures rather than apply:
- the upgrade logic in `Lobby` rather than `Daily`;
- a smaller ownable;
- dropping a view.

## Runs (VPS, D-251)

- scarb 2.20.1 and snforge 0.64.0 from `~/.asdf/installs/`.
- snforge runs: `RAYON_NUM_THREADS=1 prlimit --as=16106127360 -- /usr/bin/time -v snforge test <filter>
  --max-threads 2` (15 GiB, from the measured VmPeak).
- scarb build: `--as=12884901888` (12 GiB).
- Only after `free -g` shows 8 GB or more available. One build at a time. Record the peaks.
- A capped run with no progress for 15 minutes is stopped and reported.
- Scoped runs: the upgrade tests, lobby, golden, `test_gas_`; `class-sizes.sh` before and after. The whole suite once.
- The devnet smoke needs starknet-devnet, which is not on the VPS: say so, and the smoke runs in a separate step.

## Git

- Push the branch the plugin created for this thread (`hp/paved-core/t-...`). Do not create or rename a branch.
- Never `git rebase`. If main moves, `git merge origin/main`. Plain pushes only.

## Allowlist

- `contracts/Scarb.toml` (one exact pin of `openzeppelin_upgrades`) and `contracts/Scarb.lock`.
- `contracts/src/systems/{daily,tutorial,account,collection,lobby}.cairo`, `contracts/src/economy/economy.cairo`.
- `contracts/src/components/{ownable,hostable}.cairo`, only if the owner gate or `lobby_class` lives there.
- `contracts/src/tests/**`, `contracts/tests/**`.
- `contracts/abis/**` (through `scripts/abis.sh`).
- `scripts/deploy.sh`: constructor arguments and the smoke only. Not the Sepolia sending steps.
- `docs/architecture/{native-storage,upgrades,economy,public-interface}.md`, `docs/programme/DECISIONS.md`,
  `docs/briefs/u1-upgradable.md`.
- Not `scripts/signer/**` (another thread holds it). Not `packages/**`.

## PR

- Branch from main, PR to main.
- Title: `feat: U-1 upgradable contracts (D-17, P-42)`.
- Report:
  - the PR's number and head;
  - the size table, before and after;
  - the gas of a0 to l against main, and of spawn;
  - the peaks;
  - what CLIENT must change (new events, constructor arguments in devnet.json).
- A review and a security audit follow.
