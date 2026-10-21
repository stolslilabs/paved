// Core imports

use core::dict::{Felt252Dict, Felt252DictTrait};
use core::hash::HashStateTrait;
use core::poseidon::{HashState, PoseidonTrait};

// Internal imports

use paved::constants;
use paved::helpers::bitmap::Bitmap;
use paved::helpers::random_deck::{bit_at, draw_from_bitmap};
use paved::models::builder::{Builder, BuilderTrait};
pub use paved::models::index::Game;
use paved::models::tile::{Tile, TileIntoLayout, TileTrait, ZeroableTile};
use paved::store::{Store, StoreImpl};
use paved::structure::assessment::{score_generic, score_wonder};
use paved::structure::forest::assess_forest;
use paved::structure::owners::{TallyTrait, player_of, structure_tally, wonder_tally};
use paved::structure::placement::{Neighborhood, NeighborhoodTrait};
use paved::structure::record::{open_of, ref_of};
use paved::structure::state::{Structures, StructuresTrait};
use paved::structure::{oriented, placement, tables};
use paved::types::area::Area;
use paved::types::category::{Category, CategoryImpl};
use paved::types::deck::{Deck, DeckImpl};
use paved::types::direction::{Direction, DirectionImpl};
use paved::types::layout::{Layout, LayoutImpl};
use paved::types::mode::{Mode, ModeTrait};
use paved::types::move::{Move, MoveImpl};
use paved::types::orientation::{IntoOrientationU8, IntoU8Orientation, Orientation};
use paved::types::plan::Plan;

pub mod errors {
    pub const INVALID_NAME: felt252 = 'Game: invalid name';
    pub const INVALID_HOST: felt252 = 'Game: invalid host';
    pub const INVALID_MODE: felt252 = 'Game: invalid mode';
    pub const INVALID_PRIZE: felt252 = 'Game: invalid prize';
    pub const INVALID_TILE_LIMIT: felt252 = 'Game: invalid tile limit';
    pub const INVALID_PLAYER_COUNT: felt252 = 'Game: invalid player count';
    pub const TRANSFER_SAME_HOST: felt252 = 'Game: transfer to same host';
    pub const GAME_NOT_EXISTS: felt252 = 'Game: does not exist';
    pub const GAME_ALREADY_STARTED: felt252 = 'Game: already started';
    pub const GAME_NOT_STARTED: felt252 = 'Game: not yet started';
    pub const GAME_IS_OVER: felt252 = 'Game: is over';
    pub const GAME_NOT_OVER: felt252 = 'Game: not over';
    pub const GAME_EXPIRED: felt252 = 'Game: expired';
    pub const BUILDERS_NOT_READY: felt252 = 'Game: builders not ready';
    pub const NO_RANDOM: felt252 = 'Game: no random';
}

/// Where each counter starts in `Game.counts` (the structures start at bit 0).
const FOREST_UNIT: u32 = 0x80;
const WONDER_UNIT: u32 = 0x2000;
const BIG_UNIT: u32 = 0x20000;
/// The free-game mark (cobbles v1, 4.2): bit 23 of `Game.counts`, above the four counters (23 bits,
/// each clamped to its width, so never carried into it). Set at a free spawn, never cleared.
pub const FREE_GAME: u32 = 0x800000;
/// The queue (#645, D-30, `Game.queue`): the plan of the next tile in bits 0..5, of the one after
/// it in bits 5..10 (plan codes are 1 to 19), and the VRF mark in bit 10.
const QUEUE_PLAN: u16 = 0x1f;
const QUEUE_AFTER: u16 = 0x20;
pub const QUEUE_VRF: u16 = 0x400;

#[inline]
fn min_u32(value: u32, max: u32) -> u32 {
    if value > max {
        max
    } else {
        value
    }
}

/// `2^index`, the bit of a card in the deck bitmap (`Bitmap::set_bit_at` computes it with a
/// loop of 256-bit products, which costs about 0.25M L2 gas; G5 reads it from a table instead of a
/// 128-bit power).
#[inline]
fn bit(index: u8) -> u128 {
    bit_at(index)
}

