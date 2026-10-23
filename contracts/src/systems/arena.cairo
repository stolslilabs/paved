//! `Arena`, the PvP attacks (#643, part of #637; `docs/architecture/pvp-attacks.md`).
//!
//! An attack plays the defender's placed tiles, drawn one by one by Cartridge's VRF, in the
//! defender's territory (owner decisions of 2026-10-20: the deck and the territory are the
//! defender's; a true random draw for every tile, one transaction per tile; no characters and no
//! abilities). It is composed of small pieces (owner decision of 2026-10-21): `DrawableComponent`
//! (the VRF, #638), `DeckableComponent` (the deck copied at the start and the tiles drawn) and
//! `RecordableComponent` (the moves, the replay's source). This system holds what joins them: the
//! attacks, the snapshot of the defender's village, the check of a move, the finish's replay, and
//! the calls to `Matchmaker`, of which it is an operator:
//!
//! - `start()` fixes the opponent the attacker drew there (`search`, `next`), which shields it and
//!   holds the attacker's 0-star cost; the defender's village is snapshotted (its tiles' plans, its
//!   parcel count, its score); the first tile is drawn;
//! - `play(discard, orientation, x, y)` records the move of the tile in hand, checked for the cell
//!   and its fit against the tiles already there (no structure engine), and draws the next tile;
//!   the last move finishes the attack: the moves are replayed once in a new game, scored, and
//!   `Matchmaker.settle` gives the hold back, moves the crowns and reports the attack to `Setup`,
//!   which grants the village reward (#642);
//! - `surrender()` ends the open attack at 0 stars.
//!
//! The note's proposals for the owner (section 9) are each one switch point here: the stars'
//! thresholds (`paved::matchmaker::stars`), the snapshot (`snapshot_village`), the offer's bounds
//! (`paved::matchmaker::crowns`, #639), no timeout (`ATTACK_TIMEOUT`), the NPC villages from their
//! Story level (`NPC_ATTACKS`, `snapshot_npc`).
//!
//! The client puts `request_random(Arena, Salt(vrfSalt(ATTACK_KIND, attacker, draw_index(id, n))))`
//! first in the multicall of `start` (draw 0) and of each `play` that draws (draw `n`, the tiles
//! drawn so far).

use starknet::ContractAddress;

/// The kind of an attack's VRF draws (`paved::vrf::draw_salt`); the game id is the attacker.
pub const ATTACK_KIND: felt252 = 'ATTACK';
/// The draws of one attack in a salt's index: `id * DRAWS_PER_ATTACK + n`.
pub const DRAWS_PER_ATTACK: u32 = 128;
/// Open point 4 (no timeout, proposed): the seconds after its start from which anyone may end an
/// open attack at 0 stars (`expire`). 0: never; the attacker alone ends it, by its last move or
/// `surrender`.
pub const ATTACK_TIMEOUT: u64 = 0;
/// Open point 5 (proposed): NPC villages are attacked on their Story level (`set_npc_level`).
pub const NPC_ATTACKS: bool = true;
/// The id of the first tile a Story level places before its first draw (`Story`'s `PLACED_ID`).
pub const PLACED_ID: u32 = 200;
/// The cells a village holds before its first parcel (`Village`'s `START_CELLS`).
pub const START_CELLS: u8 = 9;

/// No attack yet.
pub const STATUS_NONE: u8 = 0;
/// An attack in progress: a tile in hand.
pub const STATUS_OPEN: u8 = 1;
/// Ended by its last move: replayed and settled at its stars.
pub const STATUS_FINISHED: u8 = 2;
/// Ended at 0 stars by the attacker (`surrender`) or, past `ATTACK_TIMEOUT`, by anyone (`expire`).
pub const STATUS_SURRENDERED: u8 = 3;
/// Not played: the drawn opponent could not be attacked (an empty village, an NPC with no level);
/// its match was cancelled, nothing moved.
pub const STATUS_SKIPPED: u8 = 4;

/// The draw index of draw `n` of attack `id` in its VRF salt.
pub fn draw_index(id: u32, n: u8) -> u32 {
    id * DRAWS_PER_ATTACK + n.into()
}

/// An attacker's last attack: its number (from 1), status, defender, whether the defender is an
/// NPC, the snapshot (the defender's parcels and score at the start), the board its moves are
/// checked on, the tiles a Story level placed there, the start's time, and once ended its score
/// and stars.
#[derive(Copy, Drop, Serde, Debug, PartialEq)]
pub struct Attack {
    pub id: u32,
    pub status: u8,
    pub defender: ContractAddress,
    pub npc: bool,
    pub parcels: u8,
    pub target: u32,
    pub board: u32,
    pub placed: u8,
    pub started_at: u64,
    pub score: u32,
    pub stars: u8,
}

