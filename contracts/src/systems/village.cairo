//! `Village`, a player's permanent village (#640, part of #637;
//! `docs/architecture/village-territory.md`).
//!
//! A village is a game of this contract's own storage that never ends: founding it writes the usual
//! starter at the centre and gives the 3 x 3 of cells around it. The territory grows one parcel at
//! a time (`buy_parcel`): a cell next to an owned one, up to the owner's cap (`max_cells`), gated
//! by the player's level (`Setup.player_level`, #641) and paid in cobbles on `Setup`'s ledger
//! (`ISetupSpend::spend_cobbles`, `Village` an allowlisted spender). Tiles are placed on owned
//! cells only, by the placers the owner allows (forced placement: the tile comes from a reward,
//! #642), with the engine `Story` and `Challenge` play: the same matching against placed
//! neighbours, structure state and assessment, so a structure scores when it closes. A side facing
//! a cell not owned is an empty position for the engine: the structure stays open (no border rule).
//!
//! A player demolishes a placed tile for cobbles (`demolish`, the owner's decision of 2026-10-21):
//! `DEMOLITION_COBBLES` for the first of a chain day, doubled after each one, back to the base
//! the next day; the tile is not refunded. The structure state cannot take a tile out, so the
//! village is rebuilt: the tiles left are replayed in their placement order in a new game, and
//! its score is that game's.

/// The highest cap the owner may set on a territory, the 9 of the start included
/// (`set_max_cells`). Not a game rule (the owner's decision 1 of 2026-10-21: no village size tied
/// to the 38 tiles of a game): the technical bound of a village, so that a demolition's rebuild
/// (one move per tile left) stays well inside a transaction, and the tile ids within the 8 bits of
/// `tile_positions`.
pub const MAX_CELLS_LIMIT: u8 = 100;
/// The cells of the start: the 3 x 3 around the starter.
pub const START_CELLS: u8 = 9;
/// The most parcels a village can ever buy: `MAX_CELLS_LIMIT - START_CELLS`.
pub const MAX_PARCELS: u8 = 91;
/// The cobbles of parcel `k` are `PARCEL_COBBLES x k` (open point 7.2 of the design, proposal (a)).
pub const PARCEL_COBBLES: u32 = 10;
/// The cobbles of a chain day's first demolition; each one doubles the next (5, 10, 20, 40...).
pub const DEMOLITION_COBBLES: u32 = 5;
/// The exponent stops here: `5 x 2^29` is the last price under `u32`, what `spend_cobbles` takes
/// (and far above any balance a player earns).
pub const MAX_DOUBLINGS: u32 = 29;
/// The reasons of `Village`'s `CobblesSpent` on `Setup`.
pub const PARCEL_REASON: felt252 = 'VILLAGE_PARCEL';
pub const DEMOLITION_REASON: felt252 = 'VILLAGE_DEMOLISH';
/// The demolition day: the quests' clock, `time / DAY` (`Setup`'s calendar).
pub const DAY: u64 = 86400;

/// A cell of a territory, in the game's coordinates (the starter is at `CENTER`, `CENTER`).
#[derive(Copy, Drop, Serde, Debug, PartialEq)]
pub struct VillageCell {
    pub x: u32,
    pub y: u32,
}

/// A tile of a village: its id (1 the starter, then 2 on in placement order), plan code (1 to
/// 19), orientation code (1 North to 4 West) and position.
#[derive(Copy, Drop, Serde, Debug, PartialEq)]
pub struct VillageTile {
    pub id: u32,
    pub plan: u8,
    pub orientation: u8,
    pub x: u32,
    pub y: u32,
}

/// A village as the views give it: its game (0: no village), its cells (the 9 included), its
/// placed tiles (the starter excluded), its score, and the next parcel's number, price and level
/// (all 0 once the territory is full).
#[derive(Copy, Drop, Serde, Debug, PartialEq)]
pub struct VillageInfo {
    pub game_id: u32,
    pub cells: u8,
    pub tiles: u8,
    pub score: u32,
    pub next_parcel: u8,
    pub next_price: u32,
    pub next_level: u32,
}

