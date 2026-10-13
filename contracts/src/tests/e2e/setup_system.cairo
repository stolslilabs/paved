//! `Setup` alone (D-24, P-51 ruling 3): the owner-only allowlist of reporters, the report a
//! reporter makes for any player, and the tutorial claim (D-21, P-49 ruling 2). The definitions are
//! tested in `e2e/quests.cairo`, and the report a game over makes in `e2e/cold_paths.cairo`.

use openzeppelin_interfaces::upgrades::{IUpgradeableDispatcher, IUpgradeableDispatcherTrait};
use paved::constants;
use paved::systems::setup::{ISetupDispatcher, ISetupDispatcherTrait, Setup};
use paved::tests::setup::setup::{ANYONE, OWNER, PLAYER, SOMEONE};
use quiver_achievement::component::AchievementComponent;
use quiver_achievement::events::index::{AchievementProgressed, AchievementReporterSet};
use quiver_achievement::types::batch::TaskProgress as AchievementProgress;
use quiver_quest::component::QuestComponent;
use quiver_quest::events::index::{QuestProgressed, QuestReporterSet};
use quiver_quest::types::batch::TaskProgress as QuestProgress;
use snforge_std::{
    ContractClassTrait, DeclareResultTrait, EventSpyAssertionsTrait, EventSpyTrait, declare,
    spy_events, start_cheat_caller_address, stop_cheat_caller_address,
};
use starknet::ContractAddress;

fn deploy_setup() -> ISetupDispatcher {
    let class = declare("Setup").unwrap().contract_class();
    let (address, _) = class.deploy(@array![OWNER().into()]).unwrap();
    ISetupDispatcher { contract_address: address }
}

/// `Setup` with `ANYONE` as its reporter.
fn setup_with_reporter() -> ISetupDispatcher {
    let system = deploy_setup();
    start_cheat_caller_address(system.contract_address, OWNER());
    system.set_reporter(ANYONE(), true);
    stop_cheat_caller_address(system.contract_address);
    system
}

fn quest_progressed(player_id: felt252, task_id: u32, count: u32) -> Setup::Event {
    Setup::Event::QuestEvent(
        QuestComponent::Event::QuestProgressed(QuestProgressed { player_id, task_id, count }),
    )
}

fn achievement_progressed(player_id: felt252, task_id: u32, count: u32) -> Setup::Event {
    Setup::Event::AchievementEvent(
        AchievementComponent::Event::AchievementProgressed(
            AchievementProgressed { player_id, task_id, count },
        ),
    )
}

fn quest_set(allowed: bool) -> Setup::Event {
    Setup::Event::QuestEvent(
        QuestComponent::Event::QuestReporterSet(QuestReporterSet { reporter: ANYONE(), allowed }),
    )
}

fn achievement_set(allowed: bool) -> Setup::Event {
    Setup::Event::AchievementEvent(
        AchievementComponent::Event::AchievementReporterSet(
            AchievementReporterSet { reporter: ANYONE(), allowed },
        ),
    )
}

// The allowlist

/// `set_reporter` writes both components and emits both events; the view follows it.
#[test]
#[available_gas(l2_gas: 40000000)]
fn test_setup_owner_sets_and_revokes_a_reporter() {
    let system = deploy_setup();
    let address = system.contract_address;
    assert(!system.is_reporter(ANYONE()), 'Setup: reporter before');
    let mut spy = spy_events();
    start_cheat_caller_address(address, OWNER());
    system.set_reporter(ANYONE(), true);
    assert(system.is_reporter(ANYONE()), 'Setup: not reporter');
    system.set_reporter(ANYONE(), false);
    stop_cheat_caller_address(address);
    assert(!system.is_reporter(ANYONE()), 'Setup: still reporter');
    spy
        .assert_emitted(
            @array![
                (address, quest_set(true)), (address, achievement_set(true)),
                (address, quest_set(false)), (address, achievement_set(false)),
            ],
        );
    assert(spy.get_events().events.len() == 4, 'Setup: other events');
}

#[test]
#[available_gas(l2_gas: 40000000)]
#[should_panic(expected: 'Ownable: caller is not owner')]
fn test_setup_set_reporter_not_owner() {
    let system = deploy_setup();
    start_cheat_caller_address(system.contract_address, ANYONE());
    system.set_reporter(ANYONE(), true);
}

/// A revoked reporter cannot report.
#[test]
#[available_gas(l2_gas: 40000000)]
#[should_panic(expected: 'Quest: not reporter')]
fn test_setup_report_revoked_reporter() {
    let system = setup_with_reporter();
    start_cheat_caller_address(system.contract_address, OWNER());
    system.set_reporter(ANYONE(), false);
    start_cheat_caller_address(system.contract_address, ANYONE());
    system.report('PLAYER', array![].span(), array![].span());
}

// The report

/// Any caller that is not a reporter, the owner included, is refused.
#[test]
#[available_gas(l2_gas: 40000000)]
#[should_panic(expected: 'Quest: not reporter')]
fn test_setup_report_not_reporter() {
    let system = setup_with_reporter();
    start_cheat_caller_address(system.contract_address, SOMEONE());
    system
        .report(
            'PLAYER',
            array![QuestProgress { task_id: 1, count: 1 }].span(),
            array![AchievementProgress { task_id: 1, count: 1 }].span(),
        );
}

