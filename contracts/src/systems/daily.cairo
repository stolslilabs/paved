// Starknet imports

use paved::types::orientation::Orientation;
use paved::types::role::Role;
use paved::types::spot::Spot;

#[starknet::interface]
pub trait IDaily<TContractState> {
    fn spawn(ref self: TContractState) -> u32;
    fn claim(ref self: TContractState, tournament_id: u64, rank: u8);
    fn sponsor(ref self: TContractState, amount: felt252);
    fn discard(ref self: TContractState, game_id: u32);
    fn surrender(ref self: TContractState, game_id: u32);
    fn build(
        ref self: TContractState,
        game_id: u32,
        orientation: Orientation,
        x: u32,
        y: u32,
        role: Role,
        spot: Spot,
    );
}

#[starknet::contract]
pub mod Daily {
    // Component imports

    use paved::components::hostable::HostableComponent;
    use paved::components::ownable::OwnableComponent;
    use paved::components::payable::PayableComponent;
    use paved::components::playable::PlayableComponent;

    // Internal imports

    use paved::events::Event as PavedEvent;
    use paved::store::{StoreImpl, StoreTrait};
    use paved::types::mode::Mode;
    use paved::types::orientation::Orientation;
    use paved::types::role::Role;
    use paved::types::spot::Spot;
    use starknet::{ContractAddress, get_caller_address};

    // Local imports

    use super::IDaily;

    // Components

    component!(path: HostableComponent, storage: hostable, event: HostableEvent);
    impl HostableInternalImpl = HostableComponent::InternalImpl<ContractState>;
    component!(path: OwnableComponent, storage: ownable, event: OwnableEvent);
    #[abi(embed_v0)]
    impl OwnableImpl = OwnableComponent::OwnableImpl<ContractState>;
    impl OwnableInternalImpl = OwnableComponent::InternalImpl<ContractState>;
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
        ownable: OwnableComponent::Storage,
        #[substorage(v0)]
        payable: PayableComponent::Storage,
        #[substorage(v0)]
        playable: PlayableComponent::Storage,
    }

    // Events

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        #[flat]
        PavedEvent: PavedEvent,
        #[flat]
        HostableEvent: HostableComponent::Event,
        #[flat]
        OwnableEvent: OwnableComponent::Event,
        #[flat]
        PayableEvent: PayableComponent::Event,
        #[flat]
        PlayableEvent: PlayableComponent::Event,
    }

    // Constructor

    #[constructor]
    fn constructor(
        ref self: ContractState,
        owner: ContractAddress,
        account_address: ContractAddress,
        token_address: ContractAddress,
    ) {
        // [Effect] Initialize components
        self.ownable.initialize(owner);
        self.payable.initialize(token_address);
        // [Effect] Players are read from the Account contract
        StoreImpl::new().initialize(account_address);
    }

    // Implementations

    #[abi(embed_v0)]
    impl DailyImpl of IDaily<ContractState> {
        fn spawn(ref self: ContractState) -> u32 {
            // [Effect] Spawn a game
            let (game_id, amount) = self.hostable.spawn(Mode::Daily);
            // [Interaction] Pay entry price
            let caller = get_caller_address();
            self.payable.pay(caller, amount);
            // [Return] Game ID
            game_id
        }

        fn claim(ref self: ContractState, tournament_id: u64, rank: u8) {
            // [Effect] Claim the reward
            let reward = self.hostable.claim(tournament_id, rank, Mode::Daily);
            // [Interaction] Pay the reward out of the prize pool
            let caller = get_caller_address();
            self.payable.refund(caller, reward);
        }

        fn sponsor(ref self: ContractState, amount: felt252) {
            // [Effect] Add to the prize pool
            let amount = self.hostable.sponsor(amount, Mode::Daily);
            // [Interaction] Pay the amount
            let caller = get_caller_address();
            self.payable.pay(caller, amount);
        }

        fn discard(ref self: ContractState, game_id: u32) {
            // [Effect] Discard tile
            self.playable.discard(game_id);
        }

        fn surrender(ref self: ContractState, game_id: u32) {
            // [Effect] Surrender game
            self.playable.surrender(game_id);
        }

        fn build(
            ref self: ContractState,
            game_id: u32,
            orientation: Orientation,
            x: u32,
            y: u32,
            role: Role,
            spot: Spot,
        ) {
            // [Effect] Build a tile
            self.playable.build(game_id, orientation, x, y, role, spot);
        }
    }
}
