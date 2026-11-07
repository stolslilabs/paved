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
//!
//! The player's name (PLAYER-RENAME, `avatar::name`): UTF-8 text of 3 to 15 characters, the
//! letters and digits of any script with single spaces and hyphens between them, unique whatever
//! its case (one player per key, the case of Latin, Greek and Cyrillic folded). The player renames
//! itself (`rename`): its first change is free, every later one costs the owner's rename price in
//! cobbles, debited on `Setup`'s ledger in the same call. Without a name set here a player is shown
//! by its Cartridge username (the indexer's, N1); a name set here wins over it.

use paved::avatar::item::AvatarItem;

/// The bounds of a paid item's price in cobbles (0 and 0: not set).
#[derive(Copy, Drop, Serde, Debug, PartialEq)]
pub struct PriceBounds {
    pub min: u16,
    pub max: u16,
}

/// The reason of `Avatar`'s `CobblesSpent` on `Setup`.
pub const AVATAR_REASON: felt252 = 'AVATAR_ITEM';
/// The reason of a paid rename's `CobblesSpent` on `Setup`.
pub const RENAME_REASON: felt252 = 'RENAME';

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

/// The player's name (PLAYER-RENAME): set by the player for itself, its first change free, every
/// later one at the owner's rename price.
#[starknet::interface]
pub trait IAvatarName<TContractState> {
    /// Sets the price in cobbles of a rename after the first, owner only, not 0. Renames already
    /// made keep what they cost. Emits `RenamePriceSet`.
    fn set_rename_price(ref self: TContractState, cobbles: u16);
    /// The caller renames itself: `name` UTF-8 text of 3 to 15 characters
    /// (`avatar::name::name_key`), not its current name, and held by no other player in any case.
    /// Its first change is free; a later one costs the rename price, debited by `Setup` (a short
    /// balance reverts), refused when no price is set or the price is above `max_cobbles`, the
    /// price the player confirmed. The name it leaves is free for others at once. Emits `Renamed`.
    fn rename(ref self: TContractState, name: ByteArray, max_cobbles: u16);
    /// A player's name (empty: none set here, the client shows its Cartridge username).
    fn name(self: @TContractState, player_id: felt252) -> ByteArray;
    /// The changes a player has made (0: its next is free).
    fn renames(self: @TContractState, player_id: felt252) -> u32;
    /// The price in cobbles of a rename after the first (0: not set, only a first change is
    /// possible).
    fn rename_price(self: @TContractState) -> u16;
    /// The player holding `name` in any case; 0: free (or not a valid name).
    fn name_owner(self: @TContractState, name: ByteArray) -> felt252;
}

#[starknet::contract]
pub mod Avatar {
    use core::num::traits::Zero;
    use openzeppelin_interfaces::upgrades::IUpgradeable;
    use openzeppelin_upgrades::UpgradeableComponent;
    use paved::avatar::catalogue::CatalogueComponent;
    use paved::avatar::item::AvatarItem;
    use paved::avatar::look::{MAX_PARTS, look_ids};
    use paved::avatar::name::name_key;
    use paved::components::ownable::OwnableComponent;
    use paved::systems::setup::{ISetupSpendDispatcher, ISetupSpendDispatcherTrait};
    use starknet::storage::{
        Map, StorageMapReadAccess, StorageMapWriteAccess, StoragePointerReadAccess,
        StoragePointerWriteAccess,
    };
    use starknet::{ClassHash, ContractAddress, get_caller_address};
    use super::{AVATAR_REASON, IAvatar, IAvatarName, PriceBounds, RENAME_REASON};

