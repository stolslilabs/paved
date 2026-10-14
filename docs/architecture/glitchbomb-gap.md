# D-25: Paved against Glitchbomb (gap analysis)

D-25 (owner, via the PM, 2026-10-13): Paved's architecture and macro features follow Glitchbomb as the reference.
P-52 (PM) fixes the target systems: Challenge, Setup, Token, Vault, Faucet, Collection and Treasury (provisional);
`Account` goes to the mocks; Governor comes after mainnet. This note maps Glitchbomb's systems and components onto
Paved, recommends where Economy lives, what Setup holds, the Faucet, the identity change, an order of pull requests
and the Sepolia path. Documents only. Brief: `docs/briefs/d25a-glitchbomb-gap.md`. The PM rules on the mapping from
this note (P-52 (4)).

> **Status (D-25 A+B, `docs/briefs/ab-systems-layout.md`).** Steps A and B landed together: `economy/{token,vault,economy}.cairo`
> are now `systems/{token,vault,economy}.cairo`, and `mocks/usdc.cairo` (`MockUSDC`) is `systems/faucet.cairo` (`Faucet`),
> with a chain-id guard that refuses `SN_MAIN` and a mainnet refusal by name in `deploy.sh`. The file paths and line
> references below are those of the code before the move; the contract names `PavedToken`, `Vault` and `Economy` are
> unchanged.

Sources and how they are cited:

- **Glitchbomb** (`/home/claude/projects/glitchbomb`, read only) at commit **`5efcbce`**, clean tree. Cited as `GB:`
  plus the path from the repository root, e.g. `GB:contracts/src/systems/vault.cairo:283`. The `dojo_*.toml` files sit
  at the repository root.
- **Paved** at `origin/main` **`7d04872d`**, and at **`cde34ff7`** (#332, documents only) for the files #332
  changed. Cited by path from the repository root. Paths under `contracts/src/` are
  written from `contracts/src/` when the context is clear.
- **Pull requests that change Paved:**
  - **#331** (D-19b, open, head `dc4f6ee`): tile owners. Daily's CASM rises from 53,418 to **59,289**, with 13,658
    felts of headroom under the P-44 cap. Its first version measured 58,320. Not on main yet.
  - **#332** (thread t-0232): the D-20 to D-25 decision rows and the D-20 to D-24 plans. It **merged during this
    work** (`cde34ff7`), and this branch has merged it. Its sections are cited as "#332, `<file>`, `<section>`", and
    they are on main now. The rows D-25 and P-52 are `docs/programme/DECISIONS.md:52-53`.
- **Class sizes** come from `scripts/class-sizes.sh` (release) as recorded in merged pull requests:
  - **#262** (E2): PavedToken 8,055, Vault 6,700 and MockUSDC 6,649 CASM felts.
  - **#309** (E-9, merge `55a5969`): Economy 26,567 CASM felts after E-9.
  - **`docs/architecture/class-headroom.md:477-483`**: Daily, Tutorial and Lobby after D-18.

  No build was run for this note.

Naming traps:

- **"R-1"** names two things. In `docs/programme/RISKS.md:5` it is the risk that the native port changes the rules.
  In the briefs and `scripts/deploy.sh` it is the Sepolia repoint of `Economy` at a new `MockRouter`. This note uses
  the second.
- **"E-9"** also names two things: the risk "Ekubo interface drift" (`economy.md:759`) and the pull request E-9
  (#309, the on-chain quote and the fork test). This note means the pull request.

## 0. Two facts that shape the whole mapping

- **Glitchbomb runs on two chains; Paved runs on one.**
  - Glitchbomb's world is deployed with the same seed, and so at the same addresses, on a settlement chain (Sepolia
    or mainnet) and on an appchain (`GB:dojo_appchain.toml:11`, `GB:dojo_cartridge.toml:11`).
  - Payment, the NFT and the reward live on the settlement chain. The game itself runs on the appchain.
  - The two chains talk by messages:
    - `Play.mint` sends `create` to the appchain (`GB:contracts/src/systems/play.cairo:268-277`).
    - The appchain's `#[l1_handler] create` checks `from_address == this` (`GB:…/play.cairo:218-240`).
    - `Playable.finish` sends the result back (`GB:…/components/playable.cairo:626-636`).
    - `Play.claim` consumes it on the settlement chain (`GB:…/play.cairo:335-365`).

  Paved plays, pays and settles on one chain. None of that messaging has a counterpart, and none is a gap to fill.
- **Glitchbomb is a Dojo project; Paved is native Starknet** (P2, `docs/architecture/native-storage.md:3-5`). This
  changes the mapping in four places:
  - **Finding a contract.** Glitchbomb finds a contract by name through the world (`world.dns(...)`, e.g.
    `GB:…/systems/setup.cairo:164`, `GB:…/systems/vault.cairo:156`). Paved passes addresses to constructors and
    stores them.
  - **Shared state.** Glitchbomb's systems share state through world models: Config, Game, VaultInfo and
    VaultPosition, and Arcade's quest, achievement and bundle models (`GB:contracts/src/store.cairo:82-132`; the
    writers and owners in `GB:dojo_mainnet.toml:27-31`).
    - Setup *defines* quests and achievements, and Play *progresses* them. Both reach the same world models.
    - In Paved each contract owns its storage (`native-storage.md:29-37`). quiver's `QuestComponent` and
      `AchievementComponent` keep definitions and progress in the contract that embeds them.
    - So the definitions and the progress must sit in **one** contract (Setup), and Challenge reports to it by a
      call. That is #332's design (`public-interface.md`, "`Setup`: the planned ABI").
  - **Reading configuration.** Glitchbomb's Play reads the Config model (`store.config()`,
    `GB:contracts/src/store.cairo:82-83`) through the world: a call into the world contract. Paved has no world:
    reading another contract's value costs a contract call of its own (section 4).
  - **Upgrades.** In Glitchbomb, upgrades come from the world: no Glitchbomb system has an `upgrade` entry point. In
    Paved each upgradable contract carries OpenZeppelin's `upgrade` behind the repository's two-step `OwnableComponent`
    (D-17, P-42, `docs/architecture/upgrades.md:8-36`).

## 1. System by system

