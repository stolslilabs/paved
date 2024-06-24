// Starknet imports

use starknet::ContractAddress;

// Dojo imports

use dojo::world::IWorldDispatcher;

// Internal imports

use paved::types::orientation::Orientation;
use paved::types::direction::Direction;
use paved::types::role::Role;
use paved::types::spot::Spot;

#[dojo::interface]
trait IDaily {
    fn spawn(ref world: IWorldDispatcher) -> u32;
    fn claim(ref world: IWorldDispatcher, tournament_id: u64, rank: u8,);
    fn sponsor(ref world: IWorldDispatcher, amount: felt252);
    fn discard(ref world: IWorldDispatcher, game_id: u32,);
    fn surrender(ref world: IWorldDispatcher, game_id: u32,);
    fn build(
        ref world: IWorldDispatcher,
        game_id: u32,
        orientation: Orientation,
        x: u32,
        y: u32,
        role: Role,
        spot: Spot,
    );
}

#[dojo::contract]
mod daily {
    // Starknet imports

    use starknet::{ContractAddress, ClassHash};
    use starknet::info::{
        get_block_timestamp, get_block_number, get_caller_address, get_contract_address
    };

    // Component imports

    use paved::components::emitter::EmitterComponent;
    use paved::components::ownable::OwnableComponent;
    use paved::components::hostable::HostableComponent;
    use paved::components::payable::PayableComponent;
    use paved::components::playable::PlayableComponent;

    // Internal imports

    use paved::types::orientation::Orientation;
    use paved::types::role::Role;
    use paved::types::spot::Spot;
    use paved::types::mode::Mode;

    // Local imports

    use super::IDaily;

    // Components

    component!(path: EmitterComponent, storage: emitter, event: EmitterEvent);
    impl EmitterImpl = EmitterComponent::EmitterImpl<ContractState>;
    component!(path: OwnableComponent, storage: ownable, event: OwnableEvent);
    #[abi(embed_v0)]
    impl OwnableImpl = OwnableComponent::OwnableImpl<ContractState>;
    impl OwnableInternalImpl = OwnableComponent::InternalImpl<ContractState>;
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
        emitter: EmitterComponent::Storage,
        #[substorage(v0)]
        ownable: OwnableComponent::Storage,
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
        EmitterEvent: EmitterComponent::Event,
        #[flat]
        OwnableEvent: OwnableComponent::Event,
        #[flat]
        HostableEvent: HostableComponent::Event,
        #[flat]
        PayableEvent: PayableComponent::Event,
        #[flat]
        PlayableEvent: PlayableComponent::Event,
    }

    // Constructor

    fn dojo_init(ref world: IWorldDispatcher, token_address: ContractAddress,) {
        // [Effect] Initialize components
        self.payable._initialize(token_address);
    }

    // Implementations

    #[abi(embed_v0)]
    impl DailyImpl of IDaily<ContractState> {
        fn spawn(ref world: IWorldDispatcher) -> u32 {
            // [Effect] Spawn a game
            let (game_id, amount) = self.hostable._spawn(world, Mode::Daily);
            // [Interaction] Pay entry price
            let caller = get_caller_address();
            // self.payable._pay(caller, amount);
            // [Return] Game ID
            game_id
        }

        fn claim(ref world: IWorldDispatcher, tournament_id: u64, rank: u8) {
            // [Effect] Create game
            let reward = self.hostable._claim(world, tournament_id, rank, Mode::Daily);
            // [Interaction] Pay entry price
            let caller = get_caller_address();
        // self.payable._refund(caller, reward);
        }

        fn sponsor(ref world: IWorldDispatcher, amount: felt252) {
            // [Effect] Create game
            let amount = self.hostable._sponsor(world, amount, Mode::Daily);
            // [Interaction] Pay entry price
            let caller = get_caller_address();
        // self.payable._pay(caller, amount);
        }

        fn discard(ref world: IWorldDispatcher, game_id: u32) {
            // [Effect] Discard tile
            self.playable._discard(world, game_id);
        }

        fn surrender(ref world: IWorldDispatcher, game_id: u32) {
            // [Effect] Surrender game
            self.playable._surrender(world, game_id);
        }

        fn build(
            ref world: IWorldDispatcher,
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
