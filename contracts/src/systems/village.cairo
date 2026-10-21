//! `Village`, a player's permanent village (#640, part of #637;
//! `docs/architecture/village-territory.md`).
//!
//! A village is a game of this contract's own storage that never ends: founding it writes the usual
//! starter at the centre and gives the 3 x 3 of cells around it. The territory grows one parcel at
//! a time (`buy_parcel`): a cell next to an owned one, at most `MAX_CELLS` cells, gated by the
//! player's level (`IPlayerLevel`, #641) and paid in cobbles on `Setup`'s ledger
//! (`ISetupVillage::spend_parcel`). Tiles are placed on owned cells only, by the placers the owner
//! allows (forced placement: the tile comes from a reward, #642), with the engine `Story` and
//! `Challenge` play: the same matching against placed neighbours, structure state and
//! assessment, so a structure scores when it closes. A side facing a cell not owned is an empty
//! position for the engine: the structure stays open (no border rule).

/// The most cells a village owns, the 9 of the start included: the length of a game (#637).
pub const MAX_CELLS: u8 = 38;
/// The cells of the start: the 3 x 3 around the starter.
pub const START_CELLS: u8 = 9;
/// The most parcels a village buys: `MAX_CELLS - START_CELLS`.
pub const MAX_PARCELS: u8 = 29;
/// The cobbles of parcel `k` are `PARCEL_COBBLES x k` (open point 7.2 of the design, proposal (a)).
pub const PARCEL_COBBLES: u32 = 10;

/// A cell of a territory, in the game's coordinates (the starter is at `CENTER`, `CENTER`).
#[derive(Copy, Drop, Serde, Debug, PartialEq)]
pub struct VillageCell {
    pub x: u32,
    pub y: u32,
}

/// A tile of a village: its id (1 the starter, then 2 to 38 in placement order), plan code (1 to
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

/// The player's level (#641), as `Village` reads it for the parcels' gate.
#[starknet::interface]
pub trait IPlayerLevel<TContractState> {
    fn level(self: @TContractState, player_id: felt252) -> u32;
}

#[starknet::interface]
pub trait IVillage<TContractState> {
    /// Founds the caller's village, once (`'Village: already founded'`): a game, the starter at
    /// the centre, the 3 x 3 around it owned. Emits `VillageFounded`; returns the game id.
    fn found(ref self: TContractState) -> u32;
    /// The caller buys the cell `(x, y)` for its village: not owned (`'Village: cell owned'`),
    /// next to an owned cell (`'Village: not adjacent'`), the territory under `MAX_CELLS`
    /// (`'Village: territory full'`), the caller's level at least the parcel's
    /// (`'Village: level too low'`); its price is debited on `Setup`'s ledger
    /// (`'Setup: not enough cobbles'`). Emits `ParcelBought`; returns the parcel's number.
    fn buy_parcel(ref self: TContractState, x: u32, y: u32) -> u8;
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
}

/// The wiring of `Village`, set by the owner.
#[starknet::interface]
pub trait IVillageAdmin<TContractState> {
    /// Sets the `Setup` whose ledger is debited: the owner only, never zero. Emits `SetupSet`.
    fn set_setup(ref self: TContractState, setup: starknet::ContractAddress);
    /// Sets the contract whose `level` gates the parcels (#641): the owner only; zero makes every
    /// player level 1. Emits `LevelsSet`.
    fn set_levels(ref self: TContractState, levels: starknet::ContractAddress);
    /// Allows or forbids `placer` to place tiles: the owner only. Emits `PlacerSet`.
    fn set_placer(ref self: TContractState, placer: starknet::ContractAddress, allowed: bool);
    fn setup(self: @TContractState) -> starknet::ContractAddress;
    fn levels(self: @TContractState) -> starknet::ContractAddress;
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
    use paved::models::tile::{TileImpl, TilePositionAssert};
    use paved::store::{Store, StoreImpl};
    use paved::structure::placement::{self, NeighborhoodTrait};
    use paved::structure::state::StructuresTrait;
    use paved::systems::setup::{ISetupVillageDispatcher, ISetupVillageDispatcherTrait};
    use paved::types::mode::Mode;
    use paved::types::orientation::Orientation;
    use paved::types::plan::Plan;
    use starknet::storage::{
        Map, StorageMapReadAccess, StorageMapWriteAccess, StoragePointerReadAccess,
        StoragePointerWriteAccess,
    };
    use starknet::{ClassHash, ContractAddress, get_block_timestamp, get_caller_address};
    use super::{
        IPlayerLevelDispatcher, IPlayerLevelDispatcherTrait, IVillage, IVillageAdmin, MAX_CELLS,
        START_CELLS, VillageCell, VillageInfo, VillageTile, is_start_cell, parcel_level,
        parcel_price,
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
    }

    // Packing

    const TWO_POW_32: u128 = 0x100000000;
    const TWO_POW_40: u128 = 0x10000000000;
    const MASK_8: u128 = 0xff;
    const MASK_32: u128 = 0xffffffff;

