//! The build of `Daily` before D-18 (main at 07aab8a), frozen for one test: the games that stay
//! open across the D-18 upgrade (`e2e/upgrade_d18.cairo`).
//!
//! snforge declares only the classes of this package, so the class of 07aab8a cannot be declared
//! as it was compiled. Its build path is kept here instead, as test-only code: the modules that
//! D-18b changed, copied from 07aab8a (`git show 07aab8a:contracts/src/<path>`), with their tests
//! removed and their `paved::` paths turned to this module. The modules D-18b left alone (tables,
//! oriented rows, layouts, decks, helpers) are shared. `DailyBeforeD18` runs `build` exactly as
//! `PlayableComponent::build` of 07aab8a did, and `build_tutorial` as `TutoriableComponent::build`
//! did (with the scripted roles and spots of 07aab8a, `tutorial_parameters`), on the same storage
//! node (`selector!("paved")`), and upgrades as `Daily` and `Tutorial` do (owner only,
//! OpenZeppelin's `UpgradeableComponent`). Their game-over tails (tournament, quests, achievements)
//! are left out: the test ends its games under the new classes.

pub mod assessment;
pub mod builder;
pub mod character;
pub mod events;
pub mod forest;
pub mod game;
pub mod index;
pub mod placement;
pub mod record;
pub mod role;
pub mod state;
pub mod store;
pub mod tile;

use paved::tests::legacy::role::Role;
use paved::types::orientation::Orientation;
use paved::types::spot::Spot;
use starknet::ClassHash;

#[starknet::interface]
pub trait IDailyBeforeD18<TContractState> {
    fn build(
        ref self: TContractState,
        game_id: u32,
        orientation: Orientation,
        x: u32,
        y: u32,
        role: Role,
        spot: Spot,
    );
    fn build_tutorial(ref self: TContractState, game_id: u32);
    fn upgrade(ref self: TContractState, new_class_hash: ClassHash);
}

/// The script of the Tutorial deck of 07aab8a (`elements/decks/tutorial.cairo`, `parameters`): the
/// placement, role and spot of the tile of each index.
pub fn tutorial_parameters(index: u32) -> (Orientation, u32, u32, Role, Spot) {
    let center = paved::constants::CENTER;
    match index {
        0 => (Orientation::None, 0, 0, Role::None, Spot::None),
        1 => (Orientation::North, center - 1, center, Role::Adventurer, Spot::East),
        2 => (Orientation::East, center - 1, center - 1, Role::Paladin, Spot::Center),
        3 => (Orientation::East, center - 1, center - 2, Role::None, Spot::None),
        4 => (Orientation::West, center, center - 1, Role::Pilgrim, Spot::Center),
        5 => (Orientation::East, center, center - 2, Role::Paladin, Spot::West),
        6 => (Orientation::North, center + 1, center - 2, Role::Lady, Spot::Center),
        7 => (Orientation::East, center + 1, center - 1, Role::None, Spot::None),
        8 => (Orientation::None, 0, 0, Role::None, Spot::None), // Must be burned
        9 => (Orientation::West, center + 1, center, Role::None, Spot::None),
        _ => (Orientation::None, 0, 0, Role::None, Spot::None),
    }
}

#[starknet::contract]
pub mod DailyBeforeD18 {
    use openzeppelin_upgrades::UpgradeableComponent;
    use paved::components::ownable::OwnableComponent;
    use paved::tests::legacy::builder::{BuilderAssert, BuilderImpl};
    use paved::tests::legacy::events::{Built, Event as PavedEvent};
    use paved::tests::legacy::game::{GameAssert, GameImpl};
    use paved::tests::legacy::placement::{self, NeighborhoodTrait};
    use paved::tests::legacy::role::Role;
    use paved::tests::legacy::state::StructuresTrait;
    use paved::tests::legacy::store::{Store, StoreImpl};
    use paved::helpers::bitmap::Bitmap;
    use paved::tests::legacy::tile::{TileAssert, TilePositionAssert};
    use paved::types::orientation::{Orientation, OrientationAssert};
    use paved::types::spot::Spot;
    use starknet::{ClassHash, get_caller_address};

    component!(path: OwnableComponent, storage: ownable, event: OwnableEvent);
    impl OwnableInternalImpl = OwnableComponent::InternalImpl<ContractState>;
    component!(path: UpgradeableComponent, storage: upgradeable, event: UpgradeableEvent);
    impl UpgradeableInternalImpl = UpgradeableComponent::InternalImpl<ContractState>;

