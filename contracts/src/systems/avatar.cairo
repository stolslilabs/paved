//! `Avatar`, the system of the avatar on chain and its cosmetics (#627,
//! `docs/architecture/avatar-chain.md`).
//!
//! A player's avatar is one `felt252`, its look: one item id per part category, read through the
//! layout the owner sets (`set_layout`: the width in bits of each category, category 0 in the
//! lowest bits). The owner lists the items of the catalogue (`set_item`): a price in cobbles, 0
//! for the free base set, and optional limits in quantity (`supply`) and in time (`until`). The
//! player buys a paid item for itself (`buy_avatar_item`), once; the cobbles are debited on
//! `Setup`'s one ledger (`ISetupSpend::spend_cobbles`, this system its one spender). The player
//! sets its avatar (`set_avatar`) when every part is free or owned; anyone reads it (`avatar`).
//!
//! Nothing is hard-coded but the packing: the layout, the price bounds, the free items and the
//! limits are the owner's settings.

/// The most part categories of a layout: one byte each after the count, in one `felt252`.
pub const MAX_CATEGORIES: u32 = 30;
/// The widest category, in bits: item ids 0 to 127, one `u128` of ownership per category.
pub const MAX_WIDTH: u8 = 7;
/// The states of an item: never listed, listed (on sale, or free), withdrawn from sale.
pub const UNLISTED: u8 = 0;
pub const LISTED: u8 = 1;
pub const WITHDRAWN: u8 = 2;

/// An item of the catalogue, one slot per `(category, id)`: `state` [0, 8) · `cobbles` [8, 24)
/// (0: free) · `sold` [32, 64) · `supply` [64, 96) (0: no limit) · `until` [128, 192) (0: no
/// end;
/// otherwise sales stop at that block time).
#[derive(Copy, Drop, Serde, Debug, PartialEq, Default)]
pub struct AvatarItem {
    pub state: u8,
    pub cobbles: u16,
    pub sold: u32,
    pub supply: u32,
    pub until: u64,
}

const TWO_POW_8: u128 = 0x100;
const TWO_POW_32: u128 = 0x100000000;
const TWO_POW_64: u128 = 0x10000000000000000;
const MASK_8: u128 = 0xff;
const MASK_16: u128 = 0xffff;
const MASK_32: u128 = 0xffffffff;

pub fn item_word(item: AvatarItem) -> felt252 {
    let low: u128 = item.state.into()
        + item.cobbles.into() * TWO_POW_8
        + item.sold.into() * TWO_POW_32
        + item.supply.into() * TWO_POW_64;
    let word = u256 { low, high: item.until.into() };
    word.try_into().unwrap()
}

pub fn item_of(word: felt252) -> AvatarItem {
    let word: u256 = word.into();
    AvatarItem {
        state: (word.low & MASK_8).try_into().unwrap(),
        cobbles: ((word.low / TWO_POW_8) & MASK_16).try_into().unwrap(),
        sold: ((word.low / TWO_POW_32) & MASK_32).try_into().unwrap(),
        supply: (word.low / TWO_POW_64).try_into().unwrap(),
        until: word.high.try_into().unwrap(),
    }
}

/// The layout word: the category count in byte 0, the width of category `c` in byte `c + 1`.
pub fn layout_word(widths: Span<u8>) -> felt252 {
    let mut word: felt252 = 0;
    let mut unit: felt252 = 0x100;
    for width in widths {
        word += (*width).into() * unit;
        unit *= 0x100;
    }
    word + widths.len().into()
}

pub fn layout_widths(word: felt252) -> Array<u8> {
    let mut rest: u256 = word.into();
    let count = rest & 0xff;
    let mut widths: Array<u8> = array![];
    let mut i: u256 = 0;
    while i < count {
        rest /= 0x100;
        widths.append((rest & 0xff).try_into().unwrap());
        i += 1;
    }
    widths
}

