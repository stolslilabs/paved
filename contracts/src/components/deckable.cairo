//! Deckable component: the deck of an attack (#643, `docs/architecture/pvp-attacks.md`, section 2):
//! the plans copied from the defender at the attack's start, the bitmap of the tiles already drawn
//! and the tile in hand. A draw takes a random (the system's VRF draw) and picks the next tile
//! among the ones not yet drawn (`random_deck::draw_from_bitmap`); the structure engine is not
//! involved. This component knows nothing of moves, territories or crowns: the system composes it.
//!
//! An attack is keyed by its attacker and its number (`id`), so a deck is never overwritten by the
//! attacker's next attack.
//!
//! Storage, flat: `deck_plans`, `deck_states` (new names only, `docs/architecture/upgrades.md`,
//! "Storage layout discipline").

use starknet::ContractAddress;

/// The most tiles a deck holds: every placed tile of the largest territory (`Village`'s
/// `MAX_CELLS_LIMIT` of 100 cells, the starter's excluded), within the 128 cards of
/// `draw_from_bitmap`.
pub const MAX_DECK: u32 = 99;
/// The plans of a deck held by one storage page, a byte each.
pub const PAGE_PLANS: u32 = 31;

/// A deck: its size, the tiles drawn so far, the plan in hand (0: none) and the bitmap of the
/// tiles drawn (bit `i` for the deck's tile `i`).
#[derive(Copy, Drop, Serde, Debug, PartialEq)]
pub struct Deck {
    pub size: u8,
    pub drawn: u8,
    pub hand: u8,
    pub bitmap: u128,
}

#[starknet::interface]
pub trait IDeckable<TContractState> {
    /// The deck of attack `id` of `attacker` (zero: none).
    fn deck(self: @TContractState, attacker: ContractAddress, id: u32) -> Deck;
}

#[starknet::component]
pub mod DeckableComponent {
    use paved::helpers::random_deck::{bit_at, draw_from_bitmap};
    use starknet::ContractAddress;
    use starknet::storage::{Map, StorageMapReadAccess, StorageMapWriteAccess};
    use super::{Deck, IDeckable, MAX_DECK, PAGE_PLANS};

    pub mod errors {
        pub const INVALID_DECK: felt252 = 'Deck: invalid size';
        pub const ALREADY_LOADED: felt252 = 'Deck: already loaded';
        pub const EMPTY: felt252 = 'Deck: no tile left';
        pub const HAND_FULL: felt252 = 'Deck: tile in hand';
        pub const HAND_EMPTY: felt252 = 'Deck: no tile in hand';
    }

    const TWO_POW_8: u128 = 0x100;
    const TWO_POW_16: u128 = 0x10000;
    const MASK_8: u128 = 0xff;

    #[storage]
    pub struct Storage {
        /// A deck's plans, `PAGE_PLANS` per page, a byte each, the first in the lowest byte (key
        /// `(attacker, id, page)`).
        pub deck_plans: Map<(ContractAddress, u32, u8), felt252>,
        /// A deck's state (key `(attacker, id)`): `size` [0, 8) · `drawn` [8, 16) · `hand`
        /// [16, 24) in the low half; the bitmap of the tiles drawn in the high half (at most 99
        /// bits, so the word stays a felt).
        pub deck_states: Map<(ContractAddress, u32), felt252>,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        TileDrawn: TileDrawn,
    }

    /// The deck's draw `draw` (from 0) of attack `id`: the plan now in hand.
    #[derive(Drop, Debug, PartialEq, starknet::Event)]
    pub struct TileDrawn {
        #[key]
        pub attacker: ContractAddress,
        pub id: u32,
        pub draw: u8,
        pub plan: u8,
    }

    #[embeddable_as(DeckableImpl)]
    pub impl Deckable<
        TContractState, +HasComponent<TContractState>,
    > of IDeckable<ComponentState<TContractState>> {
        fn deck(self: @ComponentState<TContractState>, attacker: ContractAddress, id: u32) -> Deck {
            self.deck_of(attacker, id)
        }
    }

