//! `Avatar`, the system of the avatar on chain and its cosmetics (#627,
//! `docs/architecture/avatar-chain.md`).
//!
//! A player's avatar is one `u128`, its look, in AVATAR-LOOK's format (`avatar::look`: the version
//! in byte 0, one item id per part after it); the owner sets how many parts are in use
//! (`set_parts`, which only grows). The catalogue and what each player owns are the
//! `CatalogueComponent`'s (`avatar::catalogue`): the owner lists the items, a price in cobbles (0
//! for the free base set) within the owner's bounds, with optional limits in quantity and time.
//! The player buys a paid item for itself (`buy_avatar_item`), once; the cobbles are debited on
//! `Setup`'s one ledger (`ISetupSpend::spend_cobbles`, this system an allowlisted spender). The
//! player sets its avatar (`set_avatar`) when every part is free or owned; anyone reads it.
//!
//! Nothing is hard-coded but the format: the parts in use, the price bounds, the free items and the
//! limits are the owner's settings.

use paved::avatar::item::AvatarItem;

/// The bounds of a paid item's price in cobbles (0 and 0: not set).
#[derive(Copy, Drop, Serde, Debug, PartialEq)]
pub struct PriceBounds {
    pub min: u16,
    pub max: u16,
}

/// The reason of `Avatar`'s `CobblesSpent` on `Setup`.
pub const AVATAR_REASON: felt252 = 'AVATAR_ITEM';

#[starknet::interface]
pub trait IAvatar<TContractState> {
    /// Sets the number of parts in use, owner only: 1 to `look::MAX_PARTS`, never fewer than now
    /// (a new part reads as item 0 in an older look). Emits `PartsSet`.
    fn set_parts(ref self: TContractState, parts: u8);
    /// Sets the bounds of a paid item's price in cobbles, owner only (1 <= `min` <= `max`). Items
    /// already listed keep their price. Emits `PriceBoundsSet`.
    fn set_price_bounds(ref self: TContractState, min: u16, max: u16);
    /// Lists item `id` of `part`, owner only: a part in use, `cobbles` 0 (free, the base set) or
    /// within the price bounds; `supply` the most sold (0: no limit), `until` the block time sales
    /// stop at (0: no end). Relisting keeps the count sold. Emits `AvatarItemListed`.
    fn set_item(ref self: TContractState, part: u8, id: u8, cobbles: u16, supply: u32, until: u64);
    /// Withdraws a listed item, owner only: no new sale, and a free item stops being free. What
    /// is owned stays owned. Emits `AvatarItemListed`.
    fn withdraw_item(ref self: TContractState, part: u8, id: u8);
    /// The caller buys a listed paid item for itself, once, for its price in cobbles (debited by
    /// `Setup`), refused when that price is above `max_cobbles`, the price the player confirmed (an
    /// owner's change between the player's read and the purchase never charges more). Buying does
    /// not set the avatar. Emits `AvatarItemBought`.
    fn buy_avatar_item(ref self: TContractState, part: u8, id: u8, max_cobbles: u16);
    /// The caller sets its avatar: `look` 0 clears it; any other must be of the format's version,
    /// hold no byte past the parts in use, and each of its items be listed and free, or owned.
    /// Emits `AvatarSet`.
    fn set_avatar(ref self: TContractState, look: u128);
    /// The avatar of any player (0: none set).
    fn avatar(self: @TContractState, player_id: felt252) -> u128;
    /// The items of `part` a player owns: bit `id` is item `id`.
    fn owned(self: @TContractState, player_id: felt252, part: u8) -> u256;
    /// An item of the catalogue (state `UNLISTED`: never listed).
    fn item(self: @TContractState, part: u8, id: u8) -> AvatarItem;
    /// The items of a part, id 0 up to the highest ever listed (empty: none listed).
    fn items(self: @TContractState, part: u8) -> Array<AvatarItem>;
    /// The number of parts in use (0: not set, only the look 0 is accepted).
    fn parts(self: @TContractState) -> u8;
    /// The bounds of a paid item's price (0, 0: not set, only free items can be listed).
    fn price_bounds(self: @TContractState) -> PriceBounds;
    /// The `Setup` whose ledger pays; set by the owner.
    fn set_setup(ref self: TContractState, setup: starknet::ContractAddress);
    fn setup(self: @TContractState) -> starknet::ContractAddress;
}

