//! The matchmaker's pieces (#639, `docs/architecture/matchmaker.md`) on their own: the crown curves
//! reverse-engineered from Clash of Clans (the table of section 6.3 and every breakpoint pinned),
//! the settlement, the packings, and each component over its own storage
//! (`component_state_for_testing`): the buckets and the shields. The system that composes them is
//! `paved::tests::matchmaker_system`.

use paved::components::bucketable::BucketableComponent::InternalTrait as BucketableInternal;
use paved::components::bucketable::{
    BucketableComponent, IBucketable, Place, PlacePacking, TOP_BUCKET, bucket_of,
};
use paved::components::shieldable::ShieldableComponent::InternalTrait as ShieldableInternal;
use paved::components::shieldable::{
    ATTACK_SHIELD, INITIAL_SHIELD, IShieldable, QUEUE_ATTACK, QUEUE_INITIAL, Queue, QueuePacking,
    Shield, ShieldPacking, ShieldableComponent,
};
use paved::helpers::bitmap::Bitmap;
use paved::matchmaker::crowns::{
    COST_MAX, OFFER_MAX, OFFER_MIN, Settlement, cost_of, offer_of, prize_of, settle,
};
use paved::systems::matchmaker::{Matchmaker, Village, VillagePacking};
use starknet::ContractAddress;

const START: u64 = 1_800_000_000;

type Buckets = BucketableComponent::ComponentState<Matchmaker::ContractState>;
type Shields = ShieldableComponent::ComponentState<Matchmaker::ContractState>;

fn buckets() -> Buckets {
    BucketableComponent::component_state_for_testing()
}

fn shields() -> Shields {
    ShieldableComponent::component_state_for_testing()
}

fn village(id: u32) -> ContractAddress {
    let address: felt252 = 0x1000 + id.into();
    address.try_into().unwrap()
}

/// The terms at a crown gap `defender - attacker`, from a base of 10,000 crowns.
fn terms_at(gap: i32) -> (u8, u8) {
    let base: i64 = 10_000;
    let defender: u32 = (base + gap.into()).try_into().unwrap();
    let attacker: u32 = base.try_into().unwrap();
    (offer_of(attacker, defender), cost_of(attacker, defender))
}

// The curves (section 6)

#[test]
fn test_terms_pin_the_table_by_crown_gap() {
    // Section 6.3: (gap, offer, 2 stars, 1 star, 0-star cost)
    let rows: Array<(i32, u8, u32, u32, u8)> = array![
        (-1000, 1, 1, 1, 39), (-750, 1, 1, 1, 38), (-600, 1, 1, 1, 38), (-500, 3, 2, 1, 37),
        (-400, 5, 4, 2, 35), (-300, 8, 6, 3, 33), (-200, 14, 10, 5, 30), (-150, 17, 12, 6, 27),
        (-100, 21, 14, 7, 25), (-50, 25, 17, 9, 22), (0, 30, 20, 10, 20), (50, 34, 23, 12, 17),
        (100, 38, 26, 13, 14), (150, 42, 28, 14, 12), (200, 45, 30, 15, 9), (300, 50, 34, 17, 6),
        (400, 54, 36, 18, 4), (500, 56, 38, 19, 2), (600, 58, 39, 20, 1), (750, 59, 40, 20, 1),
        (1000, 59, 40, 20, 0),
    ];
    for (gap, offer, two, one, cost) in rows {
        let (o, c) = terms_at(gap);
        assert_eq!(o, offer);
        assert_eq!(c, cost);
        assert_eq!(prize_of(o, 3), offer.into());
        assert_eq!(prize_of(o, 2), two);
        assert_eq!(prize_of(o, 1), one);
    }
}

#[test]
fn test_offer_breakpoints_are_pinned() {
    // Section 6.2: the gap at which the offer becomes 2, 3, ..., 59
    let steps: Array<i32> = array![
        -574, -504, -453, -412, -378, -349, -323, -299, -278, -258, -239, -222, -206, -190, -175,
        -160, -146, -133, -120, -107, -94, -82, -70, -58, -46, -35, -23, -11, 0, 12, 23, 35, 47, 59,
        71, 83, 95, 108, 121, 134, 147, 161, 176, 191, 207, 224, 241, 260, 280, 302, 326, 353, 383,
        418, 461, 514, 590, 719,
    ];
    let mut value: u8 = OFFER_MIN;
    for gap in steps {
        let (before, _) = terms_at(gap - 1);
        let (at, _) = terms_at(gap);
        assert_eq!(before, value);
        value += 1;
        assert_eq!(at, value);
    }
    assert_eq!(value, OFFER_MAX);
}

