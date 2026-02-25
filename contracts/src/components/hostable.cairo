// Starknet imports

use starknet::ContractAddress;
use core::traits::TryInto;

// Component

#[starknet::component]
pub mod HostableComponent {
    // Starknet imports

    use starknet::ContractAddress;
    use starknet::{get_contract_address, get_caller_address, get_block_timestamp};

    // Dojo imports

    use dojo::world::IWorldDispatcher;
    use dojo::world::IWorldDispatcherTrait;

    // Internal imports

    use paved::store::{Store, StoreImpl};
    use paved::helpers::config_templates::ConfigTemplatesTrait;
    use paved::helpers::config_validation::{RuntimeGameConfig, RuntimeGameConfigTrait};
    use paved::helpers::economy_curve::compute_multiplier_fp;
    use paved::models::game::{Game, GameImpl, GameAssert};
    use paved::models::economy::{EconomyConfigTrait, EntrySettlement};
    use paved::models::player::{Player, PlayerImpl, PlayerAssert};
    use paved::models::builder::{Builder, BuilderImpl, BuilderAssert};
    use paved::models::tile::{Tile, TilePosition, TileImpl};
    use paved::models::tournament::{Tournament, TournamentImpl, TournamentAssert};
    use paved::types::mode::{Mode, ModeTrait};

    // Storage

    #[storage]
    struct Storage {}

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {}

    #[generate_trait]
    pub impl InternalImpl<
        TContractState, +HasComponent<TContractState>
    > of InternalTrait<TContractState> {
        fn spawn(
            self: @ComponentState<TContractState>, world: IWorldDispatcher, mode: Mode
        ) -> (u32, u256, u256, u256) {
            let store: Store = StoreImpl::new(world);
            let template_id = ConfigTemplatesTrait::default_template_id(mode);
            let existing = store.game_config_template(template_id);

            let (runtime, config_id) = if existing.config_id == 0 {
                let runtime = RuntimeGameConfigTrait::default_for_mode(mode);
                let template = runtime.to_template(template_id, 1, true);
                store.set_game_config_template(template);
                (runtime, template.config_id)
            } else {
                (RuntimeGameConfigTrait::runtime_from_template(existing), existing.config_id)
            };

            self.spawn_with_runtime(world, mode, runtime, config_id, template_id)
        }

        fn spawn_with_runtime(
            self: @ComponentState<TContractState>,
            world: IWorldDispatcher,
            mode: Mode,
            runtime: RuntimeGameConfig,
            config_id: u64,
            template_id: u32,
        ) -> (u32, u256, u256, u256) {
            // [Setup] Datastore
            let store: Store = StoreImpl::new(world);

            // [Check] Player exists
            let caller = get_caller_address();
            let player = store.player(caller.into());
            player.assert_exists();

            // [Effect] Create game
            let game_id = world.uuid() + 1;
            let time = get_block_timestamp();
            let mut game = GameImpl::new(game_id, time, mode);
            game.config_id = config_id;
            game.entry_price = runtime.entry_price;
            game.duration_seconds = runtime.duration_seconds;
            game.deck_id = runtime.deck_id;
            game.tile_limit = runtime.tile_limit;
            game.allow_discard = runtime.allow_discard;
            game.allow_surrender = runtime.allow_surrender;

            // [Compute] Lock economy snapshot for this session.
            let config = store.economy_config();
            config.validate();
            let mut state = store.economy_state();
            let supply_u256: u256 = state.last_supply.try_into().unwrap();
            let target_u256 = config.target_at(time);
            let multiplier_fp = compute_multiplier_fp(supply_u256, target_u256);
            let supply_snapshot: felt252 = supply_u256.try_into().unwrap();
            let target_snapshot: felt252 = target_u256.try_into().unwrap();
            game.entry_multiplier_fp = multiplier_fp;
            game.entry_supply_snapshot = supply_snapshot;
            game.entry_target_snapshot = target_snapshot;

            // [Effect] Start game
            let tile = game.start(time);

            // [Effect] Store tile
            store.set_tile(tile);

            // [Effect] Create a new builder
            let mut builder = BuilderImpl::new(game.id, player.id);
            let (tile_id, plan) = game.draw_plan();
            let tile = builder.reveal(tile_id, plan);

            // [Effect] Store builder
            store.set_builder(builder);

            // [Effect] Store tile
            store.set_tile(tile);

            // [Effect] Update tournament
            let tournament_id = TournamentImpl::compute_id(time, game.duration());
            let mut tournament = store.tournament(tournament_id);
            tournament.buyin(game.price());

            // [Effect] Store tournament
            store.set_tournament(tournament);

            // [Effect] Compute and persist entry split.
            let (team_amount, burn_amount) = config.split_entry(game.price());
            let settlement = EntrySettlement {
                game_id, entry_amount: game.price(), team_amount, burn_amount, settled: true,
            };
            store.set_entry_settlement(settlement);

            // [Effect] Keep economy aggregate counters in sync.
            let burn_u256: u256 = burn_amount.try_into().unwrap();
            let remaining_supply = if burn_u256 > supply_u256 {
                0_u256
            } else {
                supply_u256 - burn_u256
            };
            state.last_snapshot_time = time;
            state.last_supply = remaining_supply.try_into().unwrap();
            state.last_target = target_snapshot;
            state.last_multiplier_fp = multiplier_fp;
            state.total_team_alloc += team_amount;
            state.total_burned += burn_amount;
            store.set_economy_state(state);

            // [Effect] Store game
            store.set_game(game);
            store.set_game_config_snapshot(runtime.to_snapshot(game_id, template_id, config_id));

            // [Return] Game ID and amount to pay
            let amount: u256 = game.price().into();
            (game_id, amount, team_amount.into(), burn_amount.into())
        }

        fn claim(
            self: @ComponentState<TContractState>,
            world: IWorldDispatcher,
            tournament_id: u64,
            rank: u8,
            mode: Mode,
        ) -> u256 {
            // [Setup] Datastore
            let store: Store = StoreImpl::new(world);

            // [Check] Player exists
            let caller = get_caller_address();
            let mut player = store.player(caller.into());
            player.assert_exists();

            // [Check] Tournament exists
            let mut tournament = store.tournament(tournament_id);
            tournament.assert_exists();

            // [Effect] Update claim
            let time = get_block_timestamp();
            let game_id = tournament.game(rank);
            let reward_base = tournament.reward(rank);
            let multiplier_fp = tournament.multiplier(rank);
            let reward = tournament.claim(player.id, rank, time, mode.duration());
            store.set_tournament(tournament);

            // [Effect] Track minted rewards in economy state.
            let mut state = store.economy_state();
            let reward_felt: felt252 = reward.try_into().unwrap();
            state.total_minted += reward_felt;
            state.last_supply += reward_felt;
            store.set_economy_state(state);

            // [Return] Pay reward
            reward
        }

        fn sponsor(
            self: @ComponentState<TContractState>,
            world: IWorldDispatcher,
            amount: felt252,
            mode: Mode
        ) -> u256 {
            // [Setup] Datastore
            let store: Store = StoreImpl::new(world);

            // [Check] Tournament exists
            let time = get_block_timestamp();
            let tournament_id = TournamentImpl::compute_id(time, mode.duration());
            let mut tournament = store.tournament(tournament_id);
            tournament.assert_exists();

            // [Effect] Add amount to the current tournament prize pool
            tournament.buyin(amount);
            store.set_tournament(tournament);

            // [Return] Amount to pay
            amount.into()
        }
    }
}
