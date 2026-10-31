//! `Setup`, the system that holds the quests and the achievements (D-24, P-51 ruling 3, named by
//! D-25; `docs/architecture/quests.md`, `leaderboard.md` "D-24").
//!
//! The mode contracts report to it: an allowlisted reporter (today `Challenge`) sends
//! one `report` per game over, with the entries its own tally gives (`paved::quests`); `Setup`
//! knows tasks, not games. It trusts the reporter for whom the report is: it cannot read a game's
//! player without calling the reporter back. The guarantee is the reporter's code (`Challenge`
//! reports only for the caller of the move that ended the game, who must be the game's player).
//!
//! The tutorial is off chain (D-21): its achievement is claimed here by the player, once, with no
//! check (P-49 ruling 2).
//!
//! Since step E (D-25) it is also the single registry of the wiring (P-53 ruling 2): the economy
//! and collection addresses that `Account` held, set by the owner and read by `Challenge` through
//! one view per call (`wiring`). They are new storage members: none of the earlier members moves.
//!
//! Since cobbles v1 (P-61, `docs/architecture/cobbles-v1.md`, part 1) it also keeps the ledger that
//! proves the claims: each paid game over adds its sums to the player's day and week (`days`,
//! `weeks`), and every game over to the player's lifetime counts (`accounts`). The player claims
//! the cobbles of a quest or an achievement, and the free-game credit of a day's or a week's
//! quests, from that ledger; `Challenge` spends a credit through `spend_credit` for a free game.
//! Cobbles and credits are a balance per account with no transfer: they grow only by a claim and
//! fall only by a spend.
//!
//! Since cobbles v1, part 2 (`cobbles-v1.md`, 2) it also sells the cobble packs the owner sets: the
//! player pays a pack's USDC price into `Economy`, whose `sell` runs the game's own money path
//! (the referral, the swap, the Vault's PAVED, the burn), and gets its cobbles in the same call.
//!
//! Since cobbles v1, part 3 (`cobbles-v1.md`, 5) cobbles are spent here, and only here: the owner
//! prices the skin of a tile plan in a theme, the player buys it for itself (`buy_skin`), once, and
//! sets which owned skin is active for each of the 19 plans (`set_skins`, one write).

use core::num::traits::Sqrt;
use paved::constants;
use quiver_achievement::types::batch::TaskProgress as AchievementProgress;
use quiver_achievement::types::task::AchievementTask;
use quiver_achievement::types::window::AchievementWindow;
use quiver_quest::types::batch::TaskProgress as QuestProgress;
use quiver_quest::types::schedule::QuestSchedule;
use quiver_quest::types::task::QuestTask;
use starknet::ContractAddress;

/// The wiring `Challenge` reads at spawn and at game over: the `Economy` of the paid games and the
/// `Collection` of the game NFTs (each zero until set).
#[derive(Copy, Drop, Debug, PartialEq, Serde)]
pub struct Wiring {
    pub economy: ContractAddress,
    pub collection: ContractAddress,
}

/// The calendar of the ledger (cobbles v1, 1.2): a day is Paved's day id, `t / DAY`; a week runs
/// Monday to Sunday UTC, week 0 from `WEEK_START` (Monday 1970-01-05, where the weekly quests
/// start). `t` is the block time of the report: a game counts for the day and week it ends in.
pub const DAY: u64 = 86400;
pub const WEEK: u64 = 604800;
pub const WEEK_START: u64 = 345600;
/// The kinds of a quest with cobbles, and of a credit: daily and weekly.
pub const DAILY: u8 = 1;
pub const WEEKLY: u8 = 2;
/// The kinds of a cobble claim (`CobblesClaimed.kind`).
pub const CLAIM_QUEST: u8 = 1;
pub const CLAIM_ACHIEVEMENT: u8 = 2;
/// A star of a Story level (#548): `id` the level, `(campaign_id << 8) | level_id`; `period` the
/// star, 1 to 3. Paid once per star, level and account (`ISetupStory::credit_story`).
pub const CLAIM_STORY: u8 = 3;
/// A league reached for the first time in a season (#644): retired with the league bonus (#917,
/// a lifetime league mission instead); kept so the kind is never given to another claim, and
/// refused by `credit_league`.
pub const CLAIM_LEAGUE: u8 = 4;
/// A season's reward by the league held at its end (#644): `id` the league, `period` the season.
pub const CLAIM_SEASON: u8 = 5;
/// A village reward taken as Cobbles (#642, `docs/architecture/village-rewards.md`): `id` 0,
/// `period` the reward's index. Paid by `Rewards`, an allowlisted reporter.
pub const CLAIM_REWARD: u8 = 6;
/// The cobbles of the first, second and third star of a Story level (#548): 30 per level at most.
pub const STAR_COBBLES: u8 = 5;
/// The ids that can carry cobbles: 1 to 63, one bit each in the claim bitmaps (`u64`).
pub const MAX_COBBLE_ID: u32 = 63;
/// The most quests of one kind with cobbles: the ids of a list are 15 `u16` in one slot.
pub const MAX_LISTED: u32 = 15;
/// The cobbles of a quest, and of an achievement, when set (0 removes them).
pub const QUEST_COBBLES_MIN: u8 = 5;
pub const QUEST_COBBLES_MAX: u8 = 15;
pub const ACHIEVEMENT_COBBLES_MIN: u8 = 10;
pub const ACHIEVEMENT_COBBLES_MAX: u8 = 90;
/// The highest total an achievement with cobbles may have: its lifetime count saturates at `u16`.
pub const MAX_ACHIEVEMENT_TOTAL: u32 = 65535;
/// The highest total a quest with cobbles may have on a task whose day and week sums are `u16`
/// (tasks 1, 2 and 4; task 3, the points, sums in `u32`): a saturated sum can never sit under it.
pub const MAX_QUEST_TOTAL: u32 = 65535;
/// The pack ids: 1 to 8 (cobbles v1, 2.2).
pub const MAX_PACK_ID: u8 = 8;
/// The tile plans that have a skin: the `Plan` codes 1 to 19 (cobbles v1, 5.1).
pub const PLANS: u8 = 19;
/// The price of a skin when set (0 withdraws it from sale), in cobbles (cobbles v1, 5.2).
pub const SKIN_PRICE_MIN: u8 = 50;
pub const SKIN_PRICE_MAX: u8 = 100;
/// The XP of a player (#641, `docs/architecture/xp-level.md`; the amounts and the curve below are
/// the owner's ruling of 2026-10-21, with no backfill): the sources of an `XpGained`, a Challenge
/// game over (`report`), a Story star won for the first time (`credit_story`), a PvP attack and a
/// PvP defence (`ISetupLevel::credit_xp`, #643).
pub const XP_CHALLENGE: u8 = 1;
pub const XP_STORY: u8 = 2;
pub const XP_ATTACK: u8 = 3;
pub const XP_DEFENCE: u8 = 4;
/// The XP of a Challenge game over, paid or free, whatever its stake or score.
pub const GAME_XP: u32 = 20;
/// The XP of a Story star, paid once per star, level and account, as its cobbles.
pub const STAR_XP: u32 = 10;
/// The most XP one `credit_xp` may give.
pub const MAX_CREDIT_XP: u32 = 100;
/// The XP saturates at 2^27 - 1: its 27 bits of the account slot.
pub const MAX_XP: u32 = 0x7ffffff;
/// The level curve: going from level `n` to `n + 1` costs `LEVEL_STEP x n` XP, so level `L` starts
/// at `LEVEL_STEP x L (L - 1) / 2` XP (`level_floor`).
pub const LEVEL_STEP: u64 = 100;

/// A player's account (one slot, key `player_id`): the cobbles, the free-game credits, the lifetime
/// counts of every reported game over (each saturating at `u16::MAX`) and the claimed
/// achievements (bit `i` = achievement `i`), and the XP (#641, saturating at `MAX_XP`). Layout:
/// `cobbles` [0, 64) · `credits` [64, 80) · `games` [80, 96) · `forests` [96, 112) · `wonders`
/// [112, 128) · `big` [128, 144) · `high` [144, 160) · `achievements_claimed` [160, 224) · `xp`
/// [224, 251).
#[derive(Copy, Drop, Debug, PartialEq, Serde, Default)]
pub struct Account {
    pub cobbles: u64,
    pub credits: u16,
    pub games: u16,
    pub forests: u16,
    pub wonders: u16,
    pub big: u16,
    pub high: u16,
    pub achievements_claimed: u64,
    pub xp: u32,
}

/// A player's XP and level (#641, `ISetupLevel::player_level`): its level starts at `floor` XP and
/// the next one at `next`.
#[derive(Copy, Drop, Debug, PartialEq, Serde)]
pub struct PlayerLevel {
    pub xp: u32,
    pub level: u16,
    pub floor: u32,
    pub next: u32,
}

/// The level of `xp` XP: the highest `L` with `level_floor(L) <= xp`, 1 at 0 XP. `L (L - 1) <= q`,
/// `q = 2 xp / LEVEL_STEP`, is `2 L - 1 <= sqrt(4 q + 1)`: one integer square root, exact.
pub fn level_of(xp: u32) -> u16 {
    let q: u64 = 2 * xp.into() / LEVEL_STEP;
    let root: u64 = (4 * q + 1).sqrt().into();
    ((root + 1) / 2).try_into().unwrap()
}

/// The XP at which `level` starts (1 or more): `LEVEL_STEP x level (level - 1) / 2`.
pub fn level_floor(level: u16) -> u64 {
    let level: u64 = level.into();
    LEVEL_STEP * level * (level - 1) / 2
}

/// The XP of a report: `GAME_XP` per game its achievement entries of task 1 count (every game
/// over carries one), at most `MAX_XP`.
fn report_xp(entries: Span<AchievementProgress>) -> u32 {
    let mut games: u64 = 0;
    for entry in entries {
        if *entry.task_id == 1 {
            games += (*entry.count).into();
        }
    }
    let xp = games * GAME_XP.into();
    if xp > MAX_XP.into() {
        MAX_XP
    } else {
        xp.try_into().unwrap()
    }
}

/// A player's day or week (one slot, key `(player_id, period)`): the sums of the paid game overs
/// that ended in it (each saturating), the quests claimed for it (bit `i` = quest `i`), and whether
/// its credit is claimed. Layout: `games` [0, 16) · `structures` [16, 32) · `forests` [32, 48) ·
/// `points` [48, 80) · `credit` [80] · `claimed` [128, 192).
#[derive(Copy, Drop, Debug, PartialEq, Serde, Default)]
pub struct Progress {
    pub games: u16,
    pub structures: u16,
    pub forests: u16,
    pub points: u32,
    pub claimed: u64,
    pub credit: bool,
}

/// A player's PvP day or week (#644, one slot, key `(player_id, period)`): the sums of the PvP
/// settlements of its attacks in it (tasks 19 to 22, each saturating at `u16`) and the PvP missions
/// claimed for it (bit `i` = quest `i`). Apart from `Progress`, so a Challenge game over writes
/// nothing more. Layout: `attacks` [0, 16) · `stars` [16, 32) · `wins` [32, 48) · `three_stars`
/// [48, 64) · `claimed` [128, 192).
#[derive(Copy, Drop, Debug, PartialEq, Serde, Default)]
pub struct PvpProgress {
    pub attacks: u16,
    pub stars: u16,
    pub wins: u16,
    pub three_stars: u16,
    pub claimed: u64,
}

/// The cobbles of a quest (one slot, key `quest_id`), with the copy of its quiver definition's
/// schedule and single task taken when they were set: a claim reads this slot alone. `cobbles` 0:
/// no cobbles. Layout: `cobbles` [0, 8) · `kind` [8, 16) · `task` [16, 48) · `total` [48, 80) ·
/// `interval`
/// [80, 112) · `start` [128, 192). The quest's `duration` is its kind's (a day or a week) and its
/// `end` is 0 (`set_quest_cobbles` accepts no other).
#[derive(Copy, Drop, Debug, PartialEq, Serde, Default)]
pub struct QuestCobbles {
    pub cobbles: u8,
    pub kind: u8,
    pub task: u32,
    pub total: u32,
    pub start: u64,
    pub interval: u32,
}

/// The cobbles of an achievement (one slot, key `achievement_id`), with its single task copied from
/// its definition. `cobbles` 0: no cobbles. Layout: `cobbles` [0, 8) · `task` [8, 40) · `total`
/// [40, 72).
#[derive(Copy, Drop, Debug, PartialEq, Serde, Default)]
pub struct AchievementCobbles {
    pub cobbles: u8,
    pub task: u32,
    pub total: u32,
}

