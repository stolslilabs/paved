// Starknet imports

use paved::types::orientation::Orientation;

#[starknet::interface]
pub trait IChallenge<TContractState> {
    /// A paid game: approve `Challenge` on USDC for `stake x entry_price().amount` first (stake 1
    /// to 10). Any account may play: the player is the caller's address (D-25). `referrer`: an
    /// address, or zero (no referral). P-58 ignores a referrer, with no revert, when it is zero,
    /// the payer, the Vault, the router, `Economy` or the game (`Challenge`) itself. `min_out`: the
    /// least PAVED the whole swap must buy, the burn's quote plus the Vault's part
    /// (`docs/architecture/economy.md`, section 5), not the burn alone.
    fn spawn(
        ref self: TContractState, stake: u8, referrer: starknet::ContractAddress, min_out: u256,
    ) -> u32;
    /// A free game (cobbles v1, 4.1), on one of the caller's credits: no payment, no stake, no
    /// `Economy` call. `'Setup: no credit'` without a credit; paused with `spawn`. Its
    /// `GameSpawned.price` is 0, and its game over reports achievement progress only.
    fn spawn_free(ref self: TContractState) -> u32;
    fn discard(ref self: TContractState, game_id: u32);
    fn surrender(ref self: TContractState, game_id: u32);
    fn build(ref self: TContractState, game_id: u32, orientation: Orientation, x: u32, y: u32);
}

/// The VRF draws of `Challenge` (#645, D-30, `docs/architecture/challenge-vrf.md`): every random of
/// a game is drawn from Cartridge's provider (the devnet mock on devnet), one draw per transaction.
/// A call that draws puts the provider's `request_random(Challenge, Source::Salt(salt))` first in
/// its multicall: `spawn` and `spawn_free` always, with `spawn_salt(player)`; `build` and `discard`
/// when `draw(game_id).draws`, with its `salt`; `surrender` never.
#[starknet::interface]
pub trait IChallengeDraw<TContractState> {
    /// Sets the VRF provider: the owner only, never zero. Emits `VrfProviderSet`.
    fn set_vrf_provider(ref self: TContractState, provider: starknet::ContractAddress);
    /// The queue of a game and what its next build or discard draws.
    fn draw(self: @TContractState, game_id: u32) -> paved::views::DrawView;
    /// The salt that the next spawn of `player` draws with.
    fn spawn_salt(self: @TContractState, player: starknet::ContractAddress) -> felt252;
}

/// The `Setup` that `Challenge` reports its game overs to (D-24) and reads its wiring from (D-25
/// E):
/// the owner sets it (needed on a contract upgraded in place, whose constructor does not run
/// again).
#[starknet::interface]
pub trait IChallengeSetup<TContractState> {
    /// Sets the `Setup` reported to from now on: the owner only, never zero. Emits `SetupSet`.
    /// Since D-25 E it re-points the whole wiring too: every later spawn pays into and mints from,
    /// and every later game over records into, the new `Setup`'s economy and collection. Re-point
    /// only with no game in flight: a game bought under one economy would be recorded on another
    /// (whose `record` refuses a game it never sold, so the game could not end).
    fn set_setup(ref self: TContractState, setup: starknet::ContractAddress);
    fn setup(self: @TContractState) -> starknet::ContractAddress;
}

/// Emitted by `Challenge` when its owner sets the `Setup`.
#[derive(Drop, Debug, PartialEq, starknet::Event)]
pub struct SetupSet {
    pub setup: starknet::ContractAddress,
}

/// The emergency stop of `Challenge` (G4, `docs/architecture/upgrade-owner.md`, section 3): a
/// guardian, set by the owner, may pause `spawn` only, the entry point that takes money; unpausing
/// is the owner's. A paused `Challenge` still lets every game already bought end and be recorded:
/// `build`, `discard`, `surrender` and the game-over report are never paused.
#[starknet::interface]
pub trait IChallengeGuardian<TContractState> {
    /// Sets the guardian: the owner only; zero means no guardian. Emits `GuardianSet`.
    fn set_guardian(ref self: TContractState, guardian: starknet::ContractAddress);
    /// Pauses `spawn`: the guardian or the owner. Emits `SpawnPaused` once; a pause while paused
    /// does nothing.
    fn pause_spawn(ref self: TContractState);
    /// Unpauses `spawn`: the owner only. Emits `SpawnUnpaused` once; an unpause while unpaused
    /// does nothing.
    fn unpause_spawn(ref self: TContractState);
    fn guardian(self: @TContractState) -> starknet::ContractAddress;
    fn spawn_paused(self: @TContractState) -> bool;
}

