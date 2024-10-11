// Starknet imports

use starknet::ContractAddress;

// Component

#[starknet::component]
mod HostableComponent {
    // Starknet imports

    use starknet::ContractAddress;
    use starknet::info::{get_contract_address, get_caller_address, get_block_timestamp};
    use starknet::storage::{
        Map, StorageMapReadAccess, StorageMapWriteAccess, StoragePointerReadAccess,
        StoragePointerWriteAccess
    };

    // Dojo imports

    use dojo::world::IWorldDispatcher;
    use dojo::world::IWorldDispatcherTrait;

    // Internal imports

    use paved::constants;
    use paved::store::{Store, StoreImpl};
    use paved::models::game::{Game, GameTrait, GameAssert};
    use paved::models::player::{Player, PlayerImpl, PlayerAssert};
    use paved::models::builder::{Builder, BuilderImpl, BuilderAssert};
    use paved::models::tile::{Tile, TilePosition, TileImpl};
    use paved::models::tournament::{Tournament, TournamentImpl, TournamentAssert};
    use paved::types::orientation::Orientation;
    use paved::types::direction::Direction;
    use paved::types::mode::{Mode, ModeTrait};
    use paved::types::role::Role;
    use paved::types::spot::Spot;
    use paved::types::plan::Plan;
    use paved::types::deck::Deck;

    // Errors

    mod errors {
        const INVALID_WINNER: felt252 = 'INVALID_WINNER';
    }

    // Storage

    #[storage]
    struct Storage {
        builders: Map<(u32, u8), felt252>,
    }

    // Events

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {}