#[generate_trait]
pub impl GameImpl of GameTrait {
    #[inline]
    fn new(id: u32, time: u64, mode: Mode, player_id: felt252) -> Game {
        // [Check] Validate parameters
        let mode: Mode = mode.into();
        assert(Mode::None != mode, errors::INVALID_MODE);
        // [Check] The tile count is packed in 8 bits (`GameState`)
        let tile_limit: u16 = mode.deck().count().into();
        assert(tile_limit <= 255, errors::INVALID_TILE_LIMIT);
        // [Effect] Create the game
        // [Info] A game belongs to the player that spawns it
        Game {
            id,
            player_id,
            held_tile: 0,
            over: false,
            discarded: 0,
            built: 0,
            tiles: 0,
            tile_count: 0,
            start_time: 0,
            end_time: 0,
            score: 0,
            seed: 0,
            mode: mode.into(),
            day_id: 0,
            tile_limit,
            counts: 0,
            queue: 0,
        }
    }

    /// The builder of `player_id` in this game: the one of the game's player, the zero builder for
    /// anyone else (so `Builder: does not exist` reverts as it did with a builder per player).
    #[inline]
    fn builder_of(self: Game, player_id: felt252) -> Builder {
        if player_id != 0 && player_id == self.player_id {
            Builder { game_id: self.id, player_id, tile_id: self.held_tile }
        } else {
            Builder { game_id: self.id, player_id, tile_id: 0 }
        }
    }

    /// Takes the tile in hand back from the builder.
    #[inline]
    fn set_builder(ref self: Game, builder: Builder) {
        self.held_tile = builder.tile_id;
    }

    #[inline]
    fn price(self: Game) -> felt252 {
        let mode: Mode = self.mode.into();
        mode.price()
    }

    #[inline]
    fn duration(self: Game) -> u64 {
        let mode: Mode = self.mode.into();
        mode.duration()
    }

    #[inline]
    fn deck(self: Game) -> Deck {
        let mode: Mode = self.mode.into();
        mode.deck()
    }

    #[inline]
    fn is_payable(self: Game) -> bool {
        true
    }

    #[inline]
    fn nullify(ref self: Game) {
        // [Effect] Nullify the game
        self.over = false;
        self.tiles = 0;
        self.tile_count = 0;
        self.start_time = 0;
        self.score = 0;
        self.seed = 0;
    }

    #[inline]
    fn start(ref self: Game, time: u64, seed: felt252) -> Tile {
        // [Effect] Create the starter tile
        let tile_id = self.add_tile();
        let mut tile = TileTrait::new(self.id, tile_id, Plan::RFFFRFCFR);
        tile.orientation = Orientation::South.into();
        // [Info] Writing it places it on the structure state (`Store::set_tile`)

        // [Effect] Remove the starter tile from the deck
        let plan: Plan = tile.plan.into();
        let deck: Deck = self.deck();
        let mut indexes = deck.indexes(plan);
        let index = indexes.pop_front().unwrap();
        self.tiles = self.tiles | bit(index);

        // [Effect] Update game start time and seed (the seed comes from a `SeedSource`)
        self.seed = seed;
        self.tiles = deck.tiles(self.tiles, self.seed);
        self.start_time = time;

        tile
    }

    #[inline]
    fn is_over(self: Game) -> bool {
        self.over
    }

    /// The first second at which the game no longer takes a move: its start plus
    /// `constants::GAME_VALIDITY` (24 h). Read from `GameConfig.start_time`, so a game spawned
    /// before this rule gets the same 24 h from its own start.
    #[inline]
    fn expires_at(self: Game) -> u64 {
        self.start_time + constants::GAME_VALIDITY
    }

    #[inline]
    fn reseed(ref self: Game, tile: Tile) {
        let state: HashState = PoseidonTrait::new();
        let state = state.update(self.seed);
        let state = state.update(tile.x.into());
        let state = state.update(tile.y.into());
        self.seed = state.finalize();
    }

    /// Whether the game has one player (D-19): every tile is then that player's, so every
    /// structure scores for it and its tiles are not counted. The condition is the mode's
    /// (`Mode::solo`).
    #[inline]
    fn solo(self: Game) -> bool {
        let mode: Mode = self.mode.into();
        mode.solo()
    }

    #[inline]
    fn assess_over(ref self: Game) {
        self.over = self.tile_count >= self.tile_limit.into();
    }

    #[inline]
    fn surrender(ref self: Game) {
        // [Comment] Only available for solo mode
        self.over = true;
    }

    #[inline]
    fn add_tile(ref self: Game) -> u32 {
        self.tile_count += 1;
        self.tile_count
    }

    #[inline]
    fn add_score(ref self: Game, score: u32) {
        self.score += score;
    }

