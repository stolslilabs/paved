# Leagues and seasons: crowns, season rewards in Cobbles, PvP missions (#644, design)

Track CORE's design for #644, part of the PvP plan #637, after the matchmaker (#639,
`docs/architecture/matchmaker.md`). The owner's decisions of 2026-10-20 bind:

- **league points (crowns) are the rating**: a league is a range of crowns, nothing else;
- **Cobbles come from three sources**: end-of-season rewards, league tiers, and PvP-specific missions;
- **rewards in Cobbles only, never PAVED**: accounts are free on chain, so PAVED would make second accounts pay.

And the owner's credo of 2026-10-21 (#639, point 5): **more components with smaller scopes**. The leagues are two
small components and a pure table, embedded by `Matchmaker`, next to the crown, bucket and shield pieces of
MATCHMAKER-CROWNS (section 11 of the matchmaker's note); they reuse those pieces and their constants and duplicate none.

Section 9 is the proposal posted for the owner on #644 ("LEAGUES proposal for the owner"). **The owner ruled on it
(2026-10-22, #644): A on every point but the season length.** Seasons last three months and follow the four real
seasons, one PvP season per real season, four a year. They change at the northern hemisphere's equinoxes and
solstices, at the UTC timestamps of the astronomical events (the ruling as corrected on #644). The code follows the
ruling; each value is a named constant.

## 1. Summary

- **A season clock** (`SeasonableComponent`): the real seasons, from the equinoxes and solstices (`SEASON_STARTS`),
  from a first season the owner sets once. Season 0 is the time before the first season: no league, no reward, no
  reset.
- **A league table** (`paved::matchmaker::leagues`, pure): 23 named leagues as crown ranges, Clash of Clans' own (pre-2025) at one
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
| `paved::matchmaker::leagues` (pure) | `contracts/src/matchmaker/leagues.cairo` | none | none | The league table, the bonus and reward of each league, the reset, the season of a time |
| `SeasonableComponent` | `contracts/src/components/seasonable.cairo` | `season_clock` | `SeasonClockSet` | The clock: season 1's start; the current season |
| `LeagueableComponent` | `contracts/src/components/leagueable.cairo` | `league_records` | `LeagueReached`, `SeasonClosed` | Each village's season, peak league and attack count |
| `Matchmaker` (the system) | `contracts/src/systems/matchmaker.cairo` | unchanged | unchanged | Composes them with the crowns and the buckets; credits `Setup` |
| `Setup` | `contracts/src/systems/setup.cairo` | `pvp_days`, `pvp_weeks` (appended) | `CobblesClaimed` (kinds 4 and 5) | The Cobble ledger, the PvP mission sums |

- **No piece calls another** (as in section 11 of the matchmaker's note). The leagues component returns what a roll or a
  reach owes; the system sets the crowns (`crownable.set`) and credits `Setup`.
- **Why in `Matchmaker`.** The crowns live there and every crown change goes through it. A separate system would need a
  call per settlement and a second copy of who joined. The pieces stay components, so a later system can embed them.
- **NPC villages** (addresses 1 to 255) have no league: they never roll, never reset, never earn. Their crowns are the
  owner's.

## 3. The season clock

**The ruling.** A PvP season is a real season of the northern hemisphere: spring from the March equinox, summer from the
June solstice, autumn from the September equinox, winter from the December solstice, at the UTC timestamps of the
astronomical events. Seasons last 89 to 94 days (winter is the shortest), about 13 weeks, so the weekly missions still
fit.

**The game's own seasons.** The board's season dial (`packages/app/src/data/season-wheel.ts`, the renderer's
`daynight-settings.ts`) is a visual cycle of summer, autumn, winter and spring. It has no calendar: each of its seasons
lasts one 2-minute day-and-night cycle (`cycleMs`), started from the player's setting or at random. The contracts had no
calendar either. So the PvP seasons follow the sky, not the dial, and the dial is unchanged. The order is the same.

**The table** (`SEASON_STARTS` in `paved::matchmaker::leagues`): the 200 events of 2026 to 2075, four a year (spring,
summer, autumn, winter), as Unix timestamps rounded to the second.
- **Source**: JPL's DE440s planetary ephemeris, through Skyfield 1.55's `almanac.seasons` (the instants when the Sun's
  apparent ecliptic longitude reaches 0°, 90°, 180° and 270°), converted to UTC.
- **Checked against the published times**: the 2026 March equinox is 20 March 14:45:57 UTC, which matches the
  published 14:46.
- **Pinned** by `test_season_table_is_pinned`: the first four events, the last spring and the last event, each season
  88 to 94 days, each year within half a day of a tropical year.

**Past 2075.** Each event is the same event of 2075 plus whole mean tropical years (`TROPICAL_YEAR`, 365.24219 days,
31,556,925 s). Checked against DE440s, the error is at most 27 minutes to 2085 and 52 minutes to 2125. The test pins
2076 within 30 minutes. A later table, from the same ephemeris, is a constant to extend.

**The clock.**
- `season_clock` holds the first second of season 1, an event of the table (0: unset, every time is season 0).
- `season_of(t)` is 0 before it; otherwise, the number of events from season 1's start up to `t`, so 1 in the first
  season. `season_start(s)` is the first second of season `s`.
- **The owner sets it once**, before it starts: `set_season_clock(start)` takes an event's timestamp in the future, and
  reverts once `now >= start` of a set clock (a change after that would renumber seasons that already paid).
- The deployment will pass the next equinox or solstice. For example, the March equinox of 2027 is 1,805,574,281
  (20 March 2027, 20:24:41 UTC).

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

- The amounts are the owner's ruling (section 9, A). Each is at most 255, so a credit fits `Setup`'s existing `CobblesClaimed.cobbles`
  (`u8`) and the indexer reads one more kind of an event it already knows.
- **Scale.** A season's top reward (250) is between two and five skins (50 to 100 each); a full climb from Unranked to
  Legend in one season pays 3 x (5 + 10 + 15 + 20 + 25 + 30 + 40) + 50 = 485 in bonuses. The daily Challenge quests pay up to 60 a day.
- **Crowns are conserved** between players (matchmaker's note, 6.2): they enter only through the NPC villages of the cold
  start (0 to 290 crowns). Clash of Clans' ladder is held up by its trophy inflation below 1,000, which Paved does not
  copy. So the upper leagues will be rare at first; that is point 1 of the proposal (section 9, alternative B).

## 5. A village's league record

`LeagueRecord` (one felt in `league_records`): `season` [0, 32) · `peak` [32, 40) · `attacks` [40, 56).

- **The roll** (`open`): when the system touches a player's village and `record.season < current`:
  1. if `record.season >= 1`, the season `record.season` is closed: its league is `league_of(crowns)` (the crowns now,
     unchanged since its end), its reward `reward_of(league)` if `record.attacks >= MIN_SEASON_ATTACKS`, else 0; one
     `SeasonClosed` event;
  2. the crowns are reset: `min(crowns, RESET_CROWNS)` (`CrownsSet` only if they change; the bucket never moves, see
     "The pool at Legend" below);
  3. the record becomes `{ season: current, peak: league_of(reset crowns), attacks: 0 }`.

  A village idle for several seasons closes only the last one it played in: the seasons in between had no attack, so no
  reward, and the reset is idempotent.

  A village whose record is still season 0 (not touched since before the clock) closes nothing and earns nothing, since
  it settled no attack in a real season. But if it rolls into season 2 or later, season 1 ended while it held these
  crowns, so they are reset too. Its crowns and the `league` view then never keep more than `RESET_CROWNS` past a
  season's end (a fix found in review: `test_a_village_idle_since_before_the_clock_is_reset_after_season_one`, and
  `roll_of` fuzzed from season 0).
- **The reach** (`reach`): after a settlement (both villages) and after a crown set, if `league_of(crowns) > peak`, every
  league from `peak + 1` to it is reached: one `LeagueReached` each, with its bonus, and `peak` rises. A settlement in
  season 0 reaches nothing. A crown set (`set_crowns`, an operator) raises the peak without a bonus.
- **The count**: a settlement adds one to the attacker's `attacks` (saturating at `u16`).
- **The pool at Legend** (a fix found in review). A village is listed in the pool at `min(crowns, RESET_CROWNS)`
  (`pool_crowns` in `Matchmaker`), so every village of 5,000 crowns or more shares Legend's bucket (50). Without it, a
  village not yet rolled into the new season stayed in the bucket of its old crowns: with Alice at 5,000, Bob at 7,000
  and Carol at 4,900 when season 1 ends, Alice's first search of season 2 took Carol (bucket 49) and not Bob (bucket
  70), though Bob's crowns are 5,000 once rolled. The reset changes only crowns above `RESET_CROWNS`, and they all
  list in that one bucket, so a roll never changes a bucket and a draw never reads a stale one, whatever villages are
  not rolled yet (`test_a_draw_after_a_season_end_reads_no_stale_bucket`; the pool's fuzzed invariants check the capped
  bucket). The opponent drawn is rolled before its terms are fixed, so the offer and the cost use its reset crowns.
  The cost: above 5,000 the draw no longer prefers the nearest hundred crowns, as Legend in Clash of Clans is one pool.
  Buckets 51 to 250 stay empty. This changes #639's buckets above 5,000 only; `Matchmaker` is in no deployment file,
  so no listed village moves.
- **Why the peak starts at the season's starting league**: a village that keeps its crowns across seasons (under the
  reset) must climb above where it started to earn a bonus again. So an idle account earns nothing, and a second account
  parked in a league earns at most one season reward per season it attacks `MIN_SEASON_ATTACKS` times.

## 6. The calls

`Matchmaker` gains (its ABI grows; no client imports it yet, `contracts/abis/README.md`):

| Call | Who | What |
|---|---|---|
| `close_season(village)` | anyone | Rolls `village` into the current season (a no-op if it is already there); credits what its last season owes to that village, never to the caller |
| `league(village) -> LeagueStatus` | view | The village as it would be after a roll: `season`, `crowns`, `league`, `peak`, `attacks`, and `pending` (the season reward a roll would credit) |
| `season_clock() -> u64`, `current_season()`, `season_start(season)` | view | `SeasonableComponent`'s |
| `league_record(village)` | view | `LeagueableComponent`'s raw record |
| `set_season_clock(start)` | owner | Once, before the clock starts: an equinox's or solstice's timestamp of the table |

- `search` and `next` roll the attacker and the drawn opponent (so the terms see crowns after any reset); `settle`
  rolls both again (an attack can start in one season and settle in the next); `set_crowns` rolls its village.
  `start_attack` moves no crowns and rolls nothing. Their signatures are
  unchanged, so **PVP-ATTACKS (#643) calls the same interface**: `start_attack(attacker)` and `settle(attacker, stars)`.
  The leagues, the reset and the missions happen inside `settle`; #643 adds nothing for them.
- `set_crowns` stays for the operator (it was the reset's planned path; the reset is now internal).

## 7. Cobbles through `Setup` (its model)

- **A new interface, `ISetupLeague`.** `credit_league(player_id, kind, league, season, cobbles)`, for an allowlisted
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

  `settle` reports them through `ISetupLeague::report_pvp(attacker, stars)` (a reporter only): quiver's
  `QuestProgressed` for the entries that count, and the sums in a PvP day and a PvP week of their own, `PvpProgress`
  (`pvp_days`, `pvp_weeks`, appended to `Setup`'s storage: `attacks`, `stars`, `wins`, `three_stars`, four `u16`, and
  the PvP missions claimed). No achievement, so no XP: the XP of an attack is #643's `credit_xp`. `set_quest_cobbles`
  accepts quests on tasks 19 to 22, and `claim_quest` pays them from the PvP ledger; `pvp_progress(player_id, kind,
  period)` is the view.
- **Why a ledger apart.** The first build put the four sums in free bits of `Progress`, the Challenge's day and week
  slot. Every Challenge game over then paid for the wider slot: the closing moves g, i, k, x and y went over their
  ceilings (g 4,073,448 against 4,011,404). Apart, a game over writes exactly what it wrote before, and only a PvP
  settlement pays for the PvP sums.
- **The free-game credit** (`claim_daily_credit`, `claim_weekly_credit`) needs every live quest of its list: PvP missions
  are left out of that rule, so a Challenge player's credit never depends on PvP.
- **The missions** (owner calls, no code: `define_quest`, then `set_quest_cobbles`): daily "Raider" (3 attacks, 10),
  daily "Star Hunter" (5 stars, 10), weekly "Conqueror" (5 three-star attacks, 15). An attack on an NPC is reported
  only if `MISSIONS_COUNT_NPC` (default false, section 9, point 5).

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

## 9. LEAGUES proposal for the owner (posted on #644; #637 open point 8), and the ruling

**The owner's ruling (2026-10-22, #644): A on every point but point 2.** Point 2 became the four real seasons, from the
equinoxes and solstices (section 3). The proposal follows as posted.

The defaults below are built on PR #695, each as a named constant in `contracts/src/matchmaker/leagues.cairo`. Validate them or amend any line here: each amendment is a one-line change. The Clash of Clans (CoC) references are those #639 used for the crowns (`docs/architecture/matchmaker.md`, section 6): the wiki's pages before the 2025 update, at one crown per trophy.

**1. League ranges: CoC's 23 leagues, floors in crowns** (`LEAGUE_FLOORS`)

| League | Unranked | Bronze III / II / I | Silver III / II / I | Gold III / II / I | Crystal III / II / I | Master III / II / I | Champion III / II / I | Titan III / II / I | Legend |
|---|---|---|---|---|---|---|---|---|---|
| From | 0 | 400 / 500 / 600 | 800 / 1,000 / 1,200 | 1,400 / 1,600 / 1,800 | 2,000 / 2,200 / 2,400 | 2,600 / 2,800 / 3,000 | 3,200 / 3,500 / 3,800 | 4,100 / 4,400 / 4,700 | 5,000 |

A league runs from its floor up to the next league's floor minus one.

- **A (default)**: CoC's floors, the same scale as the crown curves. Trade-off: crowns are conserved (no CoC inflation below 1,000), so the upper leagues stay rare at first.
- **B**: every floor divided by 4 (Bronze from 100, Legend from 1,250). Trade-off: the leagues are reachable at once, but they no longer match the crown curves' CoC scale.

**2. Season length: 28 days** (`SEASON_LENGTH`), starting Monday 00:00 UTC. Four of `Setup`'s weeks, so a season holds exactly four weekly missions. CoC's season is about a month, ending on the last Monday. *Ruled otherwise: the four real seasons, from the equinoxes and solstices, `SEASON_STARTS` (section 3).*

- **B**: calendar months, as in CoC. Trade-off: familiar dates, but it needs a month table on chain and the weekly missions no longer fit a season.

**3. Reset at season end: crowns above 5,000 come back to 5,000** (`RESET_CROWNS`). This is CoC's Legend League reset; everyone under it keeps their crowns.

- **B**: 2,000 (Crystal III). Trade-off: many more players climb again each season, at the price of a reset most of them feel.

**4. Cobble amounts** (`GROUP_BONUSES`, `GROUP_REWARDS`, `MIN_SEASON_ATTACKS`). CoC pays leagues in loot and gems, which have no Paved equivalent, so these are scaled to Paved's prices: a skin costs 50 to 100 Cobbles, and the Challenge's dailies pay up to 60 a day.

| Group | Bronze | Silver | Gold | Crystal | Master | Champion | Titan | Legend |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Bonus per league, first reach in a season | 5 | 10 | 15 | 20 | 25 | 30 | 40 | 50 |
| Season reward, by the league at season end | 10 | 20 | 35 | 50 | 75 | 100 | 150 | 250 |

- Unranked earns nothing. A full climb in one season pays 485 in bonuses. Bonuses count only leagues above the one the season started in.
- A season reward needs **5 attacks** settled in that season.
  - **B**: 15 attacks. Trade-off: rewards only regular players, but casual players lose the season reward.

**5. Missions: three quests on the PvP tasks, counting attacks on players only** (`MISSIONS_COUNT_NPC = false`)

- daily "Raider": 3 attacks, 10 Cobbles;
- daily "Star Hunter": 5 stars, 10 Cobbles;
- weekly "Conqueror": 5 three-star attacks, 15 Cobbles.

They are left out of the Challenge's free-game credit.

- **A (default)**: NPC attacks don't count. Trade-off: a second account can't farm them alone against NPCs, but a new player in an empty pool can't progress them until other players join.
- **B**: NPC attacks count. Trade-off: missions work from day one, but every free account can farm 35 Cobbles a day.

**6. Legend pool: one matchmaking bucket for everyone at 5,000 crowns or more** (`POOL_CROWNS_CAP = RESET_CROWNS`). This mirrors CoC, where Legend League is one pool. It is also what keeps the matchmaker correct across the reset: a village not yet moved into the new season is already in the right bucket.

- **B**: #639's 100-crown buckets above 5,000, plus a roll-and-redraw at each search. Trade-off: finer matching at the top, at the cost of more gas per search and a draw that can still pick a stale village.

## 10. Audit lenses (Cobbles and crowns move)

- **Crowns** move by the reset only downwards, to `RESET_CROWNS`, and only once per village and season (the record's
  season moves first). The reset never moves a bucket (the pool at Legend, section 5), so the pool's invariants hold
  (fuzzed).
- **Cobbles** are credited only by `Matchmaker` (a reporter) for the village whose record moved, never for a caller;
  `close_season` is permissionless and pays the village itself. The sums are bounded: at most 485 in bonuses and 250 in a
  reward per village and season; the missions are bounded by `Setup`'s quests (5 to 15 per quest and period).
- **Farming by second accounts**: an account earns only by climbing (bonuses) or by attacking (reward, missions), and
  crowns are conserved between players, so feeding crowns to a main account costs the feeder as much as the main gains.
  The NPC cold start mints crowns (matchmaker's note, 8.4) and is bounded by the owner removing the NPCs.
- **Order**: every roll happens before the crowns move; the credits to `Setup` come last (checks, effects, then the
  interactions), and `Setup` holds no callback into `Matchmaker`.

## 11. As built (LEAGUES)

The code follows the owner's ruling on section 9 (#644).

### 11.1 What changed

| File | What |
|---|---|
| `contracts/src/matchmaker/leagues.cairo` | The pure table: `league_of` (a binary search over 22 floors), `floor_of`, `bonus_of`, `reward_of`, `reset`, `season_of`, `season_start` |
| `contracts/src/components/seasonable.cairo` | `SeasonableComponent`: `season_clock`, `SeasonClockSet`, `season_clock()`, `current_season()`, `season_start()` |
| `contracts/src/components/leagueable.cairo` | `LeagueableComponent`: `league_records`, `LeagueReached`, `SeasonClosed`, `league_record()`; the pure `roll_of` the lazy view shares |
| `contracts/src/systems/matchmaker.cairo` | Embeds both; rolls at the draw, the settlement and a crown set; `close_season`, `league`, `set_season_clock`; credits and `report_pvp` last |
| `contracts/src/systems/setup.cairo` | `ISetupLeague` (`credit_league`, `report_pvp`, `pvp_progress`), `PvpProgress`, `pvp_days` and `pvp_weeks` appended, `claim_quest` on PvP tasks, the credits without PvP |
| `contracts/src/constants.cairo` | `TASK_PVP_ATTACK` to `TASK_PVP_THREE_STARS` (19 to 22) |
| `packages/indexer` | `CobblesClaimed` kinds 4 and 5 decoded and kept in the running ledger, once per (player, kind, league, season) |

**Storage and upgrades.** `Matchmaker` is still in no deployment file (matchmaker's note, 11.3), so its two new
components only add names. `Setup` is deployed: `pvp_days` and `pvp_weeks` are appended (P-42) and no slot of it changes
meaning; `Progress` is unchanged to the bit. The pins: `test_league_storage_is_pinned_by_name` (`season_clock`,
`league_records`), and `test_cobbles_report_pvp_by_a_reporter_only_and_saturates` (`pvp_days` written raw and read by
the view, `pvp_weeks` read raw).

**Deployment** (with `Matchmaker`'s, the follow-up #639 named): `Setup.set_reporter(Matchmaker, true)` besides
`set_spender`, or every settlement reverts (`test_settle_when_matchmaker_is_not_a_reporter_fails`); then
`set_season_clock(start)` with the next equinox or solstice of `SEASON_STARTS`; then the missions' `define_quest` and `set_quest_cobbles`.

### 11.2 Size (P-44)

`scripts/class-sizes.sh` (release, scarb 2.20.1 through the machine's shim, VPS, 2026-10-22, under
`prlimit --as=12884901888`, peak RSS 4,779,016 kB). The base is an export of main at `62056003`, measured the same way.

| Class | CASM main | CASM LEAGUES | Change | Share of the Starknet cap | Under the P-44 cap (73,728) |
|---|---:|---:|---:|---:|---:|
| `Matchmaker` | 24,614 | 33,244 | +8,630 | 40.6 % | 40,484 |
| `Setup` | 43,431 | 47,384 | +3,953 | 57.8 % | 26,344 |

Every other class is unchanged to the felt (`Challenge` 69,494, `Story` 58,837, `Village` 57,691, `Avatar` 10,201).

### 11.3 Gas

L2 gas of the call alone (`contracts/tests/gas.cairo`, test profile, snforge 0.64.0, VPS, 2026-10-22); ceilings set at
measured + 5 %. Every new call has its own measure and ceiling (z32 to z43), besides the calls #639 measured.

| Test | Call | Before | Now | Change |
|---|---|---:|---:|---:|
| z17 | `search`, free (no clock: the rolls read the clock and the records only) | 2,602,829 | 2,750,425 | +5.7 % |
| z18 | `next` | 3,169,327 | 3,317,523 | +4.7 % |
| z19 | `start_attack`, worst case | 4,421,401 | 4,435,441 | +0.3 % |
| z20 | `settle`, worst case of #639 (both change bucket), in season 0 | 3,133,404 | 4,632,946 | +47.9 % |
| z32 | `settle` across a season's end: both rolled, reset from 6,000 to 5,000 and paid | new | 5,675,378 | |
| z33 | `close_season` with a reward and a reset | new | 1,969,843 | |
| z34 | `set_season_clock`, the owner's first set (the event checked in the table) | new | 651,740 | |
| z35 | `current_season` (view, a binary search of the table) | new | 603,690 | |
| z36 | `season_clock` (view) | new | 130,070 | |
| z37 | `league_record` (view) | new | 163,966 | |
| z38 | `league` (view), a village of a past season: the roll computed, no write | new | 1,084,586 | |
| z39 | `Setup.credit_league`, a season's reward | new | 520,168 | |
| z40 | `Setup.report_pvp`, a 3-star attack: four entries, new day and week slots | new | 1,067,688 | |
| z41 | `Setup.pvp_progress` (view) | new | 197,612 | |
| z42 | `Setup.claim_quest` of a PvP mission (the PvP day read and written) | new | 1,579,371 | |
| z43 | `season_start` (view), season 2 of the clock | new | 460,020 | |

- **The calendar's cost**: the season of a time is a binary search over the 200 events (about 0.4M of L2 gas in a call
  that reads it, z35). A call in season 0, with no clock, pays none of it (z17, z18, z20).
- **Where z20's +1.52M goes**: almost all of it is `report_pvp` (a call to `Setup`, quiver's events, two PvP slots
  written); the leagues' own part in season 0 is the clock and two record reads.
- **Levers for #643** if its attack budget needs them: report the missions only on a win, or drop quiver's
  `QuestProgressed` for the PvP tasks (the ledger alone pays the missions). Not taken: the indexer's quest progress
  reads those events.
- The Challenge paths and `Setup`'s claims are unchanged (g 3,977,820, k 4,509,430, z1 931,431, under their ceilings).

### 11.4 Tests

Run in a scratch copy of the crate that keeps every source and only the test modules named (the full test build passes
the machine's 8 GB Cairo scope, as for #639): `paved::tests::leagues`, `paved::tests::matchmaker`,
`paved::tests::matchmaker_system`, `paved::tests::setup`, `paved::tests::e2e::cobbles_ledger`, and every `test_gas_`
test. 433 pass (peak RSS 5,677,996 kB under `prlimit --as=16106127360`). CI runs the whole suite.

- **The table** pinned row by row (floors, bonuses, rewards), the floor and the crown below it of every league;
  fuzzed: `league_of` is the highest floor at or below, `reset` never raises and is idempotent.
- **The components alone**: the clock set once before its start and refused after, in the past or under a day; the
  roll from season 0 (nothing closed), with and without `MIN_SEASON_ATTACKS`, the climb league by league, down and up
  again, unpaid, in season 0, the attacks saturating; fuzzed: a roll pays at most once per season, its reward never
  above its league's.
- **The system**: a settlement reaching Bronze III pays 5 and not twice; the defender climbing by a failed attack; a crown
  set reaching leagues unpaid; a season's end paying 250 and resetting 6,000 to 5,000 (staying in Legend's bucket, 50) by anyone's
  `close_season`, once, and nothing for idle seasons after; below the threshold the crowns stay; a draw rolling both;
  an attack started in one season and settled in the next; an NPC with no league; the missions reported and claimed;
  the reporter missing reverting the settlement.
- **The pool's fuzzed sequences** now run on a clock of one-day seasons: the leagues' invariants (a record never past the
  season; once rolled, its peak at least its crowns' league; the lazy view in the current season) are checked with the
  buckets, and the long sequence must cross two seasons and pay Cobbles (it reached season 3 and paid 40).
- **`Setup`**: the PvP packing bit for bit, the sums and their claims once, a `u16` total refused above 65,535, the
  free-game credit not needing PvP, `report_pvp` and `credit_league` by a reporter only.

### 11.5 Audit, correctness and security (Cobbles and crowns move)

- **Crowns.** The reset is the only new move: downwards, to `RESET_CROWNS`, once per village and season, before any
  crowns move in that season; it never moves a bucket (fuzzed with the pool's invariants). Between players crowns stay
  conserved: an attack across a season's end settles from both reset counts (`test_settle_after_the_season_ends_rolls_first`).
- **Cobbles.**
  - `Setup` credits league Cobbles only from a reporter, 1 to 255 a call, kind 4 or 5. `Matchmaker` calls it for the
    village whose record moved, never for the caller of `close_season`.
  - Each credit is tied to a record write in the same transaction: a bonus to `peak` rising past its league, a reward
    to `season` moving past the closed season. So a replay of `close_season`, or a settlement in the same season, finds
    nothing more to pay (tested, and fuzzed in `roll_of`).
  - The sums are bounded per village and season: 485 in bonuses (the full climb), 250 in a reward.
- **Farming.** No Cobble for being idle: a reward needs `MIN_SEASON_ATTACKS` attacks settled in the season, and a bonus a
  league above the one the season started in. Crowns between players are conserved, so a second account feeding a main
  one loses what the main gains; the NPCs' minted crowns are the cold start's, bounded by the owner removing them.
- **Farming the missions.** An attack costs no Cobble. Against an NPC it needs no other player, so with NPC attacks
  counted a free second account could complete the missions every day (35 a day and 15 a week). The default,
  `MISSIONS_COUNT_NPC = false`, reports only attacks on players (`test_npc_has_no_league` checks no mission progress), so
  a farm needs a second player to attack, whose crowns and shield it moves. Gating the missions by level (#641) is the
  next lever if needed.
- **Trust.** `Matchmaker` becomes a `Setup` reporter, the same allowlist as `Challenge` and `Story`, which can also call
  `credit_story` and `credit_xp`: a compromised `Matchmaker` could mint Cobbles, as a compromised `Story` could. It is the
  owner's upgradable class, like them.
- **Order.** Rolls and record writes come before the calls to `Setup` (credits, then `report_pvp`); `Setup` calls nothing
  back.
- **Season 0.** With no clock, nothing changes from #639 but the missions' report.

### 11.6 Follow-ups this PR names

- **The client side**, with `Matchmaker`'s deployment (#639's follow-up, its note 11.7): `scripts/deploy.sh` (the
  reporter, the clock, the missions), the `@paved/chain` views `league`, `season_clock`, `current_season`,
  `pvp_progress` and the write `close_season`, and the indexer's `pvp_leagues` table from the leagues' events, which
  serves the leagues' leaderboard (section 8).
- **#643** calls `start_attack` and `settle(attacker, stars)` as before; the leagues and the missions are inside
  `settle`.

