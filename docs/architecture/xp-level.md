# The player's XP and level (#641, design)

Track CORE's design for #641, part of the PvP plan #637. The owner's decisions of 2026-10-20 bind:

- The village's parcels are gated by the player's level (#640).
- #625's ring shows XP 0 until the contracts define the XP.

Everything else below is a proposal. The open points (section 6) go to the owner on #641. The code is built on the
proposals, with every amount a named constant, so a ruling changes numbers and not the design.

## 1. Summary

- **XP is one number per account, stored in the 27 free bits of `Setup`'s `accounts` slot**, bits [224, 251), after
  `achievements_claimed`. It only grows, saturating at 2^27 - 1 (134,217,727). No new storage member, no new slot.
- **The level is not stored.** It is a pure function of the XP (section 3), read through one view. Changing the curve is
  an upgrade of `Setup` and moves no data.
- **Only allowlisted reporters credit XP**, as for Cobbles: `Challenge` through its game-over `report`, `Story`
  through `credit_story`, PvP (#643) through a new `credit_xp`. A player never credits itself.
- **One event, `XpGained`**, carries the gain, the new total and the new level. The indexer keeps one row per player.
- **The client's seam** (`usePlayerProgress()`, #625, XP-RING) reads the `level` view, or the indexer's row.

## 2. The XP of a game, per mode (proposal, open point 1)

| Mode | When | XP | Constant | Why |
|---|---|---|---|---|
| Challenge | each game over, paid or free (a credit) | **20** | `GAME_XP` | Every game is paid with money or with a credit earned by quests, so it cannot be farmed for free. Flat: the stake (1 to 10) must not buy levels, or Cobbles and USDC would buy parcels after all. |
| Story | each star gained for the first time | **10** per star (30 per level at most) | `STAR_XP` | Story runs are free and can be replayed; paying the first time a star is won, as its Cobbles are, makes it non-farmable. |
| PvP attack (#643) | each attack finished | **10, plus 5 per star** (25 at most) | `ATTACK_XP`, `ATTACK_STAR_XP` (in #643) | A loss still teaches; stars reward winning. |
| PvP defence (#643) | each attack that ends with 0 stars for the attacker | **5** | `DEFENCE_XP` (in #643) | The 8-hour shield limits it to three a day; a defence that loses gives nothing, so an alt account attacking badly on purpose gives its victim at most 15 XP a day. |

The Challenge's XP does not depend on the score: the score's scale moves with the deck and the rules, a flat amount does
not. A score-based bonus is an option for the owner (open point 1).

The PvP amounts are set in #643's code, which calls `credit_xp`. `Setup` bounds a single credit at `MAX_CREDIT_XP` (100)
so a faulty reporter cannot grant a level in one call.

## 3. The level curve (proposal, open point 2)

Level 1 at 0 XP; going from level `n` to `n + 1` costs `100 n` XP. So level `L` starts at `50 L (L - 1)` XP:

| Level | 1 | 2 | 3 | 4 | 5 | 10 | 20 | 30 |
|---|---|---|---|---|---|---|---|---|
| XP | 0 | 100 | 300 | 600 | 1,000 | 4,500 | 19,000 | 43,500 |
| Challenge games (20 XP) | 0 | 5 | 15 | 30 | 50 | 225 | 950 | 2,175 |

- The level is `max { L : 50 L (L - 1) <= xp }`, computed with one integer square root and a correction step, no loop
  over the levels. At the XP's ceiling it is level 1,638.
- It is quadratic so that the first levels (and #640's first parcels) come within a session, and the later ones take
  weeks. The step (100) is one constant, `LEVEL_STEP`.
- How many cells a level opens is #640's rule, which reads the level. A proposal for #640: the starting territory, then
  one parcel per level.

## 4. Storage and upgrade

- `Account` gains `xp: u32`, packed at bits [224, 251) of the same felt. Bits 224 and up are zero in every slot written
  so far (`achievements_claimed` ends at 224, and the high half was kept under 2^96), so every existing account reads
  XP 0 after the upgrade: no migration, no new member (`upgrades.md`, the storage discipline).
- 251 bits fit a felt (any value under 2^251 is below the field's prime).
- 27 bits are enough: at 20 XP a game it is 6.7 million games.
- **No backfill** of the games played before the upgrade (open point 3): Sepolia is a playtest, and mainnet starts with
  the code.

## 5. Interface

On `Setup` (new trait `ISetupLevel`, published early for #640):

```cairo
#[derive(Copy, Drop, Debug, PartialEq, Serde)]
pub struct PlayerLevel {
    pub xp: u32,    // the player's XP
    pub level: u16, // its level (1 at 0 XP)
    pub floor: u32, // the XP at which this level starts
    pub next: u32,  // the XP at which the next level starts
}

trait ISetupLevel {
    /// Credits `player_id` `xp` XP (1 to `MAX_CREDIT_XP`) for `source` (3 PvP attack, 4 PvP defence;
    /// 1 and 2 are credited by `report` and `credit_story`): an allowlisted reporter only. Emits `XpGained`.
    fn credit_xp(ref self, player_id: felt252, source: u8, xp: u32);
    /// The XP and level of a player; level 1 at 0 XP.
    fn player_level(self: @, player_id: felt252) -> PlayerLevel;
}
```

`paved::systems::setup::level_of(xp) -> u16` and `level_floor(level) -> u32` are public pure functions for any system
that holds an XP value. #640 reads `player_level(player_id).level` from `Setup`.

- `report` adds `GAME_XP` for the game over it reports (the achievement entry of task 1, which every game over carries),
  in the account write it already makes.
- `credit_story` adds `STAR_XP` per star it pays, in its account write.
- **Event** `XpGained { #[key] player_id, source, xp, total, level }`, `source` 1 Challenge, 2 Story, 3 PvP attack, 4 PvP
  defence. One per credit (one per Story call, not per star).
- The `account` view returns the new `xp` field (an ABI change, the repository's ABI pattern).
- **Indexer**: a `player_xp` table (player, xp, level, updated block), written from `XpGained`, served with the
  player's other data.
- **Client**: `@paved/chain` decodes `xp`, reads `player_level`; #625's `usePlayerProgress()` maps
  `{ level, xp: xp - floor, xpForNext: next - floor }`.

## 6. Open points for the owner

1. **XP per mode** (section 2): Challenge 20 per game, Story 10 per new star, PvP attack 10 + 5 per star, defence 5 per
   defence won. Should the Challenge add a score-based bonus?
2. **The curve** (section 3): level `n` to `n + 1` costs `100 n` XP (level 10 at 225 Challenge games). Steeper,
   flatter, or a level cap?
3. **Backfill**: XP from the games played before the upgrade (`games` is counted per account): none (proposed), or
   `GAME_XP` per counted game at the first credit.
4. **The amounts of #637 open point 8** that read the level (the parcels per level) stay with #640.