/// A player's next demolition: the chain day, the demolitions it already made that day and the
/// price of the next one.
#[derive(Copy, Drop, Serde, Debug, PartialEq)]
pub struct DemolitionOffer {
    pub day: u64,
    pub count: u32,
    pub price: u32,
}

#[starknet::interface]
pub trait IVillage<TContractState> {
    /// Founds the caller's village, once (`'Village: already founded'`): a game, the starter at
    /// the centre, the 3 x 3 around it owned. Emits `VillageFounded`; returns the game id.
    fn found(ref self: TContractState) -> u32;
    /// The caller buys the cell `(x, y)` for its village: not owned (`'Village: cell owned'`),
    /// next to an owned cell (`'Village: not adjacent'`), the territory under `max_cells`
    /// (`'Village: territory full'`), the caller's level at least the parcel's
    /// (`'Village: level too low'`); its price is debited on `Setup`'s ledger
    /// (`'Setup: not enough cobbles'`). Emits `ParcelBought`; returns the parcel's number.
    fn buy_parcel(ref self: TContractState, x: u32, y: u32) -> u8;
    /// The caller demolishes the tile at `(x, y)` of its village (`'Village: no tile'`), never the
    /// starter (`'Village: starter stays'`), for the price of its day's next demolition
    /// (`demolition_price`), debited on `Setup`'s ledger (`'Setup: not enough cobbles'`). The
    /// village is rebuilt from the tiles left, in their order, in a new game. Emits
    /// `TileDemolished`; returns the price paid.
    fn demolish(ref self: TContractState, x: u32, y: u32) -> u32;
    /// Places a tile of `plan` (1 to 19) turned to `orientation` (1 to 4) at `(x, y)` in the
    /// village of `player_id`: an allowed placer only (`'Village: not placer'`), on an owned cell
    /// (`'Village: cell not owned'`), free (`'Tile: already exists'`) and fitting its placed
    /// neighbours (`'Tile: no neighbors'`, `'Tile: cannot place'`). Built and assessed as a move
    /// of a game. Emits `TilePlaced`; returns the points it scored.
    fn place(
        ref self: TContractState, player_id: felt252, plan: u8, orientation: u8, x: u32, y: u32,
    ) -> u32;
    fn village(self: @TContractState, player_id: felt252) -> VillageInfo;
    /// The owned cells: the 9 of the start (rows from the south, west to east), then the parcels
    /// in purchase order. Empty with no village.
    fn cells(self: @TContractState, player_id: felt252) -> Array<VillageCell>;
    /// The tiles, by id: the starter, then the placed ones. Empty with no village.
    fn tiles(self: @TContractState, player_id: felt252) -> Array<VillageTile>;
    fn is_owned(self: @TContractState, player_id: felt252, x: u32, y: u32) -> bool;
    /// The price in cobbles of parcel `parcel` (1 to `MAX_PARCELS`; 0 otherwise).
    fn parcel_price(self: @TContractState, parcel: u8) -> u32;
    /// The level parcel `parcel` needs (1 to `MAX_PARCELS`; 0 otherwise).
    fn parcel_level(self: @TContractState, parcel: u8) -> u32;
    /// The player's next demolition at the block's time: the day, today's count, the price.
    fn next_demolition(self: @TContractState, player_id: felt252) -> DemolitionOffer;
}

/// The wiring of `Village`, set by the owner.
#[starknet::interface]
pub trait IVillageAdmin<TContractState> {
    /// Sets the `Setup` whose ledger is debited: the owner only, never zero. Emits `SetupSet`.
    fn set_setup(ref self: TContractState, setup: starknet::ContractAddress);
    /// Sets the most cells a territory may hold, the 9 of the start included: the owner only,
    /// `START_CELLS` to `MAX_CELLS_LIMIT` (`'Village: invalid max cells'`). A village already
    /// above a lowered cap keeps its cells and buys no more. Emits `MaxCellsSet`.
    fn set_max_cells(ref self: TContractState, max_cells: u8);
    fn max_cells(self: @TContractState) -> u8;
    /// Allows or forbids `placer` to place tiles: the owner only. Emits `PlacerSet`.
    fn set_placer(ref self: TContractState, placer: starknet::ContractAddress, allowed: bool);
    fn setup(self: @TContractState) -> starknet::ContractAddress;
    fn is_placer(self: @TContractState, placer: starknet::ContractAddress) -> bool;
}