/// 2 to the power of a width, 1 to 7.
fn unit_of(width: u8) -> u256 {
    match width {
        0 => 1,
        1 => 0x2,
        2 => 0x4,
        3 => 0x8,
        4 => 0x10,
        5 => 0x20,
        6 => 0x40,
        _ => 0x80,
    }
}

/// The item id of each category of a look, category 0 first; `None` when the look has a bit set
/// above the layout.
pub fn look_ids(look: felt252, widths: Span<u8>) -> Option<Array<u8>> {
    let mut rest: u256 = look.into();
    let mut ids: Array<u8> = array![];
    for width in widths {
        let unit = unit_of(*width);
        ids.append((rest % unit).try_into().unwrap());
        rest /= unit;
    }
    if rest == 0 {
        Some(ids)
    } else {
        None
    }
}

/// A look from one item id per category, category 0 in the lowest bits (ids are not checked
/// against the widths).
pub fn look_of(ids: Span<u8>, widths: Span<u8>) -> felt252 {
    let mut look: u256 = 0;
    let mut unit: u256 = 1;
    let mut i = 0;
    while i < ids.len() {
        look += (*ids.at(i)).into() * unit;
        unit *= unit_of(*widths.at(i));
        i += 1;
    }
    look.try_into().unwrap()
}

#[starknet::interface]
pub trait IAvatar<TContractState> {
    /// Sets the layout, owner only: the width in bits (1 to 7) of each part category, category 0
    /// first, 1 to 30 categories. Once set it may only grow: the categories already there keep
    /// their widths, so a stored look keeps its meaning (a new category reads as item 0 in an old
    /// look). Emits `LayoutSet`.
    fn set_layout(ref self: TContractState, widths: Span<u8>);
    /// Sets the bounds of a paid item's price in cobbles, owner only (1 <= `min` <= `max`). Items
    /// already listed keep their price. Emits `PriceBoundsSet`.
    fn set_price_bounds(ref self: TContractState, min: u16, max: u16);
    /// Lists item `id` of `category`, owner only: `cobbles` 0 (free, the base set) or within the
    /// price bounds; `supply` the most sold (0: no limit), `until` the block time sales stop at
    /// (0: no end). Relisting keeps the count sold. Emits `AvatarItemListed`.
    fn set_item(
        ref self: TContractState, category: u8, id: u8, cobbles: u16, supply: u32, until: u64,
    );
    /// Withdraws a listed item, owner only: no new sale, and a free item stops being free. What
    /// is owned stays owned. Emits `AvatarItemListed`.
    fn withdraw_item(ref self: TContractState, category: u8, id: u8);
    /// The caller buys a listed paid item for itself, once, for its price in cobbles (debited by
    /// `Setup`). Buying does not set the avatar. Emits `AvatarItemBought`.
    fn buy_avatar_item(ref self: TContractState, category: u8, id: u8);
    /// The caller sets its avatar: `look` 0 clears it; any other must fit the layout, and each of
    /// its items be listed and free, or owned. Emits `AvatarSet`.
    fn set_avatar(ref self: TContractState, look: felt252);
    /// The avatar of any player (0: none set).
    fn avatar(self: @TContractState, player_id: felt252) -> felt252;
    /// The items of `category` a player owns: bit `id` is item `id`.
    fn owned(self: @TContractState, player_id: felt252, category: u8) -> u128;
    /// An item of the catalogue (state `UNLISTED`: never listed).
    fn item(self: @TContractState, category: u8, id: u8) -> AvatarItem;
    /// Every item of a category of the layout, id 0 first: `2^width` of them.
    fn items(self: @TContractState, category: u8) -> Array<AvatarItem>;
    /// The width of each category, category 0 first (empty: no layout yet).
    fn layout(self: @TContractState) -> Array<u8>;
    /// The bounds of a paid item's price (0, 0: not set, only free items can be listed).
    fn price_bounds(self: @TContractState) -> (u16, u16);
    /// The `Setup` whose ledger pays; set by the owner.
    fn set_setup(ref self: TContractState, setup: starknet::ContractAddress);
    fn setup(self: @TContractState) -> starknet::ContractAddress;
}