    /// A village's tiles: the starter and one per cell at most.
    const TILE_LIMIT: u16 = 38;

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
        /// The contract whose `level` gates the parcels (#641); zero: every player is level 1.
        levels: ContractAddress,
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
        LevelsSet: LevelsSet,
        PlacerSet: PlacerSet,
        VillageFounded: VillageFounded,
        ParcelBought: ParcelBought,
        TilePlaced: TilePlaced,
    }

    #[derive(Drop, Debug, PartialEq, starknet::Event)]
    pub struct SetupSet {
        pub setup: ContractAddress,
    }

    #[derive(Drop, Debug, PartialEq, starknet::Event)]
    pub struct LevelsSet {
        pub levels: ContractAddress,
    }

    #[derive(Drop, Debug, PartialEq, starknet::Event)]
    pub struct PlacerSet {
        #[key]
        pub placer: ContractAddress,
        pub allowed: bool,
    }

    /// A village founded: its game in this contract (the starter is its tile 1).
    #[derive(Drop, Debug, PartialEq, starknet::Event)]
    pub struct VillageFounded {
        #[key]
        pub player_id: felt252,
        pub game_id: u32,
    }

    /// A parcel bought: its number and cell, the territory's cells after it, its price (`Setup`'s
    /// `ParcelPaid` carries the balance) and the level the gate read.
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

    /// A village's slot, unpacked.
    #[derive(Copy, Drop)]
    struct Header {
        game_id: u32,
        cells: u8,
        tiles: u8,
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
    impl VillageImpl of IVillage<ContractState> {
        fn found(ref self: ContractState) -> u32 {
            let player_id: felt252 = get_caller_address().into();
            // [Check] One village per player
            assert(self.header_of(player_id).game_id == 0, errors::ALREADY_FOUNDED);
            // [Effect] The game and its starter, tile 1, at the centre
            let store: Store = StoreImpl::new();
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
            store.set_game_state(game);
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
            assert(header.cells < MAX_CELLS, errors::TERRITORY_FULL);
            // [Check] The level gate (#641)
            let parcel = header.cells - START_CELLS + 1;
            let level = self.level_of(player_id);
            assert(level >= parcel_level(parcel), errors::LEVEL_TOO_LOW);
            // [Effect] The cell
            let cobbles = parcel_price(parcel);
            let word: u64 = x.into() + y.into() * 0x100000000;
            self.parcels.write((player_id, parcel), word.into());
            self.owned.write((player_id, x, y), parcel);
            let cells = header.cells + 1;
            self.write_header(player_id, Header { cells, ..header });
            // [Interaction] The price, from `Setup`'s ledger (reverts when the balance is short)
            ISetupVillageDispatcher { contract_address: self.setup_address() }
                .spend_parcel(player_id, parcel, cobbles);
            self.emit(ParcelBought { player_id, parcel, x, y, cells, cobbles, level });
            parcel
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
            let id = game.add_tile();
            let mut tile = TileImpl::new(game_id, id, code);
            let around = NeighborhoodTrait::read(game_id, x, y);
            tile.settle(orientation.into(), x, y);
            placement::assert_fits(tile, @around);
            let mut structures = StructuresTrait::new(game_id);
            let (refs, closes) = placement::place_move(ref structures, tile, @around);
            structures.track(tile, refs);
            if closes {
                game.assess(tile, refs, @around, ref structures, ref store);
            }
            structures.flush(store);
            game.built += 1;
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
            } else if header.cells >= MAX_CELLS {
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
    }

    #[abi(embed_v0)]
    impl VillageAdminImpl of IVillageAdmin<ContractState> {
        fn set_setup(ref self: ContractState, setup: ContractAddress) {
            self.ownable.assert_only_owner();
            assert(setup.is_non_zero(), errors::ZERO_SETUP_ADDRESS);
            self.setup.write(setup);
            self.emit(SetupSet { setup });
        }

        fn set_levels(ref self: ContractState, levels: ContractAddress) {
            self.ownable.assert_only_owner();
            self.levels.write(levels);
            self.emit(LevelsSet { levels });
        }

        fn set_placer(ref self: ContractState, placer: ContractAddress, allowed: bool) {
            self.ownable.assert_only_owner();
            self.placers.write(placer, allowed);
            self.emit(PlacerSet { placer, allowed });
        }

        fn setup(self: @ContractState) -> ContractAddress {
            self.setup.read()
        }

        fn levels(self: @ContractState) -> ContractAddress {
            self.levels.read()
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

        /// The player's level: 1 while no `levels` contract is set (#641 not wired).
        fn level_of(self: @ContractState, player_id: felt252) -> u32 {
            let levels = self.levels.read();
            if levels.is_zero() {
                return 1;
            }
            IPlayerLevelDispatcher { contract_address: levels }.level(player_id)
        }

        /// Whether the cell is in the player's territory (its village founded or not).
        fn owns(self: @ContractState, player_id: felt252, x: u32, y: u32) -> bool {
            is_start_cell(x, y) || self.owned.read((player_id, x, y)) != 0
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

    /// As `Challenge.build`: the position has its 8 neighbours in `u32`.
    fn assert_position(x: u32, y: u32) {
        assert(
            x != 0 && y != 0 && x != Bounded::<u32>::MAX && y != Bounded::<u32>::MAX,
            errors::INVALID_POSITION,
        );
    }
}