    #[generate_trait]
    impl InternalImpl<
        TContractState, +HasComponent<TContractState>
    > of InternalTrait<TContractState> {
        fn spawn(
            ref self: ComponentState<TContractState>,
            world: IWorldDispatcher,
            mode: Mode,
            name: felt252,
            duration: u64,
            price: felt252
        ) -> (u32, u256) {
            // [Setup] Datastore
            let store: Store = StoreImpl::new(world);

            // [Check] Player exists
            let caller = get_caller_address();
            let player = store.player(caller.into());
            player.assert_exists();

            // [Effect] Create game
            let game_id = world.uuid() + 1;
            let time = get_block_timestamp();
            let mut game = GameTrait::new(game_id, time, mode, name, duration, price);

            // [Effect] Create and store new builder
            let builder_index = game.join();
            let builder = BuilderImpl::new(game.id, player.id, builder_index);
            self.builders.write((game.id, builder.index), builder.player_id);
            store.set_builder(builder);

            // [Effect] Update game
            store.set_game(game);

            // [Return] Game ID and amount to pay
            let amount: u256 = game.price().into();
            (game_id, amount)
        }

        fn rename(
            self: @ComponentState<TContractState>,
            world: IWorldDispatcher,
            game_id: u32,
            name: felt252
        ) {
            // [Setup] Datastore
            let store: Store = StoreImpl::new(world);

            // [Check] Player exists
            let caller = get_caller_address();
            let player = store.player(caller.into());
            player.assert_exists();

            // [Check] Game exists
            let mut game = store.game(game_id);
            game.assert_exists();

            // [Check] Builder exists
            let builder = store.builder(game, player.id);
            builder.assert_exists();

            // [Check] Game has not yet started
            game.assert_not_started();

            // [Check] Player is the host
            builder.assert_host();

            // [Effect] Set name
            game.rename(name);

            // [Effect] Store game
            store.set_game(game);
        }

        fn update(
            self: @ComponentState<TContractState>,
            world: IWorldDispatcher,
            game_id: u32,
            duration: u64
        ) {
            // [Setup] Datastore
            let store: Store = StoreImpl::new(world);

            // [Check] Player exists
            let caller = get_caller_address();
            let player = store.player(caller.into());
            player.assert_exists();

            // [Check] Game exists
            let mut game = store.game(game_id);
            game.assert_exists();

            // [Check] Builder exists
            let builder = store.builder(game, player.id);
            builder.assert_exists();

            // [Check] Game has not yet started
            game.assert_not_started();

            // [Check] Player is the host
            builder.assert_host();

            // [Effect] Set duration
            game.update(duration);

            // [Effect] Store game
            store.set_game(game);
        }

        fn join(
            ref self: ComponentState<TContractState>, world: IWorldDispatcher, game_id: u32
        ) -> u256 {
            // [Setup] Datastore
            let store: Store = StoreImpl::new(world);

            // [Check] Player exists
            let caller = get_caller_address();
            let player = store.player(caller.into());
            player.assert_exists();

            // [Check] Game exists
            let mut game = store.game(game_id);
            game.assert_exists();

            // [Check] Game has not yet started
            game.assert_not_started();

            // [Check] Game is not full
            game.assert_not_full();

            // [Check] Builder not already exists
            let builder = store.builder(game, player.id);
            builder.assert_not_exists();

            // [Effect] Join the game
            let builder_index = game.join();
            store.set_game(game);

            // [Effect] Create a new builder
            let builder = BuilderImpl::new(game.id, player.id, builder_index);
            self.builders.write((game.id, builder.index), builder.player_id);
            store.set_builder(builder);

            // [Return] Entry price
            game.price().into()
        }

        fn ready(
            self: @ComponentState<TContractState>,
            world: IWorldDispatcher,
            game_id: u32,
            status: bool
        ) {
            // [Setup] Datastore
            let store: Store = StoreImpl::new(world);

            // [Check] Player exists
            let caller = get_caller_address();
            let player = store.player(caller.into());
            player.assert_exists();

            // [Check] Game exists
            let mut game = store.game(game_id);
            game.assert_exists();

            // [Check] Game has not yet started
            game.assert_not_started();

            // [Check] Builder exists
            let builder = store.builder(game, player.id);
            builder.assert_exists();

            // [Effect] Ready the builder
            let mut builder = store.builder(game, player.id);
            game.ready(builder.index, status);
            store.set_game(game);
        }

        fn transfer(
            ref self: ComponentState<TContractState>,
            world: IWorldDispatcher,
            game_id: u32,
            player_id: felt252
        ) {
            // [Setup] Datastore
            let store: Store = StoreImpl::new(world);

            // [Check] Game exists
            let mut game = store.game(game_id);
            game.assert_exists();

            // [Check] Player exists
            let caller = get_caller_address();
            let player = store.player(caller.into());
            player.assert_exists();

            // [Check] Builder exists
            let mut builder = store.builder(game, player.id);
            builder.assert_exists();

            // [Check] Buidler host exists
            let mut host = store.builder(game, player_id);
            host.assert_exists();

            // [Check] Game has not yet started
            game.assert_not_started();

            // [Check] Player is the host
            builder.assert_host();

            // [Effect] Swap builders
            let builder_index = builder.index;
            builder.index = host.index;
            host.index = builder_index;
            self.builders.write((game.id, builder.index), builder.player_id);
            self.builders.write((game.id, host.index), host.player_id);
            store.set_builder(builder);
            store.set_builder(host);

            // [Effect] Reset game
            game.reset();
            store.set_game(game);
        }

        fn leave(
            ref self: ComponentState<TContractState>, world: IWorldDispatcher, game_id: u32,
        ) -> u256 {
            // [Setup] Datastore
            let store: Store = StoreImpl::new(world);

            // [Check] Game exists
            let mut game = store.game(game_id);
            game.assert_exists();

            // [Check] Player exists
            let caller = get_caller_address();
            let player = store.player(caller.into());
            player.assert_exists();

            // [Check] Builder exists
            let mut builder = store.builder(game, player.id);
            builder.assert_exists();

            // [Check] Game has not yet started
            game.assert_not_started();

            // [Check] Player is not the host
            builder.assert_not_host();

            // [Effect] Delete builder
            let last_index = game.player_count - 1;
            builder.nullify();
            if builder.index != last_index {
                // [Effect] Swap builder to remove with last builder
                let last_player_id = self.builders.read((game.id, last_index));
                self.builders.write((game.id, builder.index), last_player_id);
                let mut last_builder = store.builder(game, last_player_id);
                last_builder.index = builder.index;
                builder.index = last_index;
                store.set_builder(last_builder);
            }
            store.set_builder(builder);

            // [Effect] Leave the game
            game.leave();
            store.set_game(game);

            // [Return] Refund Entry price
            game.price().into()
        }

        fn kick(
            ref self: ComponentState<TContractState>,
            world: IWorldDispatcher,
            game_id: u32,
            player_id: felt252
        ) -> u256 {
            // [Setup] Datastore
            let store: Store = StoreImpl::new(world);

            // [Check] Game exists
            let mut game = store.game(game_id);
            game.assert_exists();

            // [Check] Player exists
            let caller = get_caller_address();
            let player = store.player(caller.into());
            player.assert_exists();

            // [Check] Builder exists
            let builder = store.builder(game, player.id);
            builder.assert_exists();

            // [Check] Player is the host
            builder.assert_host();

            // [Check] Game has not yet started
            game.assert_not_started();

            // [Check] Kicked's builder exists
            let mut kicked = store.builder(game, player_id);
            kicked.assert_exists();

            // [Check] Kicked is not the host
            kicked.assert_not_host();

            // [Effect] Delete builder
            let last_index = game.player_count - 1;
            kicked.nullify();
            if kicked.index != last_index {
                // [Effect] Swap builder to remove with last builder
                let last_player_id = self.builders.read((game.id, last_index));
                self.builders.write((game.id, kicked.index), last_player_id);
                let mut last_builder = store.builder(game, last_player_id);
                last_builder.index = kicked.index;
                kicked.index = last_index;
                store.set_builder(last_builder);
            }
            store.set_builder(kicked);

            // [Effect] Leave the game
            game.leave();
            store.set_game(game);

            // [Return] Entry price
            game.price().into()
        }

        fn delete(
            self: @ComponentState<TContractState>, world: IWorldDispatcher, game_id: u32,
        ) -> u256 {
            // [Setup] Datastore
            let store: Store = StoreImpl::new(world);

            // [Check] Game exists
            let mut game = store.game(game_id);
            game.assert_exists();

            // [Check] Player exists
            let caller = get_caller_address();
            let player = store.player(caller.into());
            player.assert_exists();

            // [Check] Builder exists
            let builder = store.builder(game, player.id);
            builder.assert_exists();

            // [Check] Game has not yet started
            game.assert_not_started();

            // [Check] Player is the host
            builder.assert_host();

            // [Check] Game is deletable
            game.assert_deletable();

            // [Effect] Delete builder
            let mut builder = store.builder(game, player.id);
            builder.nullify();
            store.set_builder(builder);

            // [Effect] Delete the game
            game.delete();
            store.set_game(game);

            // [Return] Entry price
            game.price().into()
        }

        fn start(self: @ComponentState<TContractState>, world: IWorldDispatcher, game_id: u32,) {
            // [Setup] Datastore
            let store: Store = StoreImpl::new(world);

            // [Check] Game exists
            let mut game = store.game(game_id);
            game.assert_exists();

            // [Check] Player exists
            let caller = get_caller_address();
            let player = store.player(caller.into());
            player.assert_exists();

            // [Check] Builder exists
            let builder = store.builder(game, player.id);
            builder.assert_exists();

            // [Check] Game has not yet started
            game.assert_not_started();

            // [Check] Player is the host
            builder.assert_host();

            // [Check] Game startable
            game.assert_startable();

            // [Effect] Start game
            let time = get_block_timestamp();
            let tile = game.start(time);

            // [Effect] Store tile
            store.set_tile(tile);

            // [Effect] Create a new builder
            let mut index = game.player_count;
            while index > 0 {
                // [Effect] Builder draw tile
                index -= 1;
                let player_id = self.builders.read((game.id, index));
                let mut builder = store.builder(game, player_id);
                let (tile_id, plan) = game.draw_plan();
                let tile = builder.reveal(tile_id, plan);

                // [Effect] Update entities
                store.set_builder(builder);
                store.set_tile(tile);
            };

            // [Effect] Update game
            store.set_game(game);
        }

        fn claim(
            self: @ComponentState<TContractState>, world: IWorldDispatcher, game_id: u32
        ) -> u256 {
            // [Setup] Datastore
            let store: Store = StoreImpl::new(world);

            // [Check] Game exists
            let mut game = store.game(game_id);
            game.assert_exists();

            // [Check] Player exists
            let caller = get_caller_address();
            let player = store.player(caller.into());
            player.assert_exists();

            // [Check] Builder exists
            let builder = store.builder(game, player.id);
            builder.assert_exists();

            // [Check] Game has started
            game.assert_started();

            // [Check] Game is over
            let time = get_block_timestamp();
            game.assert_is_over(time);

            // [Check] Prize not already claimed
            game.assert_not_claimed();

            // [Check] Top score builder is the player
            let mut index = game.player_count - 1;
            let player_id = self.builders.read((game.id, index));
            let mut top = store.builder(game, player_id);
            while index > 0 {
                index -= 1;
                let player_id = self.builders.read((game.id, index));
                let current = store.builder(game, player_id);
                if current.score > top.score {
                    top = current;
                    break;
                }
            };
            assert(top.player_id == player.id, errors::INVALID_WINNER);

            // [Effect] Claim the prize
            let prize = game.claim();

            // [Effect] Update game
            store.set_game(game);

            // [Return] Prize
            prize
        }
    }
}
