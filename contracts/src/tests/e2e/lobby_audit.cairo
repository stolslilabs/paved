//! The notes of the S1 audit on the `Lobby` split (P-26): the storage layout of `Lobby` and `Daily`
//! pinned variable by variable, a token that calls back into `Daily` during a library call, and
//! the mode `Lobby.spawn` is given.

use core::num::traits::Zero;
use paved::components::ownable::{IOwnableDispatcher, IOwnableDispatcherTrait};
use paved::constants;
use paved::day::day_id;
use paved::mocks::reentrant_token::{
    IReentrantTokenDispatcher, IReentrantTokenDispatcherTrait, SPAWN,
};
use paved::systems::daily::{IDailyDispatcher, IDailyQuestsDispatcher, IDailyQuestsDispatcherTrait};
use paved::systems::tutorial::ITutorialDispatcherTrait;
use paved::tests::e2e::lobby::{ISpyEconomyDispatcher, ISpyEconomyDispatcherTrait, daily_paid_in};
use paved::tests::setup::setup;
use paved::tests::setup::setup::{ANYONE, IDailyDispatcherTrait, OWNER, PLAYER};
use paved::types::mode::Mode;
use paved::views::{IGameViewDispatcher, IGameViewDispatcherTrait};
use quiver_achievement::types::task::AchievementTask;
use quiver_achievement::types::window::AchievementWindow;
use quiver_quest::types::schedule::QuestSchedule;
use quiver_quest::types::task::QuestTask;
use snforge_std::{
    load, map_entry_address, start_cheat_block_timestamp_global, start_cheat_caller_address,
    stop_cheat_caller_address,
};
use starknet::ContractAddress;

const DAY: u32 = 86400;

// Layout: every storage variable of the components `Daily` and `Lobby` share

/// The raw slot of a plain storage variable.
fn raw(contract: ContractAddress, name: felt252) -> felt252 {
    *load(contract, name, 1).at(0)
}

/// The raw slot of a map entry.
fn raw_entry(contract: ContractAddress, map: felt252, key: Array<felt252>) -> felt252 {
    *load(contract, map_entry_address(map, key.span()), 1).at(0)
}

/// Pins, by name, every storage variable that `Lobby` shares with `Daily`: `owner` and
/// `pending_owner` (ownable), `token_address` (payable), `sponsorships` (hostable, dead since D-20
/// under P-42: a whole game of the day leaves its slot at zero, never written) and the
/// quiver ones a definition writes (`Quest_definitions`, `Quest_tasks`, `Quest_conditions`,
/// `Achievement_definitions`, `Achievement_extra_tasks`). `Quest_progress`, `Quest_records`,
/// `Quest_held` and the two `*_reporters` maps are not written by `Lobby` or `Daily`: the game over
/// reports in `QuestMode::Event`, which emits events and stores nothing (a probe found no slot). A
/// variable renamed, moved or added to a shared component without this list changing fails here,
/// because the name is the slot. Each one is written by one class and read at its raw address, or
/// the other way round, through the class that does not write it.
///
/// A fully structural test (enumerate the variables, write each through one class and read it
/// through the other) is not possible in snforge: a contract class lists no storage variables
/// (the ABI holds none) and `Lobby` cannot be deployed, so it has no address to read. Whoever adds
/// a variable to `OwnableComponent`, `PayableComponent`, `HostableComponent`, `QuestComponent` or
/// `AchievementComponent` adds it here. `lobby_class` is `Daily`'s alone (`Lobby` never reads it;
/// `Daily`'s owner sets it, P-42). `UpgradeableComponent` has no storage.
#[test]
#[available_gas(l2_gas: 400000000)]
fn test_lobby_and_daily_pin_every_shared_storage_variable_by_name() {
    start_cheat_block_timestamp_global(10 * 86400);
    let (_, systems, context) = setup::spawn_game(Mode::None);
    let daily = systems.daily.contract_address;
    let admin = IDailyQuestsDispatcher { contract_address: daily };
    let ownable = IOwnableDispatcher { contract_address: daily };

    // [Daily writes, Lobby reads] `token_address`, set by `Daily`'s constructor, is what `Lobby`
    // pays
    assert(
        raw(daily, selector!("token_address")) == context.token.contract_address.into(),
        'Pin: token_address',
    );

    // [Daily writes, Lobby reads] `owner` and `pending_owner`: a transfer of ownership, then a
    // definition `Lobby` accepts from the new owner alone
    assert(raw(daily, selector!("owner")) == OWNER().into(), 'Pin: owner');
    assert(raw(daily, selector!("pending_owner")) == 0, 'Pin: pending_owner before');
    start_cheat_caller_address(daily, OWNER());
    ownable.transfer_ownership(ANYONE());
    assert(raw(daily, selector!("pending_owner")) == ANYONE().into(), 'Pin: pending_owner');
    start_cheat_caller_address(daily, ANYONE());
    ownable.accept_ownership();
    assert(raw(daily, selector!("owner")) == ANYONE().into(), 'Pin: owner after');
    assert(raw(daily, selector!("pending_owner")) == 0, 'Pin: pending_owner after');
    let window = AchievementWindow { start: 0, end: 0 };
    let schedule = QuestSchedule { start: 0, end: 0, duration: DAY, interval: DAY };
    // [Lobby writes] quest 1, with one condition (quest 2 first), achievement 3 with 2 tasks
    admin
        .define_quest(
            2, schedule, array![QuestTask { task_id: 1, total: 1 }].span(), array![].span(),
        );
    admin
        .define_quest(
            1, schedule, array![QuestTask { task_id: 1, total: 1 }].span(), array![2].span(),
        );
    admin
        .define_achievement(
            3,
            window,
            array![
                AchievementTask { task_id: 1, total: 1 }, AchievementTask { task_id: 2, total: 1 },
            ]
                .span(),
            10,
        );
    stop_cheat_caller_address(daily);
    // [Dead since D-20] `sponsorships` (P-42): a whole game of the day, spawned and ended through
    // `Lobby`, leaves the slot of its player at zero
    start_cheat_caller_address(daily, PLAYER());
    let game_id = systems.daily.spawn(1, Zero::zero(), 0);
    systems.daily.surrender(game_id);
    stop_cheat_caller_address(daily);
    let day = day_id(10 * 86400, constants::DAILY_DURATION);
    assert(
        raw_entry(daily, selector!("sponsorships"), array![day.into(), PLAYER().into()]) == 0,
        'Pin: sponsorships written',
    );
    assert(
        raw_entry(daily, selector!("Quest_definitions"), array![1]) != 0, 'Pin: Quest_definitions',
    );
    assert(raw_entry(daily, selector!("Quest_tasks"), array![1]) != 0, 'Pin: Quest_tasks');
    assert(
        raw_entry(daily, selector!("Quest_conditions"), array![1]) != 0, 'Pin: Quest_conditions',
    );
    assert(
        raw_entry(daily, selector!("Achievement_definitions"), array![3]) != 0,
        'Pin: Achievement_definitions',
    );
    assert(
        raw_entry(daily, selector!("Achievement_extra_tasks"), array![3]) != 0,
        'Pin: Achievement_extra_tasks',
    );
}