#[starknet::contract]
pub mod Avatar {
    use core::num::traits::{Pow, Zero};
    use openzeppelin_interfaces::upgrades::IUpgradeable;
    use openzeppelin_upgrades::UpgradeableComponent;
    use paved::components::ownable::OwnableComponent;
    use paved::systems::setup::{ISetupSpendDispatcher, ISetupSpendDispatcherTrait, SPEND_AVATAR};
    use starknet::storage::{
        Map, StorageMapReadAccess, StorageMapWriteAccess, StoragePointerReadAccess,
        StoragePointerWriteAccess,
    };
    use starknet::{ClassHash, ContractAddress, get_block_timestamp, get_caller_address};
    use super::{
        AvatarItem, IAvatar, LISTED, MAX_CATEGORIES, MAX_WIDTH, WITHDRAWN, item_of, item_word,
        layout_widths, layout_word, look_ids,
    };

    pub mod errors {
        pub const ZERO_SETUP_ADDRESS: felt252 = 'Avatar: setup is zero';
        pub const INVALID_LAYOUT: felt252 = 'Avatar: invalid layout';
        pub const LAYOUT_SHRINKS: felt252 = 'Avatar: layout changed';
        pub const NO_LAYOUT: felt252 = 'Avatar: no layout';
        pub const INVALID_BOUNDS: felt252 = 'Avatar: invalid bounds';
        pub const INVALID_ITEM: felt252 = 'Avatar: invalid item';
        pub const INVALID_COBBLES: felt252 = 'Avatar: invalid cobbles';
        pub const NOT_LISTED: felt252 = 'Avatar: item not listed';
        pub const NOT_FOR_SALE: felt252 = 'Avatar: item not for sale';
        pub const OWNED: felt252 = 'Avatar: item owned';
        pub const SOLD_OUT: felt252 = 'Avatar: item sold out';
        pub const SALE_ENDED: felt252 = 'Avatar: sale ended';
        pub const INVALID_LOOK: felt252 = 'Avatar: invalid look';
        pub const NOT_OWNED: felt252 = 'Avatar: item not owned';
    }

    component!(path: OwnableComponent, storage: ownable, event: OwnableEvent);
    #[abi(embed_v0)]
    impl OwnableImpl = OwnableComponent::OwnableImpl<ContractState>;
    impl OwnableInternalImpl = OwnableComponent::InternalImpl<ContractState>;
    component!(path: UpgradeableComponent, storage: upgradeable, event: UpgradeableEvent);
    impl UpgradeableInternalImpl = UpgradeableComponent::InternalImpl<ContractState>;

    /// The `state` and `cobbles` bits of an item word (`super::item_word`).
    const FREE_MASK: u128 = 0xffffff;

    #[storage]
    struct Storage {
        #[substorage(v0)]
        ownable: OwnableComponent::Storage,
        #[substorage(v0)]
        upgradeable: UpgradeableComponent::Storage,
        /// The `Setup` whose ledger pays; written by the constructor and `set_setup`.
        setup: ContractAddress,
        /// The layout (`super::layout_word`); written by `set_layout`.
        layout: felt252,
        /// The bounds of a paid item's price; written by `set_price_bounds`.
        price_min: u16,
        price_max: u16,
        /// The catalogue, key `(category, id)` (`super::item_word`); written by `set_item`,
        /// `withdraw_item` and `buy_avatar_item` (`sold`).
        items: Map<(u8, u8), felt252>,
        /// The items a player owns in a category, key `(player_id, category)`: bit `id`; written
        /// by `buy_avatar_item`.
        owned: Map<(felt252, u8), u128>,
        /// A player's look, key `player_id`; written by `set_avatar`.
        avatars: Map<felt252, felt252>,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        #[flat]
        OwnableEvent: OwnableComponent::Event,
        #[flat]
        UpgradeableEvent: UpgradeableComponent::Event,
        SetupSet: SetupSet,
        LayoutSet: LayoutSet,
        PriceBoundsSet: PriceBoundsSet,
        AvatarItemListed: AvatarItemListed,
        AvatarItemBought: AvatarItemBought,
        AvatarSet: AvatarSet,
    }

