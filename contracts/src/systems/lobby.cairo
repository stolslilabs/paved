// What does not run on an ordinary move: spawn, claim, sponsor, discard and surrender of `Daily`
// and `Tutorial`, as one class those two run through `library_call_syscall`
// (`docs/architecture/class-headroom.md`, option e). Under a library call the storage, the caller
// and the address that emits the events stay the calling contract's. The components use flat
// storage (`substorage(v0)`) and the game state lives in the `paved` storage node
// (`store.cairo`), so this code reads and writes the same addresses as the caller's own code
// (`tests::e2e::lobby` pins that).
//
// `Lobby` is declared, never deployed: its constructor reverts, so no instance of it exists and
// its entry points only run as `Daily` or `Tutorial`, through their wrappers.

use paved::types::mode::Mode;

#[starknet::interface]
pub trait ILobby<TContractState> {
    fn spawn(ref self: TContractState, mode: Mode) -> u32;
    fn claim(ref self: TContractState, tournament_id: u64, rank: u8);
    fn sponsor(ref self: TContractState, amount: felt252);
    fn discard(ref self: TContractState, game_id: u32);
    fn surrender(ref self: TContractState, game_id: u32);
    fn tutorial_discard(ref self: TContractState, game_id: u32);
    fn tutorial_surrender(ref self: TContractState, game_id: u32);
}

#[starknet::contract]
pub mod Lobby {
    // Component imports

    use paved::components::hostable::HostableComponent;
    use paved::components::payable::PayableComponent;
    use paved::components::playable::PlayableComponent;
    use paved::components::tutoriable::TutoriableComponent;

    // Internal imports

    use paved::types::mode::Mode;
    use starknet::get_caller_address;

    // Local imports

    use super::ILobby;

    // Errors

    pub mod errors {
        pub const NOT_DEPLOYABLE: felt252 = 'Lobby: declared only';
    }

    // Components

    component!(path: HostableComponent, storage: hostable, event: HostableEvent);
    impl HostableInternalImpl = HostableComponent::InternalImpl<ContractState>;
    component!(path: PayableComponent, storage: payable, event: PayableEvent);
    impl PayableInternalImpl = PayableComponent::InternalImpl<ContractState>;
    component!(path: PlayableComponent, storage: playable, event: PlayableEvent);
    impl PlayableInternalImpl = PlayableComponent::InternalImpl<ContractState>;
    component!(path: TutoriableComponent, storage: tutoriable, event: TutoriableEvent);
    impl TutoriableInternalImpl = TutoriableComponent::InternalImpl<ContractState>;

    // Storage

    #[storage]
    struct Storage {
        #[substorage(v0)]
        hostable: HostableComponent::Storage,
        #[substorage(v0)]
        payable: PayableComponent::Storage,
        #[substorage(v0)]
        playable: PlayableComponent::Storage,
        #[substorage(v0)]
        tutoriable: TutoriableComponent::Storage,
    }

    // Events

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        #[flat]
        HostableEvent: HostableComponent::Event,
        #[flat]
        PayableEvent: PayableComponent::Event,
        #[flat]
        PlayableEvent: PlayableComponent::Event,
        #[flat]
        TutoriableEvent: TutoriableComponent::Event,
    }

    // Constructor

    /// A deploy of the class always reverts: `Lobby` only runs by library call.
    #[constructor]
    fn constructor(ref self: ContractState) {
        core::panic_with_felt252(errors::NOT_DEPLOYABLE);
    }

    // Implementations

    #[abi(embed_v0)]
    impl LobbyImpl of ILobby<ContractState> {
        fn spawn(ref self: ContractState, mode: Mode) -> u32 {
            // [Effect] Spawn a game
            let (game_id, amount) = self.hostable.spawn(mode);
            // [Interaction] Pay entry price (a Tutorial game is free)
            if mode == Mode::Daily {
                self.payable.pay(get_caller_address(), amount);
            }
            // [Return] Game ID
            game_id
        }

        fn claim(ref self: ContractState, tournament_id: u64, rank: u8) {
            // [Effect] Claim the reward
            let reward = self.hostable.claim(tournament_id, rank, Mode::Daily);
            // [Interaction] Pay the reward out of the prize pool
            self.payable.refund(get_caller_address(), reward);
        }

        fn sponsor(ref self: ContractState, amount: felt252) {
            // [Effect] Add to the prize pool
            let amount = self.hostable.sponsor(amount, Mode::Daily);
            // [Interaction] Pay the amount
            self.payable.pay(get_caller_address(), amount);
        }

        fn discard(ref self: ContractState, game_id: u32) {
            // [Effect] Discard tile
            self.playable.discard(game_id);
        }

        fn surrender(ref self: ContractState, game_id: u32) {
            // [Effect] Surrender game
            self.playable.surrender(game_id);
        }

        fn tutorial_discard(ref self: ContractState, game_id: u32) {
            // [Effect] Discard a tile
            self.tutoriable.discard(game_id);
        }

        fn tutorial_surrender(ref self: ContractState, game_id: u32) {
            // [Effect] Surrender game
            self.tutoriable.surrender(game_id);
        }
    }
}