/// The Story level an NPC village is attacked on: `campaign` 0 for none.
#[derive(Copy, Drop, Serde, Debug, PartialEq)]
pub struct NpcLevel {
    pub campaign: u8,
    pub level: u8,
}

#[starknet::interface]
pub trait IArena<TContractState> {
    /// Starts the caller's attack on the opponent it drew in `Matchmaker` (`search`, `next`): no
    /// attack open (`'Arena: attack open'`); `Matchmaker.start_attack` shields the defender and
    /// holds the 0-star cost. A player's village with a placed tile, or an NPC with a Story level,
    /// is snapshotted; the first tile is drawn. Emits `AttackOpened`. An opponent that cannot be
    /// attacked is skipped instead: its match cancelled (the next `search` is free), nothing
    /// moved, the VRF draw consumed, `AttackSkipped` (status `STATUS_SKIPPED`). Returns the
    /// attack's number.
    fn start(ref self: TContractState) -> u32;
    /// Plays the tile in hand of the caller's open attack (`'Arena: no attack'`): discarded, or
    /// built turned to `orientation` (1 to 4) at `(x, y)`: in the snapshot's territory
    /// (`'Arena: outside territory'`), free (`'Tile: already exists'`), fitting the tiles there
    /// (`'Tile: no neighbors'`, `'Tile: cannot place'`). Emits `AttackPlayed`; draws the next tile,
    /// or, after the last, replays the attack and settles it (`AttackFinished`). Returns the stars
    /// once finished, 0 before.
    fn play(ref self: TContractState, discard: bool, orientation: u8, x: u32, y: u32) -> u8;
    /// Ends the caller's open attack at 0 stars, with no replay. Emits `AttackFinished`.
    fn surrender(ref self: TContractState);
    /// Ends `attacker`'s open attack at 0 stars once `ATTACK_TIMEOUT` has passed since its start;
    /// anyone. With no timeout (0) it always fails (`'Arena: no timeout'`).
    fn expire(ref self: TContractState, attacker: ContractAddress);
    /// `attacker`'s last attack (id 0: none).
    fn attack(self: @TContractState, attacker: ContractAddress) -> Attack;
    fn npc_level(self: @TContractState, npc_id: u8) -> NpcLevel;
}

/// The wiring of `Arena`, set by the owner.
#[starknet::interface]
pub trait IArenaAdmin<TContractState> {
    /// Sets the systems `Arena` calls: `Matchmaker` (where it is an operator), `Village` and
    /// `Story`. None zero. Emits `WiringSet`.
    fn set_wiring(
        ref self: TContractState,
        matchmaker: ContractAddress,
        village: ContractAddress,
        story: ContractAddress,
    );
    fn wiring(self: @TContractState) -> (ContractAddress, ContractAddress, ContractAddress);
    fn set_vrf_provider(ref self: TContractState, provider: ContractAddress);
    /// Maps NPC village `npc_id` (1 to 255, `Matchmaker`'s) to Story level `level` of `campaign`;
    /// `campaign` 0 removes it. Emits `NpcLevelSet`.
    fn set_npc_level(ref self: TContractState, npc_id: u8, campaign: u8, level: u8);
}

#[starknet::contract]
pub mod Arena {
    use core::num::traits::{Bounded, Zero};
    use openzeppelin_interfaces::upgrades::IUpgradeable;
    use openzeppelin_upgrades::UpgradeableComponent;
    use paved::components::deckable::DeckableComponent;
    use paved::components::drawable::DrawableComponent;
    use paved::components::ownable::OwnableComponent;
    use paved::components::recordable::{AttackMove, RecordableComponent};
    use paved::events::Event as PavedEvent;
    use paved::matchmaker::stars::stars_of;
    use paved::models::game::{Game, GameImpl};
    use paved::models::tile::{TileImpl, ZeroableTile};
    use paved::store::{Store, StoreImpl};
    use paved::structure::placement::{self, NeighborhoodTrait};
    use paved::structure::state::StructuresTrait;
    use paved::systems::matchmaker::{IMatchmakerDispatcher, IMatchmakerDispatcherTrait, MAX_NPC};
    use paved::systems::story::{IStoryDispatcher, IStoryDispatcherTrait};
    use paved::systems::village::{IVillageDispatcher, IVillageDispatcherTrait, is_start_cell};
    use paved::types::mode::Mode;
    use paved::types::orientation::Orientation;
    use paved::types::plan::Plan;
    use starknet::storage::{
        Map, StorageMapReadAccess, StorageMapWriteAccess, StoragePointerReadAccess,
        StoragePointerWriteAccess,
    };
    use starknet::{ClassHash, ContractAddress, get_block_timestamp, get_caller_address};
    use super::{
        ATTACK_KIND, ATTACK_TIMEOUT, Attack, IArena, IArenaAdmin, NPC_ATTACKS, NpcLevel, PLACED_ID,
        START_CELLS, STATUS_FINISHED, STATUS_OPEN, STATUS_SKIPPED, STATUS_SURRENDERED, draw_index,
    };