/// A cobble pack (one slot, key `pack_id`): its cobbles, its price in USDC base units (6
/// decimals) and whether it is on sale. `cobbles` 0: never set. Layout: `price` [0, 128) ·
/// `cobbles` [128, 160) · `active` [160].
#[derive(Copy, Drop, Debug, PartialEq, Serde, Default)]
pub struct Pack {
    pub cobbles: u32,
    pub price: u128,
    pub active: bool,
}

/// The active skins of a player (one `felt252`, key `player_id`): the theme active for plan `p`
/// (1 to 19) in byte `p - 1` (bits [8 (p - 1), 8 p), 152 bits); 0 is the default theme.
pub fn active_word(themes: Span<u8>) -> felt252 {
    let mut word: u256 = 0;
    let mut i = themes.len();
    while i != 0 {
        i -= 1;
        word = word * 256 + (*themes.at(i)).into();
    }
    word.try_into().unwrap()
}

/// The 19 themes of an active word, plan 1 first.
pub fn active_themes(value: felt252) -> Array<u8> {
    let mut word: u256 = value.into();
    let mut themes: Array<u8> = array![];
    for _ in 0..PLANS {
        themes.append((word % 256).try_into().unwrap());
        word /= 256;
    }
    themes
}

const TWO_POW_8: u128 = 0x100;
const TWO_POW_16: u128 = 0x10000;
const TWO_POW_32: u128 = 0x100000000;
const TWO_POW_40: u128 = 0x10000000000;
const TWO_POW_48: u128 = 0x1000000000000;
const TWO_POW_64: u128 = 0x10000000000000000;
const TWO_POW_80: u128 = 0x100000000000000000000;
const TWO_POW_96: u128 = 0x1000000000000000000000000;
const TWO_POW_112: u128 = 0x10000000000000000000000000000;
const TWO_POW_64_NZ: NonZero<u128> = 0x10000000000000000;
const MASK_8: u128 = 0xff;
const MASK_16: u128 = 0xffff;
const MASK_32: u128 = 0xffffffff;
const MASK_64: u128 = 0xffffffffffffffff;

/// The two halves of a packed slot.
fn halves(value: felt252) -> (u128, u128) {
    let word: u256 = value.into();
    (word.low, word.high)
}

/// A packed slot from its halves; every layout keeps `high` under 2^123, so it fits a felt.
fn word(low: u128, high: u128) -> felt252 {
    let word = u256 { low, high };
    word.try_into().unwrap()
}

#[inline(always)]
fn field(half: u128, unit: u128, mask: u128) -> u128 {
    (half / unit) & mask
}

pub impl AccountPacking of starknet::storage_access::StorePacking<Account, felt252> {
    fn pack(value: Account) -> felt252 {
        let low: u128 = value.cobbles.into()
            + value.credits.into() * TWO_POW_64
            + value.games.into() * TWO_POW_80
            + value.forests.into() * TWO_POW_96
            + value.wonders.into() * TWO_POW_112;
        let high: u128 = value.big.into()
            + value.high.into() * TWO_POW_16
            + value.achievements_claimed.into() * TWO_POW_32
            + value.xp.into() * TWO_POW_96;
        word(low, high)
    }

    fn unpack(value: felt252) -> Account {
        let (low, high) = halves(value);
        let (xp, claimed) = DivRem::div_rem(high / TWO_POW_32, TWO_POW_64_NZ);
        Account {
            cobbles: (low & MASK_64).try_into().unwrap(),
            credits: field(low, TWO_POW_64, MASK_16).try_into().unwrap(),
            games: field(low, TWO_POW_80, MASK_16).try_into().unwrap(),
            forests: field(low, TWO_POW_96, MASK_16).try_into().unwrap(),
            wonders: (low / TWO_POW_112).try_into().unwrap(),
            big: (high & MASK_16).try_into().unwrap(),
            high: field(high, TWO_POW_16, MASK_16).try_into().unwrap(),
            achievements_claimed: claimed.try_into().unwrap(),
            xp: xp.try_into().unwrap(),
        }
    }
}

pub impl ProgressPacking of starknet::storage_access::StorePacking<Progress, felt252> {
    fn pack(value: Progress) -> felt252 {
        let credit: u128 = if value.credit {
            TWO_POW_80
        } else {
            0
        };
        let low: u128 = value.games.into()
            + value.structures.into() * TWO_POW_16
            + value.forests.into() * TWO_POW_32
            + value.points.into() * TWO_POW_48
            + credit;
        word(low, value.claimed.into())
    }

    fn unpack(value: felt252) -> Progress {
        let (low, high) = halves(value);
        Progress {
            games: (low & MASK_16).try_into().unwrap(),
            structures: field(low, TWO_POW_16, MASK_16).try_into().unwrap(),
            forests: field(low, TWO_POW_32, MASK_16).try_into().unwrap(),
            points: field(low, TWO_POW_48, MASK_32).try_into().unwrap(),
            claimed: high.try_into().unwrap(),
            credit: low / TWO_POW_80 != 0,
        }
    }
}

pub impl PvpProgressPacking of starknet::storage_access::StorePacking<PvpProgress, felt252> {
    fn pack(value: PvpProgress) -> felt252 {
        let low: u128 = value.attacks.into()
            + value.stars.into() * TWO_POW_16
            + value.wins.into() * TWO_POW_32
            + value.three_stars.into() * TWO_POW_48;
        word(low, value.claimed.into())
    }

    fn unpack(value: felt252) -> PvpProgress {
        let (low, high) = halves(value);
        PvpProgress {
            attacks: (low & MASK_16).try_into().unwrap(),
            stars: field(low, TWO_POW_16, MASK_16).try_into().unwrap(),
            wins: field(low, TWO_POW_32, MASK_16).try_into().unwrap(),
            three_stars: field(low, TWO_POW_48, MASK_16).try_into().unwrap(),
            claimed: high.try_into().unwrap(),
        }
    }
}

pub impl QuestCobblesPacking of starknet::storage_access::StorePacking<QuestCobbles, felt252> {
    fn pack(value: QuestCobbles) -> felt252 {
        let low: u128 = value.cobbles.into()
            + value.kind.into() * TWO_POW_8
            + value.task.into() * TWO_POW_16
            + value.total.into() * TWO_POW_48
            + value.interval.into() * TWO_POW_80;
        word(low, value.start.into())
    }

    fn unpack(value: felt252) -> QuestCobbles {
        let (low, high) = halves(value);
        QuestCobbles {
            cobbles: (low & MASK_8).try_into().unwrap(),
            kind: field(low, TWO_POW_8, MASK_8).try_into().unwrap(),
            task: field(low, TWO_POW_16, MASK_32).try_into().unwrap(),
            total: field(low, TWO_POW_48, MASK_32).try_into().unwrap(),
            start: high.try_into().unwrap(),
            interval: field(low, TWO_POW_80, MASK_32).try_into().unwrap(),
        }
    }
}

pub impl AchievementCobblesPacking of starknet::storage_access::StorePacking<
    AchievementCobbles, felt252,
> {
    fn pack(value: AchievementCobbles) -> felt252 {
        let low: u128 = value.cobbles.into()
            + value.task.into() * TWO_POW_8
            + value.total.into() * TWO_POW_40;
        low.into()
    }

    fn unpack(value: felt252) -> AchievementCobbles {
        let (low, _) = halves(value);
        AchievementCobbles {
            cobbles: (low & MASK_8).try_into().unwrap(),
            task: field(low, TWO_POW_8, MASK_32).try_into().unwrap(),
            total: field(low, TWO_POW_40, MASK_32).try_into().unwrap(),
        }
    }
}

pub impl PackPacking of starknet::storage_access::StorePacking<Pack, felt252> {
    fn pack(value: Pack) -> felt252 {
        let active: u128 = if value.active {
            TWO_POW_32
        } else {
            0
        };
        word(value.price, value.cobbles.into() + active)
    }

    fn unpack(value: felt252) -> Pack {
        let (low, high) = halves(value);
        Pack {
            cobbles: (high & MASK_32).try_into().unwrap(),
            price: low,
            active: high / TWO_POW_32 != 0,
        }
    }
}

/// The ids of a quest list (`quest_lists`, one slot per kind): up to `MAX_LISTED` non-zero ids,
/// `u16` each, from bit 0 of the low half (8) then of the high half (7); 0 is an empty place.
pub fn list_ids(value: felt252) -> Array<u32> {
    let (mut low, mut high) = halves(value);
    let mut ids: Array<u32> = array![];
    let mut i: u32 = 0;
    while i < MAX_LISTED {
        let id: u32 = if i < 8 {
            let id = low & MASK_16;
            low = low / TWO_POW_16;
            id.try_into().unwrap()
        } else {
            let id = high & MASK_16;
            high = high / TWO_POW_16;
            id.try_into().unwrap()
        };
        if id != 0 {
            ids.append(id);
        }
        i += 1;
    }
    ids
}

/// A quest list from its ids (at most `MAX_LISTED`, each at most `MAX_COBBLE_ID`).
pub fn list_word(ids: Span<u32>) -> felt252 {
    assert(ids.len() <= MAX_LISTED, 'Setup: list full');
    let mut low: u128 = 0;
    let mut high: u128 = 0;
    let mut unit_low: u128 = 1;
    let mut unit_high: u128 = 1;
    let mut i: u32 = 0;
    for id in ids {
        let id: u128 = (*id).into();
        if i < 8 {
            low += id * unit_low;
            if i < 7 {
                unit_low *= TWO_POW_16;
            }
        } else {
            high += id * unit_high;
            unit_high *= TWO_POW_16;
        }
        i += 1;
    }
    word(low, high)
}

/// `count + by`, saturating at `u16::MAX`.
#[inline(always)]
fn add_u16(count: u16, by: u32) -> u16 {
    let sum: u64 = count.into() + by.into();
    if sum > 0xffff {
        0xffff
    } else {
        sum.try_into().unwrap()
    }
}

/// `count + by`, saturating at `u32::MAX`.
#[inline(always)]
fn add_u32(count: u32, by: u32) -> u32 {
    let sum: u64 = count.into() + by.into();
    if sum > 0xffffffff {
        0xffffffff
    } else {
        sum.try_into().unwrap()
    }
}

/// Bit `id` of a claim bitmap (`id` 1 to `MAX_COBBLE_ID`).
pub fn bit(id: u32) -> u64 {
    let mut bit: u64 = 1;
    let mut i: u32 = 0;
    while i < id {
        bit *= 2;
        i += 1;
    }
    bit
}

#[generate_trait]
pub impl ProgressImpl of ProgressTrait {
    /// Adds the quest entries of a paid game over (tasks 1 to 4; any other is not summed).
    fn add(ref self: Progress, entries: Span<QuestProgress>) {
        for entry in entries {
            let count = *entry.count;
            match *entry.task_id {
                0 => {},
                1 => { self.games = add_u16(self.games, count); },
                2 => { self.structures = add_u16(self.structures, count); },
                3 => { self.points = add_u32(self.points, count); },
                4 => { self.forests = add_u16(self.forests, count); },
                _ => {},
            }
        }
    }

    /// The sum of a quest task (1 to 4) in this period; 0 for any other.
    fn count(self: @Progress, task: u32) -> u32 {
        match task {
            0 => 0,
            1 => (*self.games).into(),
            2 => (*self.structures).into(),
            3 => *self.points,
            4 => (*self.forests).into(),
            _ => 0,
        }
    }
}

#[generate_trait]
pub impl PvpProgressImpl of PvpProgressTrait {
    /// Adds a settlement of `stars` (0 to 3): an attack, its stars, a win, three stars.
    fn add(ref self: PvpProgress, stars: u8) {
        self.attacks = add_u16(self.attacks, 1);
        if stars != 0 {
            self.stars = add_u16(self.stars, stars.into());
            self.wins = add_u16(self.wins, 1);
        }
        if stars == 3 {
            self.three_stars = add_u16(self.three_stars, 1);
        }
    }

    /// The sum of a PvP task (19 to 22) in this period; 0 for any other.
    fn count(self: @PvpProgress, task: u32) -> u32 {
        if task == constants::TASK_PVP_ATTACK {
            (*self.attacks).into()
        } else if task == constants::TASK_PVP_STARS {
            (*self.stars).into()
        } else if task == constants::TASK_PVP_WIN {
            (*self.wins).into()
        } else if task == constants::TASK_PVP_THREE_STARS {
            (*self.three_stars).into()
        } else {
            0
        }
    }
}