    #[generate_trait]
    pub impl InternalImpl<
        TContractState, +HasComponent<TContractState>,
    > of InternalTrait<TContractState> {
        fn deck_of(
            self: @ComponentState<TContractState>, attacker: ContractAddress, id: u32,
        ) -> Deck {
            let word: u256 = self.deck_states.read((attacker, id)).into();
            Deck {
                size: (word.low & MASK_8).try_into().unwrap(),
                drawn: ((word.low / TWO_POW_8) & MASK_8).try_into().unwrap(),
                hand: ((word.low / TWO_POW_16) & MASK_8).try_into().unwrap(),
                bitmap: word.high,
            }
        }

        /// Copies `plans` (1 to `MAX_DECK`) as the deck of attack `id`, nothing drawn.
        fn load(
            ref self: ComponentState<TContractState>,
            attacker: ContractAddress,
            id: u32,
            plans: Span<u8>,
        ) {
            assert(plans.len() != 0 && plans.len() <= MAX_DECK, errors::INVALID_DECK);
            assert(self.deck_of(attacker, id).size == 0, errors::ALREADY_LOADED);
            let mut page: u8 = 0;
            let mut word: u256 = 0;
            let mut unit: u256 = 1;
            let mut index: u32 = 0;
            for plan in plans {
                word += (*plan).into() * unit;
                unit *= 0x100;
                index += 1;
                if index % PAGE_PLANS == 0 || index == plans.len() {
                    self.deck_plans.write((attacker, id, page), word.try_into().unwrap());
                    page += 1;
                    word = 0;
                    unit = 1;
                }
            }
            let size: u8 = plans.len().try_into().unwrap();
            self.write(attacker, id, Deck { size, drawn: 0, hand: 0, bitmap: 0 });
        }

        /// Draws the next tile of attack `id` with `random` among the tiles not yet drawn, into
        /// the hand (empty: `'Deck: tile in hand'`). Emits `TileDrawn`; returns its plan.
        fn draw(
            ref self: ComponentState<TContractState>,
            attacker: ContractAddress,
            id: u32,
            random: felt252,
        ) -> u8 {
            let mut deck = self.deck_of(attacker, id);
            assert(deck.drawn < deck.size, errors::EMPTY);
            assert(deck.hand == 0, errors::HAND_FULL);
            // [Info] `draw_from_bitmap`'s cards are 1 to `size`: card `c` is the deck's tile `c -
            // 1`
            let (card, _) = draw_from_bitmap(random, deck.size.into(), deck.bitmap);
            let index = card - 1;
            let plan = self.plan_at(attacker, id, index);
            let draw = deck.drawn;
            deck.bitmap = deck.bitmap | bit_at(index);
            deck.drawn += 1;
            deck.hand = plan;
            self.write(attacker, id, deck);
            self.emit(TileDrawn { attacker, id, draw, plan });
            plan
        }

        /// Takes the plan in hand of attack `id` out of it (to be played). Returns it.
        fn take(
            ref self: ComponentState<TContractState>, attacker: ContractAddress, id: u32,
        ) -> u8 {
            let mut deck = self.deck_of(attacker, id);
            assert(deck.hand != 0, errors::HAND_EMPTY);
            let plan = deck.hand;
            deck.hand = 0;
            self.write(attacker, id, deck);
            plan
        }

        /// The tiles of attack `id` not yet drawn.
        fn left(self: @ComponentState<TContractState>, attacker: ContractAddress, id: u32) -> u8 {
            let deck = self.deck_of(attacker, id);
            deck.size - deck.drawn
        }

        /// The plan of the deck's tile `index`.
        fn plan_at(
            self: @ComponentState<TContractState>, attacker: ContractAddress, id: u32, index: u8,
        ) -> u8 {
            let page: u8 = (index.into() / PAGE_PLANS).try_into().unwrap();
            let mut word: u256 = self.deck_plans.read((attacker, id, page)).into();
            let mut offset: u32 = index.into() % PAGE_PLANS;
            while offset != 0 {
                word /= 0x100;
                offset -= 1;
            }
            (word.low & MASK_8).try_into().unwrap()
        }

        fn write(
            ref self: ComponentState<TContractState>,
            attacker: ContractAddress,
            id: u32,
            deck: Deck,
        ) {
            let low: u128 = deck.size.into()
                + deck.drawn.into() * TWO_POW_8
                + deck.hand.into() * TWO_POW_16;
            let word = u256 { low, high: deck.bitmap };
            self.deck_states.write((attacker, id), word.try_into().unwrap());
        }
    }
}
