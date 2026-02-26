use paved::types::mode::Mode;
use paved::store::{StoreTrait};
use paved::tests::setup::{
    setup,
    setup::{IConfigurableDispatcherTrait, Mode as SetupMode},
};
use paved::tests::setup::setup::{IDailyDispatcherTrait};
use snforge_std::start_cheat_caller_address;

#[test]
fn test_configurable_create_with_template_persists_snapshot() {
    let (world, systems, _) = setup::spawn_game(SetupMode::None);
    let store = StoreTrait::new(world);

    let template_id = systems.configurable.register_default_template(1_u8);
    let game_id = systems.configurable.create_with_template(template_id);

    let game = store.game(game_id);
    let snapshot = store.game_config_snapshot(game_id);
    assert(game.config_id != 0, 'Configurable: game config id');
    assert(snapshot.game_id == game_id, 'Configurable: snapshot game id');
    assert(snapshot.template_id == template_id, 'Configurable: template snapshot');
}

#[test]
#[should_panic(expected: ('Config: private requires root',))]
fn test_configurable_create_with_config_rejects_private_without_access_root() {
    let (_, systems, _) = setup::spawn_game(SetupMode::None);
    let _ = systems
        .configurable
        .create_with_config(
            Mode::Daily.into(),
            2,
            1_000_000_000_000_000_000,
            86_400,
            38,
            true,
            true,
            true,
            0,
            0,
        );
}

#[test]
fn test_configurable_legacy_spawn_writes_snapshot_defaults() {
    let (world, systems, _) = setup::spawn_game(SetupMode::None);
    let store = StoreTrait::new(world);

    let game_id = systems.daily.spawn();
    let game = store.game(game_id);
    let snapshot = store.game_config_snapshot(game_id);

    assert(game.config_id != 0, 'Configurable: legacy config id');
    assert(snapshot.game_id == game_id, 'Configurable: legacy snapshot');
    assert(snapshot.mode == Mode::Daily.into(), 'Configurable: legacy mode');
}

#[test]
fn test_configurable_create_with_valid_explicit_config_succeeds() {
    let (world, systems, _) = setup::spawn_game(SetupMode::None);
    let store = StoreTrait::new(world);

    let game_id = systems
        .configurable
        .create_with_config(
            Mode::Daily.into(),
            2,
            1_000_000_000_000_000_000,
            86_400,
            38,
            true,
            true,
            false,
            0,
            12345,
        );

    let game = store.game(game_id);
    let snapshot = store.game_config_snapshot(game_id);
    assert(game_id != 0, 'Configurable: explicit game id');
    assert(snapshot.game_id == game_id, 'Configurable: explicit snapshot');
    assert(snapshot.template_id == 0, 'Cfg: explicit tpl');
    assert(snapshot.config_id == game.config_id, 'Cfg: explicit cfg');
}

#[test]
fn test_configurable_template_toggle_updates_version() {
    let (world, systems, _) = setup::spawn_game(SetupMode::None);
    let store = StoreTrait::new(world);

    let template_id = systems.configurable.register_default_template(1_u8);
    let before = store.game_config_template(template_id);
    assert(before.version == 1, 'Configurable: initial version');

    systems.configurable.set_template_enabled(template_id, false);

    let after = store.game_config_template(template_id);
    assert(after.version == 2, 'Configurable: bumped version');
    assert(!after.enabled, 'Configurable: disabled');
}

#[test]
#[should_panic(expected: ('Config: template disabled',))]
fn test_configurable_template_disabled_rejects_creation() {
    let (_, systems, _) = setup::spawn_game(SetupMode::None);
    let template_id = systems.configurable.register_default_template(1_u8);
    systems.configurable.set_template_enabled(template_id, false);
    let _ = systems.configurable.create_with_template(template_id);
}

#[test]
#[should_panic(expected: ('Config: not admin',))]
fn test_configurable_non_admin_cannot_set_template_enabled() {
    let (_, systems, _) = setup::spawn_game(SetupMode::None);

    let template_id = systems.configurable.register_default_template(1_u8);
    start_cheat_caller_address(systems.configurable.contract_address, setup::SOMEONE());
    systems.configurable.set_template_enabled(template_id, false);
}