#[generate_trait]
pub impl AccountImpl of AccountTrait {
    /// Adds the achievement entries of a game over to the lifetime counts (tasks 1, 4, 5, 6, 7).
    fn add(ref self: Account, entries: Span<AchievementProgress>) {
        for entry in entries {
            let count = *entry.count;
            match *entry.task_id {
                0 => {},
                1 => { self.games = add_u16(self.games, count); },
                2 | 3 => {},
                4 => { self.forests = add_u16(self.forests, count); },
                5 => { self.wonders = add_u16(self.wonders, count); },
                6 => { self.big = add_u16(self.big, count); },
                7 => { self.high = add_u16(self.high, count); },
                _ => {},
            }
        }
    }

    /// Adds `xp` to the XP, saturating at `MAX_XP`; returns the XP added.
    fn add_xp(ref self: Account, xp: u32) -> u32 {
        let room = MAX_XP - self.xp;
        let added = if xp > room {
            room
        } else {
            xp
        };
        self.xp += added;
        added
    }

    /// The lifetime count of an achievement task (1, 4, 5, 6 or 7); 0 for any other. Task 10 (the
    /// tutorial) is read from `tutorial_claims`, task 23 (the groups reached) from `league_groups`,
    /// by the claim.
    fn count(self: @Account, task: u32) -> u32 {
        match task {
            0 => 0,
            1 => (*self.games).into(),
            2 | 3 => 0,
            4 => (*self.forests).into(),
            5 => (*self.wonders).into(),
            6 => (*self.big).into(),
            7 => (*self.high).into(),
            _ => 0,
        }
    }
}

#[generate_trait]
pub impl QuestCobblesImpl of QuestCobblesTrait {
    /// The first second of `period` for a quest of this kind: the day `period` (daily) or the week
    /// `period` (weekly).
    fn period_start(self: @QuestCobbles, period: u64) -> u64 {
        if *self.kind == WEEKLY {
            WEEK_START + period * WEEK
        } else {
            period * DAY
        }
    }

    /// Whether the copied schedule is active at `time`: quiver's `ScheduleTrait::is_active` with
    /// the kind's duration and no end.
    fn is_active(self: @QuestCobbles, time: u64) -> bool {
        let start = *self.start;
        if time < start || *self.interval == 0 {
            return false;
        }
        let duration = if *self.kind == WEEKLY {
            WEEK
        } else {
            DAY
        };
        (time - start) % (*self.interval).into() < duration
    }
}

/// The kind of a quest's schedule that can carry cobbles, or 0 when it is neither shape (cobbles
/// v1, 3.2): daily, a day in every whole number of days from 00:00 UTC; weekly, every week from a
/// Monday 00:00 UTC. A quest with an end is neither.
pub fn schedule_kind(schedule: QuestSchedule) -> u8 {
    if schedule.end != 0 {
        return 0;
    }
    let duration: u64 = schedule.duration.into();
    let interval: u64 = schedule.interval.into();
    if duration == DAY && interval != 0 && interval % DAY == 0 && schedule.start % DAY == 0 {
        return DAILY;
    }
    if duration == WEEK && interval == WEEK && schedule.start % WEEK == WEEK_START {
        return WEEKLY;
    }
    0
}

/// The week of `time`, `None` before week 0.
pub fn week_of(time: u64) -> Option<u64> {
    if time < WEEK_START {
        Option::None
    } else {
        Option::Some((time - WEEK_START) / WEEK)
    }
}

#[starknet::interface]
pub trait ISetup<TContractState> {
    /// The definitions of the quests and of the achievements: owner only. A definition is created
    /// once and cannot be edited; a retired id cannot be defined again (`quiver_quest` and
    /// `quiver_achievement` rules).
    fn define_quest(
        ref self: TContractState,
        quest_id: u32,
        schedule: QuestSchedule,
        tasks: Span<QuestTask>,
        conditions: Span<u32>,
    );
    fn retire_quest(ref self: TContractState, quest_id: u32);
    fn define_achievement(
        ref self: TContractState,
        achievement_id: u32,
        window: AchievementWindow,
        tasks: Span<AchievementTask>,
        points: u16,
    );
    fn retire_achievement(ref self: TContractState, achievement_id: u32);
    /// Allows or revokes a reporter, in both components: owner only. Emits `QuestReporterSet` and
    /// `AchievementReporterSet`.
    fn set_reporter(ref self: TContractState, reporter: ContractAddress, allowed: bool);
    /// The progress of `player_id`, from an allowlisted reporter only (`'Quest: not reporter'`
    /// otherwise): one `QuestProgressed` per quest entry and one `AchievementProgressed` per
    /// achievement entry (quiver merges repeated task ids).
    fn report(
        ref self: TContractState,
        player_id: felt252,
        quests: Span<QuestProgress>,
        achievements: Span<AchievementProgress>,
    );
    /// The caller's claim of the tutorial achievement (task 10, First Stone): the first call emits
    /// `AchievementProgressed { player_id: caller, task_id: 10, count: 1 }`; any later call does
    /// nothing and does not revert.
    fn claim_tutorial(ref self: TContractState);
    fn is_reporter(self: @TContractState, reporter: ContractAddress) -> bool;
    fn tutorial_claimed(self: @TContractState, player_id: felt252) -> bool;
    /// Sets the `Economy` that `Challenge` pays into, once: the owner only, never zero. Emits
    /// `EconomySet`.
    fn set_economy(ref self: TContractState, economy: ContractAddress);
    /// Sets the `Collection` that `Challenge` mints the games to, once: the owner only, never zero.
    /// Emits `CollectionSet`.
    fn set_collection(ref self: TContractState, collection: ContractAddress);
    /// The wiring, in one call (P-53 ruling 2): `Challenge` reads it at spawn and at game over.
    fn wiring(self: @TContractState) -> Wiring;
}

/// Cobbles v1, part 1 (P-61, `docs/architecture/cobbles-v1.md`): the owner sets the cobbles of a
/// quest or an achievement; the player claims them, and the free-game credit of a day's or a week's
/// quests, for itself, from the ledger the reports write; `Challenge` spends a credit for a free
/// game.
#[starknet::interface]
pub trait ISetupCobbles<TContractState> {
    /// Sets the cobbles of a defined, live quest, owner only: 5 to 15, or 0 to remove them. The
    /// quest must have one task, of task 1 to 4, and a daily or weekly schedule (`schedule_kind`);
    /// its schedule and task are copied, and the id joins its kind's list (at most 15). Emits
    /// `QuestCobblesSet`.
    fn set_quest_cobbles(ref self: TContractState, quest_id: u32, cobbles: u8);
    /// Sets the cobbles of a defined, live achievement, owner only: 10 to 90, or 0 to remove them.
    /// The achievement must have one task, of task 1, 4, 5, 6, 7 or 10, a total of at most 65,535
    /// and no window. Emits `AchievementCobblesSet`.
    fn set_achievement_cobbles(ref self: TContractState, achievement_id: u32, cobbles: u8);
    /// The caller claims the cobbles of a quest for `period`, its day number (daily) or week number
    /// (weekly), once: the quest is live in that period and the period's sum of its task reaches
    /// its total. Emits `CobblesClaimed`.
    fn claim_quest(ref self: TContractState, quest_id: u32, period: u64);
    /// The caller claims the cobbles of an achievement, once: its lifetime count reaches the total
    /// (task 10: the tutorial is claimed). Emits `CobblesClaimed`.
    fn claim_achievement(ref self: TContractState, achievement_id: u32);
    /// The caller claims the free-game credit of `day`, once: every daily quest with cobbles live
    /// that day is completed, and at least one is live. Emits `CreditClaimed`.
    fn claim_daily_credit(ref self: TContractState, day: u64);
    /// The same for the weekly quests and `week`.
    fn claim_weekly_credit(ref self: TContractState, week: u64);
    /// Spends one credit of `player_id` for the free game `game_id`: an allowlisted reporter only
    /// (`'Quest: not reporter'`), `'Setup: no credit'` without one. Emits `CreditSpent`.
    fn spend_credit(ref self: TContractState, player_id: felt252, game_id: u32);
    fn account(self: @TContractState, player_id: felt252) -> Account;
    fn day_progress(self: @TContractState, player_id: felt252, day: u64) -> Progress;
    fn week_progress(self: @TContractState, player_id: felt252, week: u64) -> Progress;
    fn quest_cobbles(self: @TContractState, quest_id: u32) -> QuestCobbles;
    fn achievement_cobbles(self: @TContractState, achievement_id: u32) -> AchievementCobbles;
}

/// Cobbles v1, part 2 (P-61, `docs/architecture/cobbles-v1.md`, 2): the packs of cobbles, set by
/// the owner and bought by the player for itself at the game's split.
#[starknet::interface]
pub trait ISetupPacks<TContractState> {
    /// Sets a pack, owner only: `pack_id` 1 to 8, `cobbles` and `price` (USDC base units) non-zero;
    /// `active` false stops its sales. Emits `PackSet`.
    fn set_pack(ref self: TContractState, pack_id: u8, cobbles: u32, price: u128, active: bool);
    /// The caller buys an active pack for itself: its cobbles are credited, its price moves from
    /// the caller to `Economy` (the caller approves `Setup` on USDC first), and `Economy.sell` runs
    /// the game's split with `referrer` (ignored when it is `Economy`, `Setup` or any address the
    /// game ignores) and `min_out`. Emits `PackBought`.
    fn buy_pack(ref self: TContractState, pack_id: u8, referrer: ContractAddress, min_out: u256);
    fn pack(self: @TContractState, pack_id: u8) -> Pack;
}

/// Story mode (#548, `docs/architecture/story-mode.md`): the cobbles of the stars of a level, paid
/// from this ledger for the `Story` system, an allowlisted reporter.
#[starknet::interface]
pub trait ISetupStory<TContractState> {
    /// Credits `player_id` the cobbles of the stars `paid + 1` to `stars` of a Story level
    /// (`paid` < `stars` <= 3): star `k` is worth `k x STAR_COBBLES` (5, 10, 15). An allowlisted
    /// reporter only (`'Quest: not reporter'`); it trusts the reporter for whom and for which
    /// stars (`Story` pays a star once: the best stars it keeps). Emits one `CobblesClaimed` per
    /// star (`kind` 3, `id` `(campaign_id << 8) | level_id`, `period` the star); returns the sum.
    fn credit_story(
        ref self: TContractState,
        player_id: felt252,
        campaign_id: u8,
        level_id: u8,
        paid: u8,
        stars: u8,
    ) -> u32;
}

/// Leagues and seasons (#644, `docs/architecture/leagues.md`): the cobbles of a season's end, paid
/// from this ledger for `Matchmaker`, an allowlisted reporter, and the groups a player has reached
/// in a lifetime, the lifetime league missions (#917).
#[starknet::interface]
pub trait ISetupLeague<TContractState> {
    /// Credits `player_id` `cobbles` (not 0) for `league` in `season`: `kind` `CLAIM_SEASON` (a
    /// season's reward; `CLAIM_LEAGUE` is retired, #917). An allowlisted reporter only
    /// (`'Quest: not reporter'`); it trusts the reporter for whom, which and how much (`Matchmaker`
    /// pays each once: its league records). Emits `CobblesClaimed` (`id` the league, `period` the
    /// season); returns the balance after it.
    fn credit_league(
        ref self: TContractState,
        player_id: felt252,
        kind: u8,
        league: u8,
        season: u32,
        cobbles: u8,
    ) -> u64;
    /// The PvP missions' progress of `player_id`'s attack settled with `stars` (0 to 3), from an
    /// allowlisted reporter only (`Matchmaker`): the PvP day and week sums (`PvpProgress`), and
    /// quiver's `QuestProgressed` for tasks 19 to 22 (the entries that count).
    fn report_pvp(ref self: TContractState, player_id: felt252, stars: u8);
    /// `player_id` reached `league` in a settlement (#917), from an allowlisted reporter only
    /// (`Matchmaker`): when its group (`groups_of`) passes the most the player has reached in a
    /// lifetime, that count rises to it, with quiver's `AchievementProgressed` for task 23 by the
    /// difference. A group reached again (a later season) changes nothing.
    fn report_league(ref self: TContractState, player_id: felt252, league: u8);
    /// The most groups `player_id` has reached in a lifetime, 0 (none) to 8 (Grand Master).
    fn league_groups(self: @TContractState, player_id: felt252) -> u8;
    /// A player's PvP day (`DAILY`) or week (`WEEKLY`) `period`.
    fn pvp_progress(
        self: @TContractState, player_id: felt252, kind: u8, period: u64,
    ) -> PvpProgress;
}