#[starknet::contract]
pub mod Avatar {
    use core::num::traits::Zero;
    use openzeppelin_interfaces::upgrades::IUpgradeable;
    use openzeppelin_upgrades::UpgradeableComponent;
    use paved::avatar::catalogue::CatalogueComponent;
    use paved::avatar::item::AvatarItem;
    use paved::avatar::look::{MAX_PARTS, look_ids};
    use paved::components::ownable::OwnableComponent;
    use paved::systems::setup::{ISetupSpendDispatcher, ISetupSpendDispatcherTrait};
    use starknet::storage::{
        Map, StorageMapReadAccess, StorageMapWriteAccess, StoragePointerReadAccess,
        StoragePointerWriteAccess,
    };
    use starknet::{ClassHash, ContractAddress, get_caller_address};
    use super::{AVATAR_REASON, IAvatar, PriceBounds};

    pub mod errors {
        pub const ZERO_SETUP_ADDRESS: felt252 = 'Avatar: setup is zero';
        pub const INVALID_PARTS: felt252 = 'Avatar: invalid parts';
        pub const INVALID_PART: felt252 = 'Avatar: invalid part';
        pub const INVALID_LOOK: felt252 = 'Avatar: invalid look';
        pub const NOT_OWNED: felt252 = 'Avatar: item not owned';
        pub const PRICE_ABOVE_MAX: felt252 = 'Avatar: price above max';
    }

    component!(path: OwnableComponent, storage: ownable, event: OwnableEvent);
    #[abi(embed_v0)]
    impl OwnableImpl = OwnableComponent::OwnableImpl<ContractState>;
    impl OwnableInternalImpl = OwnableComponent::InternalImpl<ContractState>;
    component!(path: UpgradeableComponent, storage: upgradeable, event: UpgradeableEvent);
    impl UpgradeableInternalImpl = UpgradeableComponent::InternalImpl<ContractState>;
    component!(path: CatalogueComponent, storage: catalogue, event: CatalogueEvent);
    impl CatalogueInternalImpl = CatalogueComponent::InternalImpl<ContractState>;

    #[storage]
    struct Storage {
        #[substorage(v0)]
        ownable: OwnableComponent::Storage,
        #[substorage(v0)]
        upgradeable: UpgradeableComponent::Storage,
        #[substorage(v0)]
        catalogue: CatalogueComponent::Storage,
        /// The `Setup` whose ledger pays; written by the constructor and `set_setup`.
        setup: ContractAddress,
        /// The number of parts in use; written by `set_parts`.
        parts: u8,
        /// A player's look, key `player_id`; written by `set_avatar`.
        avatars: Map<felt252, u128>,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        #[flat]
        OwnableEvent: OwnableComponent::Event,
        #[flat]
        UpgradeableEvent: UpgradeableComponent::Event,
        #[flat]
        CatalogueEvent: CatalogueComponent::Event,
        SetupSet: SetupSet,
        PartsSet: PartsSet,
        AvatarItemBought: AvatarItemBought,
        AvatarSet: AvatarSet,
    }

    #[derive(Drop, Debug, PartialEq, starknet::Event)]
    pub struct SetupSet {
        pub setup: ContractAddress,
    }

    #[derive(Drop, Debug, PartialEq, starknet::Event)]
    pub struct PartsSet {
        pub parts: u8,
    }

    /// An item bought by the player for itself: `cobbles` its price, `sold` the count sold after
    /// it, `balance` the player's cobbles after it.
    #[derive(Drop, Debug, PartialEq, starknet::Event)]
    pub struct AvatarItemBought {
        #[key]
        pub player_id: felt252,
        pub part: u8,
        pub id: u8,
        pub cobbles: u16,
        pub sold: u32,
        pub balance: u64,
    }

    /// The player's avatar after a `set_avatar` (0: cleared).
    #[derive(Drop, Debug, PartialEq, starknet::Event)]
    pub struct AvatarSet {
        #[key]
        pub player_id: felt252,
        pub look: u128,
    }

