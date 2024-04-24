// Starknet imports

use starknet::ContractAddress;

// Dojo imports

use dojo::world::IWorldDispatcher;

// Internal imports

use paved::types::orientation::Orientation;
use paved::types::direction::Direction;
use paved::types::role::Role;
use paved::types::spot::Spot;

#[starknet::interface]
trait IHost<TContractState> {
    fn create(
        self: @TContractState, world: IWorldDispatcher, name: felt252, duration: u64, mode: u8
    ) -> u32;
    fn rename(self: @TContractState, world: IWorldDispatcher, game_id: u32, name: felt252);
    fn update(self: @TContractState, world: IWorldDispatcher, game_id: u32, duration: u64);
    fn join(self: @TContractState, world: IWorldDispatcher, game_id: u32);
    fn ready(self: @TContractState, world: IWorldDispatcher, game_id: u32, status: bool);
    fn transfer(self: @TContractState, world: IWorldDispatcher, game_id: u32, player_id: felt252);
    fn leave(self: @TContractState, world: IWorldDispatcher, game_id: u32,);
    fn kick(self: @TContractState, world: IWorldDispatcher, game_id: u32, player_id: felt252);
    fn delete(self: @TContractState, world: IWorldDispatcher, game_id: u32,);
    fn start(self: @TContractState, world: IWorldDispatcher, game_id: u32,);
    fn claim(self: @TContractState, world: IWorldDispatcher, tournament_id: u64, rank: u8,);
}

#[starknet::interface]
trait IERC20<TContractState> {
    fn transfer(ref self: TContractState, recipient: ContractAddress, amount: u256) -> bool;
    fn transferFrom(
        ref self: TContractState, sender: ContractAddress, recipient: ContractAddress, amount: u256
    ) -> bool;
}

#[starknet::contract]
mod host {
    // Core imports

    use paved::store::StoreTrait;
    use core::debug::PrintTrait;

    // Starknet imports

    use starknet::ContractAddress;
    use starknet::info::{
        get_block_timestamp, get_block_number, get_caller_address, get_contract_address, get_tx_info
    };

    // Dojo imports

    use dojo::world;
    use dojo::world::IWorldDispatcher;
    use dojo::world::IWorldDispatcherTrait;
    use dojo::world::IWorldProvider;
    use dojo::world::IDojoResourceProvider;

    // Internal imports

    use paved::constants;
    use paved::store::{Store, StoreImpl};
    use paved::models::game::{Game, GameImpl, GameAssert};
    use paved::models::player::{Player, PlayerImpl, PlayerAssert};
    use paved::models::team::{Team, TeamImpl};
    use paved::models::builder::{Builder, BuilderImpl, BuilderAssert};
    use paved::models::tile::{Tile, TilePosition, TileImpl};
    use paved::models::tournament::{Tournament, TournamentImpl, TournamentAssert};
    use paved::types::alliance::{Alliance, AllianceImpl};
    use paved::types::order::{Order, OrderImpl};
    use paved::types::orientation::Orientation;
    use paved::types::direction::Direction;
    use paved::types::role::Role;
    use paved::types::spot::Spot;
    use paved::types::plan::Plan;
    use paved::types::mode::Mode;
    use paved::types::deck::Deck;

    // Local imports

    use super::{IHost, IERC20Dispatcher, IERC20DispatcherTrait};

    // Errors

    mod errors {
        const ERC20_REWARD_FAILED: felt252 = 'ERC20: reward failed';
        const ERC20_PAY_FAILED: felt252 = 'ERC20: pay failed';
        const ERC20_REFUND_FAILED: felt252 = 'ERC20: refund failed';
    }

    // Storage

    #[storage]
    struct Storage {}

    // Implementations

    #[abi(embed_v0)]
    impl DojoResourceProviderImpl of IDojoResourceProvider<ContractState> {
        fn dojo_resource(self: @ContractState) -> felt252 {
            'host'
        }
    }

    #[abi(embed_v0)]
    impl WorldProviderImpl of IWorldProvider<ContractState> {
        fn world(self: @ContractState) -> IWorldDispatcher {
            IWorldDispatcher { contract_address: constants::WORLD() }
        }
    }