    #[storage]
    struct Storage {
        #[substorage(v0)]
        ownable: OwnableComponent::Storage,
        #[substorage(v0)]
        upgradeable: UpgradeableComponent::Storage,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        #[flat]
        OwnableEvent: OwnableComponent::Event,
        #[flat]
        UpgradeableEvent: UpgradeableComponent::Event,
    }

    #[abi(embed_v0)]
    impl DailyBeforeD18Impl of super::IDailyBeforeD18<ContractState> {
        /// `PlayableComponent::build` of 07aab8a, without its game-over tail.
        fn build(
            ref self: ContractState,
            game_id: u32,
            orientation: Orientation,
            x: u32,
            y: u32,
            role: Role,
            spot: Spot,
        ) {
            build_before_d18(game_id, orientation, x, y, role, spot, true);
        }

        /// `TutoriableComponent::build` of 07aab8a, without its game-over tail: the placement,
        /// role and spot come from the script, and the seed is not stirred before the draw.
        fn build_tutorial(ref self: ContractState, game_id: u32) {
            let store: Store = StoreImpl::new();
            let game = store.live_game(game_id);
            let index = Bitmap::most_significant_bit(game.tiles).unwrap();
            let (orientation, x, y, role, spot) = super::tutorial_parameters(index.into());
            // [Check] Tile can be placed
            orientation.assert_is_valid();
            build_before_d18(game_id, orientation, x, y, role, spot, false);
        }

        fn upgrade(ref self: ContractState, new_class_hash: ClassHash) {
            self.ownable.assert_only_owner();
            self.upgradeable.upgrade(new_class_hash);
        }
    }

    /// The body shared by the two builds of 07aab8a; `daily` stirs the seed with the position
    /// before the draw, as `Daily` did (the Tutorial did not).
    fn build_before_d18(
        game_id: u32,
        orientation: Orientation,
        x: u32,
        y: u32,
        role: Role,
        spot: Spot,
        daily: bool,
    ) {
            // [Setup] Datastore
            let mut store: Store = StoreImpl::new();

            // [Check] Game exists
            let mut game = store.live_game(game_id);
            game.assert_exists();

            // [Check] Game has started
            game.assert_started();

            // [Check] Game is not over
            game.assert_not_over();

            // [Check] The caller is the player of the game: the game has one builder, its
            // player's, and anyone else has none
            let player_id: felt252 = get_caller_address().into();
            let mut builder = game.builder_of(player_id);
            builder.assert_exists();

            // [Check] Tile exists
            let mut tile = store.tile(game, builder.tile_id);
            tile.assert_exists();

            // [Check] Position not already taken
            let tile_position = store.tile_position(game, x, y);
            tile_position.assert_not_exists();

            // [Effect] Build tile
            let around = NeighborhoodTrait::read(game_id, x, y);
            builder.build(ref tile, orientation, x, y);

            // [Check] The tile fits its neighbours
            placement::assert_fits(tile, @around);

            // [Event] Tile built
            store
                .emit(
                    PavedEvent::Built(
                        Built {
                            game_id,
                            player_id: player_id,
                            tile_id: tile.id,
                            plan: tile.plan,
                            orientation: orientation.into(),
                            x,
                            y,
                            role: role.into(),
                            spot: spot.into(),
                        },
                    ),
                );

            // [Check] Character to place: its structure is idle
            let mut structures = StructuresTrait::new(game_id);
            let placing = role != Role::None && spot != Spot::None;
            if placing {
                game.assert_structure_idle(tile, spot, @around, ref structures);
            }

            // [Effect] Place the tile on the structure state
            let refs = game.place_structures(tile, @around, ref structures);

            if placing {
                // [Effect] Place character
                let character = builder.place(role, ref tile, spot);
                game.occupy_structure(tile, refs, spot, role, ref structures);

                // [Effect] Update character (written with the structure state, at the end)
                structures.put_character(character);
            }

            // [Effect] Update tile (written with its position by `flush`, after the assessment)
            structures.track(tile, refs);

            // [Effect] Assess game over
            game.assess_over();
            // [Info] The test ends its games under the new class
            assert(!game.is_over(), 'Legacy: game over');

            // [Effect] Draw a new tile
            if daily {
                game.reseed(tile);
            }
            let (tile_id, plan) = game.draw_plan();
            let new_tile = builder.reveal(tile_id, plan);
            store.set_tile(new_tile);

            // [Effect] Update builder: the tile in hand and the roles placed are part of the game
            // state, which the assessment recovers characters into
            game.set_builder(builder);

            // [Effect] Assessment, then what the move changed outside the game state: the record
            // pages, the `Characters` word and the built tile
            game.assess(tile, refs, @around, ref structures, ref store);
            structures.flush(store);

            // [Effect] Update game
            game.built += 1;
            store.set_game_state(game);
    }
}
