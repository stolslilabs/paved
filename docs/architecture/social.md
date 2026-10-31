# Social features on chain and off chain: guilds, follows, messages, the services and their costs on the L3 (#956, design)

Design note for #956, part of the umbrella #957. **Documents only**: no contract, service or client code. The client's
social features (#952, #953, #954, #955) are built first on mock data; the contracts, the services and the integration wait
for the client's validation. This note fixes the strategy they will follow.

The owner's decisions bind:

- **The client first, on mock data, until it is fully validated** (2026-10-30, #927; restated 2026-10-31 for the social
  features).
- **The contracts wait; their strategy is documented now, with the fees weighed despite a centralised L3** (2026-10-31).

The rules described here are those of #953 (guilds), #954 (follows, friends, blocks) and #955 (messages), with their open
points at their defaults. The note's own open points keep their defaults until the owner answers on #956 (section 10).

Sources: #953 to #957; `accounts.md` (#918), `indexer.md`, `docs/client/indexer-hosting.md`, `vault-share.md`
(`delegate_by_sig`), `parity-fixture.md`, `quests.md`, `g7-gas-plan.md` (unit costs), `structure-state.md` (the receipts'
cost per slot), `leagues.md`, `xp-level.md`; `contracts/src/systems/setup.cairo` (`player_level`, `spend_cobbles`) and
`matchmaker.cairo` (`league`). Cartridge's components (`cartridge-gg/arcade`, `packages/social/src/components/`, main at
`c53fadcc`) are cited from #953, #954 and #956's reading of them: read, not run.

## 1. Summary

- **On chain: the guilds only.** One new contract, `Guild`, holds each guild in one packed felt, each player's membership in
  one packed felt, and a name index for unique names. No list is stored: the members, the log, the search and the ranking
  come from its events, through the indexer.
- **Signed off chain, redeemed on chain: join requests and invitations** (SNIP-12, with an expiry and the joining player's
  nonce). Accepting one is one transaction where a stored request would need two, and nothing is stored while it waits.
- **Off chain, in a new social service: everything the chain cannot or should not hold.** Follows (signed), blocks, mutes,
  reports, the guild's description and announcements (signed by an officer), and the messages of the World, the guilds and
  the private conversations (each signed). The service has a database with retention rules, deletion on request, moderation
  tools, a word filter, rate limits and a socket.
- **The cost**: every guild entry point is estimated at **0.3M to 2.2M L2 gas**, almost all of it in execution, since every
  write after the first is a rewrite of an existing slot. For 10,000 daily players (section 3.5) the guilds cost about
  **1,360M L2 gas a day, about 0.04 % of their games**. Follows on chain as Cartridge's events would cost nine times the
  guilds, and would make every follow public; they stay off chain.
- **Spam with no fees** is held by the contract's caps and delays, and by a level to create a guild (accounts are free,
  levels are not); the service has its own rate limits.