// Re-entry: a token that calls back into `Daily` during a `Lobby` library call

fn reentrant_with_economy() -> (
    IDailyDispatcher, IReentrantTokenDispatcher, ISpyEconomyDispatcher,
) {
    start_cheat_block_timestamp_global(100);
    let (daily, token, economy) = daily_paid_in("ReentrantToken");
    (daily, IReentrantTokenDispatcher { contract_address: token }, economy)
}

/// A spawn pays by `transferFrom` after the game is stored; the token calls `spawn` again from
/// inside it, as the player. The nested spawn succeeds (its transfer is not re-entered: one
/// re-entry is armed): the player holds two games, each with its own purchase, each paid once, and
/// the first game is as it was written.
#[test]
#[available_gas(l2_gas: 140000000)]
fn test_lobby_reentry_during_spawn_cannot_change_the_game_written() {
    let (daily, token, economy) = reentrant_with_economy();
    token.arm(daily.contract_address, SPAWN);
    let views = IGameViewDispatcher { contract_address: daily.contract_address };
    let price: u256 = constants::DAILY_PRICE.into();
    let first = daily.spawn(1, Zero::zero(), 0);
    let (attempts, reverted) = token.outcome();
    assert(attempts == 1 && reverted == 0, 'Reentry: nested spawn refused');
    assert(first == 1, 'Reentry: first id');
    // [Nested game] exists, is the player's, is a Daily game
    let nested = views.game(2);
    assert(nested.id == 2 && nested.player_id == PLAYER().into(), 'Reentry: nested game');
    assert(nested.mode == Mode::Daily.into() && nested.tile_id != 0, 'Reentry: nested mode');
    // [First game] unchanged
    let game = views.game(1);
    assert(game.id == 1 && game.player_id == PLAYER().into(), 'Reentry: first game');
    assert(game.mode == Mode::Daily.into() && game.tile_count == 2, 'Reentry: first changed');
    assert(game.tile_id != 0 && !game.over, 'Reentry: first state');
    // [Terms] one purchase per game; the outer one is the last, on game 1
    let purchase = economy.purchased();
    assert(purchase.count == 2, 'Reentry: two purchases');
    assert(purchase.game_id == 1 && purchase.player == PLAYER(), 'Reentry: purchase game');
    assert(purchase.price == price, 'Reentry: purchase price');
    // [Paid] exactly twice the price, all of it to Economy
    let (paid, recipient) = token.paid();
    assert(paid == 2 * price, 'Reentry: paid twice');
    assert(recipient == economy.contract_address, 'Reentry: paid to economy');
}

// Mode: `Lobby.spawn` takes a mode, no entry point of the game contracts does

/// `Daily.spawn` has no mode argument (it passes `Mode::Daily`) and `Tutorial.spawn` neither (it
/// passes `Mode::Tutorial`): the game each stores has that mode, for any caller.
#[test]
#[available_gas(l2_gas: 140000000)]
fn test_lobby_spawn_mode_is_fixed_by_the_game_contract() {
    start_cheat_block_timestamp_global(100);
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let daily = IGameViewDispatcher { contract_address: systems.daily.contract_address };
    let tutorial = IGameViewDispatcher { contract_address: systems.tutorial.contract_address };
    let tutorial_id = systems.tutorial.spawn();
    assert(tutorial.game(tutorial_id).mode == Mode::Tutorial.into(), 'Mode: tutorial');
    let daily_id = systems.daily.spawn(1, Zero::zero(), 0);
    assert(daily.game(daily_id).mode == Mode::Daily.into(), 'Mode: daily');
}