/// Emitted by `Challenge` when its owner sets the guardian (zero: no guardian).
#[derive(Drop, Debug, PartialEq, starknet::Event)]
pub struct GuardianSet {
    pub guardian: starknet::ContractAddress,
}

/// Emitted by `Challenge` when `spawn` is paused, `by` the guardian or the owner.
#[derive(Drop, Debug, PartialEq, starknet::Event)]
pub struct SpawnPaused {
    pub by: starknet::ContractAddress,
}

/// Emitted by `Challenge` when its owner unpauses `spawn`.
#[derive(Drop, Debug, PartialEq, starknet::Event)]
pub struct SpawnUnpaused {}

#[starknet::contract]
pub mod Challenge {
    // Component imports

    use core::num::traits::Zero;
    use openzeppelin_interfaces::upgrades::IUpgradeable;
    use openzeppelin_upgrades::UpgradeableComponent;
    use paved::components::drawable::DrawableComponent;
    use paved::components::hostable::HostableComponent;
    use paved::components::ownable::OwnableComponent;
    use paved::components::payable::{IERC20Dispatcher, IERC20DispatcherTrait, PayableComponent};
    use paved::components::playable::PlayableComponent;

    // Internal imports

    use paved::events::Event as PavedEvent;
    use paved::models::game::GameImpl;
    use paved::quests::{achievement_entries, decode, is_free, quest_entries};
    use paved::seed::VrfSeed;
    use paved::store::StoreImpl;
    use paved::systems::collection::{ICollectionDispatcher, ICollectionDispatcherTrait};
    use paved::systems::economy::{DAY, IEconomyDispatcher, IEconomyDispatcherTrait};
    use paved::systems::setup::{
        ISetupCobblesDispatcher, ISetupCobblesDispatcherTrait, ISetupDispatcher,
        ISetupDispatcherTrait, Wiring,
    };
    use paved::types::mode::Mode;
    use paved::types::orientation::Orientation;
    use paved::views::{
        BuilderView, DrawView, GameView, IChallengeView, IGameView, PriceView, TileView, ViewsImpl,
    };
    use paved::vrf::draw_salt;
    use quiver_achievement::component::AchievementComponent;
    use quiver_quest::component::QuestComponent;
    use starknet::storage::{
        Map, StorageMapReadAccess, StorageMapWriteAccess, StoragePointerReadAccess,
        StoragePointerWriteAccess,
    };
    #[cfg(test)]
    use starknet::storage::{StorageAsPath, StorageAsPointer, StoragePathEntry};
    use starknet::{
        ClassHash, ContractAddress, get_block_timestamp, get_caller_address, get_contract_address,
    };

    // Local imports

    use super::{
        GuardianSet, IChallenge, IChallengeDraw, IChallengeGuardian, IChallengeSetup, SetupSet,
        SpawnPaused, SpawnUnpaused,
    };

    /// The kinds of `Challenge`'s draws (`paved::vrf::draw_salt`): a spawn, salted with the
    /// player's address and spawn count, and a move, salted with the game id and the id of the
    /// tile it queues.
    pub const SPAWN_KIND: felt252 = 'CHALLENGE_SPAWN';
    pub const MOVE_KIND: felt252 = 'CHALLENGE';

    // Errors

    pub mod errors {
        pub const ZERO_TOKEN_ADDRESS: felt252 = 'Challenge: token is zero';
        pub const ZERO_SETUP_ADDRESS: felt252 = 'Challenge: setup is zero';
        pub const NO_ECONOMY: felt252 = 'Challenge: economy not set';
        pub const NO_COLLECTION: felt252 = 'Challenge: collection not set';
        pub const PAY_FAILED: felt252 = 'ERC20: pay failed';
        pub const SPAWN_PAUSED: felt252 = 'Challenge: spawn paused';
        pub const NOT_GUARDIAN: felt252 = 'Challenge: not guardian';
        pub const INVALID_POSITION: felt252 = 'Challenge: invalid position';
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
    component!(path: DrawableComponent, storage: drawable, event: DrawableEvent);
    #[abi(embed_v0)]
    impl DrawableImpl = DrawableComponent::DrawableImpl<ContractState>;
    impl DrawableInternalImpl = DrawableComponent::InternalImpl<ContractState>;

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
        /// The address that may pause `spawn` (G4, P-42: appended); zero, no guardian. Written by
        /// `set_guardian` only: zero on a fresh deployment and after an in-place upgrade.
        guardian: ContractAddress,
        /// Whether `spawn` is paused (G4, P-42: appended); written by `pause_spawn` and
        /// `unpause_spawn` only: false on a fresh deployment and after an in-place upgrade.
        spawn_paused: bool,
        /// The VRF provider and the transaction of the last draw (#645, P-42: appended, flat, so
        /// at their own names `vrf_provider` and `vrf_last_draw_tx`). Zero after an in-place
        /// upgrade until the owner's `set_vrf_provider`: no spawn or drawing move until then.
        #[substorage(v0)]
        drawable: DrawableComponent::Storage,
        /// The spawns each player drew (#645, P-42: appended): the index of the player's next
        /// spawn draw, in its salt.
        vrf_spawn_counts: Map<ContractAddress, u32>,
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
        #[flat]
        DrawableEvent: DrawableComponent::Event,
        SetupSet: SetupSet,
        GuardianSet: GuardianSet,
        SpawnPaused: SpawnPaused,
        SpawnUnpaused: SpawnUnpaused,
    }

