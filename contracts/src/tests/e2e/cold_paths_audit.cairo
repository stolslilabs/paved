//! The notes of the S1 audit (P-26), kept after D-24 moved the cold paths back into `Daily`: its
//! storage variables pinned by name, the fields dead since D-20 and D-24 pinned by name and
//! against reuse, a token that calls back into `Daily` during its spawn, and the mode a spawn
//! stores.

use core::num::traits::Zero;
use paved::components::drawable::{IDrawableDispatcher, IDrawableDispatcherTrait};
use paved::components::hostable::HostableComponent;
use paved::components::hostable::HostableComponent::DeadFieldsTrait as HostableDeadFieldsTrait;
use paved::components::ownable::{IOwnableDispatcher, IOwnableDispatcherTrait};
use paved::constants;
use paved::day::day_id;
use paved::mocks::reentrant_token::{
    IReentrantTokenDispatcher, IReentrantTokenDispatcherTrait, SPAWN,
};
use paved::models::tile::CENTER;
use paved::store::PavedStorage;
use paved::systems::challenge::Challenge::DeadFieldsTrait;
use paved::systems::challenge::{
    Challenge, IChallengeDispatcherTrait as RawChallengeDispatcherTrait,
    IChallengeGuardianDispatcher, IChallengeGuardianDispatcherTrait,
};
use paved::tests::e2e::cold_paths::{
    ISpyEconomyDispatcher, ISpyEconomyDispatcherTrait, daily_paid_in,
};
use paved::tests::e2e::quests::define_accepted_list;
use paved::tests::setup::setup;
use paved::tests::setup::setup::{
    ANYONE, IChallengeDispatcherTrait, OWNER, PLAYER, TestChallenge, TestStoreTrait,
};
use paved::types::mode::Mode;
use paved::types::orientation::Orientation;
use paved::types::plan::Plan;
use paved::views::{IGameViewDispatcher, IGameViewDispatcherTrait};
use snforge_std::{
    load, map_entry_address, start_cheat_block_timestamp_global, start_cheat_caller_address,
    stop_cheat_caller_address, store as write_raw,
};
use starknet::ContractAddress;
use starknet::storage::{StorageAsPath, StorageAsPointer, StorageBase, StoragePathEntry};
use starknet::storage_access::storage_address_from_base;

/// The raw slot of a plain storage variable.
fn raw(contract: ContractAddress, name: felt252) -> felt252 {
    *load(contract, name, 1).at(0)
}