| Glitchbomb system | What it does | Paved counterpart | Lacks | In excess |
|---|---|---|---|---|
| **play** (`GB:…/systems/play.cairo`, 377 lines) | The game's entry points. NFT ownership authorises each move. Mints games on the appchain by message. Progresses quests and achievements. Grants a reward game from a quest callback | `Daily` (Challenge after D-23) with the `Lobby` library (`systems/daily.cairo`, `systems/lobby.cairo`) and `Tutorial` | quest-reward games; authorisation by NFT ownership (Paved checks the game's stored player) | a per-game purchase in `spawn` (Glitchbomb buys through Setup); the tournament prize path (goes with D-20); Tutorial (goes with D-21); the `Lobby` library (goes with D-24) |
| **setup** (`GB:…/systems/setup.cairo`, 504 lines) | The singleton Config (addresses, economy parameters, pool key, EMA). The bundles: the player's purchase entry, `issue`, then `purchase.execute`, then `Play.mint`. The achievement and quest definitions. Admin setters | **gap** today. Planned as the D-24 system (#332, `public-interface.md`, "`Setup`: the planned ABI"). The wiring lives in `Account` (`systems/account.cairo:128-152`) and the economy configuration in `Economy` (`economy/economy.cairo:771-795`) | everything: no contract holds definitions, wiring and configuration together | none |
| **token** (`GB:…/systems/token.cairo`, 126 lines) | ERC20 GLITCH. `MINTER_ROLE` given to Play. `reward` mints; `burn` burns one's own | `PavedToken` (`economy/token.cairo`) | none | none; Paved's minter is `Economy`, set once (`token.cairo:117-133`) |
| **vault** (`GB:…/systems/vault.cairo`, 441 lines) | ERC4626 vGLITCH over GLITCH, with Votes, Pausable and AccessControl. USDC dividends per share (Rewardable). Exit fee. `collect` for contracts that cannot claim | `Vault` (`economy/vault.cairo`) | voting units (only needed by a Governor); a pause; an exit fee; `collect` | none. It is deliberately smaller: no owner, no setter, no pause, no upgrade (`vault.cairo:1-10`, `upgrades.md:19`) |
| **faucet** (`GB:…/systems/faucet.cairo`, 95 lines) | Test USDC (6 decimals). `mint` is open to anyone, for any amount. Off mainnet by deployment only | `MockUSDC` (`mocks/usdc.cairo`) | nothing functional; only its place (`mocks/` instead of `systems/`) and its name | per-call and per-address caps (`usdc.cairo:24-26`); a refusal by name in `deploy.sh` (`scripts/deploy.sh:652-660`) |
| **collection** (`GB:…/systems/collection.cairo`, 302 lines) | ERC721 of games. Counts its own ids. A reward range from 2^32. Soulbound per token. Play is the minter | `Collection` (`systems/collection.cairo`) | its own id counter (Paved's token id is the game id of `Daily`); a reward range | the Tutorial id range (goes with D-21) |
| **treasury** (`GB:…/systems/treasury.cairo`, 118 lines) | An OpenZeppelin timelock whose only proposer is Governor. `collect_fees` pulls an Ekubo LP position's fees. Receives `Vault.collect` | **gap** | everything (section 1.7) | none |
| **governor** (`GB:…/systems/governor.cairo`, 134 lines) | OpenZeppelin Governor. vGLITCH votes and the Treasury timelock executes | **gap, after mainnet** (P-52 (1)) | everything | none |

### 1.1 Play and Challenge

**Glitchbomb's play.**

- `Play` embeds AccessControl, Arcade's achievement, quest and leaderboard components, and `PlayableComponent`
  (`GB:…/play.cairo:56-87`).
- **Settlement side:**
  - `mint(player, multiplier, price, soulbound, quantity)` is `CREATOR_ROLE` only, a role held by Setup
    (`GB:…/play.cairo:121-128`, `:254`). It mints the NFT (`collection.new`, `:271`) and sends `create` to the
    appchain.
  - `claim(payload)` consumes the result and mints the GLITCH reward through `Playable.claim`
    (`GB:…/components/playable.cairo:640-665`).
- **Appchain side:** `pull`, `cash_out`, `enter`, `buy` and `exit` each require the caller to own the game's NFT
  (`assert_caller_is_owner`, `GB:…/play.cairo:371-375`).
- **Quest rewards:** `on_quest_claim` mints a reward game (`GB:…/play.cairo:185-214`).

**Paved's counterpart.**

- `Daily` holds `build` and the views. `spawn`, `discard`, `surrender` and the report run in the `Lobby` class by
  library call (`systems/daily.cairo:182-219`).
- **What it lacks against Glitchbomb:**
  - reward games;
  - ownership by NFT. Paved's game is bound to the player stored in `game_configs` (`store.cairo:318-323`) and its
    NFT is soulbound (`systems/collection.cairo:1-15`), so this is not needed while the NFT cannot move.
- **What it has in excess:** each item already has its removal planned.
  - The tournament prize path goes with D-20 (#332, `leaderboard.md`, "D-20: tournaments leave the code (planned)").
  - Tutorial goes with D-21.
  - The `Lobby` library goes with D-24, and the rename to Challenge with the per-token seed comes in D-23.
- **The purchase sits in a different place.** Glitchbomb's player buys at Setup, which mints the game in Play. Paved's
  player buys in `Daily.spawn`, which calls `Economy.purchase` (`systems/lobby.cairo:420-449`).
  - This note keeps Paved's place (section 3).
  - Glitchbomb's entry is Arcade's `BundleComponent` (`GB:…/setup.cairo:65-67`, `:259-303`), a Dojo-world
    component with no native counterpart.
  - Moving the purchase out of spawn would add a cross-contract mint per game for no gain.

### 1.2 Setup

**Glitchbomb's setup.**

- **Construction.** `dojo_init` writes the singleton `Config` (`GB:…/setup.cairo:180-256`), whose fields are listed
  in `GB:contracts/src/models/index.cairo:3-24`:
  - the VRF, quote token, team, Ekubo router and positions addresses;
  - the target supply, the burn and vault percentages, the EMA of the score, the pool key fields and the base price.
- **Twelve admin setters,** each `ADMIN_ROLE` only, write that Config (`GB:…/setup.cairo:308-468`).
- **The purchase entry.** The bundles are the player's purchase entry: `issue`, then `on_issue`, then
  `purchase.execute`, then `Play.mint` (`GB:…/setup.cairo:153-170`).
- **Quests and achievements.**
  - Setup creates the definitions (`create_achievements`, `create_quests`, ADMIN; `GB:…/setup.cairo:470-484`, through
    `InitializableComponent`): 39 achievements and 37 quests.
  - Play progresses them in the shared world.
  - There is no reporter allowlist (Play is a world writer, `GB:dojo_mainnet.toml:27-28`) and no claim entry point.
    Quest rewards are claimed automatically (`GB:…/play.cairo:180-183`), and the achievement hooks do nothing
    (`GB:…/setup.cairo:118-129`).

Paved's Setup is a **gap** today. Section 4 gives what it holds.

### 1.3 Token

| | Glitchbomb's `Token` | Paved's `PavedToken` |
|---|---|---|
| Standard | OpenZeppelin ERC20 GLITCH | OpenZeppelin ERC20 "Paved Token", 18 decimals |
| Minter | `MINTER_ROLE` granted to Play at init (`GB:…/token.cairo:71-72`); nobody holds the admin role, so the roles are frozen | one minter, `Economy`, set once by `set_minter`, which then clears the admin (`economy/token.cairo:117-125`) |
| Mint | `reward` (`GB:…/token.cairo:113-119`) | `mint` (`economy/token.cairo:128-133`) |
| Burn | anyone burns their own (`:121-124`) | anyone burns their own (`economy/token.cairo:136-138`) |
| Initial mint | 1M to a recipient | 1,000,000 to `recipient` (`economy/token.cairo:103-109`) |
| Upgrade | through the world | none (`upgrades.md:18`) |

Equivalent. The move into `systems/` is a file move (section 7).

### 1.4 Vault

**Glitchbomb's vault.**

- **What it is.** An ERC4626 share token (vGLITCH) over GLITCH, which also embeds ERC20Votes, Pausable,
  AccessControl and the Rewardable component (`GB:…/vault.cairo:66-157`).
- **Dividends.** Setup pays USDC dividends through `pay`, which is `PROVIDER_ROLE` only (`GB:…/vault.cairo:283-297`).
  Holders `claim` them (`:299-317`).
- **Collector.** `COLLECTOR` sets an exit fee (`:319-325`) and may `collect` the rewards of a contract that cannot
  claim, toward Treasury (`:336-357`).
- **Unused as deployed.** Its income is set to 0: `vault_percentage` is 0 in every toml (`GB:dojo_mainnet.toml:58`),
  so `pay` is never called as deployed.

**Paved's `Vault`** (`economy/vault.cairo`).

- **What it is.** Stakers lock PAVED and earn USDC pro rata.
- **Income.** Income is the USDC that arrives unaccounted: Economy's margin, synced into the accumulator
  (`vault.cairo:1-10`). Entry points: `stake`, `unstake`, `claim` (`:148-200`).
- **What it lacks against Glitchbomb:**
  - votes, which matter only with a Governor (section 1.8);
  - a pause and an exit fee, both deliberately absent: no key can freeze stakers (`upgrades.md:19`, `:113-118`);
  - `collect`.
- **The design differs.** Paved's share is non-transferable stake accounting, not an ERC4626 token (the reversal is
  named in `economy.md:544`). Turning it into a transferable vote token is a Governor-era change, not part of D-25.

### 1.5 Faucet

Glitchbomb's `Faucet` against Paved's `MockUSDC`: see section 5.

### 1.6 Collection

| | Glitchbomb | Paved |
|---|---|---|
| Ids | counted in Collection: `new` gives counter + 1, `reward` gives 2^32 + counter + 1 (`GB:…/collection.cairo:251-267`) | the game id of `Daily`, or `TUTORIAL_OFFSET + id` for a tutorial (`systems/collection.cairo:1-15`); minted by the game in `spawn` (`systems/lobby.cairo:396`, `:411`) |
| Who mints | `MINTER_ROLE` = Play (`:129-131`, `:269-280`) | the minter of each id range, set once by `set_minters(daily, tutorial)` (`systems/collection.cairo:321-345`) |
| Soulbound | per token, transfers revert (`:177-189`); approvals are allowed | every token; transfers and approvals revert |
| Metadata | reads the Game model from the world (`:225-246`) | a data-URI JSON (`systems/collection.cairo:94-150`) |

**What Paved lacks:** a reward range, needed only for reward games.

**What Paved has in excess:** the Tutorial range, which goes with D-21. D-23 renames `daily()` to `challenge()` and
keeps the slot `sn_keccak("daily")` (#332, `public-interface.md`, "Breaking change D-23").

### 1.7 Treasury (planned, provisional: P-52 (1))

**Glitchbomb's treasury** (`GB:…/systems/treasury.cairo`).

- **What it is.** An OpenZeppelin `TimelockController` (`:35-37`).
- **Its roles.** `dojo_init(min_delay, admin)` makes **Governor the only proposer** and opens execution to anyone.
  Every toml sets min_delay 1 hour and admin 0 (`:61-67`; `GB:dojo_mainnet.toml:39-42`).
- **`collect_fees(id, pool_key, bounds)`** (`:71-77`):
  - It has no access check, and it is declared `self: @` while it makes an external call.
  - It calls `IPositions.collect_fees(id, pool_key, bounds)` on `config.ekubo_positions`
    (`GB:contracts/src/store.cairo:62-67`).
  - The caller supplies the position id, the pool key and the bounds; nothing in the contract records which position
    is the treasury's.
  - The fees go to the position's owner. So the position NFT must be held by Treasury for this to pay Treasury. This
    is a fact of Ekubo's positions contract, not of this repository.
- **What else it does.**
  - It also receives `Vault.collect` (`GB:…/vault.cairo:351-353`).
  - It holds `DEFAULT_ADMIN_ROLE` in Play (`GB:…/play.cairo:115-117`).
  - It has an `AccountContract` impl so the Governor can simulate calls (`:83-104`).
- **How money leaves it.** Only by a proposal of Governor, executed after the delay.

**What Paved has that touches the pool.**

- **The swap only.** `Economy` swaps 70 % of each price through Ekubo's router and burns the PAVED
  (`economy/economy.cairo:992-1016`).
- **The local Ekubo interfaces** (`economy/ekubo.cairo:15-70`) are the router (`swap`, `quote_swap`) and `clear`.
  There is **no positions interface and no LP code** in the contracts.
- **The LP's fee belongs to the position's holder.** The 5 % fee stays in the pool for whoever holds the position.
  That is the owner's choice, not margin (`docs/architecture/economy.md:617-618`). Who holds the position is listed
  among the owner's acts (`economy.md:21`, `:989-991`).
- **The launch LP** (800,000 PAVED and 10,000 USDC, `economy.md:395`, `:990`) is added by the owner's launch multicall:
  create the pool, add the LP, then one stake-1 paid spawn (E-9c, `economy.md:924-954`).
- **Ekubo's mainnet contracts** are the ones the fork test reads (`economy.md:1297-1298`): positions `0x02e0af29…184067`
  and router `0x0199741822…737e`. The positions address is the one Glitchbomb's tomls pass.

**Which position, who triggers, where the fees go.** This is the proposal. The destination is the owner's decision,
because the LP's holder is an owner's act.

- **The position** is the launch LP of E-9c: Paved's own PAVED/USDC pool at Paved's key (5 %, tick spacing `0x56a4c`,
  no extension; `economy.md:1303`).
  - The owner's launch multicall mints the position NFT. That NFT is then transferred to Treasury, or minted with
    Treasury as recipient.
  - Treasury stores the position id, the pool key and the bounds once, set by the owner. Unlike Glitchbomb, the
    caller does not supply them, so a caller cannot point Treasury at another position.
- **The trigger** is anyone: `collect_fees()` with no arguments. It is safe to leave open because the fees can only
  land in Treasury. A keeper or the owner calls it.
- **Where the fees go.** The fees are two tokens, PAVED and USDC. Three destinations are possible, and the choice is
  the owner's:
  - (a) Treasury holds them, and an owner-only `withdraw(token, to, amount)` moves them out;
  - (b) the USDC goes to `Vault`, as stakers' income, by a plain transfer that `Vault` already counts as income
    (`vault.cairo:1-10`), and the PAVED is burned;
  - (c) a split of the two.

  The recommended default is **(a), with no automatic routing**: it adds no rule to the economy and leaves the choice
  where `economy.md:617-618` puts it.
- **Not a Glitchbomb copy.** Glitchbomb's Treasury moves money only through a Governor proposal. Without Governor
  (after mainnet), a copy of it would lock the fees for good. Paved's Treasury is therefore an owner-held collector
  until Governor exists, and becomes Governor's timelock then.
- **Sepolia has nothing to collect.**
  - Sepolia's pool is `MockRouter`'s own reserves. Its 5 % fee stays in reserves that nobody can remove
    (`mocks/router.cairo:9`, `:31-34`, `:193`), and there is no positions contract.
  - Treasury is therefore tested against a mock positions contract in snforge and against Ekubo's real positions in
    the mainnet fork test (`tests/economy/fork.cairo`, at the pinned block).
  - Deploying it on Sepolia only checks its wiring.

**What reverses it:**

- the owner's answer on Treasury: drop it (P-52 (1)), or set a destination for the fees;
- Governor coming before mainnet, after which Treasury becomes a timelock as in Glitchbomb.

### 1.8 Governor (gap, after mainnet; not planned)

- **Glitchbomb's design.** Glitchbomb's `Governor` is OpenZeppelin's Governor with these settings
  (`GB:…/governor.cairo:24-27`, `:29-72`, `:113-118`):
  - the votes of vGLITCH (`Vault`), with Treasury as its timelock;
  - a 1-hour voting delay and a 5-day voting period;
  - a 10,000-token proposal threshold and a 30 % quorum.
- **What Paved would need first:**
  - a transferable vote unit: Paved's `Vault` has none, and its stake is not a token;
  - a Treasury that is a timelock;
  - every owner gate (`upgrade`, `set_*`, `configure`) handed to that timelock.
- **Status.** It is the "multisig or timelock" that `upgrades.md:38-39` and `:124` already name as the mainnet owner
  later. Noted, not planned (P-52 (1)).

## 2. Component by component

Glitchbomb's `contracts/src/components/` holds four components.

| Glitchbomb component | What it does | Embedded by | Paved counterpart |
|---|---|---|---|
| **initializable** (`GB:…/components/initializable.cairo`, 80 lines) | `create_achievements` (39) and `create_quests` (37) from constant tables; no storage | Setup | `define_quest`, `retire_quest`, `define_achievement` and `retire_achievement`, owner-only on `Daily` (`systems/daily.cairo:223-253`), run in `Lobby`. Move to Setup with D-24 (#332, `public-interface.md`, "Breaking change D-24") |
| **playable** (`GB:…/components/playable.cairo`, 680 lines) | The game: `create`, `pull`, `cash_out`, `enter`, `buy`, `exit`, `finish` (reward computed, leaderboard event, L2 to L1 message), `claim` (EMA push and GLITCH mint) | Play | `PlayableComponent` (`components/playable.cairo`: `discard`, `surrender`, `build`, the leaderboard submit) with `HostableComponent` (`components/hostable.cairo`: spawn). The reward half of Glitchbomb's `claim` (EMA, then mint) is `Economy.record` and `Economy.settle` (`economy/economy.cairo:691-768`) |
| **purchase** (`GB:…/components/purchase.cairo`, 285 lines) | `initialize` and `fix` set up the bundles. `execute` sends 70 % of the price to Ekubo's router, swaps it to GLITCH and burns it, pays `vault_percentage` to `Vault.pay`, sends the rest to the team, and computes the game's multiplier | Setup | `Economy.purchase` (`economy/economy.cairo:588-690`) with `economy/curve.cairo` (split, supply factor, guard) and `economy/ekubo.cairo`. Paved also has a 5 % referral, a `min_out` slippage floor, a rate guard and a frozen reference R. Glitchbomb has `clear_minimum(GLITCH, 0)` and no floor (`GB:…/purchase.cairo:211-213`) |
| **rewardable** (`GB:…/components/rewardable.cairo`, 196 lines) | Dividends per share (×1e36) in the quote token, kept in the VaultInfo and VaultPosition models: `pay`, `stake`, `unstake`, `claim`, `open`, `close`, the exit fee | Vault | `Vault`'s own accumulator (`economy/vault.cairo:148-226`); income is the unaccounted balance, not a `pay` call |

The helper `GB:contracts/src/helpers/rewarder.cairo` (the score-to-reward step table and the supply and burn
multipliers, `:8-113`) corresponds to `economy/curve.cairo` and `economy/mean.cairo`. Paved's curve differs by design
(D-10 onwards, `economy.md`).

Paved components with no Glitchbomb counterpart:

| Paved component | Purpose | Fate |
|---|---|---|
| `hostable` (`components/hostable.cairo`) | spawn, plus tournament claim, sponsor and reclaim | claim, sponsor and reclaim go with D-20; spawn stays |
| `manageable` (`components/manageable.cairo:27-46`) | `Account.create` registers the caller | goes with `Account` (section 6) |
| `ownable` (`components/ownable.cairo`) | two-step owner, which gates `upgrade` | stays. Glitchbomb uses AccessControl roles; Paved's owner gate is the D-17 design |
| `payable` (`components/payable.cairo:51-71`) | entry token `pay` and `refund` | goes with D-20 (#332) |
| `tutoriable` (`components/tutoriable.cairo`) | the tutorial `build`, `discard` and `surrender` | goes with D-21 |
| quiver `QuestComponent` and `AchievementComponent` (`quiver_quest`/`quiver_achievement =0.2.0`; embedded in `systems/daily.cairo:107-108`, `systems/lobby.cairo:131-136`, and the achievement part in `systems/tutorial.cairo:61`) | progress and definitions | move to Setup with D-24. They are Arcade's achievement and quest components in Glitchbomb |

Glitchbomb's play also embeds Arcade's leaderboard `Rankable`, which emits only (`GB:…/playable.cairo:604-614`).
Paved's on-chain top 3 (`leaderboard.cairo`) loses its prize role with D-20; the daily leaderboard stays.

## 3. Where Economy should live

**Today.**

- `economy/economy.cairo` is one upgradable contract, 1,041 lines, **26,567 CASM felts** (#309).
- It holds the purchase split and swap, the frozen reference R, the guard rate, the per-day score accumulator, the
  EMA mean, the settlement mint and `configure` (`economy.cairo:1-21`, `:423-450`).
- `Vault` and `PavedToken` sit beside it under `economy/`.

**The choice.**

- **(A)** Keep Economy one contract. Move the files to `systems/`, with `curve`, `mean` and `ekubo` staying as pure
  libraries.
- **(B)** Split it, as Glitchbomb does, into a purchase component and a reward component.
  - **(B1)** Embed them in Challenge.
  - **(B2)** Embed them in Setup. This is Glitchbomb's placement of `purchase` (`GB:…/setup.cairo:68`).

**Weighed:**

- **CASM of Challenge under the P-44 cap (72,947).**
  - Daily is 59,289 with D-19b (#331). #332 projects Challenge at 61,000 to 64,000 once spawn, discard and surrender
    come back, cross-checked at 64,000 to 66,000 (#332, `leaderboard.md`, "Challenge's CASM after the move back").
    That projection started from D-19b's first figure, 58,300; #331 now moves it to about 62,000 to 65,000.
  - Economy's code is 26,567 felts as a contract. Even allowing a few thousand felts of contract overhead that would
    not come along, (B1) puts Challenge near 85,000 to 90,000 (an estimate). That is above the cap and above
    Starknet's hard limit of 81,920.
  - **(B1) cannot be done.** (A) and (B2) leave Challenge's size unchanged.
- **The upgrade path (D-17).**
  - Under (A) nothing moves: `Economy` is already upgradable (`upgrades.md:15`), and its layout is pinned
    (`tests::e2e::upgrades::test_upgrade_layout_pins_account_and_economy_by_name`, `upgrades.md:85-88`).
  - Under (B2) the state moves to a new contract: the EMA, the days, the guard, and the open terms of games not yet
    settled.
    - On a network that runs, that is a migration with a cut-over. Games bought before it settle in the old contract.
    - `PavedToken`'s minter is `Economy`, set once, with the admin cleared (`economy/token.cairo:117-125`). Setup
      could never mint the rewards without a new `PavedToken`, which is a migration of the token, the Vault and the
      pool (`upgrades.md:106-110`).
    - On a fresh deployment (section 8) none of this applies, and mainnet is not deployed yet.
- **The audits done (E-series).**
  - E1 (token, vault, mocks), E2 (Economy, plus an economy re-audit), E3 (wiring) and E-9 (security, F1) audited
    `Economy` as one contract with one caller, the game (`economy.md:789-896`, `:1275`).
  - (A) keeps every finding's context; a move of files is checked by the ABI diff.
  - (B2) puts the minter, the swap and the settlement in the same contract as the quest reporter allowlist and the
    owner-only definitions. The access-control audit of Setup and the security and economy audit of Economy (ruling 5)
    then cover one surface, and every Setup change is an Economy change.
- **Who calls what.**
  - **Per purchase:** Challenge, at `spawn`, pulls the price from the player to Economy and calls
    `Economy.purchase` once (`systems/lobby.cairo:420-449`).
    - Under (A) that stays one call.
    - Under (B2) the call goes to Setup instead: the same count.
  - **Per game end:** Challenge calls `Economy.record(game_id, score)` once (`systems/lobby.cairo:454-461`), plus
    `Setup.report` after D-24.
    - Under (A) these are two calls.
    - Under (B2) they could be one (Setup records and reports), which saves one contract call at game over. This is an
      estimate of about 100,000 L2 gas, from the bare syscall cost of 99,230 measured in `class-headroom.md` (test
      profile).
  - **Settlement:** anyone calls `settle` (`economy.cairo:711`). This is the same under both.
- **The mean's state is shared across games.**
  - The EMA and the day accumulators (`economy/mean.cairo:6-120`) are one state for all games, written by every
    `record` and every `settle`. It needs one home whatever the choice.
  - Glitchbomb keeps its equivalent in the Config singleton and updates it at each `claim`
    (`GB:…/playable.cairo:653-656`). That works because a world model is shared state.
  - Natively, "a component" does not remove the need for a single owning contract. Under (B2) it is Setup.

**Recommendation: (A), keep Economy a contract** and move it to `systems/economy.cairo`, with `Token` and `Vault`
(section 7, PR A).

- `curve.cairo`, `mean.cairo` and `ekubo.cairo` stay pure libraries. These are Glitchbomb's purchase and rewarder
  logic, already apart from the contract that runs them.
- The target list of P-52 (1) therefore carries **Economy as an eighth system** (flagged under "For the PM").
- The reasons:
  - (B1) breaks the class limit.
  - (B2) saves one call per game over, at the cost of merging the minter into the access-control surface of Setup and
    of a token migration on any running network.
  - (A) keeps the audited unit and its pins.

**What reverses it:**

- the PM wants Glitchbomb's placement literally, so (B2), on the fresh Sepolia deployment, before mainnet;
- or a measurement shows the game over's second call matters against the gas targets.

## 4. Setup

**What Setup holds** (the D-24 system, P-51 (3), P-52 (2)):

| Part | Today (main) | In Setup |
|---|---|---|
| Quest and achievement definitions | `define_*` and `retire_*` on `Daily`, owner-only (`systems/daily.cairo:223-253`), run in `Lobby` | the same signatures, owner-only (#332, `public-interface.md`, "`Setup`: the planned ABI") |
| Progress | quiver progress in `Daily`'s storage, written by `Lobby::finish` (`systems/lobby.cairo:454-461`) | `report(player_id, quests, achievements)` from an **allowlisted reporter** (Challenge). `set_reporter(reporter, allowed)` is owner-only |
| Tutorial claim | `tutorial_*` in `Lobby` | `claim_tutorial()`: the player calls it, it is idempotent, and it is "not really verified" (D-21) |
| Wiring | `Account.set_economy` and `Account.set_collection` (owner, once, non-zero; `systems/account.cairo:128-152`) | `set_economy` and `set_collection` (owner), with the views `economy()` and `collection()`, or one view returning both (below) |
| Configuration | the economy's parameters are in `Economy.configure` (owner, bounded; `economy/economy.cairo:771`), and the pool in `Economy.set_pool` and `set_router` | **stays in Economy** under recommendation (A). Setup holds only what the game reads: the wiring, and later the game's own settings |
| Ownership and upgrades | — | `IOwnable` and `upgrade`, as the other contracts (P-42) |

**Against Glitchbomb's Setup.**

- **Setup holds the economy's numbers in Glitchbomb, not in Paved.** Glitchbomb's Config holds the economy's
  parameters, because Glitchbomb's purchase runs in Setup. Paved's run in Economy (section 3), so Setup is smaller.
- **Setup is not the purchase entry.** Paved has no bundles: spawn takes the stake directly (section 1.1).
- **Paved adds access control on progress.** Glitchbomb has no reporter allowlist; any world writer may progress.
  Paved's allowlist is new, and its audit is P-51 (6): who may report for whom.
- **Paved adds a claim.** Glitchbomb claims quest rewards automatically and has no player claim. Paved's
  `claim_tutorial` is new.

**What Challenge reads from Setup on each call, and its cost.**

Today `spawn` reaches `Account` up to four times:

- `player(caller)` (`components/hostable.cairo:60-61`);
- `economy()` (`systems/lobby.cairo:384-390`);
- `player(referrer)`, when a referrer is given (`systems/lobby.cairo:433-435`);
- `collection()` (`systems/lobby.cairo:394-400`).

The game over reaches `Account` once, for `economy()`, before `Economy.record` (`systems/lobby.cairo:454-461`).

After D-25:

- **Gone:** `player(...)`, because identity is the address (section 6).
- **`spawn`** reads the wiring from Setup: **one** view returning `(economy, collection)`, instead of two calls.
- **The game over** calls `Setup.report` (D-24) and `Economy.record`. The economy address comes from the same view, or
  Setup returns it from `report`.

Cost, as an estimate from `class-headroom.md`: a contract call costs about 99,230 L2 gas as a bare syscall (test
profile).

- `spawn` drops from three or four calls on `Account` to one on Setup: about −200,000 to −300,000 L2 gas.
- The game over keeps two calls (Setup and Economy), the same count as today (Account and Economy).
- An alternative is to cache the two addresses in Challenge's storage at deployment. That saves the wiring view
  (about 99,000 per spawn) at the cost of two sources of truth and a few hundred felts of CASM. This note recommends
  **Setup as the one registry, read per call**, as Glitchbomb's Play reads Config per call.

  **What reverses it:** a gas measurement of spawn after D-24 that shows the view matters against the targets.

**As built (E).** Step E (t-0260) built the wiring on Setup as recommended, the one registry read per call:

- `Setup.set_economy(economy)` and `Setup.set_collection(collection)`: owner only, once each, never zero (as
  `Account`'s were), emitting `EconomySet { economy }` and `CollectionSet { collection }` with `Account`'s names and
  fields. One view, `Setup.wiring() -> Wiring { economy, collection }`.
- `spawn` reads `wiring()` once, before the game is created, and uses both addresses (purchase, then mint): one call on
  Setup instead of three or four on `Account`. A game over reads `wiring()` for the economy, then calls `Setup.report`
  and `Economy.record`: three calls, as before (`Account.economy`, `report`, `record`).
- A zero `setup` slot (only possible on an in-place upgrade before `set_setup`) reverts both: a spawn leaves no game, and
  a closing move leaves the game live (`'Daily: setup is zero'`). Step D's guard (end and record, skip the report) no
  longer holds, since the economy's address is Setup's.
- Measured (`tests/gas.cairo`, VPS, scarb 2.20.1, snforge 0.64.0): spawn m 49,988,176 to 49,482,886 L2 gas
  (**-505,290**); n (stake 10, a referrer) 51,014,286 to 50,189,546 (**-824,740**: the referrer's registration read is
  gone too). The estimate was -200,000 to -300,000; the extra saving is the registration check of the caller and the
  second `Account` view. Game overs move by +360 to +1,260 (the wiring view against `Account.economy`); moves that end
  nothing by -280. Every scenario is under its ceiling; f (the tightest) is 18,554,596 against 18,923,195.

## 5. Faucet

| | Glitchbomb `Faucet` | Paved `MockUSDC` |
|---|---|---|
| Token | ERC20 "USDC", 6 decimals (`GB:…/faucet.cairo:45`, `:74-76`) | 6 decimals (`mocks/usdc.cairo:22`) |
| Who may mint | anyone, any amount, no rate limit (`GB:…/faucet.cairo:87-89`) | anyone, at most **10,000 USDC per call** and **20,000 per recipient** over all calls (`usdc.cairo:24-26`, `:106-114`) |
| Premint | an initial supply to a recipient (`:47`; 10K in `GB:dojo_sepolia.toml:53-56`) | 10,000 USDC to the deploying account, outside the caps, for the launch pool (`usdc.cairo:9-14`, `:28`) |
| Role | doubles as the quote token on test networks: `quote` falls back to `dns("Faucet")` (`GB:…/setup.cairo:210-214`) | is the `usdc` of Economy and Vault on devnet and Sepolia (`scripts/deploy.sh:1918-1922`) |
| Kept off mainnet by | deployment only: `skip_contracts` in `GB:dojo_mainnet.toml:24` and `GB:dojo_cartridge.toml:24`; absent from both mainnet manifests; no chain-id check | `deploy.sh` refuses mainnet outright (`scripts/deploy.sh:263-272`) and refuses `MockUSDC` and `MockRouter` by name off devnet and Sepolia (`:652-660`); no chain-id check |

**Who mints test USDC today** (read only):

- **The fresh deploy.** The deployer receives the 10,000 USDC premint, which `deploy.sh` checks before seeding the pool
  (`scripts/deploy.sh:1925-1930`).
- **The fresh smoke.** It mints up to 2 USDC to the deployer if short (`:2086-2093`).
- **R-1's `--repoint`.** It mints what the deployer lacks for the new pool, in chunks of at most 10,000 (`:69-72`,
  `:921-986`), plus the smoke's 2 USDC (`:1222-1225`).
- **D-18's `--d18` smoke.** It mints 2 USDC if missing (`:1386-1394`).
- **The client.** It mints 100 USDC per call (`FAUCET_USDC_AMOUNT`, `packages/chain/src/abis.ts:71`), from
  `createPlayer` or `mint` (`packages/chain/src/writer.ts:191-200`, `:325-341`), offered on devnet and Sepolia
  (`packages/app-web/src/utils/network.ts:28-29`).

**Recommendation.**

- **Faucet is `MockUSDC` moved to `systems/faucet.cairo` and renamed `Faucet`,** with its caps kept. Paved's is
  already stricter than Glitchbomb's, and S-1's audit findings 1 and 2 produced the caps (`economy.md:1239`).
- **Keep mainnet out twice:**
  - `deploy.sh`'s refusal by name, extended to `Faucet`;
  - a constructor guard, `assert(get_tx_info().chain_id != 'SN_MAIN')`. The guard costs a few felts and holds even if
    the class is declared and deployed by hand.

  Neither Glitchbomb nor Paved has the guard today.
- **The cost of the rename.** The name changes in `contracts/deployments/*.json` (`MockUSDC` becomes `Faucet`), in the
  client's deployment reader (`packages/chain/src/economy/deployment.ts:61-79`) and in the session policy
  (`packages/chain/src/auth/controller.ts:41-54`).
- **Audit:** access control (ruling 5).

**What reverses it:** a decision to keep the mocks' folder for anything not deployable on mainnet. Then only the
name changes.

## 6. Player identity off `Account`

**The id is already the wallet address.** A player's id is `get_caller_address().into()`, a `felt252`:

- `create` keys the new player on the caller (`components/manageable.cairo:30-33`);
- `build`, `discard` and `surrender` use the caller (`components/playable.cairo:75`, `:152`).

"The id becomes the address" therefore changes **no storage key and no event layout**. What goes is the registration,
the name and the master.

**Storage keyed by player id:**

| Storage | Where | After |
|---|---|---|
| `players: Map<felt252, Slots2>` (name, master) | `store.cairo:90`, written by `Account` | dead in Challenge's layout (it was never written there: `Store.player` reads `Account` when the `account` slot is set, `store.cairo:186-192`). `Account` itself leaves the deployment |
| `game_configs.a`, the player of each game | `store.cairo:318-323` | unchanged (the address felt) |
| leaderboard `rankings` (player ids of ranks 1 to 3) | `store.cairo:100-103` | dead with D-20 (#332) |
| tournament claims and sponsors keyed by caller | `models/tournament.cairo:76-84`, `components/hostable.cairo:159` | dead with D-20 |
| quiver progress, keyed by `player_id` = the caller felt | `systems/lobby.cairo:456-459` | moves to Setup (D-24) with the same key |
| `Economy.players: Map<u32, ContractAddress>` (game to payer) | `economy/economy.cairo:444` | unchanged |
| `PavedStorage.account`, the address of `Account` | `store.cairo:83`, set by `Store.initialize` (`:130-131`) | dead on an upgraded Challenge; absent from a fresh one |

**Events** (`contracts/src/events.cairo`):

- `GameSpawned` (`:31-40`), `Built` (`:43-52`), `Discarded` (`:55-62`), `Scored` (`:65-72`) and `GameOver` (`:75-86`)
  carry `player_id: felt252`. Its meaning (the address) and its layout do not change.
- `Purchased` and `Settled` carry `player_id` too (`economy/economy.cairo:472-488`, `:510-518`); they are unchanged.
- **`PlayerCreated`** (`:23-28`), and `Account`'s `EconomySet` and `CollectionSet`, are no longer emitted by anything
  deployed. The two wiring events move to Setup if Setup emits them (proposed: the same names and fields).
- `Claimed` (`:97-103`) goes with D-20.

**Behaviour that changes:**

- **Spawn.** It no longer requires a registered player (`components/hostable.cairo:60-61`, `assert_exists`). Any
  account may play.
- **Referral.** The referrer is "a registered player other than the payer" (`systems/lobby.cairo:433-435`; E3's test,
  `economy.md:866`). It becomes "a non-zero address other than the payer".
  - Registration was permissionless (`Account.create`, `components/manageable.cairo:27-46`), so the check never kept
    a second wallet out. The rule's strength is unchanged.
  - It is a rule of the economy all the same, so it goes to the economy lens (ruling 5).

**The indexer** (`packages/indexer`, read only):

- **What it reads from `Account`.** It reads only events from it: `PlayerCreated` (accepted only from `account`;
  `packages/indexer/src/events.ts:58-63`, `:171`), and `EconomySet` and `CollectionSet` (`:119-126`, `:173-174`).
  - It fills the `players` table (player_id, name, master; `packages/indexer/src/store.ts:85-89`, `:671-688`).
  - It cross-checks the wiring against the deployment file (`store.ts:652-669`).
  - Names are joined into the rankings and the player API (`packages/indexer/src/queries.ts:151`, `:264`, `:316`,
    `:338`). No view call goes to `Account`.
- **After D-25:**
  - A player row comes from the first `GameSpawned` (its `player_id` key, `events.ts:410-411`), with no name.
  - The wiring events come from Setup's emitter.
  - The deployment hash covers Daily, Tutorial, Account, Economy and Collection (`packages/indexer/src/deployment.ts:48-58`,
    `store.ts:55-70`), so removing `Account` and adding Setup forces a schema bump and a rebuild.

**The quests.** Progress is keyed by player and stays keyed by the same felt. It now lives in Setup (D-24), with no
migration of past progress on Sepolia (P-51 (5)).

**The client.**

- **Names.** The name comes from the Controller (the Cartridge username) off-chain, so `Account.create` disappears:
  - `writer.createPlayer` (`packages/chain/src/writer.ts:192-193`);
  - the session policy `Account: ["create"]` (`packages/chain/src/auth/controller.ts:31`);
  - `PavedClient.player` (`packages/chain/src/paved-client.ts:31-36`);
  - the Landing flow that creates a player (`packages/app-web/src/pages/Landing.tsx:142-145`).
- **The referrer check** (`packages/app-web/src/components/EconomyPurchase.tsx:81`) becomes a check of a non-zero
  address.
- **Leaderboard names.** The leaderboard and the player pages need names for addresses that the indexer no longer has.
  Either the client resolves them through the Controller, or the indexer does. The second would read an external
  service, which META decides.

**What `Account` in the mocks must still give the tests.**

- After the change, no deployed contract calls `Account`. Its only remaining consumers are the tests of the old
  layout:
  - `tests::e2e::upgrades::test_upgrade_layout_pins_account_and_economy_by_name` (`upgrades.md:85-88`);
  - `tests/e2e/upgrade_d18.cairo`;
  - any rehearsal of a Sepolia upgrade from the deployed state (`--rehearse`).
- If Sepolia is redeployed fresh (section 8), those consumers go too.
  - `Account` then needs no mock: it can be deleted, and git history keeps it.
  - The layout pin keeps only Economy's half.
- If Sepolia is upgraded in place, `Account` stays deployed there, unused, and the mock serves the rehearsal.

This is flagged under "For the PM": "Account to the mocks" has a consumer only on the chained path.

**As built (E).** Step E (t-0260):

- **Identity.** No registration: `HostableComponent::spawn_with` takes the caller's address as the player id and checks
  nothing more. `Store.player`, `Store.initialize`, `Store.set_player` and `PlayerAssert` in the spawn path are
  gone, and nothing emits `PlayerCreated` (still declared in `Daily.json` until the indexer drops it); `models/player.cairo` stays for the game models that still name `Player`.
- **Storage.** No key and no event layout changed. `PavedStorage.account` and `PavedStorage.players` stay declared and
  dead in Challenge's layout (P-42), pinned by name and against reuse in
  `tests::e2e::cold_paths_audit::test_daily_pins_the_dead_fields_by_name` (`upgrades.md`, "Dead slots since D-25 E").
  `Daily`'s constructor is `(owner, token_address, setup_address)`.
- **Behaviour.** Spawn by an address that never registered works
  (`tests::e2e::access::test_access_daily_spawn_by_an_unregistered_address`). The referrer is "a non-zero address other
  than the payer"; zero and the payer are ignored as before (`economy.md`, section 1).
- **`Account` and `manageable`** are deleted. **No mock `Account`**: no test needs one after the layout pin moved to
  Setup and the frozen D-18 class's unused `Store.player` went; Sepolia is redeployed fresh (P-53), so the chained path
  that would have needed it is not taken. `Account.json` stays in `contracts/abis/`, frozen at aff59e06 and no longer
  written by `abis.sh`, only while `packages/chain` imports it (CLIENT removes the import, then the file).
- **Events.** `PlayerCreated` is a past event (`public-interface.md`, "Breaking change D-25 (E)"); `EconomySet` and
  `CollectionSet` are emitted by Setup.
- **Deploy.** `deploy.sh`'s fresh path deploys no `Account`, sets the economy and the collection on Setup (owner calls,
  checked through `wiring()`), and no longer writes `contracts.Account`; `--repoint` and `--d18` are untouched.
- **Indexer and client** follow in META and CLIENT, as listed above (the deployment hash no longer covers `Account`).

## 7. The mapping, and an order

The current sequence:

1. D-19b (#331, in review);
2. D-20b (the prize path out);
3. D-21/24b (the tutorial out, the Lobby library dissolved, the quest system), which now builds Setup;
4. D-23b (the rename to Challenge and the per-token seed), last.

The D-25 steps fit around them as pull requests:

| # | Pull request | Files (main) | Audit lens (ruling 5) | Placement |
|---|---|---|---|---|
| A | **Token, Vault and Economy move to `systems/`** (recommendation (A)). This is a file move: `economy/token.cairo`, `vault.cairo` and `economy.cairo` go to `systems/`, while `curve`, `mean` and `ekubo` stay libraries; `lib.cairo` and the test imports change. No logic change. The ABI diff shows only module paths in type names. The contract names (`PavedToken`, `Vault`, `Economy`) and so the deploy artifacts are unchanged | `economy/`, `systems/`, `lib.cairo`, `tests/economy/*` | security and economy, limited to "a move": the ABI diff and an unchanged test suite. The class hashes change through the type paths; deployed instances are unaffected | **after D-19b, in parallel with D-20b**. They share only `lib.cairo`'s module list, a trivial conflict |
| B | **Faucet** (`mocks/usdc.cairo` becomes `systems/faucet.cairo`, plus the chain-id guard, `deploy.sh`'s name list, `deployments/*.json` keys) | `mocks/usdc.cairo`, `systems/`, `scripts/deploy.sh`, `tests/economy/usdc.cairo` | access control | **in parallel with D-20b and A**. `deploy.sh` is shared with D-20b (its smoke), a textual conflict only. Before the fresh deployment |
| C | **Treasury** (provisional). New `systems/treasury.cairo`, a positions interface in `ekubo.cairo`, a mock positions contract, a fork test, `deploy.sh` | new files, `economy/ekubo.cairo` (or `systems/` after A), `tests/economy/fork.cairo`, `scripts/deploy.sh` | security and economy (it holds LP fees in PAVED and USDC) | **any time after A**, in parallel with D-20b and D-21/24b (disjoint files). Waits on the owner's answer on Treasury |
| — | D-20b, the prize path out | as planned in #332 | security and economy (P-48) | unchanged |
| D | **D-21/24b becomes Setup.** The quest system, as #332 plans it, is named `Setup` from the start | as planned in #332 | security (P-51 (6)) | unchanged place: after D-20b |
| E | **`Account` out: identity is the address.** Setup gains the wiring (`set_economy`, `set_collection`, the wiring view); Challenge reads Setup instead of `Account`; `assert_exists` and the referrer's registration check go; `Store.player` goes; `Account` and `manageable` go to the mocks (or are deleted, section 6); `deploy.sh`; the indexer and client follow (META, CLIENT) | `systems/account.cairo`, `components/manageable.cairo`, `components/hostable.cairo`, `systems/lobby.cairo` (or Challenge after D-24), `store.cairo`, the Setup of D, `deploy.sh` | access control (Setup's setters) and economy (the referral rule) | **after D, before D-23b**. It edits the same files as D (spawn's code, Setup), so it cannot run in parallel with D. It can be folded into D if D's reviewer accepts the size |
| — | D-23b, the rename to Challenge and the per-token seed | as planned in #332 | as planned | last, unchanged |
| F | **Sepolia: one fresh deployment** (section 8) | `scripts/deploy.sh` (fresh path), `contracts/deployments/sepolia.json` | none (an operation) | after D-23b and the others. CLIENT and META ship their matching versions at the same time |

What runs in parallel:

- **A, B and C** touch disjoint files from D-20b except `lib.cairo` and `deploy.sh`, both textual conflicts.
- **C** waits only on A, for the folder, and on the owner.
- **D, E and D-23b** are serial: they all rewrite spawn's path and `Daily`'s constructor and interface.
- **Governor** is not in the order.

## 8. Sepolia: one fresh deployment, or chained upgrades (ruling 4)

**What Sepolia runs today, by the repository.**

- `contracts/deployments/sepolia.json` (last written by #303, block 16,421,420) lists `Account`, `Daily`, `Tutorial`,
  `Collection`, `Economy`, `PavedToken`, `Vault`, `MockUSDC`, `MockRouter`, and the `Lobby` class.
- It has **no `repoint` and no `d18` key**: R-1 part B (the E-9 repoint) and D-18c part B are not recorded as run.
- Chained upgrades would therefore start with those two tools, then D-19, then one upgrade for D-20 to D-25.

**Weighed:**

| | Chained upgrades | One fresh deployment |
|---|---|---|
| New contracts | Setup, Faucet and Treasury deployed beside the old ones. `MockUSDC` stays as the `usdc` of the running `Economy` and `Vault`, because neither can change its token (`Vault` has no setter, `vault.cairo:135-138`; `Economy` would need a migration write). So the Faucet would be a second test USDC, or would not replace `MockUSDC` at all | every contract new, with Faucet as the `usdc` from the start |
| Classes that change | `Daily` (then Challenge), `Economy`, `Collection`: upgraded. `Account`, `Tutorial` and the `Lobby` class: left deployed and unused. `PavedToken` and `Vault`: not upgradable (`upgrades.md:18-19`), so PR A's moved classes never reach Sepolia | all declared from the same commit |
| Storage left dead (P-42) | in Challenge: `tournaments`, `sponsorships`, `rankings`, `lobby_class`, `account`, the quiver substorage (definitions and progress), and `players`; plus whole contracts (`Account`, `Tutorial`). Each must be pinned and never reused, forever, for a test network's history | none |
| Test data | kept: games, days, EMA, guard, stakes. The quest progress is not migrated anyway (P-51 (5)), and tournaments and prizes leave with D-20 | dropped (accepted by the PM) |
| Indexer | a rebuild anyway: the deployment hash changes (Account out, Setup in), schema bump (#332 plans schema 7) | one rebuild, from the new deployment block |
| Tools | `--repoint`, then `--d18`, then a D-19 tool, then a D-20 to D-25 tool, each written, rehearsed (`--rehearse`) and smoked. The last one is the largest upgrade the project has done: a new layout, three new contracts, the wiring moved | `deploy.sh sepolia`, the fresh path that every devnet run and rehearsal already exercises (`scripts/deploy.sh:1883-1986`), updated by PRs B, C and E |
| CLIENT and META | new addresses for Setup, Faucet and Treasury; the old ones stay in the file; two test USDC if the Faucet is new | one new deployment file; the client and indexer switch at once |

**Recommendation: one fresh deployment** once D-23b and A to E have merged. R-1 part B and D-18c part B are then not
run: the fresh path supersedes them.

- **D-17 stays the path for mainnet.** Mainnet's first deployment is fresh in any case. Every upgrade after it follows
  `upgrades.md`.
- **The upgrade machinery stays exercised:**
  - by `tests/e2e/upgrades.cairo`;
  - by one owner `upgrade` of a probe class on the fresh Sepolia deployment, as a drill. This is a suggestion, not a
    ruling.
- The reasons:
  - three new contracts against a running pair (`Economy` and `Vault`) that cannot change its token;
  - seven dead storage names and two dead contracts that would be pinned forever;
  - four upgrade tools to write and rehearse for data the PM accepts to drop;
  - while the fresh path is already maintained and rehearsed.

**What reverses it:**

- the PM or the owner values Sepolia's stakes and games above the cost above;
- or a requirement to rehearse a chained mainnet-like upgrade on real state before mainnet. Then run the chain:
  `--repoint`, `--d18`, D-19, then D-20 to D-25.

## For the PM

1. **P-52 (1) lists no Economy.**
   - The purchase, the settlement, the mean, the guard and the minter key live in `economy/economy.cairo` (`:1-21`,
     `:423-450`). They need a home.
   - Section 3 recommends keeping `Economy` a contract, so the target list becomes eight systems.
   - The alternative is to put it inside Setup (B2). Inside Challenge (B1) it exceeds the class limit: 59,289 + 26,567 =
     85,856 felts even before the move back, above Starknet's 81,920.
2. **"Account to the mocks" has a consumer only on the chained Sepolia path.**
   - After the identity change nothing deployed calls `Account`.
   - The tests that read it pin the old layout (`upgrades.md:85-88`, `tests/e2e/upgrade_d18.cairo`).
   - With a fresh Sepolia deployment, `Account` and `components/manageable.cairo` can be deleted rather than mocked
     (section 6).
3. **"The identity becomes the wallet address" is already true of the id.**
   - It is `get_caller_address().into()` (`components/manageable.cairo:30-33`).
   - No storage key or event layout changes. Only the name, the master and `PlayerCreated` go.
4. **Treasury on Sepolia has nothing to collect.**
   - The Sepolia pool is `MockRouter`'s reserves. Its fee cannot be withdrawn (`mocks/router.cairo:9`, `:31-34`,
     `:193`), and Paved's contracts have no positions interface (`economy/ekubo.cairo:15-70`).
   - Treasury can only be tested against a mock and the mainnet fork.
5. **Glitchbomb's Treasury cannot be copied before Governor.**
   - Its only proposer is Governor (`GB:…/treasury.cairo:61-67`). Without Governor, the fees could never leave.
   - Section 1.7 proposes an owner-held collector until Governor exists.
6. **Where Treasury's fees go is the owner's decision.**
   - The LP's holder and its 5 % are listed as the owner's acts (`economy.md:21`, `:617-618`, `:989-991`).
   - The note proposes (a): hold, with an owner-only withdraw.
7. **Glitchbomb's `collect_fees` takes the position from the caller and checks nothing** (`GB:…/treasury.cairo:71-77`).
   This is harmless only because Ekubo pays the position's owner. Paved's version stores the position.
8. **Glitchbomb's purchase entry is Setup** (Arcade's `BundleComponent`, a Dojo-world component). Paved keeps the
   purchase in Challenge's `spawn` (section 1.1). This departs from "follow Glitchbomb" on purpose.
9. **Glitchbomb's play spans two chains** (section 0). Its messaging, l1 handler and claim-by-message have no
   counterpart and are not gaps.
10. **Sepolia has not run R-1 part B or D-18c part B** by `contracts/deployments/sepolia.json`, which has neither key.
    If the fresh deployment is chosen, both are superseded.
11. **The referral rule changes meaning** (`systems/lobby.cairo:433-435`): from a registered player to any non-zero
    other address. Its strength is unchanged, since registration was open, but it is an economy rule: it goes to
    E's audit.

## For META

- **`PlayerCreated` disappears.**
  - The `players` table is filled from the first `GameSpawned` of an address (`packages/indexer/src/events.ts:410-411`).
  - Names are off-chain (the Controller). Whether the indexer resolves them, by reading an external service, or the
    client does, is META's call.
- **New emitters.**
  - Setup emits the quest and achievement events (#332), and `EconomySet` and `CollectionSet` if E keeps them.
  - `EMITTERS` (`events.ts:168-180`) and the deployment hash (`deployment.ts:48-58`) change: Account and Tutorial are
    out; Setup, Faucet and Treasury are in.
- **Treasury.** Its collections may need indexing if the client shows them. To be decided with C.
- **One rebuild** at the fresh Sepolia deployment, with schema 7 of #332 or after it.

## For CLIENT

- **Registration goes.**
  - `Account.create` and its session policy go (`packages/chain/src/writer.ts:192-193`,
    `packages/chain/src/auth/controller.ts:31`).
  - The name comes from the Controller.
  - `PavedClient.player` and the Landing creation flow go (`packages/chain/src/paved-client.ts:31-36`,
    `packages/app-web/src/pages/Landing.tsx:142-145`).
- **The referrer check** becomes a non-zero address (`packages/app-web/src/components/EconomyPurchase.tsx:81`).
- **The deployment file's names change:** `MockUSDC` becomes `Faucet`, `Account` and `Tutorial` go, and `Setup` (and
  `Treasury`) arrive. The readers to change are `packages/chain/src/deployment.ts:45` and
  `packages/chain/src/economy/deployment.ts:61-79`.
- **Session policies.** `Faucet.mint` replaces `MockUSDC.mint`, and `Setup.claim_tutorial` is added
  (`packages/chain/src/auth/controller.ts:41-54`).
- **One switch** to the fresh Sepolia deployment.
