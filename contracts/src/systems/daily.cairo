// Starknet imports

use paved::types::orientation::Orientation;

#[starknet::interface]
pub trait IDaily<TContractState> {
    /// A paid game: approve `Daily` on USDC for `stake x entry_price().amount` first (stake 1 to
    /// 10). `referrer`: a registered player other than the caller, or zero; `min_out`: the least
    /// PAVED the burn's swap must buy (`docs/architecture/economy.md`, section 5).
    fn spawn(
        ref self: TContractState, stake: u8, referrer: starknet::ContractAddress, min_out: u256,
    ) -> u32;
    fn discard(ref self: TContractState, game_id: u32);
    fn surrender(ref self: TContractState, game_id: u32);
    fn build(ref self: TContractState, game_id: u32, orientation: Orientation, x: u32, y: u32);
}

/// The `Setup` that `Daily` reports its game overs to (D-24): the owner sets it (needed on a
/// contract upgraded in place, whose constructor does not run again).
#[starknet::interface]
pub trait IDailySetup<TContractState> {
    /// Sets the `Setup` reported to from now on: the owner only, never zero. Emits `SetupSet`.
    fn set_setup(ref self: TContractState, setup: starknet::ContractAddress);
    fn setup(self: @TContractState) -> starknet::ContractAddress;
}

/// Emitted by `Daily` when its owner sets the `Setup`.
#[derive(Drop, Debug, PartialEq, starknet::Event)]
pub struct SetupSet {
    pub setup: starknet::ContractAddress,
}

#[starknet::contract]
pub mod Daily {
    // Component imports

    use core::num::traits::Zero;
    use openzeppelin_interfaces::upgrades::IUpgradeable;
    use openzeppelin_upgrades::UpgradeableComponent;
    use paved::components::hostable::HostableComponent;
    use paved::components::ownable::OwnableComponent;
    use paved::components::payable::{IERC20Dispatcher, IERC20DispatcherTrait, PayableComponent};
    use paved::components::playable::PlayableComponent;

    // Internal imports

    use paved::events::Event as PavedEvent;
    use paved::models::player::ZeroablePlayerTrait;
    use paved::quests::{achievement_entries, decode, quest_entries};
    use paved::store::{PavedStorage, StoreImpl, StoreTrait};
    use paved::systems::account::{IAccountDispatcher, IAccountDispatcherTrait};
    use paved::systems::collection::{ICollectionDispatcher, ICollectionDispatcherTrait};
    use paved::systems::economy::{DAY, IEconomyDispatcher, IEconomyDispatcherTrait};
    use paved::systems::setup::{ISetupDispatcher, ISetupDispatcherTrait};
    use paved::types::mode::Mode;
    use paved::types::orientation::Orientation;
    use paved::views::{
        BuilderView, GameView, IDailyView, IGameView, PriceView, TileView, ViewsImpl,
    };
    use quiver_achievement::component::AchievementComponent;
    use quiver_quest::component::QuestComponent;
    use starknet::storage::{
        StorageAsPath, StorageBase, StoragePointerReadAccess, StoragePointerWriteAccess,
    };
    #[cfg(test)]
    use starknet::storage::{StorageAsPointer, StoragePathEntry};
    use starknet::{ClassHash, ContractAddress, get_block_timestamp, get_caller_address};

    // Local imports

    use super::{IDaily, IDailySetup, SetupSet};

    // Errors

    pub mod errors {
        pub const ZERO_ACCOUNT_ADDRESS: felt252 = 'Daily: account is zero';
        pub const ZERO_TOKEN_ADDRESS: felt252 = 'Daily: token is zero';
        pub const ZERO_SETUP_ADDRESS: felt252 = 'Daily: setup is zero';
        pub const NO_ECONOMY: felt252 = 'Daily: economy not set';
        pub const NO_COLLECTION: felt252 = 'Daily: collection not set';
        pub const PAY_FAILED: felt252 = 'ERC20: pay failed';
    }

    // Components