    /// A road or a city scored: counts a structure, and a big one from `constants::BIG_SIZE`
    /// tiles. The counters saturate at their bit width in `GameState`.
    #[inline]
    fn count_structure(ref self: Game, size: u32) {
        if self.counts & 0x7f != 0x7f {
            self.counts += 1;
        }
        if size >= constants::BIG_SIZE && (self.counts / BIG_UNIT) & 0x3f != 0x3f {
            self.counts += BIG_UNIT;
        }
    }

    /// A forest scored (one `Scored` per forest, even with 0 points).
    #[inline]
    fn count_forest(ref self: Game) {
        if (self.counts / FOREST_UNIT) & 0x3f != 0x3f {
            self.counts += FOREST_UNIT;
        }
    }

    /// A wonder scored.
    #[inline]
    fn count_wonder(ref self: Game) {
        if (self.counts / WONDER_UNIT) & 0xf != 0xf {
            self.counts += WONDER_UNIT;
        }
    }

    /// The counters packed: structures (7 bits), forests (6), wonders (4), big structures (6),
    /// each clamped to its width.
    fn counts_of(structures: u8, forests: u8, wonders: u8, big: u8) -> u32 {
        min_u32(structures.into(), 0x7f)
            + min_u32(forests.into(), 0x3f) * FOREST_UNIT
            + min_u32(wonders.into(), 0xf) * WONDER_UNIT
            + min_u32(big.into(), 0x3f) * BIG_UNIT
    }

    /// Whether the game was spawned free, on a credit (cobbles v1).
    fn is_free(self: Game) -> bool {
        self.counts & FREE_GAME != 0
    }

    fn structures(self: Game) -> u8 {
        (self.counts & 0x7f).try_into().unwrap()
    }

    fn forests(self: Game) -> u8 {
        ((self.counts / FOREST_UNIT) & 0x3f).try_into().unwrap()
    }

    fn wonders(self: Game) -> u8 {
        ((self.counts / WONDER_UNIT) & 0xf).try_into().unwrap()
    }

    fn big(self: Game) -> u8 {
        ((self.counts / BIG_UNIT) & 0x3f).try_into().unwrap()
    }

    #[inline]
    fn sub_score(ref self: Game, ref score: u32) {
        // [Check] Update score
        if self.score < score {
            score = self.score;
        }
        self.score -= score;
    }

    /// The plan of the tile after the tile in hand (0: none).
    #[inline]
    fn next_plan(self: Game) -> u8 {
        (self.queue & QUEUE_PLAN).try_into().unwrap()
    }

    /// The plan of the second tile after the tile in hand (0: none).
    #[inline]
    fn after_plan(self: Game) -> u8 {
        ((self.queue / QUEUE_AFTER) & QUEUE_PLAN).try_into().unwrap()
    }

    /// Whether the game draws from the VRF: spawned since #645, or moved to it by its first move
    /// since (`advance`).
    #[inline]
    fn is_vrf(self: Game) -> bool {
        self.queue & QUEUE_VRF != 0
    }

    /// Draws one plan from the deck with `seed`: the deck bitmap takes it out (and empties when
    /// it was the last tile, as `draw_plan`). The seed is not changed.
    fn pick(ref self: Game, seed: felt252) -> u8 {
        let deck: Deck = self.deck();
        let (plan_id, remaining) = draw_from_bitmap(seed, deck.total_count().into(), self.tiles);
        self.tiles = if remaining == 0 {
            0
        } else {
            self.tiles | bit(plan_id - 1)
        };
        deck.plan(plan_id.into()).into()
    }

    /// The draw index of the VRF draw that a build or a discard of `player_id` at `time` makes
    /// (#645): none when the move cannot be played (the game is over or expired, the caller is not
    /// its player; the move then reverts in `PlayableComponent`), ends the game, or leaves no tile
    /// to queue. A VRF game queues the tile `held + 3` while it is within the tile limit; a game
    /// spawned before #645 fills its hand and queue from one draw, salted with the id of the tile
    /// that comes into the hand.
    fn move_draw(self: Game, player_id: felt252, time: u64) -> Option<u32> {
        if self.over
            || player_id == 0
            || player_id != self.player_id
            || time >= self.expires_at()
            || self.tile_count >= self.tile_limit.into() {
            return Option::None;
        }
        if !self.is_vrf() {
            return Option::Some(self.tile_count + 1);
        }
        let index = self.tile_count + 3;
        if index <= self.tile_limit.into() {
            Option::Some(index)
        } else {
            Option::None
        }
    }