    #[constructor]
    fn constructor(
        ref self: ContractState, owner: ContractAddress, setup_address: ContractAddress,
    ) {
        assert(setup_address.is_non_zero(), errors::ZERO_SETUP_ADDRESS);
        self.ownable.initialize(owner);
        self.setup.write(setup_address);
    }

    #[abi(embed_v0)]
    impl AvatarImpl of IAvatar<ContractState> {
        fn set_parts(ref self: ContractState, parts: u8) {
            self.ownable.assert_only_owner();
            // [Check] 1 to 15 parts, never fewer than now
            assert(parts != 0 && parts <= MAX_PARTS, errors::INVALID_PARTS);
            assert(parts >= self.parts.read(), errors::INVALID_PARTS);
            // [Effect]
            self.parts.write(parts);
            self.emit(PartsSet { parts });
        }

        fn set_price_bounds(ref self: ContractState, min: u16, max: u16) {
            self.ownable.assert_only_owner();
            self.catalogue.set_price_bounds(min, max);
        }

        fn set_item(
            ref self: ContractState, part: u8, id: u8, cobbles: u16, supply: u32, until: u64,
        ) {
            self.ownable.assert_only_owner();
            assert(part < self.parts.read(), errors::INVALID_PART);
            self.catalogue.list(part, id, cobbles, supply, until);
        }

        fn withdraw_item(ref self: ContractState, part: u8, id: u8) {
            self.ownable.assert_only_owner();
            self.catalogue.withdraw(part, id);
        }

        fn buy_avatar_item(ref self: ContractState, part: u8, id: u8, max_cobbles: u16) {
            let player_id: felt252 = get_caller_address().into();
            // [Check] [Effect] On sale, not owned: owned, one more sold (an item is listed only in
            // a part in use)
            let item = self.catalogue.buy(player_id, part, id);
            // [Check] Not above the price the player confirmed (the whole call reverts otherwise)
            assert(item.cobbles <= max_cobbles, errors::PRICE_ABOVE_MAX);
            // [Interaction] The cobbles debited on `Setup`'s ledger (reverts on a short balance)
            let setup = ISetupSpendDispatcher { contract_address: self.setup_address() };
            let balance = setup.spend_cobbles(player_id, item.cobbles.into(), AVATAR_REASON);
            self
                .emit(
                    AvatarItemBought {
                        player_id, part, id, cobbles: item.cobbles, sold: item.sold, balance,
                    },
                );
        }

        fn set_avatar(ref self: ContractState, look: u128) {
            let player_id: felt252 = get_caller_address().into();
            if look != 0 {
                // [Check] The format's version, no byte past the parts in use
                let ids = match look_ids(look, self.parts.read()) {
                    Some(ids) => ids,
                    None => core::panic_with_felt252(errors::INVALID_LOOK),
                };
                // [Check] Each part listed and free, or owned
                let mut part: u8 = 0;
                for id in ids {
                    assert(self.catalogue.may_use(player_id, part, id), errors::NOT_OWNED);
                    part += 1;
                }
            }
            // [Effect]
            self.avatars.write(player_id, look);
            self.emit(AvatarSet { player_id, look });
        }

        fn avatar(self: @ContractState, player_id: felt252) -> u128 {
            self.avatars.read(player_id)
        }

        fn owned(self: @ContractState, player_id: felt252, part: u8) -> u256 {
            self.catalogue.owned(player_id, part)
        }

        fn item(self: @ContractState, part: u8, id: u8) -> AvatarItem {
            self.catalogue.item(part, id)
        }

        fn items(self: @ContractState, part: u8) -> Array<AvatarItem> {
            self.catalogue.items(part)
        }

        fn parts(self: @ContractState) -> u8 {
            self.parts.read()
        }

        fn price_bounds(self: @ContractState) -> PriceBounds {
            let (min, max) = self.catalogue.price_bounds();
            PriceBounds { min, max }
        }

        fn set_setup(ref self: ContractState, setup: ContractAddress) {
            self.ownable.assert_only_owner();
            assert(setup.is_non_zero(), errors::ZERO_SETUP_ADDRESS);
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

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn setup_address(self: @ContractState) -> ContractAddress {
            let setup = self.setup.read();
            assert(setup.is_non_zero(), errors::ZERO_SETUP_ADDRESS);
            setup
        }
    }
}
