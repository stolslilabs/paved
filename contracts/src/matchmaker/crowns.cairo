//! The crowns of the matchmaker (#639, `docs/architecture/matchmaker.md`, section 6): as in Clash
//! of Clans, the rating is the crown count. Pure functions: the offer fixed at the draw, the
//! settlement of an attack's stars, and the bucket of a crown count.

/// The crowns of one bucket.
pub const BUCKET_WIDTH: u32 = 100;
/// The highest bucket: 251 buckets (0 to 250) fit the 251 bits of the registry's felt.
pub const TOP_BUCKET: u8 = 250;
/// The offer at an even crown gap.
pub const OFFER_BASE: u32 = 25;
/// One crown of offer per `OFFER_DIVISOR` crowns of gap.
pub const OFFER_DIVISOR: u32 = 20;
/// The offer's bounds: `OFFER_BASE` -/+ `OFFER_SPAN`, 10 to 40.
pub const OFFER_SPAN: u32 = 15;
pub const OFFER_MIN: u8 = 10;
pub const OFFER_MAX: u8 = 40;
/// The 0-star cost to the attacker: `offer / LOSS_DIVISOR`, bounded 2 to 10.
pub const LOSS_DIVISOR: u8 = 4;
pub const LOSS_MIN: u8 = 2;
pub const LOSS_MAX: u8 = 10;
/// The most stars of an attack.
pub const MAX_STARS: u8 = 3;

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

/// The bucket of a crown count: `crowns / BUCKET_WIDTH`, at most `TOP_BUCKET`.
pub fn bucket_of(crowns: u32) -> u8 {
    let bucket = crowns / BUCKET_WIDTH;
    if bucket >= TOP_BUCKET.into() {
        TOP_BUCKET
    } else {
        bucket.try_into().unwrap()
    }
}

/// The offer of an attack, fixed at the draw: `OFFER_BASE + (defender - attacker) / OFFER_DIVISOR`
/// (the gap's quotient truncated toward 0), bounded `OFFER_MIN` to `OFFER_MAX`. A stronger defender
/// is worth more.
pub fn offer_of(attacker: u32, defender: u32) -> u8 {
    let offer = if defender >= attacker {
        let up = (defender - attacker) / OFFER_DIVISOR;
        if up >= OFFER_SPAN {
            OFFER_BASE + OFFER_SPAN
        } else {
            OFFER_BASE + up
        }
    } else {
        let down = (attacker - defender) / OFFER_DIVISOR;
        if down >= OFFER_SPAN {
            OFFER_BASE - OFFER_SPAN
        } else {
            OFFER_BASE - down
        }
    };
    offer.try_into().unwrap()
}

/// The 0-star cost of an offer: `offer / LOSS_DIVISOR`, bounded `LOSS_MIN` to `LOSS_MAX`.
pub fn loss_of(offer: u8) -> u8 {
    let loss = offer / LOSS_DIVISOR;
    if loss < LOSS_MIN {
        LOSS_MIN
    } else if loss > LOSS_MAX {
        LOSS_MAX
    } else {
        loss
    }
}

/// Settles an attack of `stars` (0 to 3) at `offer`.
/// - A win (1 to 3 stars) gives the attacker `offer x stars / 3`, taken from the defender, at most
///   the defender's crowns.
/// - 0 stars costs the attacker `loss_of(offer)`, at most its crowns, given to the defender.
/// - Against an NPC (`npc`), the defender's crowns never change: a win mints the attacker's gain,
///   a loss burns its cost.
/// Every amount is also at most what the receiving side can still hold under `u32`'s bound, so
/// crowns are conserved between players at every count, never negative, and never overflow; the
/// amount reported is the amount that moved.
pub fn settle(attacker: u32, defender: u32, offer: u8, stars: u8, npc: bool) -> Settlement {
    assert(stars <= MAX_STARS, errors::INVALID_STARS);
    if stars == 0 {
        let mut lost: u32 = min(loss_of(offer).into(), attacker);
        if npc {
            return Settlement { attacker: attacker - lost, defender, gained: 0, lost };
        }
        lost = min(lost, room(defender));
        return Settlement { attacker: attacker - lost, defender: defender + lost, gained: 0, lost };
    }
    let prize: u32 = offer.into() * stars.into() / MAX_STARS.into();
    let mut gained = min(prize, room(attacker));
    if npc {
        return Settlement { attacker: attacker + gained, defender, gained, lost: 0 };
    }
    gained = min(gained, defender);
    Settlement { attacker: attacker + gained, defender: defender - gained, gained, lost: 0 }
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