    pub mod errors {
        pub const ZERO_ADDRESS: felt252 = 'Arena: address is zero';
        pub const ATTACK_OPEN: felt252 = 'Arena: attack open';
        pub const NO_ATTACK: felt252 = 'Arena: no attack';
        pub const EMPTY_VILLAGE: felt252 = 'Arena: empty village';
        pub const NO_NPC_LEVEL: felt252 = 'Arena: no npc level';
        pub const INVALID_NPC: felt252 = 'Arena: invalid npc';
        pub const INVALID_ORIENTATION: felt252 = 'Arena: invalid orientation';
        pub const INVALID_POSITION: felt252 = 'Arena: invalid position';
        pub const OUTSIDE_TERRITORY: felt252 = 'Arena: outside territory';
        pub const TILE_EXISTS: felt252 = 'Tile: already exists';
        pub const NO_TIMEOUT: felt252 = 'Arena: no timeout';
        pub const NOT_EXPIRED: felt252 = 'Arena: not expired';
    }

    // Packing

    const TWO_POW_8: u128 = 0x100;
    const TWO_POW_32: u128 = 0x100000000;
    const TWO_POW_40: u128 = 0x10000000000;
    const TWO_POW_48: u128 = 0x1000000000000;
    const TWO_POW_56: u128 = 0x100000000000000;
    const TWO_POW_88: u128 = 0x10000000000000000000000;
    const TWO_POW_96: u128 = 0x1000000000000000000000000;
    const MASK_8: u128 = 0xff;
    const MASK_32: u128 = 0xffffffff;
    const MASK_64: u128 = 0xffffffffffffffff;

    component!(path: OwnableComponent, storage: ownable, event: OwnableEvent);
    #[abi(embed_v0)]
    impl OwnableImpl = OwnableComponent::OwnableImpl<ContractState>;
    impl OwnableInternalImpl = OwnableComponent::InternalImpl<ContractState>;
    component!(path: UpgradeableComponent, storage: upgradeable, event: UpgradeableEvent);
    impl UpgradeableInternalImpl = UpgradeableComponent::InternalImpl<ContractState>;
    component!(path: DrawableComponent, storage: drawable, event: DrawableEvent);
    #[abi(embed_v0)]
    impl DrawableImpl = DrawableComponent::DrawableImpl<ContractState>;
    impl DrawableInternalImpl = DrawableComponent::InternalImpl<ContractState>;
    component!(path: DeckableComponent, storage: deckable, event: DeckableEvent);
    #[abi(embed_v0)]
    impl DeckableImpl = DeckableComponent::DeckableImpl<ContractState>;
    impl DeckableInternalImpl = DeckableComponent::InternalImpl<ContractState>;
    component!(path: RecordableComponent, storage: recordable, event: RecordableEvent);
    #[abi(embed_v0)]
    impl RecordableImpl = RecordableComponent::RecordableImpl<ContractState>;
    impl RecordableInternalImpl = RecordableComponent::InternalImpl<ContractState>;

    // Storage: new contract, flat components (`docs/architecture/upgrades.md`). The boards the
    // moves are checked on and the games the attacks are replayed in live in `PavedStorage`
    // (`paved::store`), under the node `selector!("paved")`: no member here is named `paved`.