- **The rules once**: the pure functions of `packages/game-core/src/social/` (#953 to #955) are the reference. The service is
  TypeScript and imports them; the contract mirrors the guild rules, checked by a shared fixture of cases, as the engine is.
- **Nothing is embedded or copied from Cartridge**: its components are Dojo components, and four of their behaviours are
  ones Paved must not repeat (section 8).

## 2. Where each piece lives

The table of #956's proposal, each row confirmed or changed, with its reason.

| Piece | Home | Verdict | Why |
|---|---|---|---|
| The guild, its members, their ranks, the join type, the requirements, the leader | `Guild`'s storage, packed: one felt per guild, one per member; an event for each change | **Confirmed** | The rules must be trusted (who may kick whom), and later guild play (wars, missions, rewards: #957's later levels) will read them on chain. The writes are small and rare (section 3). The leader is not stored as an address: it is the member whose rank is Leader, so a transfer rewrites two member felts and nothing else |
| Join requests and invitations | Signed off chain (SNIP-12), held by the social service while they wait, redeemed in the transaction that accepts them | **Confirmed** | No storage while they wait, and one transaction (the acceptance) where a stored request needs two (the request, then the acceptance). Each carries an expiry and the joining player's nonce, so a used, cancelled or outdated one cannot be redeemed (section 6.3). Cartridge's pending request is the alternative (open point 2) |
| The guild's name | On chain: in the creation's event, and a name index (the lowercased name to the guild's id) | **Changed**: no name slot | Unique names must be checked where the guild is made, so the index is needed; the name itself is only displayed, so the event is enough (the indexer keeps it). The name is fixed at creation (#953's settings do not include it), so the index is never rewritten except to free the name when the guild is disbanded. One slot saved per guild |
| The guild's emblem | On chain, in the guild's felt (a `u32`: shield, icon, two colours, #953's open point 7) | **Confirmed** | It fits in the guild's felt for nothing, and it is part of the guild's identity on every list |
| The guild's tag | Nowhere: made from the guild's id (#953) | **Added** | A pure function of the id |
| The guild's description and announcements | Off chain, in the social service, each signed by its author; the service checks the author's rank against the chain | **Confirmed** | The text is large (150 and 500 characters), often changed, and must be deletable. The chain is checked for the rank, not trusted from the client |
| Follows | Off chain, signed, in the social service | **Confirmed** (open point 1) | No game rule reads them. On chain, even as events only, they would cost nine times the guilds (section 3.5), and every follow would be public, against #954's default that a player's lists are their own (#954, open point 2). Signed, they can be checked and moved elsewhere later |
| Blocks, mutes, reports | Off chain, private, in the social service; never on chain, never signed (the session is enough) | **Confirmed** | A public block list would hurt players, and #954 says a block is never shown to the blocked player |
| Messages: the World, the guild, private | Off chain, in the social service, each message signed by the player's key | **Confirmed** | The volume, privacy, moderation and deletion rule out the chain. The signature proves who wrote a message to a moderator, and the service cannot forge one (section 5.4) |
| The guild's log | The indexer, from `Guild`'s events; the announcements' lines from the service | **Added** | #953 keeps the last 100 entries; the chain keeps none (no lists on chain) |
| Search, suggestions, ranking | The indexer | **Added** | Lists and sorting are the indexer's (section 5.1) |

## 3. The fees on a centralised L3

### 3.1 What a transaction costs the operator

The player pays nothing on the L3 (`accounts.md`: a DEPLOY_ACCOUNT is fee-free there). Each transaction still costs the
operator:

- **its execution and its proof**: the prover's work grows with the execution's steps, so the execution's L2 gas is the
  measure of it;
- **the settlement of the state's changes on the layer below**: the storage slots the transaction writes make up the state
  diff that the L3 publishes. A new slot costs far more than a rewritten one (about 0.45M L2 gas against 0.03M in the
  receipts Grim World fitted on Sepolia: `structure-state.md`). **Events are not part of the state diff**: they cost their
  execution (about 0.035M each) and nothing at settlement;
- **a state that only grows**: every slot ever written stays in the state the node, the prover and every full node keep.

So this design counts the slots each entry point writes and how many are new, packs them, and stores no list.

### 3.2 The unit costs used

All figures in L2 gas. They are the measured unit costs of `g7-gas-plan.md` (section 1.4, test profile: the release build
costs less) and the receipt figures of `structure-state.md`:

| Unit | L2 gas | Source |
|---|---:|---|
| A storage read | 77,000 | measured (g7: 76,840) |
| A storage write | 118,000 | measured (g7: 118,210) |
| An event | 35,000 | measured (g7: 32,800 to 37,000) |
| A view call to another contract, with the read behind it | 260,000 | estimate: the external call measured at about 181,000 (`baseline.md`, the game over's `Setup.report`) plus one read |
| A SNIP-12 signature check (the message's Poseidon hash, the call to the signer's `is_valid_signature`, one ECDSA) | 350,000 | **estimate**, not measured in Paved |
| The entry point's dispatch | 50,000 | estimate |
| State diff: a new slot | 450,000 | receipts, fitted (Sepolia) |
| State diff: a rewritten slot | 30,000 | receipts, fitted (Sepolia) |
| A transaction's own cost (the account's validation, its nonce, the calldata) | 330,000 | **assumption**, the same for any write; left out of the per-entry-point table, counted in the day's total |

The settlement figures are Sepolia's; on the L3 the settlement price of a slot depends on the layer below and on how the L3
publishes its state diff (to check when the L3 exists). The ratio between a new slot and a rewrite is what drives the
design, and it holds wherever the state diff is paid.

### 3.3 Storage layout

Timestamps are stored as `u48` seconds (enough for millions of years; the contracts' `u64` values narrowed in the packing),
days as `u32` day numbers.

| Storage | Key | Slots | Packing (low bits first) | Written |
|---|---|---|---|---|
| `guilds` | `guild_id: u32` | 1 | `members u8`, `officers u8`, `join_type u8` (1 Open, 2 By request, 3 Invite only), `min_level u16`, `min_crowns u32`, `emblem u32`, `created_at u48`, `leader_seen u32` (day), `rotation_day u32` (0: no claim open), `flags u8` (bit 0: disbanded). 200 bits | create (new), every change of membership, rank or settings (rewrite), the leader's daily check-in (rewrite), a rotation's claim (rewrite) |
| `members` | `player: ContractAddress` | 1 | `guild u32` (0: none), `rank u8` (0 none, 1 Member, 2 Officer, 3 Leader), `nonce u32`, `joined_at u48`, `last_kick_at u48`, `last_created_at u48`. 216 bits | the player's first guild ever (new), every later change (rewrite). Kept after leaving (guild 0), since its nonce and delays must survive |
| `names` | the lowercased name (`felt252`) | 1 | the `guild_id u32` | create (new), disband (written 0) |
| `next_guild_id` | | 1 | `u32` | create (rewrite) |
| `rotations` | `guild_id: u32` | 1 | the claimed heir (`ContractAddress`); the claim's day is the guild felt's `rotation_day` (section 6.4) | a rotation's claim (new the first time per guild), its contest and finish (rewrite) |

- **Ranks as numbers** in that order, with room between them, so #953's fourth rank (open point 1 of #953) comes in without
  a layout change.
- **The member count and the officer count** live in the guild's felt: "is the guild full" and "is there an officer to
  inherit" are reads of one slot. Every leave and kick lowers the count (Cartridge's `leave` does not: section 8).
- **No arrays**: the members of a guild, its requests, its log, the ranking and the search are the indexer's.
- **State growth**: two slots per guild ever created (one freed to 0 when disbanded, which still costs a rewrite and keeps
  the key), one per player who ever joined a guild, one per guild that ever rotated its leader. For 10,000 daily players and
  a few hundred guilds, a few tens of thousands of slots in all, against three new slots per Challenge move
  (`structure-state.md`).

### 3.4 Each entry point

Execution from the unit costs of section 3.2; settlement from the slots written. **All figures are estimates**, to be
measured on the devnet with the contract's gas tests (the method of `quests.md`, "How it will be measured"), when the
contract is written.

| Entry point | Reads | Writes | New slots | Rewrites | Events | Execution (M) | State diff (M) | Total (M) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `create`, a player's first guild ever | 3 | 4 | 3 | 1 | 1 | 0.79 | 1.38 | **2.17** |
| `create`, a player who was in a guild before | 3 | 4 | 2 | 2 | 1 | 0.79 | 0.96 | **1.75** |
| `update_settings` | 2 | 1 | 0 | 1 | 1 | 0.36 | 0.03 | **0.39** |
| `disband` (the leader alone; also through `leave`) | 2 | 3 | 0 | 3 | 1 | 0.59 | 0.09 | **0.68** |
| `join` an Open guild with requirements | 2 | 2 | 0 | 2 | 1 | 0.99 | 0.06 | **1.05** |
| `accept_request` (by an officer) | 3 | 2 | 0 | 2 | 1 | 1.42 | 0.06 | **1.48** |
| `accept_invitation` (by the invitee; requirements waived) | 3 | 2 | 0 | 2 | 1 | 0.90 | 0.06 | **0.96** |
| `kick`, by an officer (writes their kick time) | 3 | 3 | 0 | 3 | 1 | 0.67 | 0.09 | **0.76** |
| `kick`, by the leader (no kick rate) | 3 | 2 | 0 | 2 | 1 | 0.55 | 0.06 | **0.61** |
| `promote`, `demote` | 3 | 2 | 0 | 2 | 1 | 0.55 | 0.06 | **0.61** |
| `make_leader` | 3 | 3 | 0 | 3 | 1 | 0.67 | 0.09 | **0.76** |
| `leave` | 2 | 2 | 0 | 2 | 1 | 0.47 | 0.06 | **0.53** |
| `check_in` (the leader, once a day, section 6.4) | 2 | 1 | 0 | 1 | 0 | 0.32 | 0.03 | **0.35** |
| `claim_rotation` | 4 | 2 | 1 | 1 | 1 | 0.63 | 0.48 | **1.11** |
| `contest_rotation` | 4 | 1 | 0 | 1 | 1 | 0.51 | 0.03 | **0.54** |
| `finish_rotation` | 3 | 4 | 0 | 4 | 1 | 0.79 | 0.12 | **0.91** |
| `cancel_signed` (raises the nonce) | 1 | 1 | 0 | 1 | 1 | 0.28 | 0.03 | **0.31** |
| *Compare*: a follow as an event only (Cartridge's) | 0 | 0 | 0 | 0 | 1 | 0.09 | 0 | **0.09** |

- **A player's first guild ever** adds 0.42M to any joining entry point (`join`, `accept_request`, `accept_invitation`): their
  member slot is new once, then always rewritten.
- **Requirements of 0 cost nothing**: the contract reads a player's level (`Setup.player_level`) and crowns
  (`Matchmaker.league(player).crowns`, no write) only when the guild asks for them. An Open guild with no requirements: `join` is 0.47M.
- **The signature check** is the largest part of `accept_request` and `accept_invitation`; it replaces a whole transaction
  (the stored request's), so it is a saving (section 6.3).
- **Batching**: an officer's acceptance of several requests, or several kicks, goes in one multicall. Each call keeps its own
  cost, but the transaction's own cost (section 3.2) is paid once, and so is the guild felt's settlement (one slot rewritten
  however many times in a transaction appears once in the state diff).

### 3.5 The cost of a day

A stated activity, for **10,000 daily players**, 60 % of them in a guild (6,000 members in about 240 guilds of 25):
20 guilds created, 300 joins of Open guilds, 150 requests and 50 invitations accepted (half of all the joins a player's first
guild), 250 leaves, 60 kicks (40 by officers), 40 promotions or demotions, 5 transfers, 30 settings changes, 5 disbands,
240 leaders' check-ins, one rotation, 20 cancellations. Each transaction counts its own cost (330,000, an assumption); the
check-ins ride in the multicall of the leader's first game write of the day, so they pay none.

| | Transactions a day | L2 gas a day |
|---|---:|---:|
| The guilds, as above | about 930 | **about 1,355M** (of which about 195M of state diff) |
| *Compare*: follows on chain, as events (3 follows or unfollows per player per day) | 30,000 | about 12,450M |
| *Compare*: the games (2 Challenge games of 30 moves per player per day, 5.17M a move, `g7-gas-plan.md` scenario a0) | 600,000 | about 3,102,000M |

The guilds are about **0.04 %** of the games' L2 gas; follows on chain would be about 0.4 %, nine times the guilds, for no
rule that reads them. The guilds' cost is not what limits the L3; their spam is (section 4).

## 4. Spam, with no fees to slow it

Without fees, and with accounts that cost nothing to deploy, a script can send any number of writes from any number of
accounts. A brake per account holds a careless player; only a brake that costs something real holds a script.

| Brake | Where | Default | What it holds |
|---|---|---|---|
| 50 members per guild | `Guild` (`'Guild: full'`) | **kept** (#953, open point 4) | A guild's size, so every guild felt and every list stays bounded |
| One guild per player | `Guild` (the member felt) | **kept** | A player's footprint |
| One guild created per player per 24 hours | `Guild` (`last_created_at`, in the member felt already written: free) | **kept** (open point 4) | A player who creates and disbands in a loop |
| A level to create a guild | `Guild` (one `Setup.player_level` read, 0.26M) | **level 2** (open point 8, new) | A script with many free accounts: a level needs XP, which needs paid or credited games (`xp-level.md`). It also stops name squatting. The level of the World chat (#955) |
| The officers' kick rate: one per 20 minutes | `Guild` (`last_kick_at`) | **kept** (#953, open point 6) | An officer emptying a guild |
| A price in Cobbles to create a guild, burned | `Guild` through `Setup.spend_cobbles` (`Guild` an allowed spender; about 0.3M more) | **none** (#953, open point 5; open point 4 here) | A second, stronger brake, if the level is not enough. Cobbles are earned in play, not bought with PAVED, so it does not make a free account pay money |
| A rate limit per account at the sequencer | Katana | **not relied on** | To check: no such setting is documented in this repository. If the L3 sponsors fees through a paymaster instead of a zero gas price, the paymaster's quota per account is the place |
| The service's rate limits on off-chain writes | the social service | **#955's limits** (section 5.3) | Messages, follows, signed requests and invitations |

A join-and-leave loop on an Open guild is not braked on chain: each turn is two rewrites (about 1.6M with the transactions'
own cost) and some events, and it fills only the guild's log. The indexer can fold a run of joins and leaves of one player
into one line; a rejoin delay is left for later if it is seen.

## 5. The services

### 5.1 The indexer gains the guilds

It stays display only, holds no key, and is rebuilt from the chain's events (`indexer.md`). One new source, `Guild` (optional
in the deployment file, as `Arena` is), and these tables:

- `guilds (guild_id, name, emblem, join_type, min_level, min_crowns, members, created_at, disbanded)`, from the creation,
  the settings and the disband events;
- `guild_members (guild_id, player_id, rank, joined_at)`, from the membership and rank events;
- `guild_log`, one row per event at its chain position (a rewind is a delete by block), the last 100 per guild served;
- the **search** by name or tag (a `LIKE` on the lowercased name; the tag is the id);
- the **ranking**: a guild's score is the sum of its members' crowns, which the indexer already has from the PvP attacks
  (`gained`, `lost` of `pvp_attacks`) and the season resets;
- the **suggestions** of #953: guilds the player may join (requirements, not full, not Invite only), the most active first
  (the log's last week).

A halt, as for the other sources, on an event that contradicts the indexer's state (a join to a full guild, a rank change of
a non-member): it means a contract the indexer does not know.

### 5.2 A new social service

It holds what the chain cannot rebuild:

- the **follows** (signed), **blocks**, **mutes** and **reports**;
- the guilds' **descriptions** and **announcements** (signed by their author);
- the **pending join requests and invitations** (signed), with the request's message (100 characters), until they are
  redeemed, declined, cancelled or expired;
- the **messages** of the World, the guilds and the private conversations (signed), and the private conversations' state
  (Requests, accepted, declined: #955).

**Its shape.** One Node process in TypeScript, as the indexer, so it imports `@paved/game-core`'s social rules (section 7).
SQLite in WAL mode, one file, its own (never the indexer's, which can be deleted at any time; this one cannot). An HTTP API
for reads and writes, and a WebSocket for live messages. It reads the chain through the node's RPC for the ranks it checks.

**Its database, backups and retention.**

- A backup each day, encrypted, kept off the host for 7 days; restored once by hand before the service opens.
- **Retention** (open point 6), checked: **the World 7 days, a guild 90 days, private conversations one year**. The World
  is a stream nobody scrolls back a week; a guild's chat holds its plans for a season (about 90 days, `leagues.md`); a
  private conversation is the player's own record. A message under a report is kept with the report until it is handled,
  then 90 days, whatever its conversation's retention, so moderation can be reviewed.
- Follows, blocks and mutes are kept until undone; descriptions until changed; announcements, the 20 latest per guild
  (#953); expired requests and invitations are deleted at once.

**Deleting a player's data on request.** Their messages (shown as "Message deleted", as a sender's own deletion), follows
both ways, blocks, mutes, the reports they made, their pending requests and invitations, and their sessions are deleted;
the backups age them out within 7 days. **What the chain holds cannot be deleted**: the guild's events (the address joined,
was promoted, left) stay on chain and in any indexer. The address is pseudonymous; the privacy notice says so. This is one
more reason to keep every text off chain.

**Moderation.**

- The reports' queue (spam, scam, harassment, other: #955), each with the message, its signature and the conversation's
  last messages around it.
- The actions: delete a message; mute a player in the World for a time; ban an address from the service (it can still play,
  but not write in the service). Each action is logged with its moderator.
- The tools: a small admin page behind the owner's login (phase C of `accounts.md`), or a command line on the host first.
- **The word filter** runs in the service, which is the one that counts: listed words are replaced with "•••" before the
  message is stored, so every reader gets the same text. The list leaves the client (where it sits on the mock, #955).

**The socket.** One WebSocket per open client, authenticated with the session token (5.3), subscribed to the World, the
player's guild and their private conversations. It replaces the indexer's polling for messages only; the rest stays polled.
For 10,000 daily players, a few thousand sockets at once at most: one process holds them. The source of #955 reads a
conversation by subscribing to it, so the socket takes the mock's place without a page changing.

**Where it runs** (open point 7): **beside the indexer**, on the same host, its own process and its own subdomain, with the
same TLS and allowed origin (`indexer-hosting.md`). It needs no secret but the RPC URL and its session-token key. Its
memory is that of the indexer's order (hundreds of MB). If the indexer's host cannot take the sockets, it moves on its own.

### 5.3 Signing in to the service

- The client asks for a challenge, the player's key signs it as a SNIP-12 message (`'Paved Social'`, version `'1'`, the
  L3's chain id; the message: the service's origin, a random nonce, an expiry of 5 minutes), and the service gives back a
  session token (a day; renewed while used).
- **A deployed account**: the service checks the signature with the account's `is_valid_signature` (one RPC call). That is
  every active player: a player's first write founds their village at the first connection (#753, #927), and the account is
  deployed by that write.
- **An account not deployed yet**: the client sends the public key with the signature; the service checks the signature
  against it, and the address against the counterfactual address of that key (OpenZeppelin's class, the key as salt and
  constructor argument, the zero deployer: `accounts.md`, section 3). This holds until a key rotation, and a rotation
  (`set_public_key`) is a call of the account, so a rotated account is always deployed and takes the first path. **Kept**:
  a guest can read the World before their first write.
- The service keeps the account's public key with the session, so each later signed message is checked locally, without an
  RPC call. A key rotation ("Sign out everywhere", `accounts.md` phase D) ends the sessions: the service follows the
  accounts' `OwnerAdded` and `OwnerRemoved` events (OpenZeppelin's account component), or checks the key again at each renewal.

**The rate limits** (#955, open point 4, and #954): in the World, one message per 5 seconds and 10 per minute, and the same
text twice in a row refused; in the guild and in private, one per 2 seconds; writing in the World from level 2. For the rest,
in the same spirit: follows, 30 a minute and the cap of 500 (#954); signed requests, one pending at a time (#953); invitations
from one officer, 20 an hour. Each is a pure function of game-core, so the service and the mock refuse the same way.

### 5.4 Messages and their signatures

**Each message signed**: confirmed. The service could trust its session alone, but the signature gives two things for a few
milliseconds of the client's time: a moderator can prove who wrote a reported message, and the service itself cannot write
in a player's name. The signed message is SNIP-12: the conversation, the text's hash, the time, a per-player counter.

**Private messages** are readable by their two players only: the service serves a conversation only to its two members,
over TLS. **No end-to-end encryption** (open point 5): with it the service could not read a reported message, and so could
not moderate the scams #955 warns of ("Paved never asks for your key or your password"). The database is encrypted at rest
on the host. End-to-end encryption stays a later option, weighed against moderation then.

## 6. The contract's outline

A new contract, `Guild` (`systems/guild.cairo`), Paved's own, native Starknet like the others (`native-storage.md`).
Ownable and upgradeable as they are. It reads `Setup` (the level) and `Matchmaker` (the crowns), and, if a price is ever set,
spends Cobbles through `Setup.spend_cobbles` as an allowed spender. **The player is always the caller**
(`get_caller_address()`): never an argument, as Cartridge's components leave to their embedder.

### 6.1 Entry points

| Group | Entry point | Who | What it checks |
|---|---|---|---|
| Creating and running | `create(name, emblem, join_type, min_level, min_crowns)` | a player in no guild | name valid (3 to 20 ASCII letters, digits, spaces) and free whatever the case, the 24-hour delay, the creation's level (open point 8). The creator becomes Leader |
| | `update_settings(emblem, join_type, min_level, min_crowns)` | the Leader (#953, open point 3) | |
| | `disband()` | the Leader, alone in the guild | frees the name. Also what the Leader's `leave` does when alone |
| Joining | `join(guild_id)` | a player in no guild | Open, not full, requirements met |
| | `accept_request(request, signature)` | an Officer or the Leader of the guild | the request (6.3): the guild's, not expired, the player's nonce, the player in no guild, not full, the join type By request (or Open), requirements met, the player's signature |
| | `accept_invitation(invitation, signature)` | the invitee | the invitation (6.3): not expired, the invitee's nonce, the inviter still an Officer or the Leader of that guild, not full, the inviter's signature. The requirements are waived (#953, open point 8). A player in a guild leaves it in the same multicall first |
| | `cancel_signed()` | any player | raises the caller's nonce: every request or invitation of theirs not yet redeemed dies |
| Ranks | `kick(player)` | an Officer or the Leader | the same guild, the caller's rank strictly above the target's; for an Officer, 20 minutes since their last kick. The reason is off chain (its line in the service) |
| | `promote(player)`, `demote(player)` | the Leader (#953, open point 2) | a Member to Officer, an Officer to Member |
| | `make_leader(player)` | the Leader | a member of the guild; the Leader becomes an Officer |
| | `leave()` | any member | the Leader only when alone (then the guild is disbanded); the Leader with others must transfer first |
| The rotation | `check_in()` | the Leader | marks the day (6.4) |
| | `claim_rotation(guild_id, heir)`, `contest_rotation(guild_id, heir)`, `finish_rotation(guild_id)` | any member | section 6.4 |
| Views | `guild(guild_id)`, `member(player)`, `guild_of_name(name)`, `nonce(player)`, `rotation(guild_id)` | | |

Every membership change (join, leave, kick, both sides of a transfer) raises the player's nonce in the same write of their
member felt: it costs nothing more.

### 6.2 Events and errors

**Events**, one per change, each with the guild's id as a key:

- `GuildCreated { guild_id, leader, name, emblem, join_type, min_level, min_crowns }`, `GuildSettingsChanged { guild_id,
  emblem, join_type, min_level, min_crowns }`, `GuildDisbanded { guild_id }`;
- `MemberJoined { guild_id, player, via (1 Open, 2 request, 3 invitation), by }`, `MemberLeft { guild_id, player }`,
  `MemberKicked { guild_id, player, by }`;
- `RankChanged { guild_id, player, rank, by }`, `LeaderChanged { guild_id, from, to, cause (1 transfer, 2 rotation) }`;
- `RotationClaimed { guild_id, heir, by }`, `NonceRaised { player, nonce }`.

**Errors**, one per typed reason of `game-core`'s guild rules, prefixed as the other contracts' (`'Guild: ...'`, at most 31
characters): `not found`, `full`, `already in a guild`, `not a member`, `rank too low`, `not the same guild`, `name invalid`,
`name taken`, `create too soon`, `level too low`, `kick too soon`, `join closed`, `requirements`, `expired`, `bad nonce`,
`bad signature`, `leader must transfer`, `leader active`, `not the heir`, `rotation open`. The mapping between the reasons and
the errors is one table of the fixture (section 7).

### 6.3 Signed requests and invitations

Both are SNIP-12 messages (revision 1, Poseidon), hashed on chain with OpenZeppelin's SNIP-12 utilities as vPAVED's
`delegate_by_sig` (`vault-share.md`), and checked against the signer's account with `is_valid_signature`. The domain is
`'Paved Guild'`, version `'1'`, the L3's chain id; the message names the `Guild` contract's address, so a signature does not
carry over to another deployment.

| Message | Signed by | Fields | Redeemed by |
|---|---|---|---|
| `JoinRequest` | the requesting player | `guild`, `guild_id`, `player`, `nonce` (the player's), `expiry` | an Officer or the Leader, `accept_request` |
| `Invitation` | an Officer or the Leader | `guild`, `guild_id`, `inviter`, `invitee`, `nonce` (the invitee's), `expiry` | the invitee, `accept_invitation` |

- **Why the joining player's nonce in both**: the player joins at most once per nonce. Two requests to two guilds: the first
  redeemed raises the nonce and kills the other, so one pending request at a time (#953) holds on chain whatever the
  service does. A used invitation dies when its invitee joins; after a leave, an old request cannot pull the player back.
- **Expiry**: 7 days for both (#953's invitations; the same for requests, open point 11).
- **Cancelling before it expires**, weighed: a short expiry alone leaves a cancelled request redeemable until it ends by an
  officer who kept it; a nonce raised on chain ends it at once for 0.31M. **Default: both.** The client cancels in the
  service (the request disappears from the officers' lists, which covers an honest guild), and the player can raise their
  nonce on chain from the request's menu if they want certainty. The worst case without the raise is joining a guild one had
  cancelled, which a `leave` undoes.
- **A signer's account must be deployed** for `is_valid_signature`. Every active player's is (5.3), so requesting needs the
  player to have founded their village, which the client does at the first connection.

### 6.4 The leader's rotation

The rule (#953, open point 9): when the Leader has not played for 35 days, the longest-serving Officer becomes Leader, or else
the longest-serving Member.

**The last activity on chain.** Two options were weighed:

- **A last-played day in `Setup`**, written at each XP credit (every game over, Story star, attack): the most faithful, but a
  new slot per player, then a read and a rewrite each day each player plays (about 0.23M each: about 2,200M L2 gas a day for
  10,000 players, more than all the guilds' writes), paid for the rotation of a few hundred guilds. `Setup`'s account slot has no free bit since the XP (`xp-level.md`).
- **The Leader's check-in** (default, open point 9): the Leader's client adds `Guild.check_in()` to the multicall of its first
  game write of each day, which rewrites the guild felt's `leader_seen` day (0.35M, about 84M a day for 240 guilds, no
  transaction of its own). A Leader whose client skips it can lose the guild: only to their own cost, and 35 days is long.

**The longest-serving heir, with no list on chain.** The contract can check an heir's rank and `joined_at`, but not that no
other member served longer. So the rotation is a claim with a window:

1. `claim_rotation(guild_id, heir)`, by any member once `leader_seen` is 35 days old: the heir must be a member of the
   highest rank present (Officer if the guild's officer count is not 0). It stores the heir and opens a 24-hour window.
2. `contest_rotation(guild_id, heir)` within the window, by any member, replaces the heir with one of the same rank who
   joined earlier.
3. `finish_rotation(guild_id)` after the window, by anyone: the heir becomes Leader, the old Leader an Officer (or a Member if
   ranks shift with a fourth one), `LeaderChanged` with cause rotation. A `check_in` of the old Leader during the window
   cancels the claim.

The indexer knows the true heir, so the client always claims for the right one, and one honest member is enough to correct a
wrong claim. A rotation costs about 2.0M L2 gas in all (claim and finish; 2.7M with the two transactions' own cost), a few times a month across every guild. Alternative (open point 10):
the first claimant of the highest rank wins, with no window: simpler, but not #953's rule.

## 7. The rules written once

- **The reference** is `packages/game-core/src/social/`, as #953 to #955 write it: `guild.ts` (every row of #953's table,
  the limits, the delays), `follow.ts` (follows, blocks, the cap), `chat.ts` (lengths, rate limits, who may write and delete
  where). Pure functions, each refusal a typed reason.
- **The service** imports them: it is TypeScript, so the follow and chat rules are the same code on the mock and in the
  service, with no mirror to keep.
- **The contract mirrors the guild rules** (`Guild`'s checks), and only them.
- **A shared fixture**, `contracts/fixtures/social.json`, beside `parity.json` and in the same manner
  (`parity-fixture.md`): cases of a starting state (a guild's felt, the members involved, the time), an action and its
  arguments, and the expected outcome (allowed, with the new state, or the reason). `snforge` replays it against `Guild`;
  `game-core`'s tests replay it against `guild.ts`; the table of reasons to errors is part of the file. The contracts track
  keeps it current when a rule changes; a rule changed in `game-core` alone fails the contract's replay in CI.
- **New rules from this note** go into `game-core` first, with their tests, so the mock refuses as the contract will: the
  level to create a guild (open point 8), the requests' expiry (open point 11), the rotation's claim and window (open point
  10, the mock can keep the immediate rule until then).

## 8. What Paved takes from Cartridge

Cartridge's `guildable` and `followable` are Dojo components: they take a `WorldStorage`, and Paved's contracts are native,
with no Dojo world (`client-data-layer.md`). **Nothing is embedded or copied.** Taken as ideas:

- **The strictly-higher-rank rule** of `fire`: an actor acts on a member only when their rank is strictly above. #953's table
  is built on it, and `Guild` checks it for kicks, and the officers' message deletion uses it in the service.
- **The `open` and `free` flags**, which become the three join types: closed is Invite only, open is By request, open and
  free is Open.
- **Follows as events**, as the alternative to signed follows (open point 1), not taken by default (section 2).

Not taken, as #956's reading of them found (read, not run), and how `Guild` avoids each:

| Cartridge's behaviour | In `Guild` |
|---|---|
| Neither component checks the caller; the embedder must derive the player | The player is always `get_caller_address()` |
| `create` seems to need a pending request | `create` needs only to be in no guild |
| The requester check of `join` seems inverted, which would block the request-then-accept path | The request is a signed message checked against its signer; the path is tested in the fixture |
| `leave` does not lower the member count | Every leave, kick and disband updates the counts in the guild's felt |
| There is no way to disband a guild; the Master can neither leave nor be removed | `disband`, the Leader's `leave` when alone, and the rotation |
| `guildable` emits no event | One event per change, which the indexer needs for every list |
| A 100-member cap | 50 (#953, open point 4) |

## 9. The integration, after the client's validation

1. The rules of #953 to #955 are in `game-core` with their tests (done by the client's issues), plus this note's new rules
   (section 7).
2. The fixture, then `Guild` and its tests, and its gas measured on the devnet (each figure of section 3.4 becomes a
   measure, ceilings at measured + 5 %, as the other contracts').
3. The indexer's `Guild` source and its tables (5.1).
4. The social service (5.2 to 5.4), its hosting beside the indexer.
5. **The social source of #952 gets its implementation** over `Guild` (the writes, through `packages/chain`'s writers), the
   indexer (the lists) and the service (the rest, and the socket), **behind the same interface** as the mock. The pages do
   not change. The mock stays for the tests and the stories.

## 10. Open points (defaults until the owner answers on #956)

1. **Follows.** Default: off chain, signed, held by the social service. Alternative: on-chain events only, as Cartridge's
   (about 12,450M L2 gas a day at section 3.5's activity, and public lists).
2. **Join requests and invitations.** Default: signed off chain, redeemed by the accepting transaction. Alternative: stored on
   chain, as Cartridge's pending request (one more transaction and one more slot per request).
3. **The guild's text.** Default: the name (in the creation's event and the name index) and the emblem on chain, the
   description and announcements off chain.
4. **The spam brake for creating a guild.** Default: one per player per 24 hours, and no price. With open point 8.
5. **Private messages.** Default: no end-to-end encryption, but TLS, access control and encryption at rest, so reports can be
   moderated.
6. **Retention.** Default: the World 7 days, a guild 90 days, private conversations one year; a reported message until its
   report is handled, then 90 days.
7. **Where the social service runs.** Default: beside the indexer, its own process and database.
8. **A level to create a guild** (new). Default: level 2, as writing in the World (#955), since accounts are free and levels
   are not. Alternative: none, the 24-hour delay alone. It is a new rule for #953's `guild.ts` when the contract comes.
9. **The Leader's last activity.** Default: the Leader's daily `check_in`, in the multicall of their first game write of the
   day. Alternative: a last-played day in `Setup`, written at each XP credit.
10. **The rotation's heir.** Default: a claim with a 24-hour window in which an earlier-joined heir of the same rank replaces
    it. Alternative: the first claimant of the highest rank, at once.
11. **The requests' expiry.** Default: 7 days, as the invitations'; a cancelled request is withdrawn in the service, and the
    player may raise their nonce on chain.

**To check, not the owner's**: whether Katana (or the L3's sequencer) has a rate limit per account, or the L3 sponsors fees
through a paymaster with quotas (section 4); the L3's settlement price per slot (section 3.2); the SNIP-12 check's real cost
(section 3.2, an estimate).