/// Pins, by name, the storage variables of `Daily` that its constructor and its owner write:
/// `owner` and `pending_owner` (ownable), `token_address` (payable), `setup` (D-24), and
/// `guardian` and `spawn_paused` (G4). A variable
/// renamed or moved fails here, because the name is the slot: an upgrade in place would lose it.
/// The dead ones are pinned by `test_daily_pins_the_dead_fields_by_name`. `UpgradeableComponent`
/// has no storage.
#[test]
#[available_gas(l2_gas: 96675533)]
fn test_daily_pins_its_storage_variables_by_name() {
    let (_, systems, context) = setup::spawn_game(Mode::None);
    let challenge = systems.challenge.contract_address;
    let ownable = IOwnableDispatcher { contract_address: challenge };
    assert(
        raw(challenge, selector!("token_address")) == context.token.contract_address.into(),
        'Pin: token_address',
    );
    assert(
        raw(challenge, selector!("setup")) == systems.setup.contract_address.into(), 'Pin: setup',
    );
    assert(raw(challenge, selector!("owner")) == OWNER().into(), 'Pin: owner');
    assert(raw(challenge, selector!("pending_owner")) == 0, 'Pin: pending_owner before');
    start_cheat_caller_address(challenge, OWNER());
    ownable.transfer_ownership(ANYONE());
    assert(raw(challenge, selector!("pending_owner")) == ANYONE().into(), 'Pin: pending_owner');
    start_cheat_caller_address(challenge, ANYONE());
    ownable.accept_ownership();
    stop_cheat_caller_address(challenge);
    assert(raw(challenge, selector!("owner")) == ANYONE().into(), 'Pin: owner after');
    assert(raw(challenge, selector!("pending_owner")) == 0, 'Pin: pending_owner after');
    // G4 (appended): the guardian and the pause, zero and false until written
    let guardian = IChallengeGuardianDispatcher { contract_address: challenge };
    assert(raw(challenge, selector!("guardian")) == 0, 'Pin: guardian before');
    assert(raw(challenge, selector!("spawn_paused")) == 0, 'Pin: spawn_paused before');
    start_cheat_caller_address(challenge, ANYONE());
    guardian.set_guardian(PLAYER());
    guardian.pause_spawn();
    assert(raw(challenge, selector!("guardian")) == PLAYER().into(), 'Pin: guardian');
    assert(raw(challenge, selector!("spawn_paused")) == 1, 'Pin: spawn_paused');
    guardian.unpause_spawn();
    assert(raw(challenge, selector!("spawn_paused")) == 0, 'Pin: spawn_paused after');
    stop_cheat_caller_address(challenge);
    // #645 (appended): the VRF provider and the last draw's transaction (the flat `drawable`), the
    // spawn count of each player
    let provider = IDrawableDispatcher { contract_address: challenge }.vrf_provider();
    assert(raw(challenge, selector!("vrf_provider")) == provider.into(), 'Pin: vrf_provider');
    assert(raw(challenge, selector!("vrf_last_draw_tx")) == 0, 'Pin: vrf_last_draw_tx before');
    let count = snforge_std::map_entry_address(
        selector!("vrf_spawn_counts"), array![PLAYER().into()].span(),
    );
    assert(raw(challenge, count) == 0, 'Pin: vrf_spawn_counts before');
    start_cheat_caller_address(challenge, PLAYER());
    snforge_std::start_cheat_transaction_hash_global('PIN_TX');
    systems.challenge.dispatcher().spawn(1, core::num::traits::Zero::zero(), 0);
    stop_cheat_caller_address(challenge);
    assert(raw(challenge, selector!("vrf_last_draw_tx")) == 'PIN_TX', 'Pin: vrf_last_draw_tx');
    assert(raw(challenge, count) == 1, 'Pin: vrf_spawn_counts');
}

// Dead since D-20, D-24 and D-25 E (P-42): declared, never written or read, never reused

/// The `Slots` of a map entry of the `paved` node, computed from the names alone: a member of a
/// storage node sits at `pedersen(node, selector!(name))`, a map entry at `pedersen(map, key)`.
fn paved_entry(member: felt252, key: felt252) -> felt252 {
    core::pedersen::pedersen(core::pedersen::pedersen(selector!("paved"), member), key)
}

/// The address the code resolves for a storage path, as a felt.
fn address_of<T, +Drop<T>, +StorageAsPointer<T>>(path: T) -> felt252 {
    storage_address_from_base(path.as_ptr().__storage_pointer_address__).into()
}