    #[storage]
    struct Storage {
        #[substorage(v0)]
        ownable: OwnableComponent::Storage,
        #[substorage(v0)]
        upgradeable: UpgradeableComponent::Storage,
        #[substorage(v0)]
        drawable: DrawableComponent::Storage,
        #[substorage(v0)]
        deckable: DeckableComponent::Storage,
        #[substorage(v0)]
        recordable: RecordableComponent::Storage,
        /// An attacker's last attack (`attack_word`): `id` [0, 32) · `status` [32, 40) · `npc`
        /// [40, 48) · `parcels` [48, 56) · `target` [56, 88) · `board` [88, 120) · `placed`
        /// [120, 128) in the low half; `started_at` [0, 64) · `score` [64, 96) · `stars` [96,
        /// 104)
        /// in the high half.
        attacks: Map<ContractAddress, felt252>,
        /// An attacker's last defender (an address does not fit beside the fields).
        attack_defenders: Map<ContractAddress, ContractAddress>,
        /// The Story level of an NPC village (key its id): `campaign` [0, 8) · `level` [8, 16).
        npc_levels: Map<u8, u16>,
        /// The systems called (`set_wiring`).
        matchmaker: ContractAddress,
        village: ContractAddress,
        story: ContractAddress,
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
        #[flat]
        DrawableEvent: DrawableComponent::Event,
        #[flat]
        DeckableEvent: DeckableComponent::Event,
        #[flat]
        RecordableEvent: RecordableComponent::Event,
        WiringSet: WiringSet,
        NpcLevelSet: NpcLevelSet,
        AttackOpened: AttackOpened,
        AttackFinished: AttackFinished,
        AttackSkipped: AttackSkipped,
    }

    #[derive(Drop, Debug, PartialEq, starknet::Event)]
    pub struct WiringSet {
        pub matchmaker: ContractAddress,
        pub village: ContractAddress,
        pub story: ContractAddress,
    }

    #[derive(Drop, Debug, PartialEq, starknet::Event)]
    pub struct NpcLevelSet {
        #[key]
        pub npc_id: u8,
        pub campaign: u8,
        pub level: u8,
    }

    /// An attack started: its number, the defender (an NPC or a player), the offer fixed at the
    /// draw, the snapshot's score (the stars' target) and the tiles of its deck. The defender's
    /// log is the attacks keyed by its address.
    #[derive(Drop, Debug, PartialEq, starknet::Event)]
    pub struct AttackOpened {
        #[key]
        pub attacker: ContractAddress,
        #[key]
        pub defender: ContractAddress,
        pub id: u32,
        pub npc: bool,
        pub offer: u8,
        pub target: u32,
        pub tiles: u8,
    }

    /// An attack ended: its score (0 when surrendered) and stars, whether it was surrendered (or
    /// expired), and the crowns that moved (`Matchmaker`'s `CrownsSettled` has the counts).
    #[derive(Drop, Debug, PartialEq, starknet::Event)]
    pub struct AttackFinished {
        #[key]
        pub attacker: ContractAddress,
        #[key]
        pub defender: ContractAddress,
        pub id: u32,
        pub game_id: u32,
        pub score: u32,
        pub stars: u8,
        pub surrendered: bool,
        pub gained: u32,
        pub lost: u32,
    }

    /// A start on a drawn opponent that cannot be attacked (an empty village, an NPC with no
    /// level): its match cancelled in `Matchmaker`, so the next `search` is free.
    #[derive(Drop, Debug, PartialEq, starknet::Event)]
    pub struct AttackSkipped {
        #[key]
        pub attacker: ContractAddress,
        #[key]
        pub defender: ContractAddress,
        pub id: u32,
    }

    #[constructor]
    fn constructor(
        ref self: ContractState,
        owner: ContractAddress,
        matchmaker: ContractAddress,
        village: ContractAddress,
        story: ContractAddress,
        provider: ContractAddress,
    ) {
        self.ownable.initialize(owner);
        self.write_wiring(matchmaker, village, story);
        self.drawable.set_provider(provider);
    }

