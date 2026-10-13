//! The build of `Daily` before D-19 (main at 7d04872, the D-18 class), frozen for one test: the
//! games that stay open across the D-19 upgrade (`e2e/upgrade_d19.cairo`).
//!
//! snforge declares only the classes of this package, so the D-18 class cannot be declared as it
//! was compiled. As `legacy.cairo` does for D-18, its build path is kept here as test-only code:
//! the code that D-19b changed, copied from 7d04872 (`Game::assess`, `structure/assessment.cairo`,
//! the forest scan of `structure/forest.cairo`, `PlayableComponent::build`), with its `paved::`
//! paths kept. The modules D-19b left alone (the store's existing maps, placement, the record
//! pages, the tables) are shared: D-19b only appends the `tile_owners` map to `PavedStorage`.
//! `DailyBeforeD19` runs `build` as `PlayableComponent::build` of 7d04872 did, on the same storage
//! node (`selector!("paved")`), and upgrades as `Daily` does (owner only). Its game-over tail
//! (tournament, quests) is left out: the test does not end its games.

use paved::types::orientation::Orientation;
use starknet::ClassHash;

#[starknet::interface]
pub trait IDailyBeforeD19<TContractState> {
    fn build(ref self: TContractState, game_id: u32, orientation: Orientation, x: u32, y: u32);
    fn upgrade(ref self: TContractState, new_class_hash: ClassHash);
}

/// `Game::assess` of 7d04872 and the scorers it calls: every structure scores for the game's
/// player.
pub mod assess {
    use core::dict::{Felt252Dict, Felt252DictTrait};
    use paved::events::{Event, Scored};
    use paved::helpers::multiplier::compute_multiplier;
    use paved::models::game::{Game, GameImpl};
    use paved::models::tile::Tile;
    use paved::store::{Store, StoreImpl};
    use paved::structure::placement::{Neighborhood, NeighborhoodTrait};
    use paved::structure::record::{open_of, ref_of, size_of};
    use paved::structure::state::{Structures, StructuresTrait};
    use paved::structure::{oriented, placement, tables};
    use paved::types::category::{Category, CategoryImpl};

    pub fn assess(
        ref game: Game,
        tile: Tile,
        refs: u128,
        around: @Neighborhood,
        ref structures: Structures,
        ref store: Store,
    ) {
        // [Info] The roots assessed by this move
        let mut done: Array<u32> = array![];

        // [Compute] The start spots of the tile
        let row = oriented::plan_row(tile.plan, tile.orientation);
        let mut count = oriented::start_count(row);
        let mut starts = oriented::starts(row);
        while count > 0 {
            let (_, area, rest) = oriented::next_start(starts);
            starts = rest;
            count -= 1;
            let area_row = oriented::area_row(tile.plan, tile.orientation, area);
            let category: Category = tables::row_category(area_row).into();
            let scorable = match category {
                Category::Road | Category::City | Category::Wonder | Category::Forest => true,
                _ => false,
            };
            if !scorable {
                continue;
            }
            let (root, record) = structures.find(ref_of(refs, area));
            if open_of(record) != 0 || placement::contains(done.span(), root) {
                continue;
            }
            done.append(root);
            match category {
                Category::Wonder => score_wonder(ref game, ref store),
                Category::Forest => assess_forest(
                    ref game, tile, refs, area, record, ref structures, ref store,
                ),
                _ => score_generic(ref game, ref store, record, category),
            }
        }

        // [Compute] The wonders of the neighbours
        let mut directions = array![
            tables::NORTH, tables::EAST, tables::SOUTH, tables::WEST, tables::NORTH_WEST,
            tables::NORTH_EAST, tables::SOUTH_EAST, tables::SOUTH_WEST,
        ]
            .span();
        while let Option::Some(direction) = directions.pop_front() {
            if *around.wonders & placement::bit(*direction) != 0 {
                let wonder = oriented::wonder_area(around.tile(*direction).plan);
                let (root, record) = structures.find(around.reference(*direction, wonder));
                if open_of(record) == 0 && !placement::contains(done.span(), root) {
                    done.append(root);
                    score_wonder(ref game, ref store);
                }
            }
        }
    }