#[test]
fn test_cost_breakpoints_are_pinned() {
    // Section 6.2: the gap at which the cost becomes 38, 37, ..., 0 (choice B: 20 at an even gap)
    let steps: Array<i32> = array![
        -754, -559, -465, -402, -353, -313, -279, -249, -221, -196, -173, -151, -130, -110, -91,
        -72, -53, -35, -17, 1, 18, 36, 54, 73, 92, 111, 131, 152, 174, 197, 222, 250, 280, 314, 354,
        403, 466, 560, 755,
    ];
    let mut value: u8 = COST_MAX;
    for gap in steps {
        let (_, before) = terms_at(gap - 1);
        let (_, at) = terms_at(gap);
        assert_eq!(before, value);
        value -= 1;
        assert_eq!(at, value);
    }
    assert_eq!(value, 0);
}

#[test]
fn test_terms_at_the_ends_of_the_crown_range() {
    assert_eq!(offer_of(0, 0), 30);
    assert_eq!(cost_of(0, 0), 20);
    assert_eq!(offer_of(0, core::num::traits::Bounded::<u32>::MAX), OFFER_MAX);
    assert_eq!(cost_of(0, core::num::traits::Bounded::<u32>::MAX), 0);
    assert_eq!(offer_of(core::num::traits::Bounded::<u32>::MAX, 0), OFFER_MIN);
    assert_eq!(cost_of(core::num::traits::Bounded::<u32>::MAX, 0), COST_MAX);
}

#[test]
#[fuzzer(runs: 64, seed: 639)]
fn test_terms_are_bounded_and_monotonic(attacker: u32, defender: u32) {
    let offer = offer_of(attacker, defender);
    let cost = cost_of(attacker, defender);
    assert(offer >= OFFER_MIN && offer <= OFFER_MAX, 'offer out of bounds');
    assert(cost <= COST_MAX, 'cost out of bounds');
    // A stronger defender offers at least as much and costs at most as much
    if defender < core::num::traits::Bounded::<u32>::MAX {
        assert(offer_of(attacker, defender + 1) >= offer, 'offer not monotonic');
        assert(cost_of(attacker, defender + 1) <= cost, 'cost not monotonic');
    }
}

#[test]
fn test_prize_is_a_third_per_star_rounded_up() {
    // A 1-star on a 1-crown offer wins 1 (the note's S1)
    assert_eq!(prize_of(1, 1), 1);
    assert_eq!(prize_of(30, 1), 10);
    assert_eq!(prize_of(31, 1), 11);
    assert_eq!(prize_of(31, 2), 21);
    assert_eq!(prize_of(59, 3), 59);
}

// The settlement

#[test]
fn test_settle_win() {
    let outcome = settle(1_000, 1_000, 30, 20, 2, false);
    assert_eq!(outcome, Settlement { attacker: 1_020, defender: 980, gained: 20, lost: 0 });
    let outcome = settle(1_000, 1_000, 30, 20, 3, false);
    assert_eq!(outcome, Settlement { attacker: 1_030, defender: 970, gained: 30, lost: 0 });
}

#[test]
fn test_settle_win_capped_by_defender() {
    let outcome = settle(0, 12, 30, 20, 3, false);
    assert_eq!(outcome, Settlement { attacker: 12, defender: 0, gained: 12, lost: 0 });
}

#[test]
fn test_settle_loss() {
    let outcome = settle(1_000, 1_000, 30, 20, 0, false);
    assert_eq!(outcome, Settlement { attacker: 980, defender: 1_020, gained: 0, lost: 20 });
    // A village at 0 loses nothing (as in Clash of Clans)
    let outcome = settle(0, 1_000, 30, 20, 0, false);
    assert_eq!(outcome, Settlement { attacker: 0, defender: 1_000, gained: 0, lost: 0 });
}

#[test]
fn test_settle_against_npc() {
    let outcome = settle(100, 150, 34, 17, 3, true);
    assert_eq!(outcome, Settlement { attacker: 134, defender: 150, gained: 34, lost: 0 });
    let outcome = settle(100, 150, 34, 17, 0, true);
    assert_eq!(outcome, Settlement { attacker: 83, defender: 150, gained: 0, lost: 17 });
}

#[test]
#[should_panic(expected: ('Matchmaker: invalid stars',))]
fn test_settle_refuses_four_stars() {
    settle(0, 0, 30, 20, 4, false);
}

