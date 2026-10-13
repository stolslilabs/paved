// Starknet imports

use core::traits::TryInto;
use starknet::ContractAddress;

// Component

#[starknet::component]
pub mod HostableComponent {
    // Internal imports

    use paved::day::day_id;
    use paved::events::{Event as PavedEvent, GameSpawned};
    use paved::models::builder::{Builder, BuilderAssert, BuilderImpl};
    use paved::models::game::{Game, GameAssert, GameImpl};
    use paved::models::tile::{Tile, TileImpl, TilePosition};
    use paved::seed::{DailySeed, SeedSource};
    use paved::store::{Store, StoreImpl};
    use paved::types::mode::{Mode, ModeTrait};
    use starknet::storage::Map;
    #[cfg(test)]
    use starknet::storage::{StorageAsPointer, StoragePathEntry};
    use starknet::{ContractAddress, get_block_timestamp, get_caller_address};

    // Storage

    #[storage]
    pub struct Storage {
        /// Dead since D-20 (P-42): what each sponsor put in each day's prize (P-37). Kept declared
        /// so that its address is never given to another field; never written or read again.
        pub sponsorships: Map<(u64, ContractAddress), felt252>,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {}

    /// Test only: the address of a `sponsorships` entry, resolved through the field's name, for the
    /// pin of the dead fields
    /// (`tests::e2e::cold_paths_audit::test_daily_pins_the_dead_fields_by_name`).
    #[cfg(test)]
    #[generate_trait]
    pub impl DeadFieldsImpl<
        TContractState, +HasComponent<TContractState>,
    > of DeadFieldsTrait<TContractState> {
        fn sponsorship_address(
            self: @ComponentState<TContractState>, day: u64, sponsor: ContractAddress,
        ) -> felt252 {
            let path = self.sponsorships.entry((day, sponsor));
            starknet::storage_access::storage_address_from_base(
                path.as_ptr().__storage_pointer_address__,
            )
                .into()
        }
    }

    #[generate_trait]
    pub impl InternalImpl<
        TContractState, +HasComponent<TContractState>,
    > of InternalTrait<TContractState> {
        fn spawn(self: @ComponentState<TContractState>, mode: Mode) -> (u32, u256) {
            self.spawn_with(mode, @DailySeed {})
        }

        fn spawn_with<S, +SeedSource<S>>(
            self: @ComponentState<TContractState>, mode: Mode, source: @S,
        ) -> (u32, u256) {
            // [Setup] Datastore
            let store: Store = StoreImpl::new();

            // [Info] The player is the caller's address: any account may play (D-25)
            let player_id: felt252 = get_caller_address().into();

            // [Effect] Create game
            let game_id = store.uuid();
            let time = get_block_timestamp();
            let mut game = GameImpl::new(game_id, time, mode, player_id);

            // [Effect] Start game
            let seed = source.seed(mode, time, game.id, game.seed);
            let tile = game.start(time, seed);

            // [Effect] Store tile
            store.set_tile(tile);

            // [Effect] The first tile is in the builder's hand (`GameState`, stored with the game)
            let mut builder = BuilderImpl::new(game.id, player_id);
            let (tile_id, plan) = game.draw_plan();
            let tile = builder.reveal(tile_id, plan);

            // [Effect] Store tile
            store.set_tile(tile);

            // [Info] The day the game is spawned in
            let day = day_id(time, game.duration());

            // [Effect] Store game
            store.set_game(game);

            // [Event] Game spawned
            store
                .emit(
                    PavedEvent::GameSpawned(
                        GameSpawned {
                            game_id,
                            player_id,
                            mode: game.mode,
                            day_id: day,
                            start_time: time,
                            price: game.price(),
                        },
                    ),
                );

            // [Return] Game ID and the price of one stake unit
            let amount: u256 = game.price().into();
            (game_id, amount)
        }
    }
}