/// Pins the dead fields of `Daily` by name, two ways: those of D-20, `sponsorships` (hostable),
/// `tournaments` and `rankings` (the `paved` node), those of D-25 E, `account` and `players` (the
/// `paved` node: `Account` left the systems), and those of D-24, `lobby_class` and every
/// member of the flat quest and achievement substorage (`Quest_definitions`, `Quest_tasks`,
/// `Quest_conditions`, `Quest_progress`, `Quest_records`, `Quest_held`, `Quest_reporters`,
/// `Achievement_definitions`, `Achievement_extra_tasks`, `Achievement_reporters`).
/// 1. **Name**: the entry address the code resolves through the field, in `Daily`'s storage
///    (`HostableComponent` as `Daily` embeds it, `PavedStorage`, and `Daily`'s own members through
///    the test-only `dead_addresses`), equals the address computed from the literal name. A rename
///    or a removal fails to compile here, or moves the address away from the literal: the assert
///    fails. A retype of the key moves it too.
/// 2. **Reuse**: a sentinel written at each raw address survives a whole game of that day (spawn,
///    build, discard, surrender, each reported to `Setup`) and the definition of the accepted list
///    on `Setup`. A field that a new code path writes again, or that another variable reuses,
///    overwrites it.
/// The names `test_daily_pins_*` are kept from before D-23 (`Daily` became `Challenge`) on purpose:
/// the docs and the comments of the code cite them.
#[test]
#[available_gas(l2_gas: 148014460)]
fn test_daily_pins_the_dead_fields_by_name() {
    start_cheat_block_timestamp_global(10 * 86400);
    let (store, systems, context) = setup::spawn_game(Mode::None);
    let challenge = systems.challenge.contract_address;
    let day: u64 = day_id(10 * 86400, constants::CHALLENGE_DURATION);
    let player: ContractAddress = PLAYER();
    let id: u32 = 1;

    // [Name] D-20: `sponsorships`, flat in the substorage of `Daily`
    let sponsorship = map_entry_address(
        selector!("sponsorships"), array![day.into(), player.into()].span(),
    );
    let on_daily: HostableComponent::ComponentState<Challenge::ContractState> =
        HostableComponent::component_state_for_testing();
    assert(on_daily.sponsorship_address(day, player) == sponsorship, 'Dead: sponsorships');
    // [Name] D-20: `tournaments` and `rankings`, members of the `paved` node
    let node: StorageBase<PavedStorage> = StorageBase { __base_address__: selector!("paved") };
    let tournament = paved_entry(selector!("tournaments"), day.into());
    let ranking = paved_entry(selector!("rankings"), day.into());
    assert(
        address_of(node.as_path().tournaments.entry(day)) == tournament, 'Dead: tournaments name',
    );
    assert(address_of(node.as_path().rankings.entry(day)) == ranking, 'Dead: rankings name');
    // [Name] D-25 E: `account` and `players`, members of the `paved` node
    let account = core::pedersen::pedersen(selector!("paved"), selector!("account"));
    let players = paved_entry(selector!("players"), player.into());
    assert(address_of(node.as_path().account) == account, 'Dead: account name');
    assert(
        address_of(node.as_path().players.entry(player.into())) == players, 'Dead: players name',
    );

    // [Name] D-24: `lobby_class` and the quiver members, from their literal names
    let p: felt252 = player.into();
    let k: felt252 = id.into();
    let literal: Array<felt252> = array![
        selector!("lobby_class"),
        map_entry_address(selector!("Quest_definitions"), array![k].span()),
        map_entry_address(selector!("Quest_tasks"), array![k].span()),
        map_entry_address(selector!("Quest_conditions"), array![k].span()),
        map_entry_address(selector!("Quest_progress"), array![p, k, 0].span()),
        map_entry_address(selector!("Quest_records"), array![p, k].span()),
        map_entry_address(selector!("Quest_held"), array![p, 0].span()),
        map_entry_address(selector!("Quest_reporters"), array![p].span()),
        map_entry_address(selector!("Achievement_definitions"), array![k].span()),
        map_entry_address(selector!("Achievement_extra_tasks"), array![k].span()),
        map_entry_address(selector!("Achievement_reporters"), array![p].span()),
    ];
    let state = Challenge::contract_state_for_testing();
    let resolved = state.dead_addresses(id, p, player);
    assert(resolved.len() == literal.len(), 'Dead: D-24 count');
    let mut i = 0;
    while i < literal.len() {
        assert(*resolved.at(i) == *literal.at(i), 'Dead: D-24 name');
        i += 1;
    }

    // [Reuse] Sentinels at every slot (every slot of `Slots2` and `Slots4` for D-20)
    let mut slots: Array<felt252> = array![
        sponsorship, tournament, tournament + 1, ranking, ranking + 1, ranking + 2, ranking + 3,
        account, players, players + 1,
    ];
    for slot in literal {
        slots.append(slot);
    }
    let sentinel = 'D-20 D-24 D-25 dead';
    let mut i = 0;
    while i < slots.len() {
        write_raw(challenge, *slots.at(i), array![sentinel + *slots.at(i)].span());
        i += 1;
    }

    // [Effect] The accepted list on `Setup`, then a whole game of that day: spawn, build, discard,
    // surrender (the game over reports to `Setup`)
    define_accepted_list(systems.setup.contract_address);
    start_cheat_caller_address(challenge, player);
    let game_id = systems.challenge.spawn(1, Zero::zero(), 0);
    let game = store.game(game_id);
    let builder = store.builder(game, context.player_id);
    let mut tile = store.tile(game, builder.tile_id);
    tile.plan = Plan::FFCFFFCFF.into();
    store.set_tile(tile);
    systems.challenge.build(game_id, Orientation::North, CENTER, CENTER + 1);
    systems.challenge.discard(game_id);
    systems.challenge.surrender(game_id);
    stop_cheat_caller_address(challenge);
    assert(store.game(game_id).day_id == day, 'Dead: game not in the day');

    // [Assert] Every sentinel intact
    let mut i = 0;
    while i < slots.len() {
        assert(
            *load(challenge, *slots.at(i), 1).at(0) == sentinel + *slots.at(i),
            'Dead: field written',
        );
        i += 1;
    }
}