#[test]
#[fuzzer(runs: 64, seed: 639)]
fn test_settle_conserves_crowns(attacker: u32, defender: u32, gap: u32, stars: u8) {
    // The terms of a real draw: from some crown gap, so offer and cost are on the curves
    let offer = offer_of(attacker, gap);
    let cost = cost_of(attacker, gap);
    assert_settle_conserves(attacker, defender, offer, cost, stars % 4);
}

#[test]
#[fuzzer(runs: 64, seed: 639)]
fn test_settle_conserves_crowns_near_the_bound(
    attacker: u8, defender: u8, offer: u8, cost: u8, stars: u8,
) {
    let max = core::num::traits::Bounded::<u32>::MAX;
    let offer = OFFER_MIN + offer % OFFER_MAX;
    let cost = cost % (COST_MAX + 1);
    assert_settle_conserves(max - attacker.into(), max - defender.into(), offer, cost, stars % 4);
    assert_settle_conserves(attacker.into(), max - defender.into(), offer, cost, stars % 4);
    assert_settle_conserves(max - attacker.into(), defender.into(), offer, cost, stars % 4);
}

fn assert_settle_conserves(attacker: u32, defender: u32, offer: u8, cost: u8, stars: u8) {
    let outcome = settle(attacker, defender, offer, cost, stars, false);
    let before: u64 = attacker.into() + defender.into();
    let after: u64 = outcome.attacker.into() + outcome.defender.into();
    assert(before == after, 'crowns not conserved');
    assert(outcome.gained == 0 || outcome.lost == 0, 'both gained and lost');
    if stars == 0 {
        assert(outcome.gained == 0, 'gained on 0 stars');
        assert(outcome.lost <= cost.into(), 'lost more than the cost');
        assert(outcome.attacker == attacker - outcome.lost, 'loss not reported');
    } else {
        assert(outcome.lost == 0, 'lost on a win');
        assert(outcome.gained <= prize_of(offer, stars), 'gained more than the prize');
        assert(outcome.attacker == attacker + outcome.gained, 'gain not reported');
    }
}

#[test]
fn test_settle_win_capped_by_the_attackers_room() {
    let max = core::num::traits::Bounded::<u32>::MAX;
    let outcome = settle(max - 5, 1_000, 30, 20, 3, false);
    assert_eq!(outcome, Settlement { attacker: max, defender: 995, gained: 5, lost: 0 });
}

#[test]
fn test_settle_loss_capped_by_the_defenders_room() {
    let max = core::num::traits::Bounded::<u32>::MAX;
    let outcome = settle(1_000, max - 3, 30, 20, 0, false);
    assert_eq!(outcome, Settlement { attacker: 997, defender: max, gained: 0, lost: 3 });
}

#[test]
fn test_settle_npc_win_capped_by_the_attackers_room() {
    let max = core::num::traits::Bounded::<u32>::MAX;
    let outcome = settle(max - 2, 150, 30, 20, 3, true);
    assert_eq!(outcome, Settlement { attacker: max, defender: 150, gained: 2, lost: 0 });
}

// Packing

#[test]
#[fuzzer(runs: 64, seed: 639)]
fn test_place_packing_round_trips(bucket: u8, index: u32, listed: bool) {
    let place = Place { bucket, index, listed };
    assert_eq!(PlacePacking::unpack(PlacePacking::pack(place)), place);
}

#[test]
#[fuzzer(runs: 64, seed: 639)]
fn test_shield_packing_round_trips(queue: u8, up: bool, seq: u64, until: u64) {
    let shield = Shield { queue, up, seq, until };
    assert_eq!(ShieldPacking::unpack(ShieldPacking::pack(shield)), shield);
}

#[test]
#[fuzzer(runs: 32, seed: 639)]
fn test_queue_packing_round_trips(head: u64, tail: u64) {
    let queue = Queue { head, tail };
    assert_eq!(QueuePacking::unpack(QueuePacking::pack(queue)), queue);
}

#[test]
#[fuzzer(runs: 32, seed: 639)]
fn test_village_packing_round_trips(status: u8, draws: u32) {
    let village = Village { status, draws };
    assert_eq!(VillagePacking::unpack(VillagePacking::pack(village)), village);
}

#[test]
fn test_packings_zero_is_default() {
    assert_eq!(PlacePacking::unpack(0), Default::default());
    assert_eq!(ShieldPacking::unpack(0), Default::default());
    assert_eq!(QueuePacking::unpack(0), Default::default());
    assert_eq!(VillagePacking::unpack(0), Default::default());
}

// The buckets