    #[derive(Drop, Debug, PartialEq, starknet::Event)]
    pub struct SetupSet {
        pub setup: ContractAddress,
    }

    /// The layout: `categories` the count, `layout` the whole word (`super::layout_word`).
    #[derive(Drop, Debug, PartialEq, starknet::Event)]
    pub struct LayoutSet {
        pub categories: u8,
        pub layout: felt252,
    }

    #[derive(Drop, Debug, PartialEq, starknet::Event)]
    pub struct PriceBoundsSet {
        pub min: u16,
        pub max: u16,
    }

    /// An item listed (`state` `LISTED`) or withdrawn (`WITHDRAWN`), with its settings.
    #[derive(Drop, Debug, PartialEq, starknet::Event)]
    pub struct AvatarItemListed {
        #[key]
        pub category: u8,
        #[key]
        pub id: u8,
        pub state: u8,
        pub cobbles: u16,
        pub supply: u32,
        pub until: u64,
    }

    /// An item bought by the player for itself: `cobbles` its price, `sold` the count sold after
    /// it, `balance` the player's cobbles after it.
    #[derive(Drop, Debug, PartialEq, starknet::Event)]
    pub struct AvatarItemBought {
        #[key]
        pub player_id: felt252,
        pub category: u8,
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
        pub look: felt252,
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
        fn set_layout(ref self: ContractState, widths: Span<u8>) {
            self.ownable.assert_only_owner();
            // [Check] 1 to 30 categories, each 1 to 7 bits wide
            assert(widths.len() != 0 && widths.len() <= MAX_CATEGORIES, errors::INVALID_LAYOUT);
            for width in widths {
                assert(*width != 0 && *width <= MAX_WIDTH, errors::INVALID_LAYOUT);
            }
            // [Check] The categories already there keep their widths
            let current = layout_widths(self.layout.read());
            assert(current.len() <= widths.len(), errors::LAYOUT_SHRINKS);
            let mut i = 0;
            while i < current.len() {
                assert(*current.at(i) == *widths.at(i), errors::LAYOUT_SHRINKS);
                i += 1;
            }
            // [Effect]
            let layout = layout_word(widths);
            self.layout.write(layout);
            self.emit(LayoutSet { categories: widths.len().try_into().unwrap(), layout });
        }

        fn set_price_bounds(ref self: ContractState, min: u16, max: u16) {
            self.ownable.assert_only_owner();
            assert(min != 0 && min <= max, errors::INVALID_BOUNDS);
            self.price_min.write(min);
            self.price_max.write(max);
            self.emit(PriceBoundsSet { min, max });
        }

        fn set_item(
            ref self: ContractState, category: u8, id: u8, cobbles: u16, supply: u32, until: u64,
        ) {
            self.ownable.assert_only_owner();
            // [Check] An item the layout can hold, a price within the bounds or free
            self.assert_item(category, id);
            assert(
                cobbles == 0
                    || (cobbles >= self.price_min.read() && cobbles <= self.price_max.read()),
                errors::INVALID_COBBLES,
            );
            // [Effect] Listed, the count sold kept
            let mut item = item_of(self.items.read((category, id)));
            item.state = LISTED;
            item.cobbles = cobbles;
            item.supply = supply;
            item.until = until;
            self.items.write((category, id), item_word(item));
            self.emit(AvatarItemListed { category, id, state: LISTED, cobbles, supply, until });
        }

        fn withdraw_item(ref self: ContractState, category: u8, id: u8) {
            self.ownable.assert_only_owner();
            let mut item = item_of(self.items.read((category, id)));
            assert(item.state == LISTED, errors::NOT_LISTED);
            item.state = WITHDRAWN;
            self.items.write((category, id), item_word(item));
            self
                .emit(
                    AvatarItemListed {
                        category,
                        id,
                        state: WITHDRAWN,
                        cobbles: item.cobbles,
                        supply: item.supply,
                        until: item.until,
                    },
                );
        }