    #[abi(embed_v0)]
    impl HostImpl of IHost<ContractState> {
        fn create(
            self: @ContractState, world: IWorldDispatcher, name: felt252, duration: u64, mode: u8,
        ) -> u32 {
            // [Setup] Datastore
            let store: Store = StoreImpl::new(world);

            // [Check] Player exists
            let caller = get_caller_address();
            let player = store.player(caller.into());
            player.assert_exists();

            // [Effect] Create game
            let game_id = world.uuid() + 1;
            let time = get_block_timestamp();
            let mut game = GameImpl::new(game_id, name, time, duration, mode);

            // [Effect] Join the game
            let builder_index = game.join();

            // [Effect] Create a new builder
            let builder = BuilderImpl::new(game.id, player.id, builder_index, player.order);
            store.set_builder(builder);

            // [Effect] Start the game if solo mode
            if game.is_solo() {
                // [Effect] Start game
                let tile = game.start(time);

                // [Effect] Store tile
                store.set_tile(tile);
            }

            // [Effect] Update Tournament prize pool if ranked game
            if game.is_ranked() {
                // [Effect] Update tournament
                let tournament_id = TournamentImpl::compute_id(time);
                let mut tournament = store.tournament(tournament_id);
                tournament.buyin(game.price());

                // [Effect] Store tournament
                store.set_tournament(tournament);
            }

            // [Effect] Store game
            store.set_game(game);

            // [Interaction] Pay entry price
            let amount: u256 = game.price().into();
            self._pay(world, caller, amount);

            game_id
        }

        fn rename(self: @ContractState, world: IWorldDispatcher, game_id: u32, name: felt252) {
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

        fn update(self: @ContractState, world: IWorldDispatcher, game_id: u32, duration: u64) {
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
            let time = get_block_timestamp();
            game.update(time, duration);

            // [Effect] Store game
            store.set_game(game);
        }

        fn join(self: @ContractState, world: IWorldDispatcher, game_id: u32) {
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

            // [Check] Builder not already exists
            let builder = store.builder(game, player.id);
            builder.assert_not_exists();

            // [Effect] Join the game
            let builder_index = game.join();
            store.set_game(game);

            // [Effect] Create a new builder
            let builder = BuilderImpl::new(game.id, player.id, builder_index, player.order);
            store.set_builder(builder);

            // [Interaction] Pay entry price
            let amount: u256 = game.price().into();
            self._pay(world, caller, amount);
        }

        fn ready(self: @ContractState, world: IWorldDispatcher, game_id: u32, status: bool) {
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
            self: @ContractState, world: IWorldDispatcher, game_id: u32, player_id: felt252
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
            store.swap_builders(game, ref builder, ref host);
            game.reset();
            store.set_game(game);
        }

        fn leave(self: @ContractState, world: IWorldDispatcher, game_id: u32,) {
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
            store.remove_builder(game, ref builder);

            // [Effect] Leave the game
            game.leave();
            store.set_game(game);

            // [Interaction] Refund entry price
            let amount: u256 = game.price().into();
            self._refund(world, caller, amount);
        }

        fn kick(self: @ContractState, world: IWorldDispatcher, game_id: u32, player_id: felt252) {
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
            let kicked_address: ContractAddress = player_id.try_into().unwrap();
            kicked.assert_exists();

            // [Check] Kicked is not the host
            kicked.assert_not_host();

            // [Effect] Delete builder
            store.remove_builder(game, ref kicked);

            // [Effect] Leave the game
            game.leave();
            store.set_game(game);

            // [Interaction] Refund entry price
            let amount: u256 = game.price().into();
            self._refund(world, kicked_address, amount);
        }

        fn delete(self: @ContractState, world: IWorldDispatcher, game_id: u32,) {
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
            builder.remove();
            store.set_builder(builder);

            // [Effect] Delete the game
            game.delete();
            store.set_game(game);

            // [Interaction] Refund entry price
            let amount: u256 = game.price().into();
            self._refund(world, caller, amount);
        }

        fn start(self: @ContractState, world: IWorldDispatcher, game_id: u32,) {
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

            // [Effect] Store game
            let time = get_block_timestamp();
            let tile = game.start(time);
            store.set_game(game);

            // [Effect] Store tile
            store.set_tile(tile);
        }

        fn claim(self: @ContractState, world: IWorldDispatcher, tournament_id: u64, rank: u8) {
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
            let reward = tournament.claim(player.id, rank, time);
            store.set_tournament(tournament);

            // [Interaction] Pay reward
            self._refund(world, caller, reward);
        }
    }


    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn _pay(
            self: @ContractState, world: IWorldDispatcher, caller: ContractAddress, amount: u256
        ) {
            // [Check] Amount is not null, otherwise return
            if amount == 0 {
                return;
            }

            // [Interaction] Transfer
            let contract = get_contract_address();
            let erc20 = IERC20Dispatcher { contract_address: constants::TOKEN_ADDRESS() };
            let status = erc20.transferFrom(caller, contract, amount);

            // [Check] Status
            assert(status, errors::ERC20_PAY_FAILED);
        }

        fn _refund(
            self: @ContractState, world: IWorldDispatcher, recipient: ContractAddress, amount: u256
        ) {
            // [Check] Amount is not null, otherwise return
            if amount == 0 {
                return;
            }

            // [Interaction] Transfer
            let erc20 = IERC20Dispatcher { contract_address: constants::TOKEN_ADDRESS() };
            let status = erc20.transfer(recipient, amount);

            // [Check] Status
            assert(status, errors::ERC20_REFUND_FAILED);
        }
    }
}