// Re-entry: a token that calls back into `Daily` during its spawn

fn reentrant_with_economy() -> (TestChallenge, IReentrantTokenDispatcher, ISpyEconomyDispatcher) {
    start_cheat_block_timestamp_global(100);
    let (challenge, token, economy, _) = daily_paid_in("ReentrantToken");
    (challenge, IReentrantTokenDispatcher { contract_address: token }, economy)
}

/// A spawn pays by `transferFrom` after the game is stored; the token calls `spawn` again from
/// inside it, as the player. Since #645 the nested spawn is refused: it would be a second VRF draw
/// in the transaction (`'VRF: one draw per tx'`), and the token swallows its revert. The player
/// holds one game, paid once, as it was written.
#[test]
#[available_gas(l2_gas: 48136700)]
fn test_daily_reentry_during_spawn_cannot_change_the_game_written() {
    let (challenge, token, economy) = reentrant_with_economy();
    token.arm(challenge.contract_address, SPAWN);
    let views = IGameViewDispatcher { contract_address: challenge.contract_address };
    let price: u256 = constants::CHALLENGE_PRICE.into();
    let first = challenge.spawn(1, Zero::zero(), 0);
    let (attempts, reverted) = token.outcome();
    assert(attempts == 1 && reverted == 1, 'Reentry: nested spawn passed');
    assert(token.error() == 'VRF: one draw per tx', 'Reentry: nested spawn reason');
    assert(first == 1, 'Reentry: first id');
    // [First game] as written, the only one
    let game = views.game(1);
    assert(game.id == 1 && game.player_id == PLAYER().into(), 'Reentry: first game');
    assert(game.mode == Mode::Challenge.into() && game.tile_count == 2, 'Reentry: first changed');
    assert(game.tile_id != 0 && !game.over, 'Reentry: first state');
    // [Terms] one purchase, on game 1
    let purchase = economy.purchased();
    assert(purchase.count == 1, 'Reentry: one purchase');
    assert(purchase.game_id == 1 && purchase.player == PLAYER(), 'Reentry: purchase game');
    assert(purchase.price == price, 'Reentry: purchase price');
    // [Paid] exactly the price, all of it to Economy
    let (paid, recipient) = token.paid();
    assert(paid == price, 'Reentry: paid once');
    assert(recipient == economy.contract_address, 'Reentry: paid to economy');
}

// Mode: no entry point of `Daily` takes a mode

/// `Daily.spawn` has no mode argument (it passes `Mode::Challenge`): the game it stores has that
/// mode, for any caller.
#[test]
#[available_gas(l2_gas: 94052313)]
fn test_daily_spawn_mode_is_fixed_by_the_game_contract() {
    start_cheat_block_timestamp_global(100);
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let challenge = IGameViewDispatcher { contract_address: systems.challenge.contract_address };
    start_cheat_caller_address(systems.challenge.contract_address, ANYONE());
    let daily_id = systems.challenge.spawn(1, Zero::zero(), 0);
    assert(challenge.game(daily_id).mode == Mode::Challenge.into(), 'Mode: challenge');
}