    pub mod errors {
        pub const ZERO_SETUP_ADDRESS: felt252 = 'Avatar: setup is zero';
        pub const INVALID_PARTS: felt252 = 'Avatar: invalid parts';
        pub const INVALID_PART: felt252 = 'Avatar: invalid part';
        pub const INVALID_LOOK: felt252 = 'Avatar: invalid look';
        pub const NOT_OWNED: felt252 = 'Avatar: item not owned';
        pub const PRICE_ABOVE_MAX: felt252 = 'Avatar: price above max';
        pub const INVALID_NAME: felt252 = 'Avatar: invalid name';
        pub const SAME_NAME: felt252 = 'Avatar: same name';
        pub const NAME_TAKEN: felt252 = 'Avatar: name taken';
        pub const RENAME_NOT_PRICED: felt252 = 'Avatar: rename not priced';
        pub const INVALID_RENAME_PRICE: felt252 = 'Avatar: invalid rename price';
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
        /// PLAYER-RENAME, appended (P-42). A player's name, key `player_id` (empty: none); written
        /// by `rename`.
        names: Map<felt252, ByteArray>,
        /// The player holding a name, key the name's key (`name_key`: its characters, their case
        /// folded, hashed; 0: free); written by `rename`.
        name_owners: Map<felt252, felt252>,
        /// The changes a player has made, key `player_id`; written by `rename`.
        renames: Map<felt252, u32>,
        /// The key of a player's name, key `player_id` (0: none), so a rename frees it without
        /// reading the name again; written by `rename`.
        name_keys: Map<felt252, felt252>,
        /// The price in cobbles of a rename after the first (0: not set); written by
        /// `set_rename_price`.
        rename_price: u16,
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
        RenamePriceSet: RenamePriceSet,
        Renamed: Renamed,
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

    /// The price of a rename after the first, set by the owner.
    #[derive(Drop, Debug, PartialEq, starknet::Event)]
    pub struct RenamePriceSet {
        pub cobbles: u16,
    }

    /// The player's new name: `cobbles` what it cost (0: its first change), `count` the changes it
    /// has made with this one.
    #[derive(Drop, Debug, PartialEq, starknet::Event)]
    pub struct Renamed {
        #[key]
        pub player_id: felt252,
        pub name: ByteArray,
        pub cobbles: u16,
        pub count: u32,
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
    impl AvatarNameImpl of IAvatarName<ContractState> {
        fn set_rename_price(ref self: ContractState, cobbles: u16) {
            self.ownable.assert_only_owner();
            assert(cobbles != 0, errors::INVALID_RENAME_PRICE);
            self.rename_price.write(cobbles);
            self.emit(RenamePriceSet { cobbles });
        }

        fn rename(ref self: ContractState, name: ByteArray, max_cobbles: u16) {
            let player_id: felt252 = get_caller_address().into();
            // [Check] 3 to 15 characters of the allowed ones (`avatar::name`)
            let key = match name_key(@name) {
                Some(key) => key,
                None => core::panic_with_felt252(errors::INVALID_NAME),
            };
            // [Check] Another name than the current one (another case is another name): the name
            // read only when its key is the new one's
            let left = self.name_keys.read(player_id);
            if left == key {
                assert(name != self.names.read(player_id), errors::SAME_NAME);
            }
            // [Check] Held by no other player, in any case
            let owner = self.name_owners.read(key);
            assert(owner == 0 || owner == player_id, errors::NAME_TAKEN);
            // [Check] The first change free, a later one at the price set, never above the price
            // the player confirmed
            let count = self.renames.read(player_id);
            let cobbles = if count == 0 {
                0
            } else {
                let price = self.rename_price.read();
                assert(price != 0, errors::RENAME_NOT_PRICED);
                price
            };
            assert(cobbles <= max_cobbles, errors::PRICE_ABOVE_MAX);
            // [Effect] The name left is free at once; the new one is the player's
            if left != 0 && left != key {
                self.name_owners.write(left, 0);
            }
            self.name_owners.write(key, player_id);
            self.name_keys.write(player_id, key);
            self.names.write(player_id, name.clone());
            let count = count + 1;
            self.renames.write(player_id, count);
            // [Interaction] A paid change's cobbles debited on `Setup`'s ledger (reverts on a short
            // balance, and the whole rename with it)
            if cobbles != 0 {
                let setup = ISetupSpendDispatcher { contract_address: self.setup_address() };
                setup.spend_cobbles(player_id, cobbles.into(), RENAME_REASON);
            }
            self.emit(Renamed { player_id, name, cobbles, count });
        }

        fn name(self: @ContractState, player_id: felt252) -> ByteArray {
            self.names.read(player_id)
        }

        fn renames(self: @ContractState, player_id: felt252) -> u32 {
            self.renames.read(player_id)
        }

        fn rename_price(self: @ContractState) -> u16 {
            self.rename_price.read()
        }

        fn name_owner(self: @ContractState, name: ByteArray) -> felt252 {
            match name_key(@name) {
                Some(key) => self.name_owners.read(key),
                None => 0,
            }
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