#[test]
fn test_bucket_of() {
    assert_eq!(bucket_of(0), 0);
    assert_eq!(bucket_of(99), 0);
    assert_eq!(bucket_of(100), 1);
    assert_eq!(bucket_of(25_000), TOP_BUCKET);
    assert_eq!(bucket_of(core::num::traits::Bounded::<u32>::MAX), TOP_BUCKET);
}

#[test]
fn test_insert_appends_and_sets_the_bit() {
    let mut b = buckets();
    b.insert(village(1), 0);
    b.insert(village(2), 150);
    b.insert(village(3), 25_000);
    assert_eq!(b.place(village(1)), Place { bucket: 0, index: 0, listed: true });
    assert_eq!(b.place(village(2)), Place { bucket: 1, index: 0, listed: true });
    assert_eq!(b.place(village(3)), Place { bucket: TOP_BUCKET, index: 0, listed: true });
    let expected: u256 = Bitmap::set_bit_at(3_u256, TOP_BUCKET, true);
    let registry: u256 = b.registry().into();
    assert_eq!(registry, expected);
}

#[test]
#[should_panic(expected: ('Buckets: already listed',))]
fn test_insert_twice_fails() {
    let mut b = buckets();
    b.insert(village(1), 0);
    b.insert(village(1), 500);
}

#[test]
fn test_remove_swaps_with_the_last_slot() {
    let mut b = buckets();
    b.insert(village(1), 0);
    b.insert(village(2), 10);
    b.insert(village(3), 20);
    b.remove(village(1));
    assert_eq!(b.bucket_size(0), 2);
    assert(b.slot(0, 0) == village(3), 'last not moved in');
    assert_eq!(b.place(village(3)), Place { bucket: 0, index: 0, listed: true });
    assert_eq!(b.place(village(1)), Default::default());
    assert(b.slot(0, 1) == village(2), 'other slot moved');
}

#[test]
fn test_registry_bit_clears_when_a_bucket_empties() {
    let mut b = buckets();
    b.insert(village(1), 150);
    assert_eq!(b.registry(), 2);
    b.remove(village(1));
    assert_eq!(b.registry(), 0);
}

#[test]
#[should_panic(expected: ('Buckets: not listed',))]
fn test_remove_unlisted_fails() {
    let mut b = buckets();
    b.remove(village(1));
}

#[test]
fn test_follow_moves_only_on_a_new_bucket() {
    let mut b = buckets();
    b.insert(village(1), 120);
    b.insert(village(2), 150);
    b.follow(village(1), 199);
    assert_eq!(b.place(village(1)), Place { bucket: 1, index: 0, listed: true });
    b.follow(village(1), 250);
    assert_eq!(b.place(village(1)), Place { bucket: 2, index: 0, listed: true });
    assert_eq!(b.place(village(2)), Place { bucket: 1, index: 0, listed: true });
    // An unlisted village is left out
    b.follow(village(3), 500);
    assert_eq!(b.place(village(3)), Default::default());
    assert_eq!(b.registry(), 6);
}

#[test]
fn test_draw_alone_finds_no_one() {
    let mut b = buckets();
    b.insert(village(1), 0);
    assert!(b.draw(village(1), 0, 12345).is_none());
}

#[test]
fn test_draw_takes_the_nearest_bucket() {
    let mut b = buckets();
    b.insert(village(1), 1_000);
    b.insert(village(2), 1_300);
    b.insert(village(3), 5_000);
    let mut random: felt252 = 0;
    while random != 8 {
        assert(b.draw(village(1), 1_000, random).unwrap() == village(2), 'not the nearest bucket');
        random += 1;
    }
}

#[test]
fn test_draw_tie_is_broken_by_the_random() {
    let mut b = buckets();
    b.insert(village(1), 1_000);
    b.insert(village(2), 800);
    b.insert(village(3), 1_200);
    assert(b.draw(village(1), 1_000, 0).unwrap() == village(3), 'even: above');
    assert(b.draw(village(1), 1_000, 1).unwrap() == village(2), 'odd: below');
}

#[test]
#[fuzzer(runs: 64, seed: 639)]
fn test_draw_never_returns_the_attacker(random: felt252, count: u8, which: u8) {
    let mut b = buckets();
    let count: u32 = 2 + (count % 6).into();
    let mut id: u32 = 0;
    while id != count {
        b.insert(village(id), 0);
        id += 1;
    }
    let attacker = village(which.into() % count);
    let drawn = b.draw(attacker, 0, random).unwrap();
    assert(drawn != attacker, 'self match');
    assert(b.place(drawn).listed, 'drawn unlisted');
}