    fn score_generic(ref game: Game, ref store: Store, record: u64, category: Category) {
        let size: u32 = size_of(record).into();
        let (num, den) = compute_multiplier(size);
        let points = size * category.base_points() * num / den;
        game.add_score(points);
        game.count_structure(size);
        store
            .emit(
                Event::Scored(
                    Scored {
                        game_id: game.id,
                        player_id: game.player_id,
                        category: category.into(),
                        size,
                        points,
                    },
                ),
            );
    }

    fn score_wonder(ref game: Game, ref store: Store) {
        let points = Category::Wonder.base_points();
        game.add_score(points);
        game.count_wonder();
        store
            .emit(
                Event::Scored(
                    Scored {
                        game_id: game.id,
                        player_id: game.player_id,
                        category: Category::Wonder.into(),
                        size: 0,
                        points,
                    },
                ),
            );
    }

    fn assess_forest(
        ref game: Game,
        tile: Tile,
        refs: u128,
        area: u8,
        record: u64,
        ref structures: Structures,
        ref store: Store,
    ) {
        let (open_road, roads, cities) = scan(game.id, tile, refs, area, ref structures);
        if open_road {
            return;
        }
        let size: u32 = size_of(record).into();
        let (num, den) = compute_multiplier(size);
        let points = (roads + cities) * Category::Forest.base_points() * num / den;
        game.add_score(points);
        game.count_forest();
        store
            .emit(
                Event::Scored(
                    Scored {
                        game_id: game.id,
                        player_id: game.player_id,
                        category: Category::Forest.into(),
                        size,
                        points,
                    },
                ),
            );
    }

    fn scan(
        game_id: u32, tile: Tile, refs: u128, area: u8, ref structures: Structures,
    ) -> (bool, u32, u32) {
        let mut visited: Felt252Dict<bool> = Default::default();
        let mut slots: Felt252Dict<felt252> = Default::default();
        if structures.built.id != 0 {
            let built = structures.built;
            slots
                .insert(
                    built.x.into() * 0x100000000 + built.y.into(),
                    StoreImpl::tile_slot(built, structures.built_refs),
                );
        }
        let mut road_roots: Felt252Dict<bool> = Default::default();
        let mut city_roots: Felt252Dict<bool> = Default::default();
        let mut roads: u32 = 0;
        let mut cities: u32 = 0;
        let mut open_road = false;
        let mut nodes: Array<(Tile, u128, u8)> = array![(tile, refs, area)];
        visited.insert(node_key(tile.id, area), true);
        while let Option::Some((node, node_refs, node_area)) = nodes.pop_front() {
            let north = tables::area_row(node.plan, node_area);
            let mut adjacent = tables::row_adjacent_roads(north);
            let mut other: u8 = 1;
            while adjacent != 0 {
                if adjacent & 1 != 0 {
                    let (road, record) = structures.find(ref_of(node_refs, other));
                    if open_of(record) != 0 {
                        open_road = true;
                        break;
                    }
                    if !road_roots.get(road.into()) {
                        road_roots.insert(road.into(), true);
                        roads += 1;
                    }
                }
                adjacent = adjacent / 2;
                other += 1;
            }
            if open_road {
                break;
            }
            let mut adjacent = tables::row_adjacent_cities(north);
            let mut other: u8 = 1;
            while adjacent != 0 {
                if adjacent & 1 != 0 {
                    let (city, record) = structures.find(ref_of(node_refs, other));
                    if open_of(record) == 0 && !city_roots.get(city.into()) {
                        city_roots.insert(city.into(), true);
                        cities += 1;
                    }
                }
                adjacent = adjacent / 2;
                other += 1;
            }
            let row = oriented::area_row(node.plan, node.orientation, node_area);
            let mut moves = tables::row_moves(row);
            let mut count = tables::row_move_count(row);
            while count > 0 {
                let (direction, at, rest) = oriented::next_move(moves);
                moves = rest;
                count -= 1;
                if at == 0 {
                    continue;
                }
                let (x, y) = toward(node.x, node.y, direction);
                let key: felt252 = x.into() * 0x100000000 + y.into();
                let mut slot = slots.get(key);
                if slot == 0 {
                    slot = StoreImpl::tile_slot_at(game_id, x, y);
                    assert(slot != 0, 'Forest scan: open forest');
                    slots.insert(key, slot);
                }
                let (next, next_refs) = StoreImpl::tile_of_slot(game_id, slot);
                let landing = oriented::area_of(
                    oriented::plan_row(next.plan, next.orientation), at,
                );
                let key = node_key(next.id, landing);
                if !visited.get(key) {
                    visited.insert(key, true);
                    nodes.append((next, next_refs, landing));
                }
            }
        }
        (open_road, roads, cities)
    }

