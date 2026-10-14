//! A `Challenge` upgraded in place to the G4 class (D-17, as Sepolia will be): its spawn is not
//! paused and it has no guardian, and a game spawned before the upgrade plays on and ends.
//!
//! G4 appends two storage variables to `Challenge` (P-42): `guardian` and `spawn_paused`. A class
//! before G4 never writes them, so after the upgrade they read zero and false: no guardian, spawn
//! not paused. The test: `Challenge` is given a class without them (the frozen spawn of f94c34f,
//! `legacy_g1::ChallengeBeforeG1`, as `upgrade_g1.cairo` does), which spawns a game, paid and
//! minted; both slots read zero at their names; `Challenge` is upgraded back to the G4 class; the
//! views read no guardian and no pause, a new game spawns, the game in flight ends and is recorded,
//! and the owner can then set a guardian who pauses.

use core::num::traits::Zero;
use openzeppelin_interfaces::upgrades::{IUpgradeableDispatcher, IUpgradeableDispatcherTrait};
use paved::systems::challenge::{IChallengeGuardianDispatcher, IChallengeGuardianDispatcherTrait};
use paved::systems::economy::IEconomyDispatcherTrait;
use paved::tests::legacy_g1::{IChallengeBeforeG1Dispatcher, IChallengeBeforeG1DispatcherTrait};
use paved::tests::setup::setup;
use paved::tests::setup::setup::{IChallengeDispatcherTrait, OWNER, PLAYER, TestStoreTrait};
use paved::types::mode::Mode;
use snforge_std::{DeclareResultTrait, declare, get_class_hash, load, start_cheat_caller_address};

#[test]
#[available_gas(l2_gas: 162977804)]
fn test_upgrade_g4_starts_unpaused_and_keeps_the_game_in_flight() {
    let (store, systems, _) = setup::spawn_game(Mode::None);
    let contract = systems.challenge.contract_address;
    let guardian = IChallengeGuardianDispatcher { contract_address: contract };

    // [Before the upgrade] a class without the G4 slots spawns the game in flight
    let class_g4 = get_class_hash(contract);
    let frozen = *declare("ChallengeBeforeG1").unwrap().contract_class().class_hash;
    start_cheat_caller_address(contract, OWNER());
    IUpgradeableDispatcher { contract_address: contract }.upgrade(frozen);
    start_cheat_caller_address(contract, PLAYER());
    let in_flight = IChallengeBeforeG1Dispatcher { contract_address: contract }
        .spawn(1, Zero::zero(), 0);
    assert(store.game(in_flight).player_id == PLAYER().into(), 'G4: no game in flight');
    // Never written: both slots read zero at their names
    assert(*load(contract, selector!("guardian"), 1).at(0) == 0, 'G4: guardian slot');
    assert(*load(contract, selector!("spawn_paused"), 1).at(0) == 0, 'G4: spawn_paused slot');

    // [Upgrade] to the G4 class
    start_cheat_caller_address(contract, OWNER());
    IChallengeBeforeG1Dispatcher { contract_address: contract }.upgrade(class_g4);
    start_cheat_caller_address(contract, PLAYER());
    assert_eq!(get_class_hash(contract), class_g4);

    // [After the upgrade] no guardian, not paused: a new game spawns
    assert(guardian.guardian().is_zero(), 'G4: a guardian');
    assert(!guardian.spawn_paused(), 'G4: paused');
    let after = systems.challenge.spawn(1, Zero::zero(), 0);
    assert(store.game(after).player_id == PLAYER().into(), 'G4: no new game');

    // The game in flight plays on and ends, recorded by `Economy`
    systems.challenge.discard(in_flight);
    systems.challenge.surrender(in_flight);
    assert(store.game(in_flight).over, 'G4: in flight not over');
    assert(systems.economy.terms(in_flight).recorded, 'G4: in flight not recorded');

    // The owner sets a guardian, who pauses; the new game still ends
    start_cheat_caller_address(contract, OWNER());
    guardian.set_guardian(PLAYER());
    start_cheat_caller_address(contract, PLAYER());
    guardian.pause_spawn();
    assert(guardian.spawn_paused(), 'G4: not paused');
    systems.challenge.surrender(after);
    assert(systems.economy.terms(after).recorded, 'G4: new game not recorded');
}
