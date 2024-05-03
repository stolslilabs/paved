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
trait IDaily<TContractState> {
    fn initialize(ref self: TContractState, world: ContractAddress);
    fn create(
        self: @TContractState, world: IWorldDispatcher, name: felt252, master: ContractAddress
    );
    fn spawn(self: @TContractState, world: IWorldDispatcher) -> u32;
    fn claim(self: @TContractState, world: IWorldDispatcher, tournament_id: u64, rank: u8,);
    fn sponsor(self: @TContractState, world: IWorldDispatcher, amount: felt252);
    fn discard(self: @TContractState, world: IWorldDispatcher, game_id: u32,);
    fn surrender(self: @TContractState, world: IWorldDispatcher, game_id: u32,);
    fn build(
        self: @TContractState,
        world: IWorldDispatcher,
        game_id: u32,
        orientation: Orientation,
        x: u32,
        y: u32,
        role: Role,
        spot: Spot,
    );
}

#[starknet::contract]
mod daily {
    // Starknet imports

    use starknet::ContractAddress;
    use starknet::info::{
        get_block_timestamp, get_block_number, get_caller_address, get_contract_address
    };

    // Dojo imports

    use dojo::world;
    use dojo::world::IWorldDispatcher;
    use dojo::world::IWorldDispatcherTrait;
    use dojo::world::IDojoResourceProvider;

    // Component imports

    use paved::components::initializable::InitializableComponent;
    use paved::components::ownable::OwnableComponent;
    use paved::components::manageable::ManageableComponent;
    use paved::components::hostable::HostableComponent;
    use paved::components::payable::PayableComponent;
    use paved::components::playable::PlayableComponent;

    // Internal imports

    use paved::types::orientation::Orientation;
    use paved::types::role::Role;
    use paved::types::spot::Spot;

    // Local imports

    use super::IDaily;

    // Components

    component!(path: InitializableComponent, storage: initializable, event: InitializableEvent);
    #[abi(embed_v0)]
    impl WorldProviderImpl =
        InitializableComponent::WorldProviderImpl<ContractState>;
    impl InitializableInternalImpl = InitializableComponent::InternalImpl<ContractState>;
    component!(path: OwnableComponent, storage: ownable, event: OwnableEvent);
    #[abi(embed_v0)]
    impl OwnableImpl = OwnableComponent::OwnableImpl<ContractState>;
    impl OwnableInternalImpl = OwnableComponent::InternalImpl<ContractState>;
    component!(path: ManageableComponent, storage: manageable, event: ManageableEvent);
    impl ManageableInternalImpl = ManageableComponent::InternalImpl<ContractState>;
    component!(path: HostableComponent, storage: hostable, event: HostableEvent);
    impl HostableInternalImpl = HostableComponent::InternalImpl<ContractState>;
    component!(path: PayableComponent, storage: payable, event: PayableEvent);
    impl PayableInternalImpl = PayableComponent::InternalImpl<ContractState>;
    component!(path: PlayableComponent, storage: playable, event: PlayableEvent);
    impl PlayableInternalImpl = PlayableComponent::InternalImpl<ContractState>;

    // Storage

    #[storage]
    struct Storage {
        #[substorage(v0)]
        initializable: InitializableComponent::Storage,
        #[substorage(v0)]
        ownable: OwnableComponent::Storage,
        #[substorage(v0)]
        manageable: ManageableComponent::Storage,
        #[substorage(v0)]
        hostable: HostableComponent::Storage,
        #[substorage(v0)]
        payable: PayableComponent::Storage,
        #[substorage(v0)]
        playable: PlayableComponent::Storage,
    }

    // Events

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        #[flat]
        InitializableEvent: InitializableComponent::Event,
        #[flat]
        OwnableEvent: OwnableComponent::Event,
        #[flat]
        ManageableEvent: ManageableComponent::Event,
        #[flat]
        HostableEvent: HostableComponent::Event,
        #[flat]
        PayableEvent: PayableComponent::Event,
        #[flat]
        PlayableEvent: PlayableComponent::Event,
    }

    // Implementations

    #[abi(embed_v0)]
    impl DojoResourceProviderImpl of IDojoResourceProvider<ContractState> {
        fn dojo_resource(self: @ContractState) -> felt252 {
            'daily'
        }
    }

    #[abi(embed_v0)]
    impl Dailympl of IDaily<ContractState> {
        fn initialize(ref self: ContractState, world: ContractAddress) {
            // [Effect] Initialize contract
            self.initializable._initialize(world);
            // [Effect] Initialize ownable
            let caller = get_caller_address();
            self.ownable.initializer(caller);
        }

        fn create(
            self: @ContractState, world: IWorldDispatcher, name: felt252, master: ContractAddress
        ) {
            // [Effect] Create a player
            self.manageable._create(world, name, master);
        }

        fn spawn(self: @ContractState, world: IWorldDispatcher) -> u32 {
            // [Effect] Spawn a game
            let (game_id, amount) = self.hostable._spawn(world);
            // [Interaction] Pay entry price
            let caller = get_caller_address();
            self.payable._pay(caller, amount);
            // [Return] Game ID
            game_id
        }

        fn claim(self: @ContractState, world: IWorldDispatcher, tournament_id: u64, rank: u8) {
            // [Effect] Create game
            let reward = self.hostable._claim(world, tournament_id, rank);
            // [Interaction] Pay entry price
            let caller = get_caller_address();
            self.payable._refund(caller, reward);
        }

        fn sponsor(self: @ContractState, world: IWorldDispatcher, amount: felt252) {
            // [Effect] Create game
            let amount = self.hostable._sponsor(world, amount);
            // [Interaction] Pay entry price
            let caller = get_caller_address();
            self.payable._pay(caller, amount);
        }

        fn discard(self: @ContractState, world: IWorldDispatcher, game_id: u32) {
            // [Effect] Discard tile
            self.playable._discard(world, game_id);
        }

        fn surrender(self: @ContractState, world: IWorldDispatcher, game_id: u32) {
            // [Effect] Surrender game
            self.playable._surrender(world, game_id);
        }

        fn build(
            self: @ContractState,
            world: IWorldDispatcher,
            game_id: u32,
            orientation: Orientation,
            x: u32,
            y: u32,
            role: Role,
            spot: Spot,
        ) {
            // [Effect] Build a tile
            self.playable._build(world, game_id, orientation, x, y, role, spot);
        }
    }
}
