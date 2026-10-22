# Leagues and seasons: crowns, season rewards in Cobbles, PvP missions (#644, design)

Track CORE's design for #644, part of the PvP plan #637, after the matchmaker (#639,
`docs/architecture/matchmaker.md`). The owner's decisions of 2026-10-20 bind:

- **league points (crowns) are the rating**: a league is a range of crowns, nothing else;
- **Cobbles come from three sources**: end-of-season rewards, league tiers, and PvP-specific missions;
- **rewards in Cobbles only, never PAVED**: accounts are free on chain, so PAVED would make second accounts pay.

And the owner's credo of 2026-10-21 (#639, point 5): **more components with smaller scopes**. The leagues are two
small components and a pure table, embedded by `Matchmaker`, next to the crown, bucket and shield pieces of
MATCHMAKER-CROWNS (section 11 of the matchmaker's note); they reuse those pieces and their constants and duplicate none.

The open points of section 9 are posted for the owner on #644. The code is built on the proposals below until the owner
answers there; each answer is one constant away (section 9 names it).

## 1. Summary

- **A season clock** (`SeasonableComponent`): seasons of a fixed length from a start the owner sets once. Season 0 is
  the time before the first season: no league, no reward, no reset.
- **A league table** (`paved::leagues`, pure): 23 named leagues as crown ranges, Clash of Clans' own (pre-2025) at one
  crown per trophy, the scale the matchmaker's curves already use. Unranked, Bronze III to I, ..., Titan I, Legend.
- **A league record per village** (`LeagueableComponent`), one felt: the season it was last seen in, the highest league
  reached in that season, and the attacks it settled in that season.
- **Seasons roll lazily.** No keeper walks every village at a season's end. The first time a village is touched in a new
  season (a draw, an attack start, a settlement, a crown set, or anyone's `close_season(village)`), its last season is
  closed: its end-of-season reward is credited and its crowns are reset. Every call that moves crowns rolls first, so the
  crowns a roll finds are the crowns of the season's end.
- **Three Cobble sources**, all credited into `Setup`'s ledger (the one balance, `Account.cobbles`), each once by
  construction:
  - **the league bonus**, the first time a league above the one the village started the season in is reached in a
    season (one per league and season);
  - **the season reward**, by the league held at the season's end, to a village that settled at least
    `MIN_SEASON_ATTACKS` attacks in it (one per season);
  - **the PvP missions**: daily and weekly quests on four new PvP tasks, through `Setup`'s quests (quiver,
    `docs/architecture/quests-v2.md`) and its existing `claim_quest`.
- **The reset**, as in Clash of Clans' Legend League: at a season's end, crowns above `RESET_CROWNS` (5,000) come back to
  it; crowns at or under it stay.
- **Never PAVED.** Nothing here touches `Economy`, `PavedToken` or the Vault.

## 2. The pieces

| Piece | File | Storage (flat, its own names) | Events | What it knows |
|---|---|---|---|---|
| `paved::leagues` (pure) | `contracts/src/leagues.cairo` | none | none | The league table, the bonus and reward of each league, the reset, the season of a time |
| `SeasonableComponent` | `contracts/src/components/seasonable.cairo` | `season_clock` | `SeasonClockSet` | The clock: start, length; the current season |
| `LeagueableComponent` | `contracts/src/components/leagueable.cairo` | `league_records` | `LeagueReached`, `SeasonClosed` | Each village's season, peak league and attack count |
| `Matchmaker` (the system) | `contracts/src/systems/matchmaker.cairo` | unchanged | unchanged | Composes them with the crowns and the buckets; credits `Setup` |
| `Setup` | `contracts/src/systems/setup.cairo` | no new variable (free bits of `Progress`) | `CobblesClaimed` (kinds 4 and 5) | The Cobble ledger, the PvP mission sums |

- **No piece calls another** (as in section 11 of the matchmaker's note). The leagues component returns what a roll or a
  reach owes; the system sets the crowns (`crownable.set`), moves the bucket (`bucketable.follow`) and credits `Setup`.
- **Why in `Matchmaker`.** The crowns live there and every crown change goes through it. A separate system would need a
  call per settlement and a second copy of who joined. The pieces stay components, so a later system can embed them.
- **NPC villages** (addresses 1 to 255) have no league: they never roll, never reset, never earn. Their crowns are the
  owner's.

## 3. The season clock

- `season_clock` packs `start` [0, 64) and `length` [64, 128), in seconds. Unset (length 0): every time is season 0.
- `season_of(t) = 0` before `start`, else `(t - start) / length + 1`. Season `s >= 1` runs over
  `[start + (s - 1) length, start + s length)`.
- **The owner sets it once**, before it starts: `set_season_clock(start, length)` reverts once `now >= start` of a set
  clock (a change after that would renumber seasons that already paid). A new length later is an upgrade with its own
  note.
- **Proposed length: 28 days** (four of `Setup`'s weeks), the start a Monday 00:00 UTC (`Setup.WEEK_START + k WEEK`), so a
  season holds exactly four weekly missions. Clash of Clans' seasons are about a month, ending on the last Monday.

## 4. The league table

Clash of Clans' leagues before the 2025 update (wiki "Leagues", the same era as the matchmaker's crown curves, S1 of
section 6.1 of its note), one crown per trophy. A league is the highest whose floor is at or below the crowns.

| # | League | Floor (crowns) | Bonus, first reach in a season | Season reward |
|---:|---|---:|---:|---:|
| 0 | Unranked | 0 | — | 0 |
| 1 to 3 | Bronze III, II, I | 400, 500, 600 | 5 each | 10 |
| 4 to 6 | Silver III, II, I | 800, 1,000, 1,200 | 10 each | 20 |
| 7 to 9 | Gold III, II, I | 1,400, 1,600, 1,800 | 15 each | 35 |
| 10 to 12 | Crystal III, II, I | 2,000, 2,200, 2,400 | 20 each | 50 |
| 13 to 15 | Master III, II, I | 2,600, 2,800, 3,000 | 25 each | 75 |
| 16 to 18 | Champion III, II, I | 3,200, 3,500, 3,800 | 30 each | 100 |
| 19 to 21 | Titan III, II, I | 4,100, 4,400, 4,700 | 40 each | 150 |
| 22 | Legend | 5,000 | 50 | 250 |

- The amounts are proposals (section 9). Each is at most 255, so a credit fits `Setup`'s existing `CobblesClaimed.cobbles`
  (`u8`) and the indexer reads one more kind of an event it already knows.
- **Scale.** A season's top reward (250) is between two and five skins (50 to 100 each); a full climb from Unranked to
  Legend in one season pays 5 x 3 + 10 x 3 + ... + 50 = 605 in bonuses. The daily Challenge quests pay up to 60 a day.
- **Crowns are conserved** between players (matchmaker's note, 6.2): they enter only through the NPC villages of the cold
  start (0 to 290 crowns). Clash of Clans' ladder is held up by its trophy inflation below 1,000, which Paved does not
  copy. So the upper leagues will be rare at first; that is open point 1.

## 5. A village's league record

`LeagueRecord` (one felt in `league_records`): `season` [0, 32) · `peak` [32, 40) · `attacks` [40, 56).

- **The roll** (`open`): when the system touches a player's village and `record.season < current`:
  1. if `record.season >= 1`, the season `record.season` is closed: its league is `league_of(crowns)` (the crowns now,
     unchanged since its end), its reward `reward_of(league)` if `record.attacks >= MIN_SEASON_ATTACKS`, else 0; one
     `SeasonClosed` event;
  2. the crowns are reset: `min(crowns, RESET_CROWNS)` (`CrownsSet` and the bucket follow only if they change);
  3. the record becomes `{ season: current, peak: league_of(reset crowns), attacks: 0 }`.

  A village idle for several seasons closes only the last one it played in: the seasons in between had no attack, so no
  reward, and the reset is idempotent.
- **The reach** (`reach`): after a settlement (both villages) and after a crown set, if `league_of(crowns) > peak`, every
  league from `peak + 1` to it is reached: one `LeagueReached` each, with its bonus, and `peak` rises. A settlement in
  season 0 reaches nothing. A crown set (`set_crowns`, an operator) raises the peak without a bonus.
- **The count**: a settlement adds one to the attacker's `attacks` (saturating at `u16`).
- **Why the peak starts at the season's starting league**: a village that keeps its crowns across seasons (under the
  reset) must climb above where it started to earn a bonus again. So an idle account earns nothing, and a second account
  parked in a league earns at most one season reward per season it attacks `MIN_SEASON_ATTACKS` times.

## 6. The calls

`Matchmaker` gains (its ABI grows; no client imports it yet, `contracts/abis/README.md`):

| Call | Who | What |
|---|---|---|
| `close_season(village)` | anyone | Rolls `village` into the current season (a no-op if it is already there); credits what its last season owes to that village, never to the caller |
| `league(village) -> LeagueStatus` | view | The village as it would be after a roll: `season`, `crowns`, `league`, `peak`, `attacks`, and `pending` (the season reward a roll would credit) |
| `season_clock() -> (start, length)`, `current_season()` | view | `SeasonableComponent`'s |
| `league_record(village)` | view | `LeagueableComponent`'s raw record |
| `set_season_clock(start, length)` | owner | Once, before the clock starts |

- `search`, `next`, `start_attack`, `settle` and `set_crowns` roll the villages they touch first. Their signatures are
  unchanged, so **PVP-ATTACKS (#643) calls the same interface**: `start_attack(attacker)` and `settle(attacker, stars)`.
  The leagues, the reset and the missions happen inside `settle`; #643 adds nothing for them.
- `set_crowns` stays for the operator (it was the reset's planned path; the reset is now internal).

## 7. Cobbles through `Setup` (its model)

- **One new entry point**, `ISetupLeague::credit_league(player_id, kind, league, season, cobbles)`, for an allowlisted
  reporter only (`'Quest: not reporter'`), as `credit_story`: kind 4 `CLAIM_LEAGUE` (a bonus) or 5 `CLAIM_SEASON` (a
  season reward), `cobbles` 1 to 255. It adds to `Account.cobbles` and emits `CobblesClaimed { kind, id: league,
  period: season }`. It trusts the reporter for whom and how much, as `credit_story` does; `Matchmaker` becomes a
  reporter (owner's `set_reporter`).
- **Once by construction**: a bonus is credited only when `peak` rises past a league, a season reward only when the roll
  moves `record.season` past it, both in the same transaction as the record's write.
- **PvP missions.** Four tasks, after the reserved 11 to 18 (`constants.cairo`):

  | Task | Id | Counted per settlement of the attacker |
  |---|---:|---|
  | `TASK_PVP_ATTACK` | 19 | 1 |
  | `TASK_PVP_STARS` | 20 | the stars (0 to 3) |
  | `TASK_PVP_WIN` | 21 | 1 if at least one star |
  | `TASK_PVP_THREE_STARS` | 22 | 1 if three stars |

  `settle` reports them through `Setup.report(attacker, quests, [])` (no achievement, so no XP: the XP of an attack is
  #643's `credit_xp`). `Setup`'s day and week `Progress` keeps their sums in free bits of its slot (four `u16`: the
  three-star count at [96, 112), the attacks, stars and wins at [192, 240)), so an old slot reads them as 0 (`upgrades.md`, "Packed slots keep their bits"). `set_quest_cobbles` accepts
  quests on tasks 19 to 22, and `claim_quest` pays them as any other.
- **The free-game credit** (`claim_daily_credit`, `claim_weekly_credit`) needs every live quest of its list: PvP missions
  are left out of that rule, so a Challenge player's credit never depends on PvP.
- **Proposed missions** (owner calls, no code: `define_quest`, then `set_quest_cobbles`): daily "Raider" (3 attacks, 10),
  daily "Star Hunter" (5 stars, 10), weekly "Conqueror" (5 three-star attacks, 15).

## 8. The leaderboard, the indexer and the client

The client's ranking UI was removed by #623; the leagues come back as the leagues' leaderboard. As for the matchmaker
(its note, 11.7), the client side follows `Matchmaker`'s deployment in the follow-up #639 named, which gains:

- **Indexer**: a table `pvp_leagues (village, season, league, peak, attacks, crowns)` from `CrownsSettled`, `CrownsSet`,
  `LeagueReached` and `SeasonClosed`; `SeasonClockSet` gives the season of a block. The leaderboard is that table by
  crowns, for the current season; past seasons from `SeasonClosed` (league and crowns at the end).
- **`@paved/chain`**: the views `league(village)`, `season_clock()`, `current_season()`, and the write
  `close_season(village)`; the Cobbles stay `Setup.account`'s.
- **What the client reads**: the leaderboard from the indexer; its own village's `league(village)` (the lazy values, so a
  village idle since last season shows its reset crowns and its pending reward before any transaction).

## 9. Open points for the owner (posted on #644; #637 open point 8)

1. **The league ranges**: Clash of Clans' 23 leagues at 1 crown per trophy (proposed), or a compressed table (for
   example every floor divided by 4) because crowns are conserved and will sit lower than trophies. One table:
   `LEAGUE_FLOORS` in `paved::leagues`.
2. **The season length**: 28 days from a Monday (proposed), or a calendar month as Clash of Clans. A calendar month
   needs a month table on chain; a fixed length does not. `set_season_clock`'s argument.
3. **The reset threshold**: 5,000 crowns, Legend's floor, as Clash of Clans (proposed); or lower so that more players
   climb again each season (for example 2,000, Crystal III). `RESET_CROWNS`.
4. **The amounts**: the bonus and the season reward of section 4, and `MIN_SEASON_ATTACKS` = 5 attacks settled in the
   season to earn its reward. `LEAGUE_BONUSES`, `SEASON_REWARDS`, `MIN_SEASON_ATTACKS`.
5. **The missions**: the four PvP tasks and the three proposed quests (section 7); NPC attacks count for them (proposed).

## 10. Audit lenses (Cobbles and crowns move)

- **Crowns** move by the reset only downwards, to `RESET_CROWNS`, and only once per village and season (the record's
  season moves first). The reset keeps the bucket in step (`bucketable.follow`), so the pool's invariants hold (fuzzed).
- **Cobbles** are credited only by `Matchmaker` (a reporter) for the village whose record moved, never for a caller;
  `close_season` is permissionless and pays the village itself. The sums are bounded: at most 605 in bonuses and 250 in a
  reward per village and season; the missions are bounded by `Setup`'s quests (5 to 15 per quest and period).
- **Farming by second accounts**: an account earns only by climbing (bonuses) or by attacking (reward, missions), and
  crowns are conserved between players, so feeding crowns to a main account costs the feeder as much as the main gains.
  The NPC cold start mints crowns (matchmaker's note, 8.4) and is bounded by the owner removing the NPCs.
- **Order**: every roll happens before the crowns move; the credits to `Setup` come last (checks, effects, then the
  interactions), and `Setup` holds no callback into `Matchmaker`.