    #[inline(always)]
    fn node_key(tile_id: u32, area: u8) -> felt252 {
        (tile_id * 16 + area.into()).into()
    }

    #[inline(always)]
    fn toward(x: u32, y: u32, direction: u8) -> (u32, u32) {
        match direction {
            1 => (x - 1, y + 1),
            2 => (x, y + 1),
            3 => (x + 1, y + 1),
            4 => (x + 1, y),
            5 => (x + 1, y - 1),
            6 => (x, y - 1),
            7 => (x - 1, y - 1),
            _ => (x - 1, y),
        }
    }
}

#[starknet::contract]
pub mod DailyBeforeD19 {
    use openzeppelin_upgrades::UpgradeableComponent;
    use paved::components::ownable::OwnableComponent;
    use paved::events::{Built, Event as PavedEvent};
    use paved::models::builder::{BuilderAssert, BuilderImpl};
    use paved::models::game::{GameAssert, GameImpl};
    use paved::models::tile::{TileAssert, TilePositionAssert};
    use paved::store::{Store, StoreImpl};
    use paved::structure::placement::{self, NeighborhoodTrait};
    use paved::structure::state::StructuresTrait;
    use paved::types::orientation::Orientation;
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
    impl DailyBeforeD19Impl of super::IDailyBeforeD19<ContractState> {
        /// `PlayableComponent::build` of 7d04872, without its game-over tail.
        fn build(ref self: ContractState, game_id: u32, orientation: Orientation, x: u32, y: u32) {
            // [Setup] Datastore
            let mut store: Store = StoreImpl::new();

            // [Check] Game exists, has started, is not over
            let mut game = store.live_game(game_id);
            game.assert_exists();
            game.assert_started();
            game.assert_not_over();

            // [Check] The caller is the player of the game
            let player_id: felt252 = get_caller_address().into();
            let mut builder = game.builder_of(player_id);
            builder.assert_exists();

            // [Check] Tile exists, position not already taken
            let mut tile = store.tile(game, builder.tile_id);
            tile.assert_exists();
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
                        },
                    ),
                );

            // [Effect] Place the tile on the structure state
            let mut structures = StructuresTrait::new(game_id);
            let refs = game.place_structures(tile, @around, ref structures);
            structures.track(tile, refs);

            // [Effect] Assess game over
            game.assess_over();
            // [Info] The test does not end its games under this class
            assert(!game.is_over(), 'Legacy: game over');

            // [Effect] Draw a new tile
            game.reseed(tile);
            let (tile_id, plan) = game.draw_plan();
            let new_tile = builder.reveal(tile_id, plan);
            store.set_tile(new_tile);
            game.set_builder(builder);

            // [Effect] Assessment (7d04872), then the record pages and the built tile
            super::assess::assess(ref game, tile, refs, @around, ref structures, ref store);
            structures.flush(store);

            // [Effect] Update game
            game.built += 1;
            store.set_game_state(game);
        }

        fn upgrade(ref self: ContractState, new_class_hash: ClassHash) {
            self.ownable.assert_only_owner();
            self.upgradeable.upgrade(new_class_hash);
        }
    }
}