    component!(path: HostableComponent, storage: hostable, event: HostableEvent);
    impl HostableInternalImpl = HostableComponent::InternalImpl<ContractState>;
    component!(path: OwnableComponent, storage: ownable, event: OwnableEvent);
    #[abi(embed_v0)]
    impl OwnableImpl = OwnableComponent::OwnableImpl<ContractState>;
    impl OwnableInternalImpl = OwnableComponent::InternalImpl<ContractState>;
    component!(path: UpgradeableComponent, storage: upgradeable, event: UpgradeableEvent);
    impl UpgradeableInternalImpl = UpgradeableComponent::InternalImpl<ContractState>;
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
        /// Dead since D-24 (P-42): the quests' `Quest_*` members, flat. The quests are `Setup`'s;
        /// kept declared so that their addresses are never given to another field, never written
        /// or read again.
        #[substorage(v0)]
        quest: QuestComponent::Storage,
        /// Dead since D-24 (P-42): the achievements' `Achievement_*` members, flat, as `quest`.
        #[substorage(v0)]
        achievement: AchievementComponent::Storage,
        /// Dead since D-24 (P-42): the `Lobby` class once run by library call. Kept declared so
        /// that its address is never given to another field; never written or read again.
        lobby_class: ClassHash,
        #[substorage(v0)]
        upgradeable: UpgradeableComponent::Storage,
        /// The `Setup` a game over reports to; written by the constructor and `set_setup`.
        setup: ContractAddress,
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
        #[flat]
        UpgradeableEvent: UpgradeableComponent::Event,
        SetupSet: SetupSet,
    }

    // Constructor

    #[constructor]
    fn constructor(
        ref self: ContractState,
        owner: ContractAddress,
        account_address: ContractAddress,
        token_address: ContractAddress,
        setup_address: ContractAddress,
    ) {
        // [Check] Addresses are set
        assert(account_address.is_non_zero(), errors::ZERO_ACCOUNT_ADDRESS);
        assert(token_address.is_non_zero(), errors::ZERO_TOKEN_ADDRESS);
        assert(setup_address.is_non_zero(), errors::ZERO_SETUP_ADDRESS);
        // [Effect] Initialize components
        self.ownable.initialize(owner);
        self.payable.initialize(token_address);
        self.setup.write(setup_address);
        // [Effect] Players are read from the Account contract
        StoreImpl::new().initialize(account_address);
    }

    // Implementations

    #[abi(embed_v0)]
    impl DailyImpl of IDaily<ContractState> {
        fn spawn(
            ref self: ContractState, stake: u8, referrer: ContractAddress, min_out: u256,
        ) -> u32 {
            // [Effect] Spawn a game
            let (game_id, unit) = self.hostable.spawn(Mode::Daily);
            // [Interaction] The game is purchased
            self.purchase(game_id, unit, stake, referrer, min_out);
            // [Interaction] The game is minted to its player, under its own id and no other
            self.mint(game_id);
            // [Return] Game ID
            game_id
        }

        fn discard(ref self: ContractState, game_id: u32) {
            // [Effect] Discard tile
            let over = self.playable.discard(game_id);
            self.finish(game_id, over);
        }

        fn surrender(ref self: ContractState, game_id: u32) {
            // [Effect] Surrender game
            let over = self.playable.surrender(game_id);
            self.finish(game_id, over);
        }

        fn build(ref self: ContractState, game_id: u32, orientation: Orientation, x: u32, y: u32) {
            // [Effect] Build a tile
            let over = self.playable.build(game_id, orientation, x, y);
            self.finish(game_id, over);
        }
    }

    #[abi(embed_v0)]
    impl DailySetupImpl of IDailySetup<ContractState> {
        fn set_setup(ref self: ContractState, setup: ContractAddress) {
            // [Check] The owner, a real address
            self.ownable.assert_only_owner();
            assert(setup.is_non_zero(), errors::ZERO_SETUP_ADDRESS);
            // [Effect] Report to it from the next game over on
            self.setup.write(setup);
            self.emit(SetupSet { setup });
        }

        fn setup(self: @ContractState) -> ContractAddress {
            self.setup.read()
        }
    }

    #[abi(embed_v0)]
    impl UpgradeableImpl of IUpgradeable<ContractState> {
        /// Replaces the class, keeping the storage (OpenZeppelin's `Upgraded`). The owner only.
        fn upgrade(ref self: ContractState, new_class_hash: ClassHash) {
            self.ownable.assert_only_owner();
            self.upgradeable.upgrade(new_class_hash);
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
    }

    #[abi(embed_v0)]
    impl DailyViewImpl of IDailyView<ContractState> {
        fn current_day(self: @ContractState) -> u64 {
            ViewsImpl::current_day(get_block_timestamp())
        }

        fn entry_price(self: @ContractState) -> PriceView {
            ViewsImpl::entry_price(self.payable.token_address.read())
        }
    }

    /// Test only: the addresses of the fields dead since D-24, resolved through their names in
    /// this contract's storage, for the pin of the dead fields
    /// (`tests::e2e::cold_paths_audit::test_daily_pins_the_dead_fields_by_name`): `lobby_class`,
    /// then every member of the quests and of the achievements, at the keys given.
    #[cfg(test)]
    #[generate_trait]
    pub impl DeadFieldsImpl of DeadFieldsTrait {
        fn dead_addresses(
            self: @ContractState, id: u32, player_id: felt252, reporter: ContractAddress,
        ) -> Array<felt252> {
            array![
                address_of(self.lobby_class.as_path()),
                address_of(self.quest.Quest_definitions.entry(id)),
                address_of(self.quest.Quest_tasks.entry(id)),
                address_of(self.quest.Quest_conditions.entry(id)),
                address_of(self.quest.Quest_progress.entry((player_id, id, 0))),
                address_of(self.quest.Quest_records.entry((player_id, id))),
                address_of(self.quest.Quest_held.entry((player_id, 0))),
                address_of(self.quest.Quest_reporters.entry(reporter)),
                address_of(self.achievement.Achievement_definitions.entry(id)),
                address_of(self.achievement.Achievement_extra_tasks.entry(id)),
                address_of(self.achievement.Achievement_reporters.entry(reporter)),
            ]
        }
    }

    #[cfg(test)]
    fn address_of<T, +Drop<T>, +starknet::storage::StorageAsPointer<T>>(path: T) -> felt252 {
        starknet::storage_access::storage_address_from_base(
            path.as_ptr().__storage_pointer_address__,
        )
            .into()
    }

    /// The `Account` registry that keeps the players and the wiring (`docs/architecture/
    /// economy.md`, section 6).
    fn account() -> IAccountDispatcher {
        let base: StorageBase<PavedStorage> = StorageBase { __base_address__: selector!("paved") };
        IAccountDispatcher { contract_address: base.as_path().account.read() }
    }

    /// The `Economy` of the paid Daily games, from `Account`: set once, never zero after that.
    fn economy() -> IEconomyDispatcher {
        let economy = account().economy();
        assert(economy.is_non_zero(), errors::NO_ECONOMY);
        IEconomyDispatcher { contract_address: economy }
    }

    /// The `Collection` of the game NFTs, from `Account`: set once, never zero after that.
    fn collection() -> ICollectionDispatcher {
        let collection = account().collection();
        assert(collection.is_non_zero(), errors::NO_COLLECTION);
        ICollectionDispatcher { contract_address: collection }
    }

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        /// A game is a token (economy.md section 9): its id, minted to the caller, who is the
        /// player (`spawn` checks that they are registered). `Collection` accepts it from `Daily`
        /// only, a plain mint with no receiver callback. The id is never an input: it is the id
        /// the spawn just drew, so no entry point lets a caller mint another one.
        fn mint(ref self: ContractState, game_id: u32) {
            collection().mint(get_caller_address(), game_id.into());
        }

        /// The purchase of a Daily game (economy.md section 1, P-31): `stake x unit` USDC go
        /// from the player straight to `Economy`, then `Economy.purchase` splits them, in the same
        /// call, for this game's own id. `Economy` checks the stake (1 to 10) and the price. A
        /// referrer counts only if it is a registered player other than the payer; any other is
        /// ignored (no referral).
        fn purchase(
            ref self: ContractState,
            game_id: u32,
            unit: u256,
            stake: u8,
            referrer: ContractAddress,
            min_out: u256,
        ) {
            let player = get_caller_address();
            let economy = economy();
            let referred = referrer.is_non_zero()
                && referrer != player
                && StoreImpl::new().player(referrer.into()).is_non_zero();
            let referrer = if referred {
                referrer
            } else {
                Zero::zero()
            };
            let price = stake.into() * unit;
            let token = IERC20Dispatcher { contract_address: self.payable.token_address.read() };
            assert(token.transferFrom(player, economy.contract_address, price), errors::PAY_FAILED);
            economy
                .purchase(
                    game_id, player, get_block_timestamp() / DAY, stake, price, referrer, min_out,
                );
        }

        /// A game over (`over`, the tally of `paved::quests::encode`; 0 for a move that does not
        /// end the game, which reports nothing) makes one call to `Setup`, after the `GameOver`
        /// is emitted: the progress of the caller of the move, who is the game's player (the
        /// move reverted otherwise, `PlayableComponent`). Entries come from constants
        /// (`paved::quests`), so the report cannot revert for its content. Its score is then
        /// recorded by `Economy` (P-34). With no `Setup` (a zero slot: an in-place upgrade before
        /// `set_setup`) the game still ends and is recorded, and no progress is reported for it.
        fn finish(ref self: ContractState, game_id: u32, over: u128) {
            if over != 0 {
                let player_id: felt252 = get_caller_address().into();
                let tally = decode(over, player_id);
                let setup = self.setup.read();
                if setup.is_non_zero() {
                    ISetupDispatcher { contract_address: setup }
                        .report(
                            player_id,
                            quest_entries(tally).span(),
                            achievement_entries(tally).span(),
                        );
                }
                economy().record(game_id, tally.score);
            }
        }
    }
}
