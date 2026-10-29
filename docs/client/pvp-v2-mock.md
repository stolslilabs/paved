# PvP v2 on the device: the rules and the mock (#741)

Step 1 of the PvP v2 plan (#732, #744): the v2 rules in `packages/game-core` and the mock ledger in
`packages/app/src/data/mock`, so the whole loop plays on mock data (`VITE_DATA_SOURCE=mock`, MOCK-FIRST,
[`v2-architecture.md`](v2-architecture.md)) with no contract. The village screens (#739) and the attack screens (#740) read
the hooks below. Step 2's contracts (#733 to #738) match the rules through parity tests; step 3 (#742, #743) gives
`@paved/chain` the same interfaces and the screens do not change.

## The rules (`packages/game-core/src/rules`)

| Rule | Where | What |
|---|---|---|
| Rarity | `rarity.ts` | By copies in the base deck of 72: common (5 or more, 5 plans), uncommon (3 or 4, 10 plans), mythic (1 or 2: `ccccccccc`, `ffcfffffc`, `sfrfrfrfr`, `wfffffffr`) |
| XP and slots | `xp.ts` | The curve stays (`100 x n` from level n to n + 1); level cap 20 (19,000 XP), the XP stops there; slots = 8 + level, the starter included. PvP 0 / 5 / 10 / 20 XP by stars; Story 5 per star earned the first time; none from the Challenge or a defence |
| Free village | `free-village.ts` | `layoutRefusal`: at most S tiles, every plan held, no tile on the starter's cell, no cell twice, connected, every facing edge matching. `layoutScore`. `VillageDraft`, the editor's model: each change is checked as a whole layout, so the draft never splits and never passes the slots |
| Starter layouts | `starters.ts`, `starter-layouts.ts` | 64 layouts of 8 common or uncommon tiles, each scoring more than 0 (209 to 1,948), generated offline (`scripts/v2-layouts.ts`, the engine's search in `grow.ts`); `starterLayout(address)` picks one, the same on every device |
| Attack | `attack.ts` | The deck: ceil(1.15 x S) (`ATTACK_DECK_PERCENT`), the defender's placed tiles plus extras from the base deck's odds, shuffled from the random. `QueuedAttack`: an unbounded board, the tile in hand and the next two. Stars at 80 / 90 / 100 % (`ATTACK_STAR_PERCENTS`) |
| Chests | `chests.ts` | PvP: 1 star basic (1 tile), 2 rare (1 among 2), 3 epic (1 among 3). Story: 3 stars the first time, the first half of a campaign basic, then rare, the last level epic. Tiles from the base deck's odds; Cobbles (10) at 2 / 5 / 10 % by rank, times the league's boost (x1 at league 0 up to x2 at league 22, linear). At most 3 PvP chests a day; Story's are outside the cap |
| Shop | `shop.ts` | 3 distinct base plans a day from Poseidon of the day, uniform over the 19; 10 / 20 / 50 Cobbles by rarity; each offer once a day |
| Quests | `quests.ts` | Finishing every quest of a week pays 60 bonus Cobbles instead of a free game. Five dailies a day (`DAILY_QUESTS`), none paying on its own and no bonus for the day; the day pays at two milestones (`DAILY_MILESTONES`: 3 done 10 Cobbles, 5 done 15), each claimed once a day (#869) |

Every figure the owner may tune is a named constant (`ATTACK_DECK_PERCENT`, `ATTACK_STAR_PERCENTS`, `CHEST_COBBLE_BPS`,
`CHEST_COBBLES`, `PVP_CHESTS_PER_DAY`, `SHOP_PRICES`, `QUEST_BONUS_COBBLES`, `DAILY_QUESTS`, `DAILY_MILESTONES`, `LEVEL_CAP`, `SLOT_BASE`).

Choices made where the decisions leave room (each can be reversed by changing one constant or function):

- **The score of a layout is the engine's, its tiles built in one canonical order**: a breadth-first walk from the starter,
  neighbours north, east, south, west. A forest scores when it closes with no open road along it, so the order of building
  can change a score; the walk makes the score a function of the layout alone, which the editor, the mock and the contract
  can all compute.
- **The deck counts the tiles the attacker draws**; the starter is on the board from the start and is not in it. A full
  village of S slots holds S - 1 tiles besides the starter, so its attacker draws those plus ceil(1.15 x S) - (S - 1) extras.
- **Story XP is per star earned for the first time**: a first run at 1 star gives 5, a later 3-star run 10 more.
- **A chest's Cobbles are credited when it opens**; a basic chest is claimed like the others (its one tile), so every rank
  has the same two steps.
- **The league's boost is read when the chest is granted**, as #736 proposes.

## The mock (`packages/app/src/data/mock`)

- **The state** lives in the ledger's stored state (`paved.mock.v1`), under each player's `v2` (`mock/v2.ts`): the XP, the
  inventory, the saved layout, the chests, the shop's purchases of the day, the Story levels' best stars, the match and the
  attacks. A state written before it has none and reads as a new player's.
- **The rivals**: 30 free villages from level 1 to 20, their crowns spread over the low leagues (0 to about 1,400) with
  their level, laid out offline by the same search (`packages/app/scripts/mock-rivals.ts`, `mock/rivals.ts`; two in three
  with a beam of 3, the third with a beam of 1, a casual layout): the same at every load. Crowns and shields work as in
  PvP v1 and share the player's crowns.
- **The Story report** (`reportStory`) stands in for the Story game's report until step 3: the screens send it when a level
  ends.
- **Quest credits**: the week's pays the bonus Cobbles in the mock (`claimWeeklyCredit`); the day's is refused since #869
  (`claimDailyCredit`, `no-live-quest`), and a daily's own claim too (`no-cobbles`). The chain's still credit a free game
  until #738.
- **The day's milestones** (#869): `dailyMilestones(player, day)` reads the day's claimed word (bit `step` per milestone),
  `claimDailyMilestone(day, step)` pays `DAILY_MILESTONES[step]`'s Cobbles once a day (refused `milestone-claimed` or
  `no-milestone`, `DailyMilestoneRefusedError`), and only once that day has the milestone's dailies done (`not-reached`
  otherwise): the ledger counts them from the mock's indexer (`countDailiesWith`, set by `mockIndexer`). They are kept under
  the day's claims (`days[day].milestones`); a day stored before reads as none claimed.
- **The fifth daily** (#869): the deployed `Setup` defines four dailies a day, so the mock's indexer (`mockIndexer`,
  `mock/dailies.ts`) adds a fourth rotating family, finish 2, 3 or 4 Challenge games in a day (ids 17 to 19,
  `MOCK_DAILY_FAMILY`), to the definitions and its live quest to each day's progress, counted from the player's paid
  Challenge games finished that UTC day (a free game reports no quest progress, `Challenge.finish`; a game finished on a later
  day than its start has no end time, `end_in_day`: one surrendered counts on its surrender's time, which the mock's signer
  records (`surrenders` of the ledger; `surrender` checks no expiry, so it can come days later, and such a game is read by its id
  past the pages), one finished by its last move on the day after its start, `finishedAt`; on real data the indexer must expose
  the surrender's time, #738; read page by page, newest first, down to the games started more than a game's life before the
  day, so an older day keeps its count). An id the indexer already defines is left as it is; it goes once the contracts define the fifth
  daily (#738).
- **The level** (`playerLevel`, the ring) is v2's: the mock's XP, capped at 20.
- The "Mock" mark stays on these pages (`MOCKED_PAGES`).

## The hooks (`packages/app/src/data`)

| Hook | Reads or writes |
|---|---|
| `useFreeVillage(player)` | The layout, its score, XP, level, slots, the inventory and what is left of it |
| `useChests(player)` | The chests waiting, the one open, the day's PvP chests and the cap |
| `useShop(player, day)` | The day's 3 offers, bought or not, and when the shop ends |
| `useFreeVillageWrites(player)` | `found`, `save(tiles)`, `openChest`, `claimChest(slot)`, `buy({ day, slot, confirmedPrice })`, `reportStory({ campaign, level, stars })` |
| `useAttackV2(attacker)` | The opponent drawn (level, slots, target, deck size, crowns at stake) and the attack (the three tiles shown, the moves, the score, stars, XP, chest, crowns) |
| `useAttackV2Writes(attacker)` | `search`, `next`, `start`, `play(move)`, `surrender` |

The interfaces (`FreeVillageViews`, `FreeVillageWrites`, `AttackV2Views`, `AttackV2Writes`) are in `free-village.ts` and
`free-attack.ts`; a refusal is a `V2RefusedError` with its reason. On the chain path (before step 3) the reads answer null
and the writes have no signer, as for any view a deployment lacks: the app's lazy views (`routes/sources.ts`, `chainRead` of
`data/chain-client.ts`) refuse a read the chain client does not have with `not-configured`, which the hooks turn into null (`__tests__/data-v2-chain.test.tsx`).
`__tests__/data-mock-v2.test.tsx` plays the loop from a fresh device.

## Not in this step

- The screens (#739, #740), and the removal of the v1 village and PvP stack they replace: game-core keeps the territory,
  parcels, demolition and tiers (`engine/village.ts`, `sessions/village.ts`, `sessions/attack.ts`), and the mock keeps their
  reads, while the v1 screens still read them. They go with the screens that leave them.
- The contracts (step 2) and the chain path (step 3).