    // Constructor

    #[constructor]
    fn constructor(
        ref self: ContractState,
        owner: ContractAddress,
        token_address: ContractAddress,
        setup_address: ContractAddress,
    ) {
        // [Check] Addresses are set
        assert(token_address.is_non_zero(), errors::ZERO_TOKEN_ADDRESS);
        assert(setup_address.is_non_zero(), errors::ZERO_SETUP_ADDRESS);
        // [Effect] Initialize components
        self.ownable.initialize(owner);
        self.payable.initialize(token_address);
        self.setup.write(setup_address);
    }

    // Implementations

    #[abi(embed_v0)]
    impl ChallengeImpl of IChallenge<ContractState> {
        fn spawn(
            ref self: ContractState, stake: u8, referrer: ContractAddress, min_out: u256,
        ) -> u32 {
            self.spawn_paid(stake, referrer, min_out)
        }

        fn spawn_free(ref self: ContractState) -> u32 {
            // [Check] Spawn is not paused (G4): the pause stops free games too
            assert(!self.spawn_paused.read(), errors::SPAWN_PAUSED);
            // [Interaction] The wiring: the collection only, no economy
            let setup = self.setup_dispatcher();
            let collection = setup.wiring().collection;
            assert(collection.is_non_zero(), errors::NO_COLLECTION);
            // [Effect] Spawn a free game, marked free, `GameSpawned.price` 0, its seed drawn
            let random = self.spawn_random();
            let (game_id, _) = self.hostable.spawn_with(Mode::Challenge, @VrfSeed { random }, true);
            // [Interaction] One credit of the caller spent for it (reverts without one)
            ISetupCobblesDispatcher { contract_address: setup.contract_address }
                .spend_credit(get_caller_address().into(), game_id);
            // [Interaction] The game is minted to its player
            self.mint(collection, game_id);
            game_id
        }

        fn discard(ref self: ContractState, game_id: u32) {
            // [Effect] Discard tile, the queue's draw first if it draws
            let random = self.move_random(game_id);
            let over = self.playable.discard(game_id, random);
            self.finish(game_id, over);
        }

        fn surrender(ref self: ContractState, game_id: u32) {
            // [Effect] Surrender game
            let over = self.playable.surrender(game_id);
            self.finish(game_id, over);
        }

        fn build(ref self: ContractState, game_id: u32, orientation: Orientation, x: u32, y: u32) {
            // [Check] The position has its 8 neighbours in `u32` (0 and `u32::MAX` never have),
            // before any read or write
            assert(
                x != 0
                    && y != 0
                    && x != core::num::traits::Bounded::<u32>::MAX
                    && y != core::num::traits::Bounded::<u32>::MAX,
                errors::INVALID_POSITION,
            );
            // [Effect] Build a tile, the queue's draw first if it draws
            let random = self.move_random(game_id);
            let over = self.playable.build(game_id, orientation, x, y, random);
            self.finish(game_id, over);
        }
    }

    #[abi(embed_v0)]
    impl ChallengeSetupImpl of IChallengeSetup<ContractState> {
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
    impl ChallengeDrawImpl of IChallengeDraw<ContractState> {
        fn set_vrf_provider(ref self: ContractState, provider: ContractAddress) {
            // [Check] The owner
            self.ownable.assert_only_owner();
            // [Effect] Draw from it from now on (the component refuses zero)
            self.drawable.set_provider(provider);
        }