/// Whether `task` is one of the PvP tasks a settlement reports (19 to 22, #644).
pub fn is_pvp_task(task: u32) -> bool {
    task >= constants::TASK_PVP_ATTACK && task <= constants::TASK_PVP_THREE_STARS
}

/// The player's XP and level (#641, `docs/architecture/xp-level.md`): credited by the allowlisted
/// reporters only (a Challenge game over by `report`, a Story star by `credit_story`, PvP by
/// `credit_xp`); the level is computed from the XP (`level_of`), never stored.
#[starknet::interface]
pub trait ISetupLevel<TContractState> {
    /// Credits `player_id` `xp` XP (1 to `MAX_CREDIT_XP`) for `source`, `XP_ATTACK` or
    /// `XP_DEFENCE`: an allowlisted reporter only (`'Quest: not reporter'`), which it trusts for
    /// whom and how much. Emits `XpGained` (with the XP added, 0 at the ceiling).
    fn credit_xp(ref self: TContractState, player_id: felt252, source: u8, xp: u32);
    /// The XP and level of a player; level 1 at 0 XP.
    fn player_level(self: @TContractState, player_id: felt252) -> PlayerLevel;
}

/// Cobbles v1, part 3 (P-61, `docs/architecture/cobbles-v1.md`, 5): the skins of the tile plans,
/// priced by the owner, bought with cobbles by the player for itself, and the set the player shows.
#[starknet::interface]
pub trait ISetupSkins<TContractState> {
    /// Prices the skin of `plan` (1 to 19) in `theme` (1 to 255), owner only: 50 to 100 cobbles, or
    /// 0 to withdraw it from sale (what is owned stays owned). Emits `SkinPriced`.
    fn set_skin_price(ref self: TContractState, theme: u8, plan: u8, cobbles: u8);
    /// The caller buys the skin of `plan` in `theme` for itself, once, for its price in cobbles.
    /// Buying does not activate it. Emits `SkinBought`.
    fn buy_skin(ref self: TContractState, theme: u8, plan: u8);
    /// The caller sets the active theme of each `(plan, theme)` it names: theme 0 (the default)
    /// always, any other only if it owns that skin. One write for the whole batch, the last
    /// change of a plan winning. Emits `SkinsActivated`.
    fn set_skins(ref self: TContractState, changes: Span<(u8, u8)>);
    /// The price in cobbles of a skin; 0: not for sale.
    fn skin_price(self: @TContractState, theme: u8, plan: u8) -> u8;
    /// The skins a player owns in a theme: bit `p` is the skin of plan `p`.
    fn skins(self: @TContractState, player_id: felt252, theme: u8) -> u32;
    /// The theme active for each plan of a player: 19 ids, plan 1 first; 0 the default theme.
    fn active_skins(self: @TContractState, player_id: felt252) -> Array<u8>;
    /// Reserves the skin of `plan` in `theme` to the players whose tier of that plan
    /// (`Rewards.tier`, #642) is at least `min_tier`, owner only; 0 reserves nothing. Emits
    /// `SkinTierSet`.
    fn set_skin_tier(ref self: TContractState, theme: u8, plan: u8, min_tier: u8);
    /// The tier a skin needs; 0: none.
    fn skin_tier(self: @TContractState, theme: u8, plan: u8) -> u8;
}

/// The village rewards (#642, `docs/architecture/village-rewards.md`): the `Rewards` a game's end
/// grants a reward on (`report`, `credit_story` and `report_pvp`, by the rule A constants of
/// `paved::systems::rewards`), and the Cobbles a reward taken as Cobbles credits.
#[starknet::interface]
pub trait ISetupRewards<TContractState> {
    /// Sets the `Rewards` granted on, owner only; zero grants nothing. `Rewards` must allow `Setup`
    /// as a granter first, or a game's end reverts. Emits `RewardsSet`.
    fn set_rewards(ref self: TContractState, rewards: ContractAddress);
    fn rewards(self: @TContractState) -> ContractAddress;
    /// Credits `player_id` `cobbles` (not 0) for its reward `index` taken as Cobbles: an
    /// allowlisted reporter only (`Rewards`), which it trusts for whom, which and how much. Emits
    /// `CobblesClaimed` (kind `CLAIM_REWARD`); returns the balance after it.
    fn credit_reward(ref self: TContractState, player_id: felt252, index: u32, cobbles: u8) -> u64;
}

/// The Cobbles another system spends for a player (#639: the matchmaker's "Next"): an allowlist of
/// spenders the owner sets, separate from the reporters (a spender can only lower a balance).
#[starknet::interface]
pub trait ISetupSpend<TContractState> {
    /// Allows or revokes a spender, owner only. Emits `SpenderSet`.
    fn set_spender(ref self: TContractState, spender: ContractAddress, allowed: bool);
    fn is_spender(self: @TContractState, spender: ContractAddress) -> bool;
    /// Spends `cobbles` (not 0) of `player_id`'s balance for `reason`, an allowlisted spender only;
    /// reverts if the balance is short. It trusts the spender for whom (the matchmaker spends only
    /// for the caller of its own entry point). Emits `CobblesSpent`; returns the balance after it.
    fn spend_cobbles(
        ref self: TContractState, player_id: felt252, cobbles: u32, reason: felt252,
    ) -> u64;
}

#[starknet::contract]
pub mod Setup {
    // Imports

    use core::num::traits::Zero;
    use openzeppelin_interfaces::upgrades::IUpgradeable;
    use openzeppelin_upgrades::UpgradeableComponent;
    use paved::components::ownable::OwnableComponent;
    use paved::components::payable::{IERC20Dispatcher, IERC20DispatcherTrait};
    use paved::constants;
    use paved::matchmaker::leagues::{LEAGUE_GROUPS, groups_of};
    use paved::systems::economy::{IEconomyDispatcher, IEconomyDispatcherTrait};
    use paved::systems::rewards::{
        GRANTS_CHALLENGE, GRANTS_PVP, GRANTS_STORY, IRewardsDispatcher, IRewardsDispatcherTrait,
        SOURCE_CHALLENGE, SOURCE_PVP, SOURCE_STORY,
    };
    use quiver_achievement::component::AchievementComponent;
    use quiver_quest::component::QuestComponent;
    use quiver_quest::types::mode::Mode as QuestMode;
    use starknet::storage::{
        Map, StorageMapReadAccess, StorageMapWriteAccess, StoragePointerReadAccess,
        StoragePointerWriteAccess,
    };
    use starknet::{
        ClassHash, ContractAddress, get_block_timestamp, get_caller_address, get_contract_address,
    };

    // Local imports

    use super::{
        ACHIEVEMENT_COBBLES_MAX, ACHIEVEMENT_COBBLES_MIN, Account, AccountTrait, AchievementCobbles,
        AchievementProgress, AchievementTask, AchievementWindow, CLAIM_ACHIEVEMENT, CLAIM_QUEST,
        CLAIM_REWARD, CLAIM_SEASON, CLAIM_STORY, DAILY, DAY, ISetup, ISetupCobbles, ISetupLeague,
        ISetupLevel, ISetupPacks, ISetupRewards, ISetupSkins, ISetupSpend, ISetupStory,
        MAX_ACHIEVEMENT_TOTAL, MAX_COBBLE_ID, MAX_CREDIT_XP, MAX_PACK_ID, MAX_QUEST_TOTAL, PLANS,
        Pack, PlayerLevel, Progress, ProgressTrait, PvpProgress, PvpProgressTrait,
        QUEST_COBBLES_MAX, QUEST_COBBLES_MIN, QuestCobbles, QuestCobblesTrait, QuestProgress,
        QuestSchedule, QuestTask, SKIN_PRICE_MAX, SKIN_PRICE_MIN, STAR_COBBLES, STAR_XP, WEEKLY,
        Wiring, XP_ATTACK, XP_CHALLENGE, XP_DEFENCE, XP_STORY, active_themes, bit, is_pvp_task,
        level_floor, level_of, list_ids, list_word, report_xp, schedule_kind, week_of,
    };

    // Errors

    pub mod errors {
        pub const MISALIGNED_QUEST: felt252 = 'Setup: quest not on UTC day';
        pub const TASK_TOTAL_ZERO: felt252 = 'Setup: task total is zero';
        pub const TASK_REPEATED: felt252 = 'Setup: task id repeated';
        pub const ECONOMY_SET: felt252 = 'Setup: economy already set';
        pub const ZERO_ECONOMY: felt252 = 'Setup: economy is zero';
        pub const COLLECTION_SET: felt252 = 'Setup: collection already set';
        pub const ZERO_COLLECTION: felt252 = 'Setup: collection is zero';
        pub const INVALID_ID: felt252 = 'Setup: invalid id';
        pub const INVALID_COBBLES: felt252 = 'Setup: invalid cobbles';
        pub const RETIRED: felt252 = 'Setup: retired';
        pub const ONE_TASK: felt252 = 'Setup: not one task';
        pub const TASK_NOT_COUNTED: felt252 = 'Setup: task not counted';
        pub const INVALID_SCHEDULE: felt252 = 'Setup: invalid schedule';
        pub const TOTAL_TOO_HIGH: felt252 = 'Setup: total too high';
        pub const WINDOWED: felt252 = 'Setup: achievement windowed';
        pub const NO_COBBLES: felt252 = 'Setup: no cobbles';
        pub const NOT_LIVE: felt252 = 'Setup: not live';
        pub const NOT_COMPLETED: felt252 = 'Setup: not completed';
        pub const CLAIMED: felt252 = 'Setup: claimed';
        pub const NO_LIVE_QUEST: felt252 = 'Setup: no live quest';
        pub const CREDIT_CLAIMED: felt252 = 'Setup: credit claimed';
        pub const NO_CREDIT: felt252 = 'Setup: no credit';
        pub const CONDITIONED: felt252 = 'Setup: quest has conditions';
        pub const INVALID_PACK: felt252 = 'Setup: invalid pack';
        pub const NOT_ON_SALE: felt252 = 'Setup: pack not on sale';
        pub const NO_ECONOMY: felt252 = 'Setup: economy not set';
        pub const PAY_FAILED: felt252 = 'Setup: payment failed';
        pub const INVALID_SKIN: felt252 = 'Setup: invalid skin';
        pub const SKIN_NOT_FOR_SALE: felt252 = 'Setup: skin not for sale';
        pub const SKIN_OWNED: felt252 = 'Setup: skin owned';
        pub const NOT_ENOUGH_COBBLES: felt252 = 'Setup: not enough cobbles';
        pub const INVALID_STARS: felt252 = 'Setup: invalid stars';
        pub const SKIN_NOT_OWNED: felt252 = 'Setup: skin not owned';
        pub const INVALID_XP_SOURCE: felt252 = 'Setup: invalid xp source';
        pub const INVALID_XP: felt252 = 'Setup: invalid xp';
        pub const NOT_SPENDER: felt252 = 'Setup: not spender';
        pub const INVALID_KIND: felt252 = 'Setup: invalid kind';
        pub const TIER_TOO_LOW: felt252 = 'Setup: tier too low';
    }

    // Components

    component!(path: OwnableComponent, storage: ownable, event: OwnableEvent);
    #[abi(embed_v0)]
    impl OwnableImpl = OwnableComponent::OwnableImpl<ContractState>;
    impl OwnableInternalImpl = OwnableComponent::InternalImpl<ContractState>;
    component!(path: UpgradeableComponent, storage: upgradeable, event: UpgradeableEvent);
    impl UpgradeableInternalImpl = UpgradeableComponent::InternalImpl<ContractState>;
    // [Info] Quests and achievements (docs/architecture/quests.md): event mode, the internal layer
    // only, no view. The indexer reads the definitions from `QuestDefined` and
    // `AchievementDefined`: TrackAll.
    component!(path: QuestComponent, storage: quest, event: QuestEvent);
    impl QuestInternalImpl = QuestComponent::InternalImpl<ContractState>;
    impl QuestTracking = quiver_quest::store::tracking::TrackAll<ContractState>;
    component!(path: AchievementComponent, storage: achievement, event: AchievementEvent);
    impl AchievementInternalImpl = AchievementComponent::InternalImpl<ContractState>;
    impl AchievementTracking = quiver_achievement::store::tracking::TrackAll<ContractState>;