/// The cobbles of parcel `parcel` (1 to `MAX_PARCELS`): `PARCEL_COBBLES x parcel`; 0 otherwise.
pub fn parcel_price(parcel: u8) -> u32 {
    if parcel == 0 || parcel > MAX_PARCELS {
        return 0;
    }
    PARCEL_COBBLES * parcel.into()
}

/// The level parcel `parcel` needs: its number (the owner's rule: the 5th parcel needs level 5);
/// 0 outside 1 to `MAX_PARCELS`.
pub fn parcel_level(parcel: u8) -> u32 {
    if parcel == 0 || parcel > MAX_PARCELS {
        return 0;
    }
    parcel.into()
}

/// The price of a day's demolition after `count` of them that day: `DEMOLITION_COBBLES x 2^count`,
/// the exponent capped at `MAX_DOUBLINGS`.
pub fn demolition_price(count: u32) -> u32 {
    let doublings = if count > MAX_DOUBLINGS {
        MAX_DOUBLINGS
    } else {
        count
    };
    let mut price = DEMOLITION_COBBLES;
    let mut i: u32 = 0;
    while i < doublings {
        price *= 2;
        i += 1;
    }
    price
}

/// Whether `(x, y)` is one of the cells of the start, the 3 x 3 around `CENTER`.
pub fn is_start_cell(x: u32, y: u32) -> bool {
    let center = paved::constants::CENTER;
    x >= center - 1 && x <= center + 1 && y >= center - 1 && y <= center + 1
}

#[starknet::contract]
pub mod Village {
    use core::num::traits::{Bounded, Zero};
    use openzeppelin_interfaces::upgrades::IUpgradeable;
    use openzeppelin_upgrades::UpgradeableComponent;
    use paved::components::ownable::OwnableComponent;
    use paved::constants::CENTER;
    use paved::events::Event as PavedEvent;
    use paved::models::game::{Game, GameImpl};
    use paved::models::tile::{TileImpl, TilePositionAssert, ZeroableTilePositionTrait};
    use paved::store::{Store, StoreImpl};
    use paved::structure::placement::{self, NeighborhoodTrait};
    use paved::structure::state::StructuresTrait;
    use paved::systems::setup::{
        ISetupLevelDispatcher, ISetupLevelDispatcherTrait, ISetupSpendDispatcher,
        ISetupSpendDispatcherTrait,
    };
    use paved::types::mode::Mode;
    use paved::types::orientation::Orientation;
    use paved::types::plan::Plan;
    use starknet::storage::{
        Map, StorageMapReadAccess, StorageMapWriteAccess, StoragePointerReadAccess,
        StoragePointerWriteAccess,
    };
    use starknet::{ClassHash, ContractAddress, get_block_timestamp, get_caller_address};
    use super::{
        DAY, DEMOLITION_REASON, DemolitionOffer, IVillage, IVillageAdmin, MAX_CELLS_LIMIT,
        PARCEL_REASON, START_CELLS, VillageCell, VillageInfo, VillageTile, demolition_price,
        is_start_cell, parcel_level, parcel_price,
    };

    pub mod errors {
        pub const ZERO_SETUP_ADDRESS: felt252 = 'Village: setup is zero';
        pub const ALREADY_FOUNDED: felt252 = 'Village: already founded';
        pub const NO_VILLAGE: felt252 = 'Village: no village';
        pub const CELL_OWNED: felt252 = 'Village: cell owned';
        pub const NOT_ADJACENT: felt252 = 'Village: not adjacent';
        pub const TERRITORY_FULL: felt252 = 'Village: territory full';
        pub const LEVEL_TOO_LOW: felt252 = 'Village: level too low';
        pub const NOT_PLACER: felt252 = 'Village: not placer';
        pub const CELL_NOT_OWNED: felt252 = 'Village: cell not owned';
        pub const INVALID_PLAN: felt252 = 'Village: invalid plan';
        pub const INVALID_ORIENTATION: felt252 = 'Village: invalid orientation';
        pub const INVALID_POSITION: felt252 = 'Village: invalid position';
        pub const NO_TILE: felt252 = 'Village: no tile';
        pub const STARTER_STAYS: felt252 = 'Village: starter stays';
        pub const INVALID_MAX_CELLS: felt252 = 'Village: invalid max cells';
    }