    #[abi(embed_v0)]
    impl ArenaImpl of IArena<ContractState> {
        fn start(ref self: ContractState) -> u32 {
            let attacker = get_caller_address();
            // [Check] One attack at a time
            let last = self.attack_of(attacker);
            assert(last.status != STATUS_OPEN, errors::ATTACK_OPEN);
            let matchmaker = IMatchmakerDispatcher { contract_address: self.matchmaker.read() };
            let id = last.id + 1;
            // [Check] The drawn opponent can be attacked: a village with a placed tile, or an NPC
            // with a Story level. Otherwise the match is cancelled (the next `search` is free), the
            // attack is recorded as skipped, and the VRF draw the client requested is consumed (its
            // transaction must consume it); no shield, no hold
            let drawn = matchmaker.current_match(attacker).opponent;
            if drawn.is_non_zero() && !self.is_playable(drawn) {
                matchmaker.cancel_match(attacker);
                let skipped = Attack {
                    id,
                    status: STATUS_SKIPPED,
                    defender: drawn,
                    npc: is_npc_address(drawn),
                    parcels: 0,
                    target: 0,
                    board: 0,
                    placed: 0,
                    started_at: get_block_timestamp(),
                    score: 0,
                    stars: 0,
                };
                self.write_attack(attacker, skipped);
                self.emit(AttackSkipped { attacker, defender: drawn, id });
                self.drawable.draw_random(ATTACK_KIND, attacker.into(), draw_index(id, 0));
                return id;
            }
            // [Interaction] The match started in `Matchmaker`: its checks, the defender's shield,
            // the attacker's hold
            let (defender, offer) = matchmaker.start_attack(attacker);
            // [Effect] The snapshot of the defender, on a new board
            let mut store: Store = StoreImpl::new();
            let board = store.uuid();
            let npc = is_npc_address(defender);
            let (plans, parcels, target, placed) = if npc {
                self.snapshot_npc(defender, board, store)
            } else {
                self.snapshot_village(defender, board, store)
            };
            self.deckable.load(attacker, id, plans.span());
            let attack = Attack {
                id,
                status: STATUS_OPEN,
                defender,
                npc,
                parcels,
                target,
                board,
                placed,
                started_at: get_block_timestamp(),
                score: 0,
                stars: 0,
            };
            self.write_attack(attacker, attack);
            let tiles: u8 = plans.len().try_into().unwrap();
            self.emit(AttackOpened { attacker, defender, id, npc, offer, target, tiles });
            // [Interaction] The first tile, drawn by the VRF
            let random = self.drawable.draw_random(ATTACK_KIND, attacker.into(), draw_index(id, 0));
            self.deckable.draw(attacker, id, random);
            id
        }

        fn play(ref self: ContractState, discard: bool, orientation: u8, x: u32, y: u32) -> u8 {
            let attacker = get_caller_address();
            // [Check] An open attack; [Effect] its tile in hand taken
            let mut attack = self.attack_of(attacker);
            assert(attack.status == STATUS_OPEN, errors::NO_ATTACK);
            let id = attack.id;
            let plan = self.deckable.take(attacker, id);
            let index = self.recordable.size_of(attacker, id);
            if discard {
                self
                    .recordable
                    .append(attacker, id, AttackMove { plan, discard, orientation: 0, x: 0, y: 0 });
            } else {
                // [Check] The cell: an orientation, a position in the snapshot's territory, free,
                // fitting the tiles of the board (no structure engine)
                assert(orientation >= 1 && orientation <= 4, errors::INVALID_ORIENTATION);
                assert_position(x, y);
                if !attack.npc {
                    self.assert_territory(attack, x, y);
                }
                let (there, _) = StoreImpl::tile_at(attack.board, x, y);
                assert(there.is_zero(), errors::TILE_EXISTS);
                let around = NeighborhoodTrait::read(attack.board, x, y);
                let mut tile = TileImpl::new(attack.board, index.into() + 2, plan.into());
                tile.settle(orientation.into(), x, y);
                placement::assert_fits(tile, @around);
                // [Effect] The tile on the board, the move recorded
                StoreImpl::new().set_placed_tile(tile, 0);
                self
                    .recordable
                    .append(attacker, id, AttackMove { plan, discard, orientation, x, y });
            }
            // [Interaction] The next tile, drawn by the VRF, while one is left
            let drawn = index + 1;
            if self.deckable.left(attacker, id) != 0 {
                let random = self
                    .drawable
                    .draw_random(ATTACK_KIND, attacker.into(), draw_index(id, drawn));
                self.deckable.draw(attacker, id, random);
                return 0;
            }
            // [Effect] The last move: the attack replayed and scored; [Interaction] settled
            let (game_id, score) = self.replay(attacker, attack);
            let stars = stars_of(score, attack.target);
            attack.status = STATUS_FINISHED;
            attack.score = score;
            attack.stars = stars;
            self.write_attack(attacker, attack);
            self.settle(attacker, attack, game_id, false);
            stars
        }

        fn surrender(ref self: ContractState) {
            let attacker = get_caller_address();
            self.end(attacker);
        }