    // The external layers are not embedded; were one embedded, its admin would be the owner
    impl QuestHooks of QuestComponent::QuestHooksTrait<ContractState> {
        fn authorize_admin(
            self: @QuestComponent::ComponentState<ContractState>, caller: ContractAddress,
        ) -> bool {
            caller == self.get_contract().ownable.owner.read()
        }
        fn authorize_player(
            self: @QuestComponent::ComponentState<ContractState>,
            caller: ContractAddress,
            player_id: felt252,
        ) -> bool {
            false
        }
        fn on_quest_complete(
            ref self: QuestComponent::ComponentState<ContractState>,
            player_id: felt252,
            quest_id: u32,
            interval_id: u64,
            completions: u64,
        ) {}
        fn on_quest_claim(
            ref self: QuestComponent::ComponentState<ContractState>,
            player_id: felt252,
            quest_id: u32,
            interval_id: u64,
            claim_index: u64,
        ) {}
    }

    impl AchievementHooks of AchievementComponent::AchievementHooksTrait<ContractState> {
        fn authorize_admin(
            self: @AchievementComponent::ComponentState<ContractState>, caller: ContractAddress,
        ) -> bool {
            caller == self.get_contract().ownable.owner.read()
        }
    }

    // Storage

    #[storage]
    struct Storage {
        #[substorage(v0)]
        ownable: OwnableComponent::Storage,
        #[substorage(v0)]
        upgradeable: UpgradeableComponent::Storage,
        #[substorage(v0)]
        quest: QuestComponent::Storage,
        #[substorage(v0)]
        achievement: AchievementComponent::Storage,
        /// Whether a player has claimed the tutorial achievement (one slot per player).
        tutorial_claims: Map<felt252, bool>,
        /// The `Economy` of the paid Challenge games; written once by the owner (step E).
        economy: ContractAddress,
        /// The `Collection` of the game NFTs; written once by the owner (step E).
        collection: ContractAddress,
        /// Cobbles v1 (P-61, appended, P-42). A player's cobbles, credits, lifetime counts and
        /// claimed achievements (`super::Account`); written by `report`, the claims and
        /// `spend_credit`.
        accounts: Map<felt252, Account>,
        /// The sums of a player's paid game overs per day number, its claimed quests and credit
        /// (`super::Progress`); written by `report`, `claim_quest` and `claim_daily_credit`.
        days: Map<(felt252, u64), Progress>,
        /// The same per week number (`super::week_of`); written by `report`, `claim_quest` and
        /// `claim_weekly_credit`.
        weeks: Map<(felt252, u64), Progress>,
        /// The cobbles of a quest, with its schedule and task copied (`super::QuestCobbles`);
        /// written by `set_quest_cobbles` and `retire_quest`.
        quest_cobbles: Map<u32, QuestCobbles>,
        /// The quests with cobbles of each kind (`DAILY`, `WEEKLY`): up to 15 ids in one slot
        /// (`super::list_ids`); written by `set_quest_cobbles` and `retire_quest`.
        quest_lists: Map<u8, felt252>,
        /// The cobbles of an achievement, with its task copied (`super::AchievementCobbles`);
        /// written by `set_achievement_cobbles` and `retire_achievement`.
        achievement_cobbles: Map<u32, AchievementCobbles>,
        /// Cobbles v1, part 2 (appended, P-42). The packs (`super::Pack`); written by `set_pack`.
        packs: Map<u8, Pack>,
        /// Cobbles v1, part 3 (appended, P-42). The price in cobbles of the skin of a plan in a
        /// theme, key `(theme, plan)`; 0: not for sale; written by `set_skin_price`.
        skin_prices: Map<(u8, u8), u8>,
        /// The skins a player owns in a theme, key `(player_id, theme)`: bit `p` is the skin of
        /// plan `p` (1 to 19); written by `buy_skin`.
        skins: Map<(felt252, u8), u32>,
        /// The theme active for each plan of a player (`super::active_word`); written by
        /// `set_skins`.
        active_skins: Map<felt252, felt252>,
        /// #639 (appended, P-42). The systems allowed to spend a player's cobbles
        /// (`ISetupSpend`); written by `set_spender`.
        spenders: Map<ContractAddress, bool>,
        /// #644 (appended, P-42). The sums of a player's PvP settlements per day number, and its
        /// claimed PvP missions (`super::PvpProgress`); written by `report_pvp` and `claim_quest`.
        pvp_days: Map<(felt252, u64), PvpProgress>,
        /// The same per week number (`super::week_of`).
        pvp_weeks: Map<(felt252, u64), PvpProgress>,
        /// #642 (appended, P-42). The `Rewards` a game's end grants on; zero: none (`set_rewards`).
        rewards: ContractAddress,
        /// The tier a skin needs, key `(theme, plan)`; 0: none; written by `set_skin_tier`.
        skin_tiers: Map<(u8, u8), u8>,
        /// #917 (appended, P-42). The most groups a player has reached in a lifetime, 0 to 8: the
        /// count of task 23, the lifetime league missions; written by `report_league`.
        league_groups: Map<felt252, u8>,
    }