    // Packing

    const TWO_POW_32: u128 = 0x100000000;
    const TWO_POW_40: u128 = 0x10000000000;
    const MASK_8: u128 = 0xff;
    const MASK_32: u128 = 0xffffffff;

    /// A village's tiles: the starter and one per cell at most.
    const TILE_LIMIT: u16 = 100;

    component!(path: OwnableComponent, storage: ownable, event: OwnableEvent);
    #[abi(embed_v0)]
    impl OwnableImpl = OwnableComponent::OwnableImpl<ContractState>;
    impl OwnableInternalImpl = OwnableComponent::InternalImpl<ContractState>;
    component!(path: UpgradeableComponent, storage: upgradeable, event: UpgradeableEvent);
    impl UpgradeableInternalImpl = UpgradeableComponent::InternalImpl<ContractState>;

    // Storage. The villages' games live in `PavedStorage` (`paved::store`), under the node
    // `selector!("paved")`: no member here is named `paved`.

    #[storage]
    struct Storage {
        #[substorage(v0)]
        ownable: OwnableComponent::Storage,
        #[substorage(v0)]
        upgradeable: UpgradeableComponent::Storage,
        /// The `Setup` whose ledger is debited; written by the constructor and `set_setup`.
        setup: ContractAddress,
        /// The placers the owner allows (`set_placer`).
        placers: Map<ContractAddress, bool>,
        /// A player's village (key `player_id`): `game_id` [0, 32) · `cells` [32, 40) (the 9 of
        /// the start included) · `tiles` [40, 48) (placed, the starter excluded). 0: no village.
        villages: Map<felt252, felt252>,
        /// The cell of a parcel (key `(player_id, parcel)`, parcel 1 to 29): `x` [0, 32) · `y`
        /// [32, 64).
        parcels: Map<(felt252, u8), felt252>,
        /// The parcel's number of a bought cell (key `(player_id, x, y)`); 0: not bought. The 9
        /// cells of the start are never written (`is_start_cell`).
        owned: Map<(felt252, u32, u32), u8>,
        /// A player's demolitions of a chain day (key `player_id`): `day` [0, 64) · `count`
        /// [64, 96), the demolitions made that day. A word of another day reads as 0 today.
        demolitions: Map<felt252, felt252>,
        /// The most cells a territory may hold, the 9 of the start included (the owner's,
        /// `set_max_cells`; `START_CELLS` to `MAX_CELLS_LIMIT`).
        max_cells: u8,
    }