        fn draw(self: @ContractState, game_id: u32) -> DrawView {
            let game = StoreImpl::new().game(game_id);
            let index = game.move_draw(game.player_id, get_block_timestamp());
            ViewsImpl::draw(game, index, MOVE_KIND)
        }

        fn spawn_salt(self: @ContractState, player: ContractAddress) -> felt252 {
            draw_salt(SPAWN_KIND, player.into(), self.vrf_spawn_counts.read(player))
        }
    }

    #[abi(embed_v0)]
    impl ChallengeGuardianImpl of IChallengeGuardian<ContractState> {
        fn set_guardian(ref self: ContractState, guardian: ContractAddress) {
            // [Check] The owner
            self.ownable.assert_only_owner();
            // [Effect] The new guardian, or none
            self.guardian.write(guardian);
            self.emit(GuardianSet { guardian });
        }

        fn pause_spawn(ref self: ContractState) {
            // [Check] The guardian (never zero) or the owner. The owner arm needs no zero check:
            // the owner is never zero (`OwnableComponent::set_owner`, and there is no renounce);
            // if a renounce is ever added, keep a non-zero check on this side too.
            let caller = get_caller_address();
            let guardian = self.guardian.read();
            assert(
                (guardian.is_non_zero() && caller == guardian)
                    || caller == self.ownable.owner.read(),
                errors::NOT_GUARDIAN,
            );
            // [Effect] Pause, once
            if !self.spawn_paused.read() {
                self.spawn_paused.write(true);
                self.emit(SpawnPaused { by: caller });
            }
        }

        fn unpause_spawn(ref self: ContractState) {
            // [Check] The owner
            self.ownable.assert_only_owner();
            // [Effect] Unpause, once
            if self.spawn_paused.read() {
                self.spawn_paused.write(false);
                self.emit(SpawnUnpaused {});
            }
        }

        fn guardian(self: @ContractState) -> ContractAddress {
            self.guardian.read()
        }

        fn spawn_paused(self: @ContractState) -> bool {
            self.spawn_paused.read()
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

        fn initial_seed(self: @ContractState, game_id: u32) -> felt252 {
            ViewsImpl::initial_seed(StoreImpl::new(), get_contract_address(), game_id)
        }
    }

    #[abi(embed_v0)]
    impl ChallengeViewImpl of IChallengeView<ContractState> {
        fn current_day(self: @ContractState) -> u64 {
            ViewsImpl::current_day(get_block_timestamp())
        }

        fn entry_price(self: @ContractState) -> PriceView {
            ViewsImpl::entry_price(self.payable.token_address.read())
        }
    }

    /// Test only: the addresses of the fields dead since D-24, resolved through their names in
    /// this contract's storage, for the pin of the dead fields
    /// (`tests::e2e::cold_paths_audit::test_daily_pins_the_dead_fields_by_name`, a name kept from
    /// before D-23 on purpose: the docs cite it): `lobby_class`,
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

    /// The wiring of `setup`, in one call, checked for what each path uses: a spawn needs both
    /// addresses, a game over only the economy (`'Challenge: economy not set'`, `'Challenge:
    /// collection not set'` while `Setup`'s owner has not set them).
    fn wiring(setup: ISetupDispatcher, collection: bool) -> Wiring {
        let wiring = setup.wiring();
        assert(wiring.economy.is_non_zero(), errors::NO_ECONOMY);
        if collection {
            assert(wiring.collection.is_non_zero(), errors::NO_COLLECTION);
        }
        wiring
    }

    #[generate_trait]
    pub impl InternalImpl of InternalTrait {
        /// A paid game, its seed and first three tiles from the spawn's VRF draw (#645).
        fn spawn_paid(
            ref self: ContractState, stake: u8, referrer: ContractAddress, min_out: u256,
        ) -> u32 {
            // [Check] Spawn is not paused (G4), before any call or transfer
            assert(!self.spawn_paused.read(), errors::SPAWN_PAUSED);
            // [Interaction] The wiring, in one call to `Setup`
            let wiring = wiring(self.setup_dispatcher(), true);
            // [Interaction] The spawn's draw
            let random = self.spawn_random();
            // [Effect] Spawn a game
            let (game_id, unit) = self
                .hostable
                .spawn_with(Mode::Challenge, @VrfSeed { random }, false);
            // [Interaction] The game is purchased
            self.purchase(wiring.economy, game_id, unit, stake, referrer, min_out);
            // [Interaction] The game is minted to its player, under its own id and no other
            self.mint(wiring.collection, game_id);
            // [Return] Game ID
            game_id
        }

