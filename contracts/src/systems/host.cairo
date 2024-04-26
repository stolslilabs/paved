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
    fn initialize(ref self: TContractState, world: ContractAddress);
    fn create(self: @TContractState, world: IWorldDispatcher) -> u32;
    fn claim(self: @TContractState, world: IWorldDispatcher, tournament_id: u64, rank: u8,);
    fn sponsor(self: @TContractState, world: IWorldDispatcher, amount: felt252);
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
    use paved::models::builder::{Builder, BuilderImpl, BuilderAssert};
    use paved::models::tile::{Tile, TilePosition, TileImpl};
    use paved::models::tournament::{Tournament, TournamentImpl, TournamentAssert};
    use paved::types::orientation::Orientation;
    use paved::types::direction::Direction;
    use paved::types::role::Role;
    use paved::types::spot::Spot;
    use paved::types::plan::Plan;
    use paved::types::deck::Deck;

    // Local imports

    use super::{IHost, IERC20Dispatcher, IERC20DispatcherTrait};

    // Errors

    mod errors {
        const CONTRACT_ALREADY_INITIALIZED: felt252 = 'Contract is already initialized';
        const ERC20_REWARD_FAILED: felt252 = 'ERC20: reward failed';
        const ERC20_PAY_FAILED: felt252 = 'ERC20: pay failed';
        const ERC20_REFUND_FAILED: felt252 = 'ERC20: refund failed';
    }

    // Storage

    #[storage]
    struct Storage {
        initialized: bool,
        world: IWorldDispatcher,
    }

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
            self.world.read()
        }
    }

    #[abi(embed_v0)]
    impl HostImpl of IHost<ContractState> {
        fn initialize(ref self: ContractState, world: ContractAddress) {
            // [Check] Contract is not initialized
            assert(!self.initialized.read(), errors::CONTRACT_ALREADY_INITIALIZED);
            // [Effect] Initialize contract
            self.initialized.write(true);
            // [Effect] Set world
            self.world.write(IWorldDispatcher { contract_address: world });
        }

        fn create(self: @ContractState, world: IWorldDispatcher,) -> u32 {
            // [Setup] Datastore
            let store: Store = StoreImpl::new(world);

            // [Check] Player exists
            let caller = get_caller_address();
            let player = store.player(caller.into());
            player.assert_exists();

            // [Effect] Create game
            let game_id = world.uuid() + 1;
            let time = get_block_timestamp();
            let mut game = GameImpl::new(game_id, time);

            // [Effect] Create a new builder
            let builder = BuilderImpl::new(game.id, player.id);
            store.set_builder(builder);

            // [Effect] Start game
            let tile = game.start(time);

            // [Effect] Store tile
            store.set_tile(tile);

            // [Effect] Update tournament
            let tournament_id = TournamentImpl::compute_id(time);
            let mut tournament = store.tournament(tournament_id);
            tournament.buyin(game.price());

            // [Effect] Store tournament
            store.set_tournament(tournament);

            // [Effect] Store game
            store.set_game(game);

            // [Interaction] Pay entry price
            let amount: u256 = game.price().into();
            self._pay(world, caller, amount);

            game_id
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

        fn sponsor(self: @ContractState, world: IWorldDispatcher, amount: felt252) {
            // [Setup] Datastore
            let store: Store = StoreImpl::new(world);

            // [Check] Tournament exists
            let time = get_block_timestamp();
            let tournament_id = TournamentImpl::compute_id(time);
            let mut tournament = store.tournament(tournament_id);
            tournament.assert_exists();

            // [Effect] Add amount to the current tournament prize pool
            tournament.buyin(amount);
            store.set_tournament(tournament);

            // [Interaction] Transfer amount
            let caller = get_caller_address();
            self._pay(world, caller, amount.into());
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