    // Events

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        #[flat]
        PavedEvent: PavedEvent,
        #[flat]
        OwnableEvent: OwnableComponent::Event,
        #[flat]
        UpgradeableEvent: UpgradeableComponent::Event,
        SetupSet: SetupSet,
        PlacerSet: PlacerSet,
        MaxCellsSet: MaxCellsSet,
        VillageFounded: VillageFounded,
        ParcelBought: ParcelBought,
        TilePlaced: TilePlaced,
        TileDemolished: TileDemolished,
    }

    #[derive(Drop, Debug, PartialEq, starknet::Event)]
    pub struct SetupSet {
        pub setup: ContractAddress,
    }

    #[derive(Drop, Debug, PartialEq, starknet::Event)]
    pub struct PlacerSet {
        #[key]
        pub placer: ContractAddress,
        pub allowed: bool,
    }

    #[derive(Drop, Debug, PartialEq, starknet::Event)]
    pub struct MaxCellsSet {
        pub max_cells: u8,
    }

    /// A village founded: its game in this contract (the starter is its tile 1).
    #[derive(Drop, Debug, PartialEq, starknet::Event)]
    pub struct VillageFounded {
        #[key]
        pub player_id: felt252,
        pub game_id: u32,
    }

    /// A parcel bought: its number and cell, the territory's cells after it, its price (`Setup`'s
    /// `CobblesSpent` carries the balance) and the level the gate read (`Setup.player_level`).
    #[derive(Drop, Debug, PartialEq, starknet::Event)]
    pub struct ParcelBought {
        #[key]
        pub player_id: felt252,
        pub parcel: u8,
        pub x: u32,
        pub y: u32,
        pub cells: u8,
        pub cobbles: u32,
        pub level: u32,
    }

    /// A tile placed: the points it scored (the engine's `Scored` events of the move) and the
    /// village's score after it.
    #[derive(Drop, Debug, PartialEq, starknet::Event)]
    pub struct TilePlaced {
        #[key]
        pub player_id: felt252,
        pub game_id: u32,
        pub tile_id: u32,
        pub plan: u8,
        pub orientation: u8,
        pub x: u32,
        pub y: u32,
        pub points: u32,
        pub score: u32,
    }

    /// A tile demolished: its id and plan in the game it left, its cell, the price paid and the
    /// day's demolitions after it (`count`); the village's new game and its score once rebuilt
    /// (the rebuild emits the `Scored` of its structures again, under the new game).
    #[derive(Drop, Debug, PartialEq, starknet::Event)]
    pub struct TileDemolished {
        #[key]
        pub player_id: felt252,
        pub tile_id: u32,
        pub plan: u8,
        pub x: u32,
        pub y: u32,
        pub day: u64,
        pub count: u32,
        pub cobbles: u32,
        pub game_id: u32,
        pub score: u32,
    }

    /// A village's slot, unpacked.
    #[derive(Copy, Drop)]
    struct Header {
        game_id: u32,
        cells: u8,
        tiles: u8,
    }

    #[constructor]
    fn constructor(
        ref self: ContractState,
        owner: ContractAddress,
        setup_address: ContractAddress,
        max_cells: u8,
    ) {
        assert(setup_address.is_non_zero(), errors::ZERO_SETUP_ADDRESS);
        assert_max_cells(max_cells);
        self.ownable.initialize(owner);
        self.setup.write(setup_address);
        self.max_cells.write(max_cells);
    }

    #[abi(embed_v0)]
    impl VillageImpl of IVillage<ContractState> {
        fn found(ref self: ContractState) -> u32 {
            let player_id: felt252 = get_caller_address().into();
            // [Check] One village per player
            assert(self.header_of(player_id).game_id == 0, errors::ALREADY_FOUNDED);
            // [Effect] The game and its starter, tile 1, at the centre
            let store: Store = StoreImpl::new();
            let game = new_game(store, player_id);
            store.set_game_state(game);
            let game_id = game.id;
            self.write_header(player_id, Header { game_id, cells: START_CELLS, tiles: 0 });
            self.emit(VillageFounded { player_id, game_id });
            game_id
        }

        fn buy_parcel(ref self: ContractState, x: u32, y: u32) -> u8 {
            let player_id: felt252 = get_caller_address().into();
            // [Check] A village, a cell not owned next to an owned one, room for it
            let header = self.header_of(player_id);
            assert(header.game_id != 0, errors::NO_VILLAGE);
            assert_position(x, y);
            assert(!self.owns(player_id, x, y), errors::CELL_OWNED);
            assert(
                self.owns(player_id, x + 1, y)
                    || self.owns(player_id, x - 1, y)
                    || self.owns(player_id, x, y + 1)
                    || self.owns(player_id, x, y - 1),
                errors::NOT_ADJACENT,
            );
            assert(header.cells < self.max_cells.read(), errors::TERRITORY_FULL);
            // [Check] The level gate (#641)
            let parcel = header.cells - START_CELLS + 1;
            let setup = self.setup_address();
            let level: u32 = ISetupLevelDispatcher { contract_address: setup }
                .player_level(player_id)
                .level
                .into();
            assert(level >= parcel_level(parcel), errors::LEVEL_TOO_LOW);
            // [Effect] The cell
            let cobbles = parcel_price(parcel);
            let word: u64 = x.into() + y.into() * 0x100000000;
            self.parcels.write((player_id, parcel), word.into());
            self.owned.write((player_id, x, y), parcel);
            let cells = header.cells + 1;
            self.write_header(player_id, Header { cells, ..header });
            // [Interaction] The price, from `Setup`'s ledger (reverts when the balance is short)
            ISetupSpendDispatcher { contract_address: setup }
                .spend_cobbles(player_id, cobbles, PARCEL_REASON);
            self.emit(ParcelBought { player_id, parcel, x, y, cells, cobbles, level });
            parcel
        }

        fn demolish(ref self: ContractState, x: u32, y: u32) -> u32 {
            let player_id: felt252 = get_caller_address().into();
            // [Check] A village, a placed tile at the cell, not the starter
            let header = self.header_of(player_id);
            assert(header.game_id != 0, errors::NO_VILLAGE);
            assert_position(x, y);
            let mut store: Store = StoreImpl::new();
            let old = store.live_game(header.game_id);
            let position = store.tile_position(old, x, y);
            assert(position.is_non_zero(), errors::NO_TILE);
            assert(position.tile_id != 1, errors::STARTER_STAYS);
            // [Effect] The day's count, the price of this demolition
            let offer = self.offer_of(player_id);
            let count = offer.count + 1;
            let word: u128 = offer.day.into() + count.into() * 0x10000000000000000;
            self.demolitions.write(player_id, word.into());
            // [Effect] The village rebuilt without the tile: a new game, the starter, then every
            // other placed tile in its order, assessed as a move (the edges matched when it was
            // placed; a tile whose only neighbour left is built all the same)
            let mut game = new_game(store, player_id);
            let mut id: u32 = 2;
            let mut plan: u8 = 0;
            while id <= old.tile_count {
                let tile = store.tile(old, id);
                if id == position.tile_id {
                    plan = tile.plan;
                } else {
                    build_tile(
                        ref game,
                        ref store,
                        tile.plan.into(),
                        tile.orientation,
                        tile.x,
                        tile.y,
                        false,
                    );
                }
                id += 1;
            }
            store.set_game_state(game);
            self
                .write_header(
                    player_id, Header { game_id: game.id, tiles: header.tiles - 1, ..header },
                );
            // [Interaction] The price, from `Setup`'s ledger (reverts when the balance is short)
            ISetupSpendDispatcher { contract_address: self.setup_address() }
                .spend_cobbles(player_id, offer.price, DEMOLITION_REASON);
            self
                .emit(
                    TileDemolished {
                        player_id,
                        tile_id: position.tile_id,
                        plan,
                        x,
                        y,
                        day: offer.day,
                        count,
                        cobbles: offer.price,
                        game_id: game.id,
                        score: game.score,
                    },
                );
            offer.price
        }

        fn place(
            ref self: ContractState, player_id: felt252, plan: u8, orientation: u8, x: u32, y: u32,
        ) -> u32 {
            // [Check] An allowed placer, a village, a plan and an orientation
            assert(self.placers.read(get_caller_address()), errors::NOT_PLACER);
            let header = self.header_of(player_id);
            assert(header.game_id != 0, errors::NO_VILLAGE);
            let code: Plan = plan.into();
            let back: u8 = code.into();
            assert(plan != 0 && back == plan, errors::INVALID_PLAN);
            assert(orientation >= 1 && orientation <= 4, errors::INVALID_ORIENTATION);
            // [Check] An owned cell (the territory's rule), free
            assert_position(x, y);
            assert(self.owns(player_id, x, y), errors::CELL_NOT_OWNED);
            let mut store: Store = StoreImpl::new();
            let game_id = header.game_id;
            let mut game = store.live_game(game_id);
            store.tile_position(game, x, y).assert_not_exists();
            // [Effect] Built, if it fits its neighbours, and assessed as a move of a game
            let before = game.score;
            let id = build_tile(ref game, ref store, code, orientation, x, y, true);
            store.set_game_state(game);
            self.write_header(player_id, Header { tiles: header.tiles + 1, ..header });
            let points = game.score - before;
            self
                .emit(
                    TilePlaced {
                        player_id,
                        game_id,
                        tile_id: id,
                        plan,
                        orientation,
                        x,
                        y,
                        points,
                        score: game.score,
                    },
                );
            points
        }

        fn village(self: @ContractState, player_id: felt252) -> VillageInfo {
            let header = self.header_of(player_id);
            let score = if header.game_id == 0 {
                0
            } else {
                StoreImpl::new().live_game(header.game_id).score
            };
            let (next_parcel, next_price, next_level) = if header.game_id == 0 {
                (1, parcel_price(1), parcel_level(1))
            } else if header.cells >= self.max_cells.read() {
                (0, 0, 0)
            } else {
                let parcel = header.cells - START_CELLS + 1;
                (parcel, parcel_price(parcel), parcel_level(parcel))
            };
            VillageInfo {
                game_id: header.game_id,
                cells: header.cells,
                tiles: header.tiles,
                score,
                next_parcel,
                next_price,
                next_level,
            }
        }

        fn cells(self: @ContractState, player_id: felt252) -> Array<VillageCell> {
            let header = self.header_of(player_id);
            let mut cells: Array<VillageCell> = array![];
            if header.game_id == 0 {
                return cells;
            }
            let mut y = CENTER - 1;
            while y <= CENTER + 1 {
                let mut x = CENTER - 1;
                while x <= CENTER + 1 {
                    cells.append(VillageCell { x, y });
                    x += 1;
                }
                y += 1;
            }
            let mut parcel: u8 = 1;
            while parcel <= header.cells - START_CELLS {
                let word: u256 = self.parcels.read((player_id, parcel)).into();
                cells
                    .append(
                        VillageCell {
                            x: (word.low & MASK_32).try_into().unwrap(),
                            y: ((word.low / TWO_POW_32) & MASK_32).try_into().unwrap(),
                        },
                    );
                parcel += 1;
            }
            cells
        }

        fn tiles(self: @ContractState, player_id: felt252) -> Array<VillageTile> {
            let header = self.header_of(player_id);
            let mut tiles: Array<VillageTile> = array![];
            if header.game_id == 0 {
                return tiles;
            }
            let store: Store = StoreImpl::new();
            let game = store.live_game(header.game_id);
            let mut id: u32 = 1;
            while id <= game.tile_count {
                let tile = store.tile(game, id);
                tiles
                    .append(
                        VillageTile {
                            id,
                            plan: tile.plan,
                            orientation: tile.orientation,
                            x: tile.x,
                            y: tile.y,
                        },
                    );
                id += 1;
            }
            tiles
        }

        fn is_owned(self: @ContractState, player_id: felt252, x: u32, y: u32) -> bool {
            self.header_of(player_id).game_id != 0 && self.owns(player_id, x, y)
        }

        fn parcel_price(self: @ContractState, parcel: u8) -> u32 {
            parcel_price(parcel)
        }

        fn parcel_level(self: @ContractState, parcel: u8) -> u32 {
            parcel_level(parcel)
        }

        fn next_demolition(self: @ContractState, player_id: felt252) -> DemolitionOffer {
            self.offer_of(player_id)
        }
    }

    #[abi(embed_v0)]
    impl VillageAdminImpl of IVillageAdmin<ContractState> {
        fn set_setup(ref self: ContractState, setup: ContractAddress) {
            self.ownable.assert_only_owner();
            assert(setup.is_non_zero(), errors::ZERO_SETUP_ADDRESS);
            self.setup.write(setup);
            self.emit(SetupSet { setup });
        }

        fn set_max_cells(ref self: ContractState, max_cells: u8) {
            self.ownable.assert_only_owner();
            assert_max_cells(max_cells);
            self.max_cells.write(max_cells);
            self.emit(MaxCellsSet { max_cells });
        }

        fn max_cells(self: @ContractState) -> u8 {
            self.max_cells.read()
        }

        fn set_placer(ref self: ContractState, placer: ContractAddress, allowed: bool) {
            self.ownable.assert_only_owner();
            self.placers.write(placer, allowed);
            self.emit(PlacerSet { placer, allowed });
        }

        fn setup(self: @ContractState) -> ContractAddress {
            self.setup.read()
        }

        fn is_placer(self: @ContractState, placer: ContractAddress) -> bool {
            self.placers.read(placer)
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

        /// Whether the cell is in the player's territory (its village founded or not).
        fn owns(self: @ContractState, player_id: felt252, x: u32, y: u32) -> bool {
            is_start_cell(x, y) || self.owned.read((player_id, x, y)) != 0
        }

        /// The player's next demolition today: a counter of another day counts 0.
        fn offer_of(self: @ContractState, player_id: felt252) -> DemolitionOffer {
            let day = get_block_timestamp() / DAY;
            let word: u256 = self.demolitions.read(player_id).into();
            let stored: u64 = (word.low & 0xffffffffffffffff).try_into().unwrap();
            let count: u32 = if stored == day {
                ((word.low / 0x10000000000000000) & 0xffffffff).try_into().unwrap()
            } else {
                0
            };
            DemolitionOffer { day, count, price: demolition_price(count) }
        }

        fn header_of(self: @ContractState, player_id: felt252) -> Header {
            let word: u256 = self.villages.read(player_id).into();
            Header {
                game_id: (word.low & MASK_32).try_into().unwrap(),
                cells: ((word.low / TWO_POW_32) & MASK_8).try_into().unwrap(),
                tiles: ((word.low / TWO_POW_40) & MASK_8).try_into().unwrap(),
            }
        }

        fn write_header(ref self: ContractState, player_id: felt252, header: Header) {
            let word: u128 = header.game_id.into()
                + header.cells.into() * TWO_POW_32
                + header.tiles.into() * TWO_POW_40;
            self.villages.write(player_id, word.into());
        }
    }

    /// A new game for a village of `player_id`: its config written, its starter (tile 1) at the
    /// centre. The caller writes its state.
    fn new_game(store: Store, player_id: felt252) -> Game {
        let game_id = store.uuid();
        let mut game: Game = GameImpl::new(
            game_id, get_block_timestamp(), Mode::Challenge, player_id,
        );
        game.tile_limit = TILE_LIMIT;
        game.start_time = get_block_timestamp();
        let id = game.add_tile();
        let mut tile = TileImpl::new(game_id, id, Plan::RFFFRFCFR);
        tile.settle(Orientation::South, CENTER, CENTER);
        placement::place_starter(store, tile);
        store.set_game_config(game);
        game
    }

    /// Builds `plan` at `(x, y)` as a move of `game` (the next tile id): checked against its
    /// neighbours when `fits` (`placement::assert_fits`), placed on the structure state and
    /// assessed when it closes a structure. Returns the tile's id; the caller writes the state.
    fn build_tile(
        ref game: Game, ref store: Store, plan: Plan, orientation: u8, x: u32, y: u32, fits: bool,
    ) -> u32 {
        let game_id = game.id;
        let id = game.add_tile();
        let mut tile = TileImpl::new(game_id, id, plan);
        let around = NeighborhoodTrait::read(game_id, x, y);
        tile.settle(orientation.into(), x, y);
        if fits {
            placement::assert_fits(tile, @around);
        }
        let mut structures = StructuresTrait::new(game_id);
        let (refs, closes) = placement::place_move(ref structures, tile, @around);
        structures.track(tile, refs);
        if closes {
            game.assess(tile, refs, @around, ref structures, ref store);
        }
        structures.flush(store);
        game.built += 1;
        id
    }

    /// A territory's cap: the 9 of the start to `MAX_CELLS_LIMIT`.
    fn assert_max_cells(max_cells: u8) {
        assert(max_cells >= START_CELLS && max_cells <= MAX_CELLS_LIMIT, errors::INVALID_MAX_CELLS);
    }

    /// As `Challenge.build`: the position has its 8 neighbours in `u32`.
    fn assert_position(x: u32, y: u32) {
        assert(
            x != 0 && y != 0 && x != Bounded::<u32>::MAX && y != Bounded::<u32>::MAX,
            errors::INVALID_POSITION,
        );
    }
}
