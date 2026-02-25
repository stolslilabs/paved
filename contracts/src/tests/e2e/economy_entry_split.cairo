use paved::constants;
use paved::store::{StoreTrait};
use paved::types::mode::Mode;
use paved::tests::setup::{setup, setup::{IDailyDispatcherTrait}};

#[test]
fn test_economy_entry_split_accounting_for_team_and_burn_amounts() {
    let (world, systems, _) = setup::spawn_game(Mode::None);
    let store = StoreTrait::new(world);

    let mut state = store.economy_state();
    state.last_supply = 10_000_000_000_000_000_000;
    store.set_economy_state(state);

    let game_id = systems.daily.spawn();
    let settlement = store.entry_settlement(game_id);

    assert(settlement.entry_amount == constants::DAILY_TOURNAMENT_PRICE, 'Economy: entry total');
    assert(settlement.team_amount == 800_000_000_000_000_000, 'Economy: team split');
    assert(settlement.burn_amount == 200_000_000_000_000_000, 'Economy: burn split');
}

#[test]
fn test_economy_burn_execution_reduces_circulating_supply_metric() {
    let (world, systems, _) = setup::spawn_game(Mode::None);
    let store = StoreTrait::new(world);

    let mut state = store.economy_state();
    state.last_supply = 1_000_000_000_000_000_000;
    store.set_economy_state(state);

    systems.daily.spawn();

    let state_after = store.economy_state();
    assert(state_after.total_burned == 200_000_000_000_000_000, 'Economy: burned total');
    assert(state_after.last_supply == 800_000_000_000_000_000, 'Economy: supply reduced');
}