        fn buy_avatar_item(ref self: ContractState, category: u8, id: u8) {
            let player_id: felt252 = get_caller_address().into();
            // [Check] Listed and paid (an id never listed is `UNLISTED`), within its limits
            let mut item = item_of(self.items.read((category, id)));
            assert(item.state == LISTED && item.cobbles != 0, errors::NOT_FOR_SALE);
            assert(item.supply == 0 || item.sold < item.supply, errors::SOLD_OUT);
            assert(item.until == 0 || get_block_timestamp() < item.until, errors::SALE_ENDED);
            // [Check] Not owned (a listed item has an id below 128: `set_item` checks the layout)
            let owned = self.owned.read((player_id, category));
            let flag = 2_u128.pow(id.into());
            assert(owned & flag == 0, errors::OWNED);
            // [Effect] Owned, one more sold
            self.owned.write((player_id, category), owned | flag);
            item.sold += 1;
            self.items.write((category, id), item_word(item));
            // [Interaction] The cobbles debited on `Setup`'s ledger (reverts on a short balance)
            let setup = ISetupSpendDispatcher { contract_address: self.setup_address() };
            let key: u32 = category.into() * 0x100 + id.into();
            let balance = setup.spend_cobbles(player_id, item.cobbles.into(), SPEND_AVATAR, key);
            self
                .emit(
                    AvatarItemBought {
                        player_id, category, id, cobbles: item.cobbles, sold: item.sold, balance,
                    },
                );
        }

        fn set_avatar(ref self: ContractState, look: felt252) {
            let player_id: felt252 = get_caller_address().into();
            if look != 0 {
                // [Check] The look fits the layout
                let widths = layout_widths(self.layout.read());
                assert(widths.len() != 0, errors::NO_LAYOUT);
                let ids = match look_ids(look, widths.span()) {
                    Some(ids) => ids,
                    None => core::panic_with_felt252(errors::INVALID_LOOK),
                };
                // [Check] Each part listed and free, or owned
                let mut category: u8 = 0;
                for id in ids {
                    // Listed and free: `state` LISTED and `cobbles` 0, the low 24 bits of the item
                    // word
                    let word: u256 = self.items.read((category, id)).into();
                    if word.low & FREE_MASK != LISTED.into() {
                        let owned = self.owned.read((player_id, category));
                        assert(owned & 2_u128.pow(id.into()) != 0, errors::NOT_OWNED);
                    }
                    category += 1;
                }
            }
            // [Effect]
            self.avatars.write(player_id, look);
            self.emit(AvatarSet { player_id, look });
        }

        fn avatar(self: @ContractState, player_id: felt252) -> felt252 {
            self.avatars.read(player_id)
        }

        fn owned(self: @ContractState, player_id: felt252, category: u8) -> u128 {
            self.owned.read((player_id, category))
        }

        fn item(self: @ContractState, category: u8, id: u8) -> AvatarItem {
            item_of(self.items.read((category, id)))
        }

        fn items(self: @ContractState, category: u8) -> Array<AvatarItem> {
            let widths = layout_widths(self.layout.read());
            assert(category.into() < widths.len(), errors::INVALID_ITEM);
            let count: u32 = 2_u32.pow((*widths.at(category.into())).into());
            let mut items: Array<AvatarItem> = array![];
            for id in 0..count {
                items.append(item_of(self.items.read((category, id.try_into().unwrap()))));
            }
            items
        }

        fn layout(self: @ContractState) -> Array<u8> {
            layout_widths(self.layout.read())
        }

        fn price_bounds(self: @ContractState) -> (u16, u16) {
            (self.price_min.read(), self.price_max.read())
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

        /// A category of the layout and an id its width holds.
        fn assert_item(self: @ContractState, category: u8, id: u8) {
            let widths = layout_widths(self.layout.read());
            assert(category.into() < widths.len(), errors::INVALID_ITEM);
            let width = *widths.at(category.into());
            assert(id.into() < 2_u32.pow(width.into()), errors::INVALID_ITEM);
        }
    }
}