        /// The random of the caller's spawn (#645): salted with the caller's address and spawn
        /// count, which the draw increments. The salt is known before the transaction and no other
        /// player's spawn moves it; a reverted spawn counts nothing, so its retry draws the same.
        fn spawn_random(ref self: ContractState) -> felt252 {
            let player = get_caller_address();
            let index = self.vrf_spawn_counts.read(player);
            self.vrf_spawn_counts.write(player, index + 1);
            self.drawable.draw_random(SPAWN_KIND, player.into(), index)
        }

        /// The random of a build or discard of `game_id` by the caller, if the move draws
        /// (`GameImpl::move_draw`): salted with the game id and the id of the tile it queues.
        fn move_random(ref self: ContractState, game_id: u32) -> Option<felt252> {
            let game = StoreImpl::new().live_game(game_id);
            match game.move_draw(get_caller_address().into(), get_block_timestamp()) {
                Option::Some(index) => Option::Some(
                    self.drawable.draw_random(MOVE_KIND, game_id.into(), index),
                ),
                Option::None => Option::None,
            }
        }

        /// The `Setup` of the wiring and the reports; the wiring is read from it in one call
        /// (`wiring`, P-53 ruling 2). With no `Setup` (a zero slot: an in-place upgrade before
        /// `set_setup`) nothing can be paid, minted or recorded, so the call reverts (`'Challenge:
        /// setup is zero'`): a spawn spawns nothing, and a move that ends a game reverts and
        /// leaves the game live until the owner sets the `Setup`.
        fn setup_dispatcher(self: @ContractState) -> ISetupDispatcher {
            let setup = self.setup.read();
            assert(setup.is_non_zero(), errors::ZERO_SETUP_ADDRESS);
            ISetupDispatcher { contract_address: setup }
        }

        /// A game is a token (economy.md section 9): its id, minted to the caller, who is the
        /// player. `Collection` accepts it from `Challenge` only, a plain mint with no receiver
        /// callback. The id is never an input: it is the id the spawn just drew, so no entry
        /// point lets a caller mint another one.
        fn mint(ref self: ContractState, collection: ContractAddress, game_id: u32) {
            ICollectionDispatcher { contract_address: collection }
                .mint(get_caller_address(), game_id.into());
        }

        /// The purchase of a Challenge game (economy.md section 1, P-31): `stake x unit` USDC go
        /// from the player straight to `Economy`, then `Economy.purchase` splits them, in the same
        /// call, for this game's own id. `Economy` checks the stake (1 to 10) and the price. A
        /// referrer counts only if it is a non-zero address other than the payer (D-25: no
        /// registration) and other than the two protocol addresses `Challenge` knows, `Economy` and
        /// `Challenge` itself; any of those is ignored (no referral). Paid to `Economy`, the
        /// referral would be swept back into the margin and `Purchased` would count it twice; paid
        /// to `Challenge`, it would be stranded (nothing here transfers USDC out).
        fn purchase(
            ref self: ContractState,
            economy: ContractAddress,
            game_id: u32,
            unit: u256,
            stake: u8,
            referrer: ContractAddress,
            min_out: u256,
        ) {
            let player = get_caller_address();
            let economy = IEconomyDispatcher { contract_address: economy };
            let referred = referrer.is_non_zero()
                && referrer != player
                && referrer != economy.contract_address
                && referrer != get_contract_address();
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
        /// recorded by `Economy` (P-34), whose address is read from `Setup`'s wiring (D-25 E). With
        /// no `Setup` (a zero slot) the move reverts (`setup`): the economy is out of reach.
        ///
        /// A free game's game over (cobbles v1, 4.2) reports its achievement entries only, so no
        /// quest progress and no day or week of the ledger, and is not recorded by `Economy`,
        /// which never sold it.
        fn finish(ref self: ContractState, game_id: u32, over: u128) {
            if over != 0 {
                let player_id: felt252 = get_caller_address().into();
                let tally = decode(over, player_id);
                let setup = self.setup_dispatcher();
                if is_free(over) {
                    setup.report(player_id, array![].span(), achievement_entries(tally).span());
                    return;
                }
                let economy = wiring(setup, false).economy;
                setup
                    .report(
                        player_id, quest_entries(tally).span(), achievement_entries(tally).span(),
                    );
                IEconomyDispatcher { contract_address: economy }.record(game_id, tally.score);
            }
        }
    }
}