#[test]
#[available_gas(l2_gas: 40000000)]
#[should_panic(expected: 'Quest: not reporter')]
fn test_setup_report_owner_is_not_a_reporter() {
    let system = setup_with_reporter();
    start_cheat_caller_address(system.contract_address, OWNER());
    system.report('PLAYER', array![].span(), array![].span());
}

/// A reporter reports for the player it names: one `QuestProgressed` per quest entry and one
/// `AchievementProgressed` per achievement entry, nothing else.
#[test]
#[available_gas(l2_gas: 40000000)]
fn test_setup_reporter_reports_every_entry() {
    let system = setup_with_reporter();
    let address = system.contract_address;
    let mut spy = spy_events();
    start_cheat_caller_address(address, ANYONE());
    system
        .report(
            'PLAYER',
            array![QuestProgress { task_id: 1, count: 1 }, QuestProgress { task_id: 3, count: 900 }]
                .span(),
            array![
                AchievementProgress { task_id: 1, count: 1 },
                AchievementProgress { task_id: 4, count: 2 },
                AchievementProgress { task_id: 7, count: 1 },
            ]
                .span(),
        );
    stop_cheat_caller_address(address);
    spy
        .assert_emitted(
            @array![
                (address, quest_progressed('PLAYER', 1, 1)),
                (address, quest_progressed('PLAYER', 3, 900)),
                (address, achievement_progressed('PLAYER', 1, 1)),
                (address, achievement_progressed('PLAYER', 4, 2)),
                (address, achievement_progressed('PLAYER', 7, 1)),
            ],
        );
    assert(spy.get_events().events.len() == 5, 'Setup: other events');
}

// The tutorial claim

/// The first claim emits task 10 once for its caller and sets the flag; a second claim emits
/// nothing, does not revert and changes nothing; another player's flag is untouched.
#[test]
#[available_gas(l2_gas: 40000000)]
fn test_setup_claim_tutorial_once() {
    let system = deploy_setup();
    let address = system.contract_address;
    let player: felt252 = PLAYER().into();
    assert(!system.tutorial_claimed(player), 'Setup: claimed before');
    let mut spy = spy_events();
    start_cheat_caller_address(address, PLAYER());
    system.claim_tutorial();
    stop_cheat_caller_address(address);
    spy
        .assert_emitted(
            @array![
                (address, achievement_progressed(player, constants::TASK_TUTORIAL_FINISHED, 1)),
            ],
        );
    assert(spy.get_events().events.len() == 1, 'Setup: one event');
    assert(system.tutorial_claimed(player), 'Setup: not claimed');
    assert(!system.tutorial_claimed(ANYONE().into()), 'Setup: other claimed');

    // [Again] No effect, no revert, no event
    let mut again = spy_events();
    start_cheat_caller_address(address, PLAYER());
    system.claim_tutorial();
    stop_cheat_caller_address(address);
    assert(again.get_events().events.len() == 0, 'Setup: claimed twice');
    assert(system.tutorial_claimed(player), 'Setup: flag lost');
}

/// The claim needs no registration and no reporter: any caller claims for itself only.
#[test]
#[available_gas(l2_gas: 40000000)]
fn test_setup_claim_tutorial_is_the_callers() {
    let system = deploy_setup();
    let address = system.contract_address;
    let mut spy = spy_events();
    start_cheat_caller_address(address, SOMEONE());
    system.claim_tutorial();
    stop_cheat_caller_address(address);
    let someone: felt252 = SOMEONE().into();
    spy
        .assert_emitted(
            @array![
                (address, achievement_progressed(someone, constants::TASK_TUTORIAL_FINISHED, 1)),
            ],
        );
    assert(system.tutorial_claimed(someone), 'Setup: not claimed');
    assert(!system.tutorial_claimed(PLAYER().into()), 'Setup: claimed for another');
}

// Ownable and upgradeable

#[test]
#[available_gas(l2_gas: 40000000)]
#[should_panic(expected: 'Ownable: caller is not owner')]
fn test_setup_upgrade_not_owner() {
    let system = deploy_setup();
    let class = *declare("Setup").unwrap().contract_class().class_hash;
    start_cheat_caller_address(system.contract_address, ANYONE());
    IUpgradeableDispatcher { contract_address: system.contract_address }.upgrade(class);
}

/// An upgrade keeps the storage: the allowlist and the claims survive it.
#[test]
#[available_gas(l2_gas: 60000000)]
fn test_setup_upgrade_keeps_the_storage() {
    let system = setup_with_reporter();
    let address: ContractAddress = system.contract_address;
    start_cheat_caller_address(address, PLAYER());
    system.claim_tutorial();
    let class = *declare("Setup").unwrap().contract_class().class_hash;
    start_cheat_caller_address(address, OWNER());
    IUpgradeableDispatcher { contract_address: address }.upgrade(class);
    stop_cheat_caller_address(address);
    assert(system.is_reporter(ANYONE()), 'Setup: reporter lost');
    assert(system.tutorial_claimed(PLAYER().into()), 'Setup: claim lost');
}