        fn expire(ref self: ContractState, attacker: ContractAddress) {
            // [Check] A timeout, passed
            assert(ATTACK_TIMEOUT != 0, errors::NO_TIMEOUT);
            let attack = self.attack_of(attacker);
            assert(attack.status == STATUS_OPEN, errors::NO_ATTACK);
            assert(
                get_block_timestamp() >= attack.started_at + ATTACK_TIMEOUT, errors::NOT_EXPIRED,
            );
            self.end(attacker);
        }

        fn attack(self: @ContractState, attacker: ContractAddress) -> Attack {
            self.attack_of(attacker)
        }

        fn npc_level(self: @ContractState, npc_id: u8) -> NpcLevel {
            let word = self.npc_levels.read(npc_id);
            NpcLevel {
                campaign: (word & 0xff).try_into().unwrap(),
                level: (word / 0x100).try_into().unwrap(),
            }
        }
    }

    #[abi(embed_v0)]
    impl ArenaAdminImpl of IArenaAdmin<ContractState> {
        fn set_wiring(
            ref self: ContractState,
            matchmaker: ContractAddress,
            village: ContractAddress,
            story: ContractAddress,
        ) {
            self.ownable.assert_only_owner();
            self.write_wiring(matchmaker, village, story);
        }

        fn wiring(self: @ContractState) -> (ContractAddress, ContractAddress, ContractAddress) {
            (self.matchmaker.read(), self.village.read(), self.story.read())
        }

        fn set_vrf_provider(ref self: ContractState, provider: ContractAddress) {
            self.ownable.assert_only_owner();
            self.drawable.set_provider(provider);
        }

