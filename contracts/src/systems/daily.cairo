// Internal imports

use paved::types::orientation::Orientation;
use paved::types::role::Role;
use paved::types::spot::Spot;

#[starknet::interface]
trait IDaily<TContractState> {
    fn spawn(self: @TContractState) -> u32;
    fn claim(self: @TContractState, tournament_id: u64, rank: u8,);
    fn sponsor(self: @TContractState, amount: felt252);
    fn discard(self: @TContractState, game_id: u32,);
    fn surrender(self: @TContractState, game_id: u32,);
    fn build(
        self: @TContractState,
        game_id: u32,
        orientation: Orientation,
        x: u32,
        y: u32,
        role: Role,
        spot: Spot,
    );
}

#[dojo::contract]
mod Daily {
    // Starknet imports

    use starknet::ContractAddress;
    use starknet::info::get_caller_address;

    // Component imports

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

    component!(path: PayableComponent, storage: payable, event: PayableEvent);
    impl PayableInternalImpl = PayableComponent::InternalImpl<ContractState>;
    component!(path: PlayableComponent, storage: playable, event: PlayableEvent);
    impl PlayableInternalImpl = PlayableComponent::InternalImpl<ContractState>;

    // Storage

    #[storage]
    struct Storage {
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
        PayableEvent: PayableComponent::Event,
        #[flat]
        PlayableEvent: PlayableComponent::Event,
    }

    // Constructor

    fn dojo_init(ref world: IWorldDispatcher, token_address: ContractAddress,) {
        // [Effect] Initialize components
        self.payable.initialize(world, token_address);
    }

    // Implementations

    #[abi(embed_v0)]
    impl DailyImpl of IDaily<ContractState> {
        fn spawn(self: @ContractState) -> u32 {
            // [Effect] Spawn a game
            let (game_id, amount) = self.playable.spawn(self.world(), Mode::Daily);
            // [Interaction] Pay entry price
            let caller = get_caller_address();
            self.payable.pay(caller, amount);
            // [Return] Game ID
            game_id
        }

        fn claim(self: @ContractState, tournament_id: u64, rank: u8) {
            // [Effect] Create game
            let reward = self.playable.claim(self.world(), tournament_id, rank, Mode::Daily);
            // [Interaction] Pay entry price
            let caller = get_caller_address();
            self.payable.refund(caller, reward);
        }

        fn sponsor(self: @ContractState, amount: felt252) {
            // [Effect] Create game
            let amount = self.playable.sponsor(self.world(), amount, Mode::Daily);
            // [Interaction] Pay entry price
            let caller = get_caller_address();
            self.payable.pay(caller, amount);
        }

        fn discard(self: @ContractState, game_id: u32) {
            // [Effect] Discard tile
            self.playable.discard(self.world(), game_id);
        }

        fn surrender(self: @ContractState, game_id: u32) {
            // [Effect] Surrender game
            self.playable.surrender(self.world(), game_id);
        }

        fn build(
            self: @ContractState,
            game_id: u32,
            orientation: Orientation,
            x: u32,
            y: u32,
            role: Role,
            spot: Spot,
        ) {
            // [Effect] Build a tile
            self.playable.build(self.world(), game_id, orientation, x, y, role, spot);
        }
    }
}
