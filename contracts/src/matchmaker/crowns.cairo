//! The crowns of the matchmaker (#639, `docs/architecture/matchmaker.md`, section 6): as in Clash
//! of Clans, the rating is the crown count, and the curves are Clash of Clans' trophy curves of
//! 2013 to 2025, scaled 1 to 1 (reverse-engineered by the note's sources, owner decision of
//! 2026-10-21). Pure functions: the offer and the 0-star cost fixed at the draw from the crown
//! gap, and the settlement of an attack's stars.
//!
//! Both curves are monotone in steps of one crown. Each is held as its breakpoints, the first gap
//! (defender's crowns minus attacker's) of each new value, so no floating point is needed: the
//! offer is `OFFER_MIN` plus the number of offer breakpoints at or below the gap, the cost
//! `COST_MAX` minus the number of cost breakpoints at or below it.

/// The offer's bounds (the note's S1: 59 at most, 1 at least).
pub const OFFER_MIN: u8 = 1;
pub const OFFER_MAX: u8 = 59;
/// The 0-star cost's bound (S1); its floor is 0 (S3).
pub const COST_MAX: u8 = 39;
/// The most stars of an attack.
pub const MAX_STARS: u8 = 3;
/// Every breakpoint lies within this gap; beyond it both curves are flat.
const GAP_BOUND: u32 = 1000;

/// The gaps at which the offer becomes 2, 3, ..., 59 (section 6.2).
const OFFER_STEPS: [i16; 58] = [
    -574, -504, -453, -412, -378, -349, -323, -299, -278, -258, -239, -222, -206, -190, -175, -160,
    -146, -133, -120, -107, -94, -82, -70, -58, -46, -35, -23, -11, 0, 12, 23, 35, 47, 59, 71, 83,
    95, 108, 121, 134, 147, 161, 176, 191, 207, 224, 241, 260, 280, 302, 326, 353, 383, 418, 461,
    514, 590, 719,
];

/// The gaps at which the 0-star cost becomes 38, 37, ..., 0 (section 6.2).
const COST_STEPS: [i16; 39] = [
    -709, -536, -449, -389, -342, -304, -271, -242, -215, -191, -168, -147, -127, -107, -88, -70,
    -52, -34, -17, 0, 18, 35, 53, 71, 89, 108, 128, 148, 170, 192, 217, 244, 273, 307, 346, 394,
    456, 549, 746,
];

pub mod errors {
    pub const INVALID_STARS: felt252 = 'Matchmaker: invalid stars';
}

/// The crowns of both sides after an attack, and what moved.
#[derive(Copy, Drop, Serde, Debug, PartialEq)]
pub struct Settlement {
    pub attacker: u32,
    pub defender: u32,
    /// The crowns the attacker won (1 to 3 stars); 0 otherwise.
    pub gained: u32,
    /// The crowns the attacker lost (0 stars); 0 otherwise.
    pub lost: u32,
}

/// The offer of an attack (3 stars): Clash of Clans' win offer at the crown gap, 1 to 59. A
/// stronger defender is worth more.
pub fn offer_of(attacker: u32, defender: u32) -> u8 {
    OFFER_MIN + count_at_or_below(OFFER_STEPS.span(), gap_of(attacker, defender))
}

/// The 0-star cost of an attack: Clash of Clans' loss at the crown gap, 39 to 0. Failing against a
/// stronger defender costs less.
pub fn cost_of(attacker: u32, defender: u32) -> u8 {
    COST_MAX - count_at_or_below(COST_STEPS.span(), gap_of(attacker, defender))
}

/// What `stars` (1 to 3) win of `offer`: a third per star, rounded up (the note's S2 and S1).
pub fn prize_of(offer: u8, stars: u8) -> u32 {
    let share: u32 = offer.into() * stars.into();
    (share + MAX_STARS.into() - 1) / MAX_STARS.into()
}

/// Settles an attack of `stars` (0 to 3) at the `offer` and `cost` fixed at the draw.
/// - A win (1 to 3 stars) gives the attacker `prize_of(offer, stars)`, taken from the defender, at
///   most the defender's crowns.
/// - 0 stars costs the attacker `cost`, at most its crowns, given to the defender.
/// - Against an NPC (`npc`), the defender's crowns never change: a win mints the attacker's gain,
///   a loss burns its cost.
/// Every amount is also at most what the receiving side can still hold under `u32`'s bound, so
/// crowns are conserved between players at every count, never negative, and never overflow; the
/// amount reported is the amount that moved.
pub fn settle(
    attacker: u32, defender: u32, offer: u8, cost: u8, stars: u8, npc: bool,
) -> Settlement {
    assert(stars <= MAX_STARS, errors::INVALID_STARS);
    if stars == 0 {
        let mut lost: u32 = min(cost.into(), attacker);
        if npc {
            return Settlement { attacker: attacker - lost, defender, gained: 0, lost };
        }
        lost = min(lost, room(defender));
        return Settlement { attacker: attacker - lost, defender: defender + lost, gained: 0, lost };
    }
    let mut gained = min(prize_of(offer, stars), room(attacker));
    if npc {
        return Settlement { attacker: attacker + gained, defender, gained, lost: 0 };
    }
    gained = min(gained, defender);
    Settlement { attacker: attacker + gained, defender: defender - gained, gained, lost: 0 }
}

/// The crown gap `defender - attacker`, bounded to `GAP_BOUND` either way (both curves are flat
/// beyond it).
fn gap_of(attacker: u32, defender: u32) -> i16 {
    if defender >= attacker {
        let gap: i16 = min(defender - attacker, GAP_BOUND).try_into().unwrap();
        gap
    } else {
        let gap: i16 = min(attacker - defender, GAP_BOUND).try_into().unwrap();
        -gap
    }
}

/// The number of `steps` (sorted ascending) at or below `gap`, by binary search.
fn count_at_or_below(steps: Span<i16>, gap: i16) -> u8 {
    let mut low: u32 = 0;
    let mut high: u32 = steps.len();
    while low < high {
        let middle = (low + high) / 2;
        if *steps.at(middle) <= gap {
            low = middle + 1;
        } else {
            high = middle;
        }
    }
    low.try_into().unwrap()
}

/// What a crown count can still receive under `u32`'s bound.
fn room(crowns: u32) -> u32 {
    core::num::traits::Bounded::<u32>::MAX - crowns
}

fn min(a: u32, b: u32) -> u32 {
    if a < b {
        a
    } else {
        b
    }
}