        fn set_npc_level(ref self: ContractState, npc_id: u8, campaign: u8, level: u8) {
            self.ownable.assert_only_owner();
            assert(npc_id != 0 && npc_id <= MAX_NPC, errors::INVALID_NPC);
            let level = if campaign == 0 {
                0
            } else {
                level
            };
            self.npc_levels.write(npc_id, campaign.into() + level.into() * 0x100);
            self.emit(NpcLevelSet { npc_id, campaign, level });
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

    /// Whether `village` is an NPC's address (1 to `MAX_NPC`), as `Matchmaker` reads it.
    fn is_npc_address(village: ContractAddress) -> bool {
        let address: felt252 = village.into();
        let address: u256 = address.into();
        address != 0 && address <= MAX_NPC.into()
    }

    /// As `Challenge.build`: the position has its 8 neighbours in `u32`.
    fn assert_position(x: u32, y: u32) {
        assert(
            x != 0 && y != 0 && x != Bounded::<u32>::MAX && y != Bounded::<u32>::MAX,
            errors::INVALID_POSITION,
        );
    }

    /// The usual starter: `RFFFRFCFR` facing South at `CENTER` (`Game::start`), whose words come
    /// from constants (`placement::place_starter`).
    fn is_usual_starter(plan: u8, orientation: u8, x: u32, y: u32) -> bool {
        let usual: u8 = Plan::RFFFRFCFR.into();
        let south: u8 = Orientation::South.into();
        plan == usual
            && orientation == south
            && x == paved::constants::CENTER
            && y == paved::constants::CENTER
    }

    /// Writes a fixed tile (a starter, a tile a Story level places) on an attack's board: its
    /// plan, orientation and position, no structure (the board only checks fits).
    fn write_board_tile(
        store: Store, board: u32, id: u32, plan: u8, orientation: u8, x: u32, y: u32,
    ) {
        let mut tile = TileImpl::new(board, id, plan.into());
        tile.settle(orientation.into(), x, y);
        store.set_placed_tile(tile, 0);
    }

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn write_wiring(
            ref self: ContractState,
            matchmaker: ContractAddress,
            village: ContractAddress,
            story: ContractAddress,
        ) {
            assert(
                matchmaker.is_non_zero() && village.is_non_zero() && story.is_non_zero(),
                errors::ZERO_ADDRESS,
            );
            self.matchmaker.write(matchmaker);
            self.village.write(village);
            self.story.write(story);
            self.emit(WiringSet { matchmaker, village, story });
        }

        /// Open point 7 (the snapshot, proposed): the defender's village as it is now. Its
        /// territory needs no copy, it only grows: the parcel count is kept, and a cell is in it if
        /// it is one of the 9 of the start or a parcel up to that count. The deck is the plans of
        /// its placed tiles; the target its score. Its starter goes on the board. Returns the
        /// plans, the parcels, the target and the placed tiles (0: a village places none).
        fn snapshot_village(
            ref self: ContractState, defender: ContractAddress, board: u32, store: Store,
        ) -> (Array<u8>, u8, u32, u8) {
            let village = IVillageDispatcher { contract_address: self.village.read() };
            let info = village.village(defender.into());
            assert(info.tiles != 0, errors::EMPTY_VILLAGE);
            let mut tiles = village.tiles(defender.into()).span();
            let starter = *tiles.pop_front().unwrap();
            write_board_tile(
                store, board, 1, starter.plan, starter.orientation, starter.x, starter.y,
            );
            let mut plans: Array<u8> = array![];
            for tile in tiles {
                plans.append(*tile.plan);
            }
            (plans, info.cells - START_CELLS, info.score, 0)
        }

        /// Open point 5 (proposed): an NPC village is attacked on its Story level: its plans are
        /// the deck, its starter and placed tiles go on the board, the board has no territory, and
        /// its target is the stars' target.
        fn snapshot_npc(
            ref self: ContractState, defender: ContractAddress, board: u32, store: Store,
        ) -> (Array<u8>, u8, u32, u8) {
            assert(NPC_ATTACKS, errors::NO_NPC_LEVEL);
            let npc_id: felt252 = defender.into();
            let npc = self.npc_level(npc_id.try_into().unwrap());
            assert(npc.campaign != 0, errors::NO_NPC_LEVEL);
            let story = IStoryDispatcher { contract_address: self.story.read() };
            let level = story.level(npc.campaign, npc.level);
            assert(level.target != 0, errors::NO_NPC_LEVEL);
            let starter = level.starter;
            write_board_tile(
                store, board, 1, starter.plan, starter.orientation, starter.x, starter.y,
            );
            let mut index: u32 = 0;
            for tile in level.placed.span() {
                write_board_tile(
                    store,
                    board,
                    PLACED_ID + index,
                    *tile.plan,
                    *tile.orientation,
                    *tile.x,
                    *tile.y,
                );
                index += 1;
            }
            (level.plans, 0, level.target, index.try_into().unwrap())
        }

        /// Whether `defender` can be attacked: a player's village with a placed tile, or an NPC
        /// with a Story level that exists (open point 5).
        fn is_playable(self: @ContractState, defender: ContractAddress) -> bool {
            if is_npc_address(defender) {
                if !NPC_ATTACKS {
                    return false;
                }
                let npc_id: felt252 = defender.into();
                let npc = self.npc_level(npc_id.try_into().unwrap());
                if npc.campaign == 0 {
                    return false;
                }
                let story = IStoryDispatcher { contract_address: self.story.read() };
                return story.level(npc.campaign, npc.level).target != 0;
            }
            let village = IVillageDispatcher { contract_address: self.village.read() };
            village.village(defender.into()).tiles != 0
        }

        /// A cell of the snapshot's territory: one of the 9 of the start, or a parcel bought before
        /// the attack's start.
        fn assert_territory(self: @ContractState, attack: Attack, x: u32, y: u32) {
            if is_start_cell(x, y) {
                return;
            }
            let village = IVillageDispatcher { contract_address: self.village.read() };
            let parcel = village.parcel_of(attack.defender.into(), x, y);
            assert(parcel != 0 && parcel <= attack.parcels, errors::OUTSIDE_TERRITORY);
        }

        /// Replays an attack once in a new game of this contract, as `Story` replays a run: the
        /// board's fixed tiles written, then each move built (placed, assessed when a structure
        /// closes) or discarded (the discard penalty). Solo: every structure scores for the
        /// attacker. Returns the game and its score.
        fn replay(self: @ContractState, attacker: ContractAddress, attack: Attack) -> (u32, u32) {
            let moves = self.recordable.moves_of(attacker, attack.id);
            let mut store: Store = StoreImpl::new();
            let game_id = store.uuid();
            let mut game: Game = GameImpl::new(
                game_id, get_block_timestamp(), Mode::Challenge, attacker.into(),
            );
            game.tile_limit = (moves.len() + 1).try_into().unwrap();
            // [Effect] The starter, tile 1, and the tiles a Story level places
            let (starter, _) = StoreImpl::tile_with_refs(attack.board, 1);
            let id = game.add_tile();
            let mut tile = TileImpl::new(game_id, id, starter.plan.into());
            tile.settle(starter.orientation.into(), starter.x, starter.y);
            if is_usual_starter(starter.plan, starter.orientation, starter.x, starter.y) {
                placement::place_starter(store, tile);
            } else {
                store.set_tile(tile);
            }
            let mut index: u32 = 0;
            while index < attack.placed.into() {
                let (fixed, _) = StoreImpl::tile_with_refs(attack.board, PLACED_ID + index);
                let mut tile = TileImpl::new(game_id, PLACED_ID + index, fixed.plan.into());
                tile.settle(fixed.orientation.into(), fixed.x, fixed.y);
                store.set_tile(tile);
                index += 1;
            }
            // [Effect] Each move, built or discarded (each was checked when it was played)
            for move in moves {
                let id = game.add_tile();
                if move.discard {
                    let mut malus = paved::constants::DISCARD_POINTS;
                    game.sub_score(ref malus);
                    game.discarded += 1;
                    continue;
                }
                let mut tile = TileImpl::new(game_id, id, move.plan.into());
                let around = NeighborhoodTrait::read(game_id, move.x, move.y);
                tile.settle(move.orientation.into(), move.x, move.y);
                placement::assert_fits(tile, @around);
                let mut structures = StructuresTrait::new(game_id);
                let (refs, closes) = placement::place_move(ref structures, tile, @around);
                structures.track(tile, refs);
                if closes {
                    game.assess(tile, refs, @around, ref structures, ref store);
                }
                structures.flush(store);
                game.built += 1;
            }
            (game_id, game.score)
        }

        /// Ends `attacker`'s open attack at 0 stars, with no replay.
        fn end(ref self: ContractState, attacker: ContractAddress) {
            let mut attack = self.attack_of(attacker);
            assert(attack.status == STATUS_OPEN, errors::NO_ATTACK);
            attack.status = STATUS_SURRENDERED;
            self.write_attack(attacker, attack);
            self.settle(attacker, attack, 0, true);
        }

        /// Settles an ended attack in `Matchmaker` at its stars (the hold given back, the crowns,
        /// the leagues, the report to `Setup` and its reward). Emits `AttackFinished`.
        fn settle(
            ref self: ContractState,
            attacker: ContractAddress,
            attack: Attack,
            game_id: u32,
            surrendered: bool,
        ) {
            let matchmaker = IMatchmakerDispatcher { contract_address: self.matchmaker.read() };
            let outcome = matchmaker.settle(attacker, attack.stars);
            self
                .emit(
                    AttackFinished {
                        attacker,
                        defender: attack.defender,
                        id: attack.id,
                        game_id,
                        score: attack.score,
                        stars: attack.stars,
                        surrendered,
                        gained: outcome.gained,
                        lost: outcome.lost,
                    },
                );
        }

        fn attack_of(self: @ContractState, attacker: ContractAddress) -> Attack {
            let word: u256 = self.attacks.read(attacker).into();
            let low = word.low;
            let high = word.high;
            Attack {
                id: (low & MASK_32).try_into().unwrap(),
                status: ((low / TWO_POW_32) & MASK_8).try_into().unwrap(),
                defender: self.attack_defenders.read(attacker),
                npc: (low / TWO_POW_40) & MASK_8 == 1,
                parcels: ((low / TWO_POW_48) & MASK_8).try_into().unwrap(),
                target: ((low / TWO_POW_56) & MASK_32).try_into().unwrap(),
                board: ((low / TWO_POW_88) & MASK_32).try_into().unwrap(),
                placed: ((low / (TWO_POW_88 * TWO_POW_32)) & MASK_8).try_into().unwrap(),
                started_at: (high & MASK_64).try_into().unwrap(),
                score: ((high / (TWO_POW_32 * TWO_POW_32)) & MASK_32).try_into().unwrap(),
                stars: ((high / TWO_POW_96) & MASK_8).try_into().unwrap(),
            }
        }

        fn write_attack(ref self: ContractState, attacker: ContractAddress, attack: Attack) {
            let npc: u128 = if attack.npc {
                1
            } else {
                0
            };
            let low: u128 = attack.id.into()
                + attack.status.into() * TWO_POW_32
                + npc * TWO_POW_40
                + attack.parcels.into() * TWO_POW_48
                + attack.target.into() * TWO_POW_56
                + attack.board.into() * TWO_POW_88
                + attack.placed.into() * TWO_POW_88 * TWO_POW_32;
            let high: u128 = attack.started_at.into()
                + attack.score.into() * TWO_POW_32 * TWO_POW_32
                + attack.stars.into() * TWO_POW_96;
            let word = u256 { low, high };
            self.attacks.write(attacker, word.try_into().unwrap());
            self.attack_defenders.write(attacker, attack.defender);
        }
    }
}
