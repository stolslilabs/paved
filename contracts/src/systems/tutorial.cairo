// Starknet imports

#[starknet::interface]
pub trait ITutorial<TContractState> {
    fn spawn(ref self: TContractState) -> u32;
    fn discard(ref self: TContractState, game_id: u32);
    fn surrender(ref self: TContractState, game_id: u32);
    fn build(ref self: TContractState, game_id: u32);
}

#[starknet::contract]
pub mod Tutorial {
    // Component imports

    use core::num::traits::Zero;
    use paved::components::hostable::HostableComponent;
    use paved::components::ownable::OwnableComponent;
    use paved::components::tutoriable::TutoriableComponent;

    // Internal imports

    use paved::constants;
    use paved::events::Event as PavedEvent;
    use paved::store::{StoreImpl, StoreTrait};
    use paved::types::mode::Mode;
    use paved::views::{BuilderView, CharacterView, GameView, IGameView, TileView, ViewsImpl};
    use quiver_achievement::component::AchievementComponent;
    use starknet::{ContractAddress, get_caller_address};

    // Local imports

    use super::ITutorial;

    // Errors

    pub mod errors {
        pub const ZERO_ACCOUNT_ADDRESS: felt252 = 'Tutorial: account is zero';
    }

    // Components

    component!(path: HostableComponent, storage: hostable, event: HostableEvent);
    impl HostableInternalImpl = HostableComponent::InternalImpl<ContractState>;
    component!(path: OwnableComponent, storage: ownable, event: OwnableEvent);
    #[abi(embed_v0)]
    impl OwnableImpl = OwnableComponent::OwnableImpl<ContractState>;
    impl OwnableInternalImpl = OwnableComponent::InternalImpl<ContractState>;
    component!(path: TutoriableComponent, storage: tutoriable, event: TutoriableEvent);
    impl TutoriableInternalImpl = TutoriableComponent::InternalImpl<ContractState>;
    // [Info] Achievements: the Tutorial only reports task 10. Progress reads no definition, so the
    // definitions live in `Daily` and nothing is stored here; no view and no external entrypoint.
    component!(path: AchievementComponent, storage: achievement, event: AchievementEvent);
    impl AchievementInternalImpl = AchievementComponent::InternalImpl<ContractState>;
    impl AchievementTracking = quiver_achievement::store::tracking::TrackAll<ContractState>;

    impl AchievementHooks of AchievementComponent::AchievementHooksTrait<ContractState> {
        // Used by the external `AchievementImpl` only, which is not embedded
        fn authorize_admin(
            self: @AchievementComponent::ComponentState<ContractState>, caller: ContractAddress,
        ) -> bool {
            false
        }
    }

    // Storage

    #[storage]
    struct Storage {
        #[substorage(v0)]
        hostable: HostableComponent::Storage,
        #[substorage(v0)]
        ownable: OwnableComponent::Storage,
        #[substorage(v0)]
        tutoriable: TutoriableComponent::Storage,
        #[substorage(v0)]
        achievement: AchievementComponent::Storage,
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
        TutoriableEvent: TutoriableComponent::Event,
        #[flat]
        AchievementEvent: AchievementComponent::Event,
    }

    // Constructor

    #[constructor]
    fn constructor(
        ref self: ContractState, owner: ContractAddress, account_address: ContractAddress,
    ) {
        // [Check] Account address is set
        assert(account_address.is_non_zero(), errors::ZERO_ACCOUNT_ADDRESS);
        // [Effect] Initialize components
        self.ownable.initialize(owner);
        // [Effect] Players are read from the Account contract
        StoreImpl::new().initialize(account_address);
    }

    // Implementations

    #[abi(embed_v0)]
    impl TutorialImpl of ITutorial<ContractState> {
        fn spawn(ref self: ContractState) -> u32 {
            // [Effect] Spawn a game
            let (game_id, _) = self.hostable.spawn(Mode::Tutorial);
            // [Return] Game ID
            game_id
        }

        fn discard(ref self: ContractState, game_id: u32) {
            // [Effect] Discard a tile
            let over = self.tutoriable.discard(game_id);
            self.report(over);
        }

        fn surrender(ref self: ContractState, game_id: u32) {
            // [Effect] Surrender game
            let over = self.tutoriable.surrender(game_id);
            self.report(over);
        }

        fn build(ref self: ContractState, game_id: u32) {
            // [Effect] Build a tile
            let over = self.tutoriable.build(game_id);
            self.report(over);
        }
    }
    #[generate_trait]
    impl InternalImpl of InternalTrait {
        /// A Tutorial game over reports one unit of task 10 for its player, after the game over.
        fn report(ref self: ContractState, over: bool) {
            if over {
                let player_id: felt252 = get_caller_address().into();
                self.achievement.progress(player_id, constants::TASK_TUTORIAL_FINISHED, 1);
            }
        }
    }

    #[abi(embed_v0)]
    impl GameViewImpl of IGameView<ContractState> {
        fn game(self: @ContractState, game_id: u32) -> GameView {
            ViewsImpl::game(StoreImpl::new(), game_id)
        }

        fn tiles(self: @ContractState, game_id: u32, from: u32, count: u32) -> Array<TileView> {
            ViewsImpl::tiles(StoreImpl::new(), game_id, from, count)
        }

        fn builder(self: @ContractState, game_id: u32, player_id: felt252) -> BuilderView {
            ViewsImpl::builder(StoreImpl::new(), game_id, player_id)
        }

        fn characters(
            self: @ContractState, game_id: u32, player_id: felt252,
        ) -> Array<CharacterView> {
            ViewsImpl::characters(StoreImpl::new(), game_id, player_id)
        }
    }
}