    /// Brings the next tile into the hand (#645, D-30): the game is not over. A VRF game takes
    /// the tile `next`, shifts `after` to `next` and draws the new `after` from `random` when its
    /// id is within the tile limit. A game with no queue (at spawn, or spawned before #645) draws
    /// the hand and both queue slots from one `random`: the hand from it, the next two from
    /// Poseidon(`random`, 1) and Poseidon(`random`, 2), each within the tile limit; it is then a
    /// VRF game. Returns the hand's tile id and plan, and the id of the first tile drawn (for the
    /// `Queued` events; above the queue's last id when nothing is drawn).
    fn advance(ref self: Game, random: Option<felt252>) -> (u32, Plan, u32) {
        let limit: u32 = self.tile_limit.into();
        let hand = self.tile_count + 1;
        let (plan, next, after, first) = if self.is_vrf() {
            let after = if hand + 2 <= limit {
                self.pick(random.expect(errors::NO_RANDOM))
            } else {
                0
            };
            (self.next_plan(), self.after_plan(), after, hand + 2)
        } else {
            let random = random.expect(errors::NO_RANDOM);
            let plan = self.pick(random);
            let next = if hand + 1 <= limit {
                self.pick(PoseidonTrait::new().update(random).update(1).finalize())
            } else {
                0
            };
            let after = if hand + 2 <= limit {
                self.pick(PoseidonTrait::new().update(random).update(2).finalize())
            } else {
                0
            };
            (plan, next, after, hand)
        };
        self.tile_count = hand;
        // The drawn tile is the tile in hand
        self.held_tile = hand;
        self.queue = QUEUE_VRF + next.into() + after.into() * QUEUE_AFTER;
        (hand, plan.into(), first)
    }

    #[inline]
    fn draw_plan(ref self: Game) -> (u32, Plan) {
        let deck: Deck = self.deck();
        let (plan, tiles) = {
            let number: u32 = deck.total_count().into();
            let (plan_id, remaining) = draw_from_bitmap(self.seed, number, self.tiles);
            let tiles = if remaining == 0 {
                0
            } else {
                let index = plan_id - 1;
                self.tiles | bit(index)
            };
            (deck.plan(plan_id.into()), tiles)
        };
        self.tiles = tiles;
        self.tile_count += 1;
        // The drawn tile is the tile in hand
        self.held_tile = self.tile_count;
        // Update the seed after draw
        let state = PoseidonTrait::new();
        let state = state.update(self.seed);
        let state = state.update(self.tile_count.into());
        self.seed = state.finalize();
        (self.tile_count, plan)
    }

    /// Places the built tile on the structure state (steps 1 and 2 of
    /// `docs/architecture/structure-state.md`): returns its refs.
    #[inline]
    fn place_structures(
        self: Game, tile: Tile, around: @Neighborhood, ref structures: Structures,
    ) -> u128 {
        placement::place(ref structures, tile, around)
    }

    /// Assesses the structures of the built tile (step 4), in the order of the walks: each start
    /// spot of the tile in `starts()` order, then the wonder of each neighbour, N, E, S, W, NW, NE,
    /// SE, SW. Every structure is read from its root and scores when it is closed (D-18: no
    /// character is needed); a forest is scanned when it is closed (`structure/forest.cairo`).
    ///
    /// A structure scores once per move: a root reached from two start spots is assessed at the
    /// first one only. Only the move that closes a structure reaches it with `open == 0`: a closed
    /// structure has no half-edge left towards an empty position, so no later tile joins it.
    ///
    /// D-19: a structure scores for its winner, the seat of the most of its tiles
    /// (`structure/owners.cairo`), counted by a walk on the move that closes it. In a game with one
    /// player (`solo`) the winner is that player (never 0: a game's player is the caller of its
    /// spawn) and nothing is walked.
    #[inline]
    fn assess(
        ref self: Game,
        tile: Tile,
        refs: u128,
        around: @Neighborhood,
        ref structures: Structures,
        ref store: Store,
    ) {
        let solo = self.solo();
        self.assess_with(solo, tile, refs, around, ref structures, ref store);
    }