#[test]
fn test_unlisted_attacker_draws_from_its_crowns_bucket() {
    let mut b = buckets();
    b.insert(village(2), 0);
    b.insert(village(3), 900);
    assert(b.draw(village(1), 0, 7).unwrap() == village(2), 'wrong opponent');
    assert(b.draw(village(1), 850, 7).unwrap() == village(3), 'wrong opponent');
}

// The shields

#[test]
fn test_raise_appends_to_the_queue() {
    let mut s = shields();
    s.raise(village(1), QUEUE_INITIAL, START + INITIAL_SHIELD);
    s.raise(village(2), QUEUE_INITIAL, START + INITIAL_SHIELD);
    assert_eq!(
        s.shield(village(2)),
        Shield { queue: QUEUE_INITIAL, up: true, seq: 1, until: START + INITIAL_SHIELD },
    );
    assert_eq!(s.queue(QUEUE_INITIAL), Queue { head: 0, tail: 2 });
    assert(s.queue_entry(QUEUE_INITIAL, 1) == village(2), 'entry not the village');
}

#[test]
#[should_panic(expected: ('Shields: already up',))]
fn test_raise_twice_fails() {
    let mut s = shields();
    s.raise(village(1), QUEUE_INITIAL, START);
    s.raise(village(1), QUEUE_ATTACK, START);
}

#[test]
#[should_panic(expected: ('Shields: not up',))]
fn test_lower_without_a_shield_fails() {
    let mut s = shields();
    s.lower(village(1));
}

#[test]
fn test_release_waits_for_the_end() {
    let mut s = shields();
    s.raise(village(1), QUEUE_ATTACK, START + ATTACK_SHIELD);
    assert_eq!(s.release(START + ATTACK_SHIELD - 1, 2).len(), 0);
    assert_eq!(s.release(START + ATTACK_SHIELD, 2), array![village(1)]);
    assert!(!s.is_up(village(1)));
    assert_eq!(s.queue(QUEUE_ATTACK), Queue { head: 1, tail: 1 });
}

#[test]
fn test_release_takes_at_most_max_in_arrival_order() {
    let mut s = shields();
    s.raise(village(1), QUEUE_ATTACK, START);
    s.raise(village(2), QUEUE_ATTACK, START + 1);
    s.raise(village(3), QUEUE_ATTACK, START + 2);
    assert_eq!(s.release(START + 10, 2), array![village(1), village(2)]);
    assert!(s.is_up(village(3)));
}

#[test]
fn test_release_takes_the_earliest_end_across_queues() {
    let mut s = shields();
    s.raise(village(1), QUEUE_INITIAL, START + INITIAL_SHIELD);
    let late = START + INITIAL_SHIELD - ATTACK_SHIELD + 100;
    s.raise(village(3), QUEUE_ATTACK, late + ATTACK_SHIELD);
    assert_eq!(s.release(START + INITIAL_SHIELD, 1), array![village(1)]);
    assert_eq!(s.release(late + ATTACK_SHIELD, 2), array![village(3)]);
}

#[test]
fn test_release_discards_stale_entries() {
    let mut s = shields();
    s.raise(village(1), QUEUE_INITIAL, START + INITIAL_SHIELD);
    s.raise(village(2), QUEUE_INITIAL, START + INITIAL_SHIELD);
    s.raise(village(3), QUEUE_INITIAL, START + INITIAL_SHIELD);
    // Villages 1 and 2 attack: their shields drop, their entries turn stale; 1 is shielded again
    s.lower(village(1));
    s.lower(village(2));
    s.raise(village(1), QUEUE_ATTACK, START + ATTACK_SHIELD);
    assert_eq!(s.release(START + INITIAL_SHIELD, 2), array![village(1), village(3)]);
    assert_eq!(s.queue(QUEUE_INITIAL), Queue { head: 3, tail: 3 });
}

#[test]
fn test_release_budget_bounds_stale_pops() {
    let mut s = shields();
    let mut id: u32 = 0;
    while id != 6 {
        s.raise(village(id), QUEUE_INITIAL, START + INITIAL_SHIELD);
        id += 1;
    }
    id = 0;
    while id != 5 {
        s.lower(village(id));
        id += 1;
    }
    // A budget of 2 x 1 pops two stale entries and releases nothing
    assert_eq!(s.release(START + INITIAL_SHIELD, 1).len(), 0);
    assert_eq!(s.queue(QUEUE_INITIAL).head, 2);
    // The next call reaches village 5
    assert_eq!(s.release(START + INITIAL_SHIELD, 2), array![village(5)]);
}
