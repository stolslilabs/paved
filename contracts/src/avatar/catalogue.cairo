//! The avatar's catalogue (#627): the items the owner lists, priced in cobbles (0: free, the base
//! set) within the owner's price bounds, with optional limits in quantity (`supply`) and in time
//! (`until`, the seasonal items), and the items each player owns, one bit per item. A component
//! with that one scope: it never moves cobbles and never checks who calls. The embedding system
//! gates the owner's calls, checks the part against its parts, and has the cobbles of a purchase
//! paid before or after `buy` in the same transaction (`systems::avatar`, through `Setup`).

#[starknet::component]
pub mod CatalogueComponent {
    use core::num::traits::Pow;
    use paved::avatar::item::{AvatarItem, LISTED, WITHDRAWN, is_free_word, item_of, item_word};
    use starknet::get_block_timestamp;
    use starknet::storage::{
        Map, StorageMapReadAccess, StorageMapWriteAccess, StoragePointerReadAccess,
        StoragePointerWriteAccess,
    };

    pub mod errors {
        pub const INVALID_BOUNDS: felt252 = 'Avatar: invalid bounds';
        pub const INVALID_COBBLES: felt252 = 'Avatar: invalid cobbles';
        pub const NOT_LISTED: felt252 = 'Avatar: item not listed';
        pub const NOT_FOR_SALE: felt252 = 'Avatar: item not for sale';
        pub const OWNED: felt252 = 'Avatar: item owned';
        pub const SOLD_OUT: felt252 = 'Avatar: item sold out';
        pub const SALE_ENDED: felt252 = 'Avatar: sale ended';
    }

    #[storage]
    pub struct Storage {
        /// The bounds of a paid item's price; written by `set_price_bounds`.
        pub price_min: u16,
        pub price_max: u16,
        /// The catalogue, key `(part, id)` (`item::item_word`); written by `list`, `withdraw` and
        /// `buy` (`sold`).
        pub items: Map<(u8, u8), felt252>,
        /// One more than the highest id ever listed in a part, key `part` (the `items` view's
        /// length); written by `list`.
        pub item_ends: Map<u8, u16>,
        /// The items a player owns in a part, key `(player_id, part, half)`: bit `id % 128` of
        /// half `id / 128`; written by `buy`.
        pub owned: Map<(felt252, u8, u8), u128>,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        PriceBoundsSet: PriceBoundsSet,
        AvatarItemListed: AvatarItemListed,
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
        pub part: u8,
        #[key]
        pub id: u8,
        pub state: u8,
        pub cobbles: u16,
        pub supply: u32,
        pub until: u64,
    }

    #[generate_trait]
    pub impl InternalImpl<
        TContractState, +HasComponent<TContractState>,
    > of InternalTrait<TContractState> {
        /// Sets the bounds of a paid item's price (1 <= `min` <= `max`); items listed keep theirs.
        fn set_price_bounds(ref self: ComponentState<TContractState>, min: u16, max: u16) {
            assert(min != 0 && min <= max, errors::INVALID_BOUNDS);
            self.price_min.write(min);
            self.price_max.write(max);
            self.emit(PriceBoundsSet { min, max });
        }

        fn price_bounds(self: @ComponentState<TContractState>) -> (u16, u16) {
            (self.price_min.read(), self.price_max.read())
        }

        /// Lists (or relists) an item: `cobbles` 0 or within the bounds; the count sold kept.
        fn list(
            ref self: ComponentState<TContractState>,
            part: u8,
            id: u8,
            cobbles: u16,
            supply: u32,
            until: u64,
        ) {
            // [Check] Free, or a price within the bounds (none before the bounds are set)
            assert(
                cobbles == 0
                    || (cobbles >= self.price_min.read() && cobbles <= self.price_max.read()),
                errors::INVALID_COBBLES,
            );
            // [Effect] Listed, the count sold kept; the part's end moved past it
            let mut item = item_of(self.items.read((part, id)));
            item.state = LISTED;
            item.cobbles = cobbles;
            item.supply = supply;
            item.until = until;
            self.items.write((part, id), item_word(item));
            let end: u16 = id.into() + 1;
            if self.item_ends.read(part) < end {
                self.item_ends.write(part, end);
            }
            self.emit(AvatarItemListed { part, id, state: LISTED, cobbles, supply, until });
        }

        /// Withdraws a listed item: no new sale, and a free item stops being free.
        fn withdraw(ref self: ComponentState<TContractState>, part: u8, id: u8) {
            let mut item = item_of(self.items.read((part, id)));
            assert(item.state == LISTED, errors::NOT_LISTED);
            item.state = WITHDRAWN;
            self.items.write((part, id), item_word(item));
            self
                .emit(
                    AvatarItemListed {
                        part,
                        id,
                        state: WITHDRAWN,
                        cobbles: item.cobbles,
                        supply: item.supply,
                        until: item.until,
                    },
                );
        }

        /// Records the purchase of a paid item by `player_id`, once: listed and paid, within its
        /// limits, not owned. Returns the item after it (`cobbles` the price to be paid, `sold`
        /// counted). The caller has the price paid in the same transaction.
        fn buy(
            ref self: ComponentState<TContractState>, player_id: felt252, part: u8, id: u8,
        ) -> AvatarItem {
            // [Check] Listed and paid (an id never listed is `UNLISTED`), within its limits
            let mut item = item_of(self.items.read((part, id)));
            assert(item.state == LISTED && item.cobbles != 0, errors::NOT_FOR_SALE);
            assert(item.supply == 0 || item.sold < item.supply, errors::SOLD_OUT);
            assert(item.until == 0 || get_block_timestamp() < item.until, errors::SALE_ENDED);
            // [Check] Not owned
            let (half, flag) = half_and_flag(id);
            let owned = self.owned.read((player_id, part, half));
            assert(owned & flag == 0, errors::OWNED);
            // [Effect] Owned, one more sold
            self.owned.write((player_id, part, half), owned | flag);
            item.sold += 1;
            self.items.write((part, id), item_word(item));
            item
        }

        /// True when `player_id` may use the item: listed and free, or owned.
        fn may_use(
            self: @ComponentState<TContractState>, player_id: felt252, part: u8, id: u8,
        ) -> bool {
            if is_free_word(self.items.read((part, id))) {
                return true;
            }
            let (half, flag) = half_and_flag(id);
            self.owned.read((player_id, part, half)) & flag != 0
        }

        fn item(self: @ComponentState<TContractState>, part: u8, id: u8) -> AvatarItem {
            item_of(self.items.read((part, id)))
        }

        /// The items of a part, id 0 up to the highest ever listed.
        fn items(self: @ComponentState<TContractState>, part: u8) -> Array<AvatarItem> {
            let end: u16 = self.item_ends.read(part);
            let mut items: Array<AvatarItem> = array![];
            for id in 0..end {
                items.append(item_of(self.items.read((part, id.try_into().unwrap()))));
            }
            items
        }

        /// The items of a part a player owns: bit `id`.
        fn owned(self: @ComponentState<TContractState>, player_id: felt252, part: u8) -> u256 {
            u256 {
                low: self.owned.read((player_id, part, 0)),
                high: self.owned.read((player_id, part, 1)),
            }
        }
    }

    /// The half of the ownership an id is in, and its bit there.
    fn half_and_flag(id: u8) -> (u8, u128) {
        (id / 128, 2_u128.pow((id % 128).into()))
    }
}