    // Events

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        #[flat]
        OwnableEvent: OwnableComponent::Event,
        #[flat]
        UpgradeableEvent: UpgradeableComponent::Event,
        #[flat]
        QuestEvent: QuestComponent::Event,
        #[flat]
        AchievementEvent: AchievementComponent::Event,
        EconomySet: EconomySet,
        CollectionSet: CollectionSet,
        QuestCobblesSet: QuestCobblesSet,
        AchievementCobblesSet: AchievementCobblesSet,
        CobblesClaimed: CobblesClaimed,
        CreditClaimed: CreditClaimed,
        CreditSpent: CreditSpent,
        PackSet: PackSet,
        PackBought: PackBought,
        SkinPriced: SkinPriced,
        SkinBought: SkinBought,
        SkinsActivated: SkinsActivated,
        XpGained: XpGained,
        SpenderSet: SpenderSet,
        CobblesSpent: CobblesSpent,
        RewardsSet: RewardsSet,
        SkinTierSet: SkinTierSet,
    }

    /// The `Rewards` a game's end grants on (#642); zero: none.
    #[derive(Drop, Debug, PartialEq, starknet::Event)]
    pub struct RewardsSet {
        pub rewards: ContractAddress,
    }

    /// The tier a skin needs, set by the owner (#642; 0: none).
    #[derive(Drop, Debug, PartialEq, starknet::Event)]
    pub struct SkinTierSet {
        #[key]
        pub theme: u8,
        #[key]
        pub plan: u8,
        pub min_tier: u8,
    }

    /// The names and fields `Account` emitted before step E.
    #[derive(Drop, Debug, PartialEq, starknet::Event)]
    pub struct EconomySet {
        pub economy: ContractAddress,
    }

    #[derive(Drop, Debug, PartialEq, starknet::Event)]
    pub struct CollectionSet {
        pub collection: ContractAddress,
    }

    /// The cobbles of a quest set by the owner, or removed (`cobbles` 0, also on `retire_quest`);
    /// `kind`
    /// 1 daily, 2 weekly (0 when removed from a quest that had none).
    #[derive(Drop, Debug, PartialEq, starknet::Event)]
    pub struct QuestCobblesSet {
        #[key]
        pub quest_id: u32,
        pub cobbles: u8,
        pub kind: u8,
    }

    /// The cobbles of an achievement set by the owner, or removed (`cobbles` 0, also on
    /// `retire_achievement`).
    #[derive(Drop, Debug, PartialEq, starknet::Event)]
    pub struct AchievementCobblesSet {
        #[key]
        pub achievement_id: u32,
        pub cobbles: u8,
    }

    /// A player's claim of cobbles: `kind` 1 a quest (`period`: its day or week number), 2 an
    /// achievement (`period` 0), 3 a star of a Story level (`id` `(campaign_id << 8) | level_id`,
    /// `period` the star, 1 to 3), 4 a league's bonus and 5 a season's reward (#644: `id` the
    /// league, `period` the season), 6 a village reward taken as Cobbles (#642: `id` 0, `period`
    /// the reward's index); `balance`, the player's cobbles after it.
    #[derive(Drop, Debug, PartialEq, starknet::Event)]
    pub struct CobblesClaimed {
        #[key]
        pub player_id: felt252,
        pub kind: u8,
        pub id: u32,
        pub period: u64,
        pub cobbles: u8,
        pub balance: u64,
    }

    /// A player's claim of a free-game credit: `kind` 1 a day, 2 a week; `credits`, the player's
    /// credits after it.
    #[derive(Drop, Debug, PartialEq, starknet::Event)]
    pub struct CreditClaimed {
        #[key]
        pub player_id: felt252,
        pub kind: u8,
        pub period: u64,
        pub credits: u16,
    }

    /// A credit spent on the free game `game_id`; `credits`, the player's credits after it.
    #[derive(Drop, Debug, PartialEq, starknet::Event)]
    pub struct CreditSpent {
        #[key]
        pub player_id: felt252,
        pub game_id: u32,
        pub credits: u16,
    }

    /// A pack set by the owner (`active` false: not on sale).
    #[derive(Drop, Debug, PartialEq, starknet::Event)]
    pub struct PackSet {
        #[key]
        pub pack_id: u8,
        pub cobbles: u32,
        pub price: u128,
        pub active: bool,
    }

    /// A pack bought by the player for itself: `price` in USDC base units, `referrer` the one that
    /// counted (zero when none did), `balance` the player's cobbles after it. `Economy` emits
    /// `Sold`
    /// in the same transaction.
    #[derive(Drop, Debug, PartialEq, starknet::Event)]
    pub struct PackBought {
        #[key]
        pub player_id: felt252,
        pub pack_id: u8,
        pub cobbles: u32,
        pub price: u128,
        pub referrer: ContractAddress,
        pub balance: u64,
    }

    /// The price of a skin set by the owner (`cobbles` 0: withdrawn from sale).
    #[derive(Drop, Debug, PartialEq, starknet::Event)]
    pub struct SkinPriced {
        #[key]
        pub theme: u8,
        #[key]
        pub plan: u8,
        pub cobbles: u8,
    }

    /// A skin bought by the player for itself: `cobbles` its price, `balance` the player's cobbles
    /// after it.
    #[derive(Drop, Debug, PartialEq, starknet::Event)]
    pub struct SkinBought {
        #[key]
        pub player_id: felt252,
        pub theme: u8,
        pub plan: u8,
        pub cobbles: u8,
        pub balance: u64,
    }

    #[derive(Drop, Debug, PartialEq, starknet::Event)]
    pub struct SpenderSet {
        #[key]
        pub spender: ContractAddress,
        pub allowed: bool,
    }

    /// Cobbles spent for the player by an allowlisted spender, for `reason` (`'MATCH_NEXT'`: the
    /// matchmaker's "Next"); `balance` the player's cobbles after it.
    #[derive(Drop, Debug, PartialEq, starknet::Event)]
    pub struct CobblesSpent {
        #[key]
        pub player_id: felt252,
        pub spender: ContractAddress,
        pub reason: felt252,
        pub cobbles: u32,
        pub balance: u64,
    }

    /// The player's active skins after a `set_skins`: the whole packed word
    /// (`super::active_word`, the theme of plan `p` in byte `p - 1`).
    #[derive(Drop, Debug, PartialEq, starknet::Event)]
    pub struct SkinsActivated {
        #[key]
        pub player_id: felt252,
        pub active: felt252,
    }

    /// XP credited to a player (#641): `source` 1 a Challenge game over, 2 Story stars (one event
    /// per `credit_story`), 3 a PvP attack, 4 a PvP defence; `xp` the XP added (0 at the
    /// ceiling), `total` and `level` the player's after it.
    #[derive(Drop, Debug, PartialEq, starknet::Event)]
    pub struct XpGained {
        #[key]
        pub player_id: felt252,
        pub source: u8,
        pub xp: u32,
        pub total: u32,
        pub level: u16,
    }

    // Constructor

    #[constructor]
    fn constructor(ref self: ContractState, owner: ContractAddress) {
        self.ownable.initialize(owner);
    }

    // Implementations

    #[abi(embed_v0)]
    impl SetupImpl of ISetup<ContractState> {
        fn define_quest(
            ref self: ContractState,
            quest_id: u32,
            schedule: QuestSchedule,
            tasks: Span<QuestTask>,
            conditions: Span<u32>,
        ) {
            // [Check] Caller is the owner
            self.ownable.assert_only_owner();
            // [Check] A recurring quest rolls over at 00:00 UTC, where the day id does
            if schedule.interval != 0 {
                assert(schedule.start % 86400 == 0, errors::MISALIGNED_QUEST);
            }
            // [Check] Every task total is positive and every task id appears once
            let mut totals: Array<(u32, u32)> = array![];
            for task in tasks {
                totals.append((*task.task_id, *task.total));
            }
            assert_tasks(totals.span());
            // [Effect] Define the quest
            self.quest.define(quest_id, schedule, tasks, conditions);
        }

        fn retire_quest(ref self: ContractState, quest_id: u32) {
            self.ownable.assert_only_owner();
            self.quest.retire(quest_id);
            // [Effect] A retired quest has no cobbles (cobbles v1, 3.2)
            if self.quest_cobbles.read(quest_id).cobbles != 0 {
                self.clear_quest_cobbles(quest_id);
            }
        }

        fn define_achievement(
            ref self: ContractState,
            achievement_id: u32,
            window: AchievementWindow,
            tasks: Span<AchievementTask>,
            points: u16,
        ) {
            self.ownable.assert_only_owner();
            // [Check] Every task total is positive and every task id appears once
            let mut totals: Array<(u32, u32)> = array![];
            for task in tasks {
                totals.append((*task.task_id, *task.total));
            }
            assert_tasks(totals.span());
            self.achievement.define(achievement_id, window, tasks, points);
        }

        fn retire_achievement(ref self: ContractState, achievement_id: u32) {
            self.ownable.assert_only_owner();
            self.achievement.retire(achievement_id);
            // [Effect] A retired achievement has no cobbles (cobbles v1, 3.2)
            if self.achievement_cobbles.read(achievement_id).cobbles != 0 {
                self.achievement_cobbles.write(achievement_id, Default::default());
                self.emit(AchievementCobblesSet { achievement_id, cobbles: 0 });
            }
        }

        fn set_reporter(ref self: ContractState, reporter: ContractAddress, allowed: bool) {
            // [Check] Caller is the owner
            self.ownable.assert_only_owner();
            // [Effect] The same allowlist in both components
            self.quest.set_reporter(reporter, allowed);
            self.achievement.set_reporter(reporter, allowed);
        }

        fn report(
            ref self: ContractState,
            player_id: felt252,
            quests: Span<QuestProgress>,
            achievements: Span<AchievementProgress>,
        ) {
            // [Check] Caller is a reporter. `set_reporter` is the only writer of both components'
            // allowlists and writes them together, so the quests' one stands for both (one read)
            self.quest.assert_reporter(get_caller_address());
            // [Effect] The progress, for the player the reporter names
            self.quest.progress_many(player_id, quests, QuestMode::Event);
            self.achievement.progress_many(player_id, achievements);
            // [Effect] The ledger (cobbles v1, 1.2): the quest entries, which a free game does not
            // report, to the day and the week the report is made in; the achievement entries to
            // the lifetime counts. Before week 0 there is no week to write.
            let time = get_block_timestamp();
            if quests.len() != 0 {
                let key = (player_id, time / DAY);
                let mut day = self.days.read(key);
                day.add(quests);
                self.days.write(key, day);
                if let Option::Some(week) = week_of(time) {
                    let key = (player_id, week);
                    let mut week = self.weeks.read(key);
                    week.add(quests);
                    self.weeks.write(key, week);
                }
            }
            if achievements.len() != 0 {
                let mut account = self.accounts.read(player_id);
                account.add(achievements);
                // [Effect] The XP of the game over (#641), in the same write
                let xp = report_xp(achievements);
                if xp != 0 {
                    let xp = account.add_xp(xp);
                    self.emit_xp(player_id, XP_CHALLENGE, xp, account.xp);
                }
                self.accounts.write(player_id, account);
            }
            // [Interaction] The village reward of the game over (#642)
            if GRANTS_CHALLENGE {
                self.grant_reward(player_id, SOURCE_CHALLENGE);
            }
        }

        fn claim_tutorial(ref self: ContractState) {
            let player_id: felt252 = get_caller_address().into();
            // [Check] Once per player: a later claim does nothing
            if self.tutorial_claims.read(player_id) {
                return;
            }
            // [Effect] Claimed, then First Stone's task
            self.tutorial_claims.write(player_id, true);
            self.achievement.progress(player_id, constants::TASK_TUTORIAL_FINISHED, 1);
        }

        fn is_reporter(self: @ContractState, reporter: ContractAddress) -> bool {
            reporters::allowed(self.quest, reporter)
        }

        fn tutorial_claimed(self: @ContractState, player_id: felt252) -> bool {
            self.tutorial_claims.read(player_id)
        }

        fn set_economy(ref self: ContractState, economy: ContractAddress) {
            // [Check] The owner, once, a real address
            self.ownable.assert_only_owner();
            assert(self.economy.read().is_zero(), errors::ECONOMY_SET);
            assert(economy.is_non_zero(), errors::ZERO_ECONOMY);
            // [Effect] Set it for good
            self.economy.write(economy);
            self.emit(EconomySet { economy });
        }

        fn set_collection(ref self: ContractState, collection: ContractAddress) {
            // [Check] The owner, once, a real address
            self.ownable.assert_only_owner();
            assert(self.collection.read().is_zero(), errors::COLLECTION_SET);
            assert(collection.is_non_zero(), errors::ZERO_COLLECTION);
            // [Effect] Set it for good
            self.collection.write(collection);
            self.emit(CollectionSet { collection });
        }

        fn wiring(self: @ContractState) -> Wiring {
            Wiring { economy: self.economy.read(), collection: self.collection.read() }
        }
    }

    #[abi(embed_v0)]
    impl SetupCobblesImpl of ISetupCobbles<ContractState> {
        fn set_quest_cobbles(ref self: ContractState, quest_id: u32, cobbles: u8) {
            // [Check] The owner, an id of the claim bitmaps
            self.ownable.assert_only_owner();
            assert(quest_id != 0 && quest_id <= MAX_COBBLE_ID, errors::INVALID_ID);
            // [Effect] 0 removes the cobbles
            if cobbles == 0 {
                self.clear_quest_cobbles(quest_id);
                return;
            }
            assert(
                cobbles >= QUEST_COBBLES_MIN && cobbles <= QUEST_COBBLES_MAX,
                errors::INVALID_COBBLES,
            );
            // [Check] A defined, live quest of one task the ledger sums, daily or weekly
            let (head, tasks, conditions) = self.quest.definition(quest_id);
            assert(!head.retired, errors::RETIRED);
            assert(tasks.len() == 1, errors::ONE_TASK);
            let task = *tasks.at(0);
            assert(
                (task.task_id >= 1 && task.task_id <= 4) || is_pvp_task(task.task_id),
                errors::TASK_NOT_COUNTED,
            );
            // [Check] Reachable by a saturated sum: the day and week sums of tasks 1, 2, 4 and 19
            // to 22 are `u16`, the points' `u32`
            assert(
                task.task_id == constants::TASK_POINTS || task.total <= MAX_QUEST_TOTAL,
                errors::TOTAL_TOO_HIGH,
            );
            // [Check] No prerequisite: the claim reads the ledger only and could not check one
            assert(conditions.len() == 0, errors::CONDITIONED);
            let kind = schedule_kind(head.schedule);
            assert(kind != 0, errors::INVALID_SCHEDULE);
            // [Effect] The copy, and the id in its kind's list
            let entry = QuestCobbles {
                cobbles,
                kind,
                task: task.task_id,
                total: task.total,
                start: head.schedule.start,
                interval: head.schedule.interval,
            };
            self.quest_cobbles.write(quest_id, entry);
            let mut ids = list_ids(self.quest_lists.read(kind));
            let mut listed = false;
            for id in ids.span() {
                if *id == quest_id {
                    listed = true;
                }
            }
            if !listed {
                ids.append(quest_id);
                self.quest_lists.write(kind, list_word(ids.span()));
            }
            self.emit(QuestCobblesSet { quest_id, cobbles, kind });
        }

        fn set_achievement_cobbles(ref self: ContractState, achievement_id: u32, cobbles: u8) {
            // [Check] The owner, an id of the claim bitmap
            self.ownable.assert_only_owner();
            assert(achievement_id != 0 && achievement_id <= MAX_COBBLE_ID, errors::INVALID_ID);
            // [Effect] 0 removes the cobbles
            if cobbles == 0 {
                self.achievement_cobbles.write(achievement_id, Default::default());
                self.emit(AchievementCobblesSet { achievement_id, cobbles: 0 });
                return;
            }
            assert(
                cobbles >= ACHIEVEMENT_COBBLES_MIN && cobbles <= ACHIEVEMENT_COBBLES_MAX,
                errors::INVALID_COBBLES,
            );
            // [Check] A defined, live achievement of one task counted on chain, reachable by a
            // saturated count, with no window (the ledger counts for all time)
            let (head, tasks) = self.achievement.definition(achievement_id);
            assert(!head.retired, errors::RETIRED);
            assert(tasks.len() == 1, errors::ONE_TASK);
            let task = *tasks.at(0);
            let counted = task.task_id == constants::TASK_GAME_FINISHED
                || task.task_id == constants::TASK_FOREST_SCORED
                || task.task_id == constants::TASK_WONDER_SCORED
                || task.task_id == constants::TASK_BIG_STRUCTURE
                || task.task_id == constants::TASK_HIGH_SCORE
                || task.task_id == constants::TASK_TUTORIAL_FINISHED
                || task.task_id == constants::TASK_LEAGUE_REACHED;
            assert(counted, errors::TASK_NOT_COUNTED);
            assert(task.total <= MAX_ACHIEVEMENT_TOTAL, errors::TOTAL_TOO_HIGH);
            assert(
                task.task_id != constants::TASK_LEAGUE_REACHED
                    || task.total <= LEAGUE_GROUPS.into(),
                errors::TOTAL_TOO_HIGH,
            );
            assert(head.window.start == 0 && head.window.end == 0, errors::WINDOWED);
            // [Effect] The copy
            self
                .achievement_cobbles
                .write(
                    achievement_id,
                    AchievementCobbles { cobbles, task: task.task_id, total: task.total },
                );
            self.emit(AchievementCobblesSet { achievement_id, cobbles });
        }

        fn claim_quest(ref self: ContractState, quest_id: u32, period: u64) {
            let player_id: felt252 = get_caller_address().into();
            // [Check] The quest has cobbles, and is live in that period
            let entry = self.quest_cobbles.read(quest_id);
            assert(entry.cobbles != 0, errors::NO_COBBLES);
            assert(entry.is_active(entry.period_start(period)), errors::NOT_LIVE);
            // [Check] Completed in that period, and not claimed yet
            let key = (player_id, period);
            if is_pvp_task(entry.task) {
                self.claim_pvp_quest(player_id, quest_id, period, entry);
                return;
            }
            let mut progress = if entry.kind == WEEKLY {
                self.weeks.read(key)
            } else {
                self.days.read(key)
            };
            assert(progress.count(entry.task) >= entry.total, errors::NOT_COMPLETED);
            let flag = bit(quest_id);
            assert(progress.claimed & flag == 0, errors::CLAIMED);
            // [Effect] Claimed in the same write, then the cobbles
            progress.claimed = progress.claimed | flag;
            if entry.kind == WEEKLY {
                self.weeks.write(key, progress);
            } else {
                self.days.write(key, progress);
            }
            let mut account = self.accounts.read(player_id);
            account.cobbles += entry.cobbles.into();
            self.accounts.write(player_id, account);
            self
                .emit(
                    CobblesClaimed {
                        player_id,
                        kind: CLAIM_QUEST,
                        id: quest_id,
                        period,
                        cobbles: entry.cobbles,
                        balance: account.cobbles,
                    },
                );
        }

        fn claim_achievement(ref self: ContractState, achievement_id: u32) {
            let player_id: felt252 = get_caller_address().into();
            // [Check] The achievement has cobbles
            let entry = self.achievement_cobbles.read(achievement_id);
            assert(entry.cobbles != 0, errors::NO_COBBLES);
            // [Check] Its count reaches the total, and it is not claimed yet
            let mut account = self.accounts.read(player_id);
            let count: u32 = if entry.task == constants::TASK_TUTORIAL_FINISHED {
                if self.tutorial_claims.read(player_id) {
                    1
                } else {
                    0
                }
            } else if entry.task == constants::TASK_LEAGUE_REACHED {
                self.league_groups.read(player_id).into()
            } else {
                account.count(entry.task)
            };
            assert(count >= entry.total, errors::NOT_COMPLETED);
            let flag = bit(achievement_id);
            assert(account.achievements_claimed & flag == 0, errors::CLAIMED);
            // [Effect] Claimed and credited in one write
            account.achievements_claimed = account.achievements_claimed | flag;
            account.cobbles += entry.cobbles.into();
            self.accounts.write(player_id, account);
            self
                .emit(
                    CobblesClaimed {
                        player_id,
                        kind: CLAIM_ACHIEVEMENT,
                        id: achievement_id,
                        period: 0,
                        cobbles: entry.cobbles,
                        balance: account.cobbles,
                    },
                );
        }

        fn claim_daily_credit(ref self: ContractState, day: u64) {
            self.claim_credit(DAILY, day);
        }

        fn claim_weekly_credit(ref self: ContractState, week: u64) {
            self.claim_credit(WEEKLY, week);
        }

        fn spend_credit(ref self: ContractState, player_id: felt252, game_id: u32) {
            // [Check] Caller is a reporter (the game contract that spawns the free game)
            self.quest.assert_reporter(get_caller_address());
            // [Check] A credit to spend
            let mut account = self.accounts.read(player_id);
            assert(account.credits != 0, errors::NO_CREDIT);
            // [Effect] One credit less
            account.credits -= 1;
            self.accounts.write(player_id, account);
            self.emit(CreditSpent { player_id, game_id, credits: account.credits });
        }

        fn account(self: @ContractState, player_id: felt252) -> Account {
            self.accounts.read(player_id)
        }

        fn day_progress(self: @ContractState, player_id: felt252, day: u64) -> Progress {
            self.days.read((player_id, day))
        }

        fn week_progress(self: @ContractState, player_id: felt252, week: u64) -> Progress {
            self.weeks.read((player_id, week))
        }

        fn quest_cobbles(self: @ContractState, quest_id: u32) -> QuestCobbles {
            self.quest_cobbles.read(quest_id)
        }

        fn achievement_cobbles(self: @ContractState, achievement_id: u32) -> AchievementCobbles {
            self.achievement_cobbles.read(achievement_id)
        }
    }

    #[abi(embed_v0)]
    impl SetupStoryImpl of ISetupStory<ContractState> {
        fn credit_story(
            ref self: ContractState,
            player_id: felt252,
            campaign_id: u8,
            level_id: u8,
            paid: u8,
            stars: u8,
        ) -> u32 {
            // [Check] Caller is a reporter (`Story`), stars to pay
            self.quest.assert_reporter(get_caller_address());
            assert(paid < stars && stars <= 3, errors::INVALID_STARS);
            // [Effect] Each star credited, one claim each, in one write of the account
            let id: u32 = campaign_id.into() * 0x100 + level_id.into();
            let mut account = self.accounts.read(player_id);
            let mut total: u32 = 0;
            let mut star = paid + 1;
            while star <= stars {
                let cobbles = star * STAR_COBBLES;
                account.cobbles += cobbles.into();
                total += cobbles.into();
                self
                    .emit(
                        CobblesClaimed {
                            player_id,
                            kind: CLAIM_STORY,
                            id,
                            period: star.into(),
                            cobbles,
                            balance: account.cobbles,
                        },
                    );
                star += 1;
            }
            // [Effect] The XP of the stars (#641), in the same write
            let xp = account.add_xp((stars - paid).into() * STAR_XP);
            self.emit_xp(player_id, XP_STORY, xp, account.xp);
            self.accounts.write(player_id, account);
            // [Interaction] The village reward of a run that gained a star (#642)
            if GRANTS_STORY {
                self.grant_reward(player_id, SOURCE_STORY);
            }
            total
        }
    }

    #[abi(embed_v0)]
    impl SetupLeagueImpl of ISetupLeague<ContractState> {
        fn credit_league(
            ref self: ContractState,
            player_id: felt252,
            kind: u8,
            league: u8,
            season: u32,
            cobbles: u8,
        ) -> u64 {
            // [Check] Caller is a reporter (`Matchmaker`), a season's reward (the league bonus is
            // retired, #917), cobbles to credit
            self.quest.assert_reporter(get_caller_address());
            assert(kind == CLAIM_SEASON, errors::INVALID_KIND);
            assert(cobbles != 0, errors::INVALID_COBBLES);
            // [Effect] The cobbles
            let mut account = self.accounts.read(player_id);
            account.cobbles += cobbles.into();
            self.accounts.write(player_id, account);
            self
                .emit(
                    CobblesClaimed {
                        player_id,
                        kind,
                        id: league.into(),
                        period: season.into(),
                        cobbles,
                        balance: account.cobbles,
                    },
                );
            account.cobbles
        }

        fn report_pvp(ref self: ContractState, player_id: felt252, stars: u8) {
            // [Check] Caller is a reporter (`Matchmaker`), at most three stars
            self.quest.assert_reporter(get_caller_address());
            assert(stars <= 3, errors::INVALID_STARS);
            // [Effect] quiver's progress, for the player the reporter names
            let mut quests: Array<QuestProgress> = array![
                QuestProgress { task_id: constants::TASK_PVP_ATTACK, count: 1 },
            ];
            if stars != 0 {
                quests
                    .append(
                        QuestProgress { task_id: constants::TASK_PVP_STARS, count: stars.into() },
                    );
                quests.append(QuestProgress { task_id: constants::TASK_PVP_WIN, count: 1 });
            }
            if stars == 3 {
                quests.append(QuestProgress { task_id: constants::TASK_PVP_THREE_STARS, count: 1 });
            }
            self.quest.progress_many(player_id, quests.span(), QuestMode::Event);
            // [Effect] The PvP ledger of the day and of the week (from week 0)
            let time = get_block_timestamp();
            let key = (player_id, time / DAY);
            let mut day = self.pvp_days.read(key);
            day.add(stars);
            self.pvp_days.write(key, day);
            if let Option::Some(week) = week_of(time) {
                let key = (player_id, week);
                let mut week = self.pvp_weeks.read(key);
                week.add(stars);
                self.pvp_weeks.write(key, week);
            }
            // [Interaction] The village reward of the attack (#642)
            if GRANTS_PVP {
                self.grant_reward(player_id, SOURCE_PVP);
            }
        }

        fn pvp_progress(
            self: @ContractState, player_id: felt252, kind: u8, period: u64,
        ) -> PvpProgress {
            if kind == WEEKLY {
                self.pvp_weeks.read((player_id, period))
            } else {
                self.pvp_days.read((player_id, period))
            }
        }

        fn report_league(ref self: ContractState, player_id: felt252, league: u8) {
            // [Check] Caller is a reporter (`Matchmaker`); `groups_of` refuses a league past Legend
            self.quest.assert_reporter(get_caller_address());
            let groups = groups_of(league);
            // [Effect] A group never reached before: the lifetime count, then quiver's progress
            let had = self.league_groups.read(player_id);
            if groups <= had {
                return;
            }
            self.league_groups.write(player_id, groups);
            self
                .achievement
                .progress(player_id, constants::TASK_LEAGUE_REACHED, (groups - had).into());
        }

        fn league_groups(self: @ContractState, player_id: felt252) -> u8 {
            self.league_groups.read(player_id)
        }
    }

    #[abi(embed_v0)]
    impl SetupLevelImpl of ISetupLevel<ContractState> {
        fn credit_xp(ref self: ContractState, player_id: felt252, source: u8, xp: u32) {
            // [Check] Caller is a reporter, a PvP source, an amount
            self.quest.assert_reporter(get_caller_address());
            assert(source == XP_ATTACK || source == XP_DEFENCE, errors::INVALID_XP_SOURCE);
            assert(xp != 0 && xp <= MAX_CREDIT_XP, errors::INVALID_XP);
            // [Effect] The XP
            let mut account = self.accounts.read(player_id);
            let added = account.add_xp(xp);
            self.accounts.write(player_id, account);
            self.emit_xp(player_id, source, added, account.xp);
        }

        fn player_level(self: @ContractState, player_id: felt252) -> PlayerLevel {
            let xp = self.accounts.read(player_id).xp;
            let level = level_of(xp);
            PlayerLevel {
                xp,
                level,
                floor: level_floor(level).try_into().unwrap(),
                next: level_floor(level + 1).try_into().unwrap(),
            }
        }
    }

    #[abi(embed_v0)]
    impl SetupPacksImpl of ISetupPacks<ContractState> {
        fn set_pack(ref self: ContractState, pack_id: u8, cobbles: u32, price: u128, active: bool) {
            // [Check] The owner, a pack id, cobbles and a price
            self.ownable.assert_only_owner();
            assert(pack_id != 0 && pack_id <= MAX_PACK_ID, errors::INVALID_PACK);
            assert(cobbles != 0 && price != 0, errors::INVALID_PACK);
            // [Effect] The pack
            self.packs.write(pack_id, Pack { cobbles, price, active });
            self.emit(PackSet { pack_id, cobbles, price, active });
        }

        fn buy_pack(
            ref self: ContractState, pack_id: u8, referrer: ContractAddress, min_out: u256,
        ) {
            let player = get_caller_address();
            let player_id: felt252 = player.into();
            // [Check] A pack on sale, the economy wired
            let pack = self.packs.read(pack_id);
            assert(pack.active, errors::NOT_ON_SALE);
            let economy = self.economy.read();
            assert(economy.is_non_zero(), errors::NO_ECONOMY);

            // [Effect] The cobbles
            let mut account = self.accounts.read(player_id);
            account.cobbles += pack.cobbles.into();
            self.accounts.write(player_id, account);

            // [Interaction] The price, from the player straight to Economy (Setup holds no USDC),
            // in the token Economy swaps; then the game's split. No referral to Economy or Setup
            // itself, as `Challenge` filters Economy and itself; Economy ignores the rest.
            let economy = IEconomyDispatcher { contract_address: economy };
            let token = IERC20Dispatcher { contract_address: economy.addresses().usdc };
            let price: u256 = pack.price.into();
            assert(token.transferFrom(player, economy.contract_address, price), errors::PAY_FAILED);
            let referrer = if referrer == economy.contract_address
                || referrer == get_contract_address() {
                Zero::zero()
            } else {
                referrer
            };
            let referrer = economy.sell(player, price, referrer, min_out);
            self
                .emit(
                    PackBought {
                        player_id,
                        pack_id,
                        cobbles: pack.cobbles,
                        price: pack.price,
                        referrer,
                        balance: account.cobbles,
                    },
                );
        }

        fn pack(self: @ContractState, pack_id: u8) -> Pack {
            self.packs.read(pack_id)
        }
    }

    #[abi(embed_v0)]
    impl SetupSkinsImpl of ISetupSkins<ContractState> {
        fn set_skin_price(ref self: ContractState, theme: u8, plan: u8, cobbles: u8) {
            // [Check] The owner, a theme, a plan, a price in bounds or 0
            self.ownable.assert_only_owner();
            assert(theme != 0 && plan != 0 && plan <= PLANS, errors::INVALID_SKIN);
            assert(
                cobbles == 0 || (cobbles >= SKIN_PRICE_MIN && cobbles <= SKIN_PRICE_MAX),
                errors::INVALID_COBBLES,
            );
            // [Effect] The price
            self.skin_prices.write((theme, plan), cobbles);
            self.emit(SkinPriced { theme, plan, cobbles });
        }

        fn buy_skin(ref self: ContractState, theme: u8, plan: u8) {
            let player_id: felt252 = get_caller_address().into();
            // [Check] A skin on sale (an id never priced has price 0), not owned, affordable
            let price = self.skin_prices.read((theme, plan));
            assert(price != 0, errors::SKIN_NOT_FOR_SALE);
            let owned = self.skins.read((player_id, theme));
            let flag = skin_bit(plan);
            assert(owned & flag == 0, errors::SKIN_OWNED);
            // [Check] The tier of the plan, for a skin reserved to one (#642)
            let min_tier = self.skin_tiers.read((theme, plan));
            if min_tier != 0 {
                let rewards = self.rewards.read();
                let tier = if rewards.is_zero() {
                    0
                } else {
                    IRewardsDispatcher { contract_address: rewards }.tier(player_id, plan)
                };
                assert(tier >= min_tier, errors::TIER_TOO_LOW);
            }
            let mut account = self.accounts.read(player_id);
            assert(account.cobbles >= price.into(), errors::NOT_ENOUGH_COBBLES);

            // [Effect] The cobbles spent and the skin owned, in one transaction
            account.cobbles -= price.into();
            self.accounts.write(player_id, account);
            self.skins.write((player_id, theme), owned | flag);
            self
                .emit(
                    SkinBought { player_id, theme, plan, cobbles: price, balance: account.cobbles },
                );
        }

        fn set_skins(ref self: ContractState, changes: Span<(u8, u8)>) {
            let player_id: felt252 = get_caller_address().into();
            // The active word in halves: plans 1 to 16 in the low `u128`, 17 to 19 in the high one
            let word: u256 = self.active_skins.read(player_id).into();
            let mut low = word.low;
            let mut high = word.high;
            // The owned word of a theme is read once per theme named.
            let mut known: Array<(u8, u32)> = array![];
            for (plan, theme) in changes {
                let plan = *plan;
                let theme = *theme;
                // [Check] A plan 1 to 19, the theme the default or owned
                assert(plan != 0 && plan <= PLANS, errors::INVALID_SKIN);
                if theme != 0 {
                    let mut owned: Option<u32> = None;
                    for (seen, held) in known.span() {
                        if *seen == theme {
                            owned = Some(*held);
                        }
                    }
                    let owned = match owned {
                        Some(held) => held,
                        None => {
                            let held = self.skins.read((player_id, theme));
                            known.append((theme, held));
                            held
                        },
                    };
                    assert(owned & skin_bit(plan) != 0, errors::SKIN_NOT_OWNED);
                }
                // [Effect] The plan's byte, in order (the last change of a plan wins)
                let unit = byte_unit(plan);
                let theme: u128 = theme.into();
                if plan <= 16 {
                    low = low - (low / unit % 256) * unit + theme * unit;
                } else {
                    high = high - (high / unit % 256) * unit + theme * unit;
                }
            }
            // [Effect] One write for the batch
            let active: felt252 = u256 { low, high }.try_into().unwrap();
            self.active_skins.write(player_id, active);
            self.emit(SkinsActivated { player_id, active });
        }

        fn skin_price(self: @ContractState, theme: u8, plan: u8) -> u8 {
            self.skin_prices.read((theme, plan))
        }

        fn skins(self: @ContractState, player_id: felt252, theme: u8) -> u32 {
            self.skins.read((player_id, theme))
        }

        fn active_skins(self: @ContractState, player_id: felt252) -> Array<u8> {
            active_themes(self.active_skins.read(player_id))
        }

        fn set_skin_tier(ref self: ContractState, theme: u8, plan: u8, min_tier: u8) {
            // [Check] The owner, a theme, a plan
            self.ownable.assert_only_owner();
            assert(theme != 0 && plan != 0 && plan <= PLANS, errors::INVALID_SKIN);
            // [Effect] The tier
            self.skin_tiers.write((theme, plan), min_tier);
            self.emit(SkinTierSet { theme, plan, min_tier });
        }

        fn skin_tier(self: @ContractState, theme: u8, plan: u8) -> u8 {
            self.skin_tiers.read((theme, plan))
        }
    }

    #[abi(embed_v0)]
    impl SetupRewardsImpl of ISetupRewards<ContractState> {
        fn set_rewards(ref self: ContractState, rewards: ContractAddress) {
            self.ownable.assert_only_owner();
            self.rewards.write(rewards);
            self.emit(RewardsSet { rewards });
        }

        fn rewards(self: @ContractState) -> ContractAddress {
            self.rewards.read()
        }

        fn credit_reward(
            ref self: ContractState, player_id: felt252, index: u32, cobbles: u8,
        ) -> u64 {
            // [Check] Caller is a reporter (`Rewards`), cobbles to credit
            self.quest.assert_reporter(get_caller_address());
            assert(cobbles != 0, errors::INVALID_COBBLES);
            // [Effect] The cobbles
            let mut account = self.accounts.read(player_id);
            account.cobbles += cobbles.into();
            self.accounts.write(player_id, account);
            self
                .emit(
                    CobblesClaimed {
                        player_id,
                        kind: CLAIM_REWARD,
                        id: 0,
                        period: index.into(),
                        cobbles,
                        balance: account.cobbles,
                    },
                );
            account.cobbles
        }
    }

    #[abi(embed_v0)]
    impl SetupSpendImpl of ISetupSpend<ContractState> {
        fn set_spender(ref self: ContractState, spender: ContractAddress, allowed: bool) {
            self.ownable.assert_only_owner();
            self.spenders.write(spender, allowed);
            self.emit(SpenderSet { spender, allowed });
        }

        fn is_spender(self: @ContractState, spender: ContractAddress) -> bool {
            self.spenders.read(spender)
        }

        fn spend_cobbles(
            ref self: ContractState, player_id: felt252, cobbles: u32, reason: felt252,
        ) -> u64 {
            // [Check] An allowlisted spender, cobbles to spend, a balance that covers them
            let spender = get_caller_address();
            assert(self.spenders.read(spender), errors::NOT_SPENDER);
            assert(cobbles != 0, errors::INVALID_COBBLES);
            let mut account = self.accounts.read(player_id);
            assert(account.cobbles >= cobbles.into(), errors::NOT_ENOUGH_COBBLES);
            // [Effect] The cobbles spent
            account.cobbles -= cobbles.into();
            self.accounts.write(player_id, account);
            self
                .emit(
                    CobblesSpent { player_id, spender, reason, cobbles, balance: account.cobbles },
                );
            account.cobbles
        }
    }

    #[generate_trait]
    impl CobblesInternalImpl of CobblesInternalTrait {
        /// The claim of a PvP mission (#644), from the PvP ledger: as `claim_quest`.
        fn claim_pvp_quest(
            ref self: ContractState,
            player_id: felt252,
            quest_id: u32,
            period: u64,
            entry: QuestCobbles,
        ) {
            let key = (player_id, period);
            let mut progress = if entry.kind == WEEKLY {
                self.pvp_weeks.read(key)
            } else {
                self.pvp_days.read(key)
            };
            assert(progress.count(entry.task) >= entry.total, errors::NOT_COMPLETED);
            let flag = bit(quest_id);
            assert(progress.claimed & flag == 0, errors::CLAIMED);
            // [Effect] Claimed in the same write, then the cobbles
            progress.claimed = progress.claimed | flag;
            if entry.kind == WEEKLY {
                self.pvp_weeks.write(key, progress);
            } else {
                self.pvp_days.write(key, progress);
            }
            let mut account = self.accounts.read(player_id);
            account.cobbles += entry.cobbles.into();
            self.accounts.write(player_id, account);
            self
                .emit(
                    CobblesClaimed {
                        player_id,
                        kind: CLAIM_QUEST,
                        id: quest_id,
                        period,
                        cobbles: entry.cobbles,
                        balance: account.cobbles,
                    },
                );
        }

        /// The `XpGained` of a credit: `xp` added, `total` the player's XP after it.
        /// Grants `player_id` a village reward on the `Rewards` set, if one is (#642); at its daily
        /// cap `Rewards` does nothing.
        fn grant_reward(ref self: ContractState, player_id: felt252, source: u8) {
            let rewards = self.rewards.read();
            if rewards.is_non_zero() {
                IRewardsDispatcher { contract_address: rewards }.grant(player_id, source);
            }
        }

        fn emit_xp(ref self: ContractState, player_id: felt252, source: u8, xp: u32, total: u32) {
            self.emit(XpGained { player_id, source, xp, total, level: level_of(total) });
        }

        /// Removes the cobbles of a quest: its copy, and its id from its kind's list.
        fn clear_quest_cobbles(ref self: ContractState, quest_id: u32) {
            let entry = self.quest_cobbles.read(quest_id);
            if entry.cobbles != 0 {
                let mut kept: Array<u32> = array![];
                for id in list_ids(self.quest_lists.read(entry.kind)) {
                    if id != quest_id {
                        kept.append(id);
                    }
                }
                self.quest_lists.write(entry.kind, list_word(kept.span()));
                self.quest_cobbles.write(quest_id, Default::default());
            }
            self.emit(QuestCobblesSet { quest_id, cobbles: 0, kind: entry.kind });
        }

        /// The caller's credit of a day (`DAILY`) or a week (`WEEKLY`): every quest of that kind's
        /// list live in the period is completed in it, at least one is live, and the credit is not
        /// claimed yet.
        fn claim_credit(ref self: ContractState, kind: u8, period: u64) {
            let player_id: felt252 = get_caller_address().into();
            let key = (player_id, period);
            let mut progress = if kind == WEEKLY {
                self.weeks.read(key)
            } else {
                self.days.read(key)
            };
            // [Check] Not claimed yet
            assert(!progress.credit, errors::CREDIT_CLAIMED);
            // [Check] Every live quest of the list completed, at least one live
            let mut live: u32 = 0;
            for id in list_ids(self.quest_lists.read(kind)) {
                let entry = self.quest_cobbles.read(id);
                // A PvP mission is not part of the credit: it never depends on PvP (#644)
                if !is_pvp_task(entry.task) && entry.is_active(entry.period_start(period)) {
                    assert(progress.count(entry.task) >= entry.total, errors::NOT_COMPLETED);
                    live += 1;
                }
            }
            assert(live != 0, errors::NO_LIVE_QUEST);
            // [Effect] Claimed, then the credit
            progress.credit = true;
            if kind == WEEKLY {
                self.weeks.write(key, progress);
            } else {
                self.days.write(key, progress);
            }
            let mut account = self.accounts.read(player_id);
            account.credits += 1;
            self.accounts.write(player_id, account);
            self.emit(CreditClaimed { player_id, kind, period, credits: account.credits });
        }
    }

    #[abi(embed_v0)]
    impl UpgradeableImpl of IUpgradeable<ContractState> {
        /// Replaces the class, keeping the storage (OpenZeppelin's `Upgraded`). The owner only.
        fn upgrade(ref self: ContractState, new_class_hash: ClassHash) {
            self.ownable.assert_only_owner();
            self.upgradeable.upgrade(new_class_hash);
        }
    }

    /// Apart, because quiver's `StoreTrait` and the component's `InternalTrait` both name
    /// `set_reporter`.
    mod reporters {
        use quiver_quest::component::QuestComponent::ComponentState;
        use quiver_quest::store::StoreTrait;
        use starknet::ContractAddress;
        use super::ContractState;

        pub fn allowed(quest: @ComponentState<ContractState>, reporter: ContractAddress) -> bool {
            quest.get_reporter(reporter).allowed
        }
    }

    /// The bit of the skin of `plan` (1 to 19) in an owned word, `1 << plan`.
    fn skin_bit(plan: u8) -> u32 {
        match plan {
            1 => 0x2,
            2 => 0x4,
            3 => 0x8,
            4 => 0x10,
            5 => 0x20,
            6 => 0x40,
            7 => 0x80,
            8 => 0x100,
            9 => 0x200,
            10 => 0x400,
            11 => 0x800,
            12 => 0x1000,
            13 => 0x2000,
            14 => 0x4000,
            15 => 0x8000,
            16 => 0x10000,
            17 => 0x20000,
            18 => 0x40000,
            19 => 0x80000,
            _ => 0,
        }
    }

    /// The unit of the plan's byte in its half of the active word: 256 to the power of
    /// `(plan - 1) mod 16`.
    fn byte_unit(plan: u8) -> u128 {
        match plan {
            1 => 0x1,
            2 => 0x100,
            3 => 0x10000,
            4 => 0x1000000,
            5 => 0x100000000,
            6 => 0x10000000000,
            7 => 0x1000000000000,
            8 => 0x100000000000000,
            9 => 0x10000000000000000,
            10 => 0x1000000000000000000,
            11 => 0x100000000000000000000,
            12 => 0x10000000000000000000000,
            13 => 0x1000000000000000000000000,
            14 => 0x100000000000000000000000000,
            15 => 0x10000000000000000000000000000,
            16 => 0x1000000000000000000000000000000,
            17 => 0x1,
            18 => 0x100,
            19 => 0x10000,
            _ => 1,
        }
    }

    /// A definition the indexer can serve: no task total of 0 (complete before any report) and no
    /// task id twice (two entries under one key). Tasks are at most 3 (quiver `MAX_TASKS`).
    fn assert_tasks(tasks: Span<(u32, u32)>) {
        let mut i = 0;
        while i < tasks.len() {
            let (task_id, total) = *tasks.at(i);
            assert(total != 0, errors::TASK_TOTAL_ZERO);
            let mut j = i + 1;
            while j < tasks.len() {
                let (other, _) = *tasks.at(j);
                assert(other != task_id, errors::TASK_REPEATED);
                j += 1;
            }
            i += 1;
        }
    }
}