    /// `assess`, with the single-player skip given: `solo` false counts the tiles of every
    /// structure that closes (the tests force it off to reach the majority and the tie).
    fn assess_with(
        ref self: Game,
        solo: bool,
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
                Category::Wonder => {
                    let winner = if solo {
                        self.player_id
                    } else {
                        let mut tally = wonder_tally(tile, ref structures);
                        player_of(self.player_id, tally.winner())
                    };
                    score_wonder(ref self, ref store, winner);
                },
                Category::Forest => assess_forest(
                    ref self, tile, refs, area, record, solo, around, ref structures, ref store,
                ),
                _ => {
                    let winner = if solo {
                        self.player_id
                    } else {
                        let mut tally = structure_tally(tile, refs, area, ref structures);
                        player_of(self.player_id, tally.winner())
                    };
                    score_generic(ref self, ref store, record, category, winner);
                },
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
                    let winner = if solo {
                        self.player_id
                    } else {
                        let mut tally = wonder_tally(around.tile(*direction), ref structures);
                        player_of(self.player_id, tally.winner())
                    };
                    score_wonder(ref self, ref store, winner);
                }
            }
        }
    }
}

#[generate_trait]
pub impl ZeroableGame of ZeroableGameTrait {
    #[inline]
    fn zero() -> Game {
        Game {
            id: 0,
            player_id: 0,
            held_tile: 0,
            over: false,
            discarded: 0,
            built: 0,
            tiles: 0,
            tile_count: 0,
            start_time: 0,
            end_time: 0,
            score: 0,
            seed: 0,
            mode: 0,
            day_id: 0,
            tile_limit: 0,
            counts: 0,
            queue: 0,
        }
    }

    #[inline]
    fn is_zero(self: Game) -> bool {
        0 == self.tile_count.into()
    }

    #[inline]
    fn is_non_zero(self: Game) -> bool {
        !self.is_zero()
    }
}

#[generate_trait]
pub impl GameAssert of AssertTrait {
    #[inline]
    fn assert_exists(self: Game) {
        assert(self.is_non_zero(), errors::GAME_NOT_EXISTS);
    }

    #[inline]
    fn assert_not_started(self: Game) {
        assert(0 == self.tile_count.into(), errors::GAME_ALREADY_STARTED);
    }

    #[inline]
    fn assert_started(self: Game) {
        assert(0 != self.tile_count.into(), errors::GAME_NOT_STARTED);
    }

    #[inline]
    fn assert_not_over(self: Game) {
        assert(!self.is_over(), errors::GAME_IS_OVER);
    }

    #[inline]
    fn assert_is_over(self: Game) {
        assert(self.is_over(), errors::GAME_NOT_OVER);
    }

    /// The game still takes a move at `time`: strictly before `expires_at`.
    #[inline]
    fn assert_not_expired(self: Game, time: u64) {
        assert(time < self.expires_at(), errors::GAME_EXPIRED);
    }
}


#[cfg(test)]
pub mod tests {
    // Core imports

    use core::dict::{Felt252Dict, Felt252DictTrait};

    // Local imports

    use super::{Deck, DeckImpl, Game, GameImpl, GameTrait, Mode, Plan, constants};

    // Constants

    pub const GAME_ID: u32 = 1;
    pub const NAME: felt252 = 'NAME';
    pub const PLAYER: felt252 = 'PLAYER';
    pub const MODE: Mode = Mode::Challenge;

    #[test]
    fn test_game_new() {
        let game = GameImpl::new(GAME_ID, 0, MODE, PLAYER);
        assert(game.id == GAME_ID, 'Game: Invalid id');
        assert(game.tiles == 0, 'Game: Invalid tiles');
        assert(game.tile_count == 0, 'Game: Invalid tile_count');
    }

    #[test]
    fn test_game_counters_saturate() {
        let mut game = GameImpl::new(GAME_ID, 0, MODE, PLAYER);
        game.count_structure(constants::BIG_SIZE - 1);
        assert(game.structures() == 1 && game.big() == 0, 'Game: small structure');
        game.count_structure(constants::BIG_SIZE);
        assert(game.structures() == 2 && game.big() == 1, 'Game: big structure');
        game.count_forest();
        game.count_wonder();
        assert(game.forests() == 1 && game.wonders() == 1, 'Game: forest, wonder');
        // [Assert] Saturation at the bit width in `GameState`
        game
            .counts =
                GameImpl::counts_of(
                    constants::MAX_STRUCTURES,
                    constants::MAX_FORESTS,
                    constants::MAX_WONDERS,
                    constants::MAX_BIG,
                );
        game.count_structure(constants::BIG_SIZE);
        game.count_forest();
        game.count_wonder();
        assert(game.structures() == constants::MAX_STRUCTURES, 'Game: structures max');
        assert(game.big() == constants::MAX_BIG, 'Game: big max');
        assert(game.forests() == constants::MAX_FORESTS, 'Game: forests max');
        assert(game.wonders() == constants::MAX_WONDERS, 'Game: wonders max');
    }

