// Starknet imports

use starknet::ContractAddress;

// Internal imports

use paved::types::orientation::Orientation;
use paved::types::role::Role;
use paved::types::spot::Spot;

#[starknet::interface]
trait IDuel<TContractState> {
    fn spawn(ref self: TContractState, name: felt252, duration: u64, price: felt252) -> u32;
    fn rename(self: @TContractState, game_id: u32, name: felt252);
    fn update(self: @TContractState, game_id: u32, duration: u64);
    fn join(ref self: TContractState, game_id: u32);
    fn ready(self: @TContractState, game_id: u32, status: bool);
    fn transfer(ref self: TContractState, game_id: u32, player_id: ContractAddress);
    fn leave(ref self: TContractState, game_id: u32,);
    fn kick(ref self: TContractState, game_id: u32, player_id: ContractAddress);
    fn delete(self: @TContractState, game_id: u32,);
    fn start(self: @TContractState, game_id: u32,);
    fn claim(self: @TContractState, game_id: u32,);
    fn discard(self: @TContractState, game_id: u32,);
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
mod Duel {
    // Starknet imports

    use starknet::ContractAddress;
    use starknet::info::get_caller_address;

    // Component imports

    use paved::components::hostable::HostableComponent;
    use paved::components::payable::PayableComponent;
    use paved::components::playable::PlayableComponent;

    // Internal imports

    use paved::types::orientation::Orientation;
    use paved::types::role::Role;
    use paved::types::spot::Spot;
    use paved::types::mode::Mode;

    // Local imports

    use super::IDuel;

    // Components

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
        HostableEvent: HostableComponent::Event,
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
    impl DuelImpl of IDuel<ContractState> {
        fn spawn(ref self: ContractState, name: felt252, duration: u64, price: felt252) -> u32 {
            // [Effect] Spawn a game
            let (game_id, amount) = self
                .hostable
                .spawn(self.world(), Mode::Duel, name, duration, price);
            // [Interaction] Pay entry price
            let caller = get_caller_address();
            self.payable.pay(caller, amount);
            // [Return] Game ID
            game_id
        }

        fn rename(self: @ContractState, game_id: u32, name: felt252) {
            // [Effect] Rename game
            self.hostable.rename(self.world(), game_id, name);
        }

        fn update(self: @ContractState, game_id: u32, duration: u64) {
            // [Effect] Update game
            self.hostable.update(self.world(), game_id, duration);
        }

        fn join(ref self: ContractState, game_id: u32) {
            // [Effect] Join game
            let amount = self.hostable.join(self.world(), game_id);
            // [Interaction] Pay entry price
            let caller = get_caller_address();
            self.payable.pay(caller, amount);
        }

        fn ready(self: @ContractState, game_id: u32, status: bool) {
            // [Effect] Set ready status
            self.hostable.ready(self.world(), game_id, status);
        }

        fn transfer(ref self: ContractState, game_id: u32, player_id: ContractAddress) {
            // [Effect] Transfer ownership
            self.hostable.transfer(self.world(), game_id, player_id.into());
        }

        fn leave(ref self: ContractState, game_id: u32) {
            // [Effect] Leave game
            let amount = self.hostable.leave(self.world(), game_id);
            // [Interaction] Refund entry price
            let caller = get_caller_address();
            self.payable.refund(caller, amount);
        }

        fn kick(ref self: ContractState, game_id: u32, player_id: ContractAddress) {
            // [Effect] Kick player from game
            let amount = self.hostable.kick(self.world(), game_id, player_id.into());
            // [Interaction] Refund entry price
            self.payable.refund(player_id, amount);
        }

        fn delete(self: @ContractState, game_id: u32) {
            // [Effect] Delete game
            let amount = self.hostable.delete(self.world(), game_id);
            // [Interaction] Refund entry price
            let caller = get_caller_address();
            self.payable.refund(caller, amount);
        }

        fn start(self: @ContractState, game_id: u32) {
            // [Effect] Start game
            self.hostable.start(self.world(), game_id);
        }

        fn claim(self: @ContractState, game_id: u32) {
            // [Effect] Create game
            let reward = self.hostable.claim(self.world(), game_id);
            // [Interaction] Pay entry price
            let caller = get_caller_address();
            self.payable.refund(caller, reward);
        }

        fn discard(self: @ContractState, game_id: u32) {
            // [Effect] Discard tile
            self.playable.discard(self.world(), game_id);
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