    #[test]
    fn test_game_add_tile() {
        let mut game = GameImpl::new(GAME_ID, 0, MODE, PLAYER);
        let tile_count = game.tile_count;
        let tile_id = game.add_tile();
        assert(tile_id == GAME_ID, 'Game: Invalid tile_id');
        assert(game.tile_count == tile_count + 1, 'Game: Invalid tile_count');
    }

    #[test]
    fn test_game_draw_plan() {
        let mut game = GameImpl::new(GAME_ID, 0, MODE, PLAYER);
        let (tile_count, plan_id) = game.draw_plan();
        let deck: Deck = game.deck();
        assert(tile_count == 1, 'Game: Invalid tile_count');
        assert(plan_id.into() < deck.total_count(), 'Game: Invalid plan_id');
        assert(game.tile_count == 1, 'Game: Invalid tile_count');
        assert(game.tiles > 0, 'Game: Invalid tiles');
    }

    #[test]
    fn test_game_draw_planes() {
        let mut game = GameImpl::new(GAME_ID, 0, MODE, PLAYER);
        let mut counts: Felt252Dict<u8> = Default::default();
        let deck: Deck = game.deck();
        loop {
            if game.tile_count == deck.total_count().into() {
                break;
            }
            let (_, plan) = game.draw_plan();
            let key: felt252 = plan.into();
            counts.insert(key, counts.get(key) + 1)
        }
        // [Assert] Each plan has been drawn the right amount of time
        assert(counts.get(Plan::None.into()) == 0, 'Game: None count');
        assert(counts.get(Plan::CCCCCCCCC.into()) == 1, 'Game: CCCCCCCCC count');
        assert(counts.get(Plan::CCCCCFFFC.into()) == 4, 'Game: CCCCCFFFC count');
        assert(counts.get(Plan::CCCCCFRFC.into()) == 3, 'Game: CCCCCFRFC count');
        assert(counts.get(Plan::CFFFCFFFC.into()) == 3, 'Game: CFFFCFFFC count');
        assert(counts.get(Plan::FFCFFFCFF.into()) == 3, 'Game: FFCFFFCFF count');
        assert(counts.get(Plan::FFCFFFFFC.into()) == 2, 'Game: FFCFFFFFC count');
        assert(counts.get(Plan::FFFFCCCFF.into()) == 5, 'Game: FFFFCCCFF count');
        assert(counts.get(Plan::FFFFFFCFF.into()) == 5, 'Game: FFFFFFCFF count');
        assert(counts.get(Plan::RFFFRFCFR.into()) == 4, 'Game: RFFFRFCFR count');
        assert(counts.get(Plan::RFFFRFFFR.into()) == 8, 'Game: RFFFRFFFR count');
        assert(counts.get(Plan::RFRFCCCFR.into()) == 5, 'Game: RFRFCCCFR count');
        assert(counts.get(Plan::RFRFFFCFR.into()) == 3, 'Game: RFRFFFCFR count');
        assert(counts.get(Plan::RFRFFFFFR.into()) == 9, 'Game: RFRFFFFFR count');
        assert(counts.get(Plan::RFRFRFCFF.into()) == 3, 'Game: RFRFRFCFF count');
        assert(counts.get(Plan::SFRFRFCFR.into()) == 3, 'Game: SFRFRFCFR count');
        assert(counts.get(Plan::SFRFRFFFR.into()) == 4, 'Game: SFRFRFFFR count');
        assert(counts.get(Plan::SFRFRFRFR.into()) == 1, 'Game: SFRFRFRFR count');
        assert(counts.get(Plan::WFFFFFFFF.into()) == 4, 'Game: WFFFFFFFF count');
        assert(counts.get(Plan::WFFFFFFFR.into()) == 2, 'Game: WFFFFFFFR count');

        // [Assert] Bitmap is empty
        assert(game.tiles == 0, 'Game: Invalid tiles');
    }
}
