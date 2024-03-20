// Core imports

use core::debug::PrintTrait;
use core::dict::{Felt252Dict, Felt252DictTrait};

// External imports

use origami::random::deck::{Deck as OrigamiDeck, DeckTrait};

// Internal imports

use paved::constants;
use paved::store::{Store, StoreImpl};
use paved::events::{Scored};
use paved::helpers::bitmap::Bitmap;
use paved::helpers::generic::GenericCount;
use paved::helpers::forest::ForestCount;
use paved::helpers::wonder::WonderCount;
use paved::helpers::conflict::Conflict;
use paved::types::mode::Mode;
use paved::types::plan::Plan;
use paved::types::deck::{Deck, DeckImpl};
use paved::types::spot::{Spot, SpotImpl};
use paved::types::area::Area;
use paved::types::role::Role;
use paved::types::category::{Category, CategoryImpl};
use paved::types::layout::{Layout, LayoutImpl};
use paved::types::direction::{Direction, DirectionImpl};
use paved::types::orientation::Orientation;
use paved::types::move::{Move, MoveImpl};
use paved::models::player::{Player, PlayerImpl};
use paved::models::builder::{Builder, BuilderImpl};
use paved::models::character::{Character, CharacterPosition, CharacterImpl, CharacterAssert,};
use paved::models::tile::{Tile, TilePosition, TileImpl};

mod errors {
    const INVALID_NAME: felt252 = 'Game: invalid name';
    const INVALID_HOST: felt252 = 'Game: invalid host';
    const INVALID_MODE: felt252 = 'Game: invalid mode';
    const INVALID_PLAYER_COUNT: felt252 = 'Game: invalid player count';
    const TRANSFER_SAME_HOST: felt252 = 'Game: transfer to same host';
    const GAME_NOT_EXISTS: felt252 = 'Game: does not exist';
    const GAME_ALREADY_STARTED: felt252 = 'Game: already started';
    const GAME_NOT_STARTED: felt252 = 'Game: not yet started';
    const STRUCTURE_NOT_IDLE: felt252 = 'Game: structure not idle';
    const GAME_IS_OVER: felt252 = 'Game: is over';
    const GAME_NOT_OVER: felt252 = 'Game: not over';
    const BUILDERS_NOT_READY: felt252 = 'Game: builders not ready';
}

#[derive(Model, Copy, Drop, Serde)]
struct Game {
    #[key]
    id: u32,
    name: felt252,
    over: bool,
    players: u128,
    player_count: u32,
    tiles: u128,
    tile_count: u32,
    start_time: u64,
    duration: u64,
    prize: felt252,
    score: u32,
    mode: u8,
    deck: u8,
}

#[generate_trait]
impl GameImpl of GameTrait {
    #[inline(always)]
    fn new(id: u32, name: felt252, time: u64, duration: u64, mode: u8, deck: Deck) -> Game {
        // [Check] Validate parameters
        assert(Mode::None != mode.into(), errors::INVALID_MODE);
        // TODO: Hard coded prize pool until it comes from player fees
        let prize = constants::PRIZE_POOL;
        Game {
            id,
            name,
            over: false,
            players: 0,
            player_count: 0,
            tiles: 0,
            tile_count: 0,
            start_time: 0,
            duration,
            prize,
            score: 0,
            mode: mode.into(),
            deck: deck.into(),
        }
    }

    #[inline(always)]
    fn nullify(ref self: Game) {
        // [Effect] Nullify the game
        self.name = 0;
        self.player_count = 0;
        self.tiles = 0;
        self.tile_count = 0;
        self.start_time = 0;
        self.duration = 0;
        self.prize = 0;
        self.score = 0;
        self.mode = 0;
    }

    #[inline(always)]
    fn rename(ref self: Game, name: felt252) {
        // [Check] Validate parameters
        GameAssert::assert_valid_name(name);
        // [Effect] Update name
        self.name = name;
    }

    #[inline(always)]
    fn update(ref self: Game, time: u64, duration: u64) {
        // [Effect] Update duration
        self.duration = duration;
        self.reset();
    }

    #[inline(always)]
    fn join(ref self: Game) -> u32 {
        let index = self.player_count;
        self.player_count += 1;
        index
    }

    #[inline(always)]
    fn leave(ref self: Game) {
        self.player_count -= 1;
        self.reset();
    }

    #[inline(always)]
    fn reset(ref self: Game) {
        self.players = 0;
    }

    #[inline(always)]
    fn delete(ref self: Game) {
        self.nullify();
        self.reset();
    }

    #[inline(always)]
    fn ready(ref self: Game, index: u32, status: bool) {
        self.players = Bitmap::set_bit_at(self.players, index.into(), status);
    }

    #[inline(always)]
    fn start(ref self: Game, time: u64) -> Tile {
        // [Effect] Create the starter tile
        let tile_id = self.add_tile();
        let mut tile = TileImpl::new(self.id, tile_id, 0, Plan::RFFFRFCFR);
        tile.orientation = Orientation::South.into();

        // [Effect] Remove the starter tile from the deck
        let deck: Deck = self.deck.into();
        let plan: Plan = tile.plan.into();
        let mut indexes = deck.indexes(plan);
        let index = indexes.pop_front().unwrap();
        self.tiles = Bitmap::set_bit_at(self.tiles, index.into(), true);

        // [Effect] Update game start time
        self.start_time = time;

        tile
    }

    #[inline(always)]
    fn is_over(self: Game, time: u64) -> bool {
        let endtime = self.start_time + self.duration;
        return self.over || (self.duration != 0 && time >= endtime);
    }

    #[inline(always)]
    fn assess_over(ref self: Game) {
        let deck: Deck = self.deck.into();
        self.over = Mode::Solo == self.mode.into() && self.tile_count >= deck.count().into();
    }

    #[inline(always)]
    fn surrender(ref self: Game) {
        // [Comment] Only available for solo mode
        self.over = Mode::Solo == self.mode.into();
    }

    #[inline(always)]
    fn add_tile(ref self: Game) -> u32 {
        self.tile_count += 1;
        self.tile_count
    }

    #[inline(always)]
    fn add_score(
        ref self: Game,
        ref builder: Builder,
        ref player: Player,
        score: u32,
        ref events: Array<Scored>
    ) {
        if Mode::Solo == self.mode.into() {
            player.solo_score += score;
        } else if Mode::Multi == self.mode.into() {
            player.multi_score += score;
        };

        self.score += score;
        builder.score += score;
        let event = Scored {
            game_id: self.id,
            tile_id: 0,
            x: 0,
            y: 0,
            player_id: player.id,
            player_name: player.name,
            order_id: builder.order,
            points: score
        };
        events.append(event);
    }

    #[inline(always)]
    fn sub_score(ref self: Game, ref builder: Builder, ref player: Player, ref score: u32,) {
        // [Check] Update score
        if builder.score < score {
            score = builder.score;
        };
        if Mode::Solo == self.mode.into() {
            player.solo_score -= score;
        } else if Mode::Multi == self.mode.into() {
            player.multi_score -= score;
        };
        self.score -= score;
        builder.score -= score;
    }

    #[inline(always)]
    fn draw_plan(ref self: Game, seed: felt252) -> (u32, Plan) {
        let deck: Deck = self.deck.into();
        let number: u32 = deck.count().into();
        let mut deck: OrigamiDeck = DeckTrait::from_bitmap(seed, number, self.tiles);
        let plan_id: u32 = deck.draw().into();
        self.tile_count += 1;
        // Update bitmap if deck is not empty, otherwise reset
        self
            .tiles =
                if deck.remaining == 0 {
                    0
                } else {
                    let index = plan_id - 1;
                    Bitmap::set_bit_at(self.tiles, index.into(), true)
                };
        let deck: Deck = self.deck.into();
        (self.tile_count, deck.plan(plan_id))
    }

    fn assess(ref self: Game, tile: Tile, ref store: Store) -> Array<Scored> {
        // [Compute] Setup recursion
        let mut events: Array<Scored> = ArrayTrait::new();
        let layout: Layout = tile.into();
        let mut north_oriented_starts = tile.north_oriented_starts();
        loop {
            match north_oriented_starts.pop_front() {
                // [Compute] Process the current spot
                Option::Some(north_oriented_start) => {
                    // Update the tile according to previous assessments to avoid characters to be counted twice
                    let tile = store.tile(self, tile.id);
                    let start = north_oriented_start.rotate(tile.orientation.into());
                    let category: Category = layout.get_category(start);
                    self.assess_at(tile, start, category, ref events, ref store);
                },
                // [Check] Otherwise returns the characters
                Option::None => { break; },
            };
        };

        // [Compute] Assess wonders in the neighborhood
        let mut neighbors = store.neighborhood(self, tile.x, tile.y);
        loop {
            match neighbors.pop_front() {
                // [Compute] Process the current neighbor
                Option::Some(neighbor) => {
                    let start = neighbor.north_oriented_wonder();
                    // [Check] Skip if there is no wonder
                    if start != Spot::None {
                        self.assess_at(neighbor, start, Category::Wonder, ref events, ref store);
                    };
                },
                // [Check] Otherwise returns the characters
                Option::None => { break; },
            };
        };
        events
    }

    #[inline(always)]
    fn assess_at(
        ref self: Game,
        tile: Tile,
        at: Spot,
        category: Category,
        ref events: Array<Scored>,
        ref store: Store
    ) {
        // [Compute] Assess the spot
        let base = category.base_points();
        match category {
            Category::None => { return; },
            Category::Forest => {
                let (count, woodsman_score, herdsman_score, mut woodsmen, mut herdsmen) =
                    ForestCount::start(
                    self, tile, at, ref store
                );
                // [Effect] Solve and collect characters
                if 0 != count.into() && 0 != woodsmen.len().into() {
                    ForestCount::solve(
                        ref self, count, woodsman_score, base, ref woodsmen, ref events, ref store
                    );
                }
                if 0 != count.into() && 0 != herdsmen.len().into() {
                    ForestCount::solve(
                        ref self, count, herdsman_score, base, ref herdsmen, ref events, ref store
                    );
                }
            },
            Category::Road => {
                let (count, score, mut characters) = GenericCount::start(self, tile, at, ref store);
                // [Effect] Solve and collect characters
                if 0 != score.into() && 0 != characters.len().into() {
                    GenericCount::solve(
                        ref self, count, score, base, ref characters, ref events, ref store
                    );
                }
            },
            Category::City => {
                let (count, score, mut characters) = GenericCount::start(self, tile, at, ref store);
                // [Effect] Solve and collect characters
                if 0 != score.into() && 0 != characters.len().into() {
                    GenericCount::solve(
                        ref self, count, score, base, ref characters, ref events, ref store
                    );
                }
            },
            Category::Wonder => {
                let (score, mut character) = WonderCount::start(self, tile, at, ref store);
                // [Effect] Solve and collect the character
                if 0 != score.into() {
                    WonderCount::solve(ref self, base, ref character, ref events, ref store);
                }
            },
            _ => { return; },
        };
    }
}

impl ZeroableGame of core::Zeroable<Game> {
    #[inline(always)]
    fn zero() -> Game {
        Game {
            id: 0,
            name: 0,
            over: false,
            players: 0,
            player_count: 0,
            tiles: 0,
            tile_count: 0,
            start_time: 0,
            duration: 0,
            prize: 0,
            score: 0,
            mode: 0,
            deck: 0,
        }
    }

    #[inline(always)]
    fn is_zero(self: Game) -> bool {
        0 == self.player_count.into()
    }

    #[inline(always)]
    fn is_non_zero(self: Game) -> bool {
        !self.is_zero()
    }
}

#[generate_trait]
impl GameAssert of AssertTrait {
    #[inline(always)]
    fn assert_exists(self: Game) {
        assert(self.is_non_zero(), errors::GAME_NOT_EXISTS);
    }

    #[inline(always)]
    fn assert_not_started(self: Game) {
        assert(0 == self.tile_count.into(), errors::GAME_ALREADY_STARTED);
    }

    #[inline(always)]
    fn assert_started(self: Game) {
        assert(0 != self.tile_count.into(), errors::GAME_NOT_STARTED);
    }

    #[inline(always)]
    fn assert_structure_idle(self: Game, tile: Tile, at: Spot, ref store: Store) {
        let status = Conflict::start(self, tile, at, ref store);
        assert(!status, errors::STRUCTURE_NOT_IDLE);
    }

    #[inline(always)]
    fn assert_not_over(self: Game, time: u64) {
        assert(!self.is_over(time), errors::GAME_IS_OVER);
    }

    #[inline(always)]
    fn assert_over(self: Game, time: u64) {
        assert(self.is_over(time), errors::GAME_NOT_OVER);
    }

    #[inline(always)]
    fn assert_valid_name(name: felt252) {
        assert(name != 0, errors::INVALID_NAME);
    }

    #[inline(always)]
    fn assert_is_solo(self: Game) {
        assert(self.mode == Mode::Solo.into(), errors::INVALID_MODE);
    }

    #[inline(always)]
    fn assert_is_multi(self: Game) {
        assert(self.mode == Mode::Multi.into(), errors::INVALID_MODE);
    }

    #[inline(always)]
    fn assert_deletable(self: Game) {
        assert(self.player_count == 1, errors::INVALID_PLAYER_COUNT);
    }

    #[inline(always)]
    fn assert_startable(self: Game) {
        let readiness = Bitmap::two_pow(self.player_count.into()) - 1;
        assert(self.players == readiness, errors::BUILDERS_NOT_READY);
    }
}


#[cfg(test)]
mod tests {
    // Core imports

    use core::debug::PrintTrait;
    use core::dict::{Felt252Dict, Felt252DictTrait};

    // Local imports

    use super::{Game, GameTrait, GameImpl, constants, Plan, Mode, Deck};

    // Constants

    const GAME_ID: u32 = 1;
    const NAME: felt252 = 'NAME';
    const SEED: felt252 = 'SEED';

    #[test]
    fn test_game_new() {
        let game = GameImpl::new(GAME_ID, NAME, 0, 0, Mode::Multi.into(), Deck::Enhanced.into());
        assert(game.id == GAME_ID, 'Game: Invalid id');
        assert(game.tiles == 0, 'Game: Invalid tiles');
        assert(game.tile_count == 0, 'Game: Invalid tile_count');
    }

    #[test]
    fn test_game_add_tile() {
        let mut game = GameImpl::new(
            GAME_ID, NAME, 0, 0, Mode::Multi.into(), Deck::Enhanced.into()
        );
        let tile_count = game.tile_count;
        let tile_id = game.add_tile();
        assert(tile_id == GAME_ID, 'Game: Invalid tile_id');
        assert(game.tile_count == tile_count + 1, 'Game: Invalid tile_count');
    }

    #[test]
    fn test_game_draw_plan() {
        let mut game = GameImpl::new(
            GAME_ID, NAME, 0, 0, Mode::Multi.into(), Deck::Enhanced.into()
        );
        let (tile_count, plan_id) = game.draw_plan(SEED);
        assert(tile_count == 1, 'Game: Invalid tile_count');
        assert(plan_id.into() < constants::TOTAL_TILE_COUNT, 'Game: Invalid plan_id');
        assert(game.tile_count == 1, 'Game: Invalid tile_count');
        assert(game.tiles > 0, 'Game: Invalid tiles');
    }

    #[test]
    fn test_game_draw_planes() {
        let mut game = GameImpl::new(
            GAME_ID, NAME, 0, 0, Mode::Multi.into(), Deck::Enhanced.into()
        );
        let mut counts: Felt252Dict<u8> = core::Default::default();
        loop {
            if game.tile_count == constants::TOTAL_TILE_COUNT.into() {
                break;
            }
            let (_, plan) = game.draw_plan(SEED);
            let key: felt252 = plan.into();
            counts.insert(key, counts.get(key) + 1)
        };
        // [Assert] Each plan has been drawn the right amount of time
        assert(counts.get(Plan::None.into()) == 0, 'Game: None count');
        assert(counts.get(Plan::CCCCCCCCC.into()) == 1, 'Game: CCCCCCCCC count');
        assert(counts.get(Plan::CCCCCFFFC.into()) == 4, 'Game: CCCCCFFFC count');
        assert(counts.get(Plan::CCCCCFRFC.into()) == 3, 'Game: CCCCCFRFC count');
        assert(counts.get(Plan::CFCFCCCCC.into()) == 1, 'Game: CFCFCCCCC count');
        assert(counts.get(Plan::CFCFCFCFC.into()) == 1, 'Game: CFCFCFCFC count');
        assert(counts.get(Plan::CFCFCFFFC.into()) == 1, 'Game: CFCFCFFFC count');
        assert(counts.get(Plan::CFFCFCFFC.into()) == 1, 'Game: CFFCFCFFC count');
        assert(counts.get(Plan::CFFFCFFFC.into()) == 3, 'Game: CFFFCFFFC count');
        assert(counts.get(Plan::CFFFCFRFC.into()) == 3, 'Game: CFFFCFRFC count');
        assert(counts.get(Plan::FCCFCCCFC.into()) == 1, 'Game: FCCFCCCFC count');
        assert(counts.get(Plan::FCCFCFCFC.into()) == 1, 'Game: FCCFCFCFC count');
        assert(counts.get(Plan::FFCFCCCFF.into()) == 1, 'Game: FFCFCCCFF count');
        assert(counts.get(Plan::FFCFCFCFC.into()) == 1, 'Game: FFCFCFCFC count');
        assert(counts.get(Plan::FFCFFFCCC.into()) == 1, 'Game: FFCFFFCCC count');
        assert(counts.get(Plan::FFCFFFCFC.into()) == 1, 'Game: FFCFFFCFC count');
        assert(counts.get(Plan::FFCFFFCFF.into()) == 3, 'Game: FFCFFFCFF count');
        assert(counts.get(Plan::FFCFFFFFC.into()) == 2, 'Game: FFCFFFFFC count');
        assert(counts.get(Plan::FFFFCCCFF.into()) == 5, 'Game: FFFFCCCFF count');
        assert(counts.get(Plan::FFFFFFCFF.into()) == 5, 'Game: FFFFFFCFF count');
        assert(counts.get(Plan::RFFFFFCFR.into()) == 2, 'Game: RFFFFFCFR count');
        assert(counts.get(Plan::RFFFRFCFF.into()) == 2, 'Game: RFFFRFCFF count');
        assert(counts.get(Plan::RFFFRFCFR.into()) == 4, 'Game: RFFFRFCFR count');
        assert(counts.get(Plan::RFFFRFFFR.into()) == 9, 'Game: RFFFRFFFR count');
        assert(counts.get(Plan::RFRFCCCFF.into()) == 2, 'Game: RFRFCCCFF count');
        assert(counts.get(Plan::RFRFCCCFR.into()) == 5, 'Game: RFRFCCCFR count');
        assert(counts.get(Plan::RFRFFFCCC.into()) == 2, 'Game: RFRFFFCCC count');
        assert(counts.get(Plan::RFRFFFCFF.into()) == 2, 'Game: RFRFFFCFF count');
        assert(counts.get(Plan::RFRFFFCFR.into()) == 3, 'Game: RFRFFFCFR count');
        assert(counts.get(Plan::RFRFFFFFR.into()) == 10, 'Game: RFRFFFFFR count');
        assert(counts.get(Plan::RFRFRFCFF.into()) == 3, 'Game: RFRFRFCFF count');
        assert(counts.get(Plan::SFFFFFFFR.into()) == 2, 'Game: SFFFFFFFR count');
        assert(counts.get(Plan::SFRFRFCFR.into()) == 3, 'Game: SFRFRFCFR count');
        assert(counts.get(Plan::SFRFRFFFR.into()) == 5, 'Game: SFRFRFFFR count');
        assert(counts.get(Plan::SFRFRFRFR.into()) == 2, 'Game: SFRFRFRFR count');
        assert(counts.get(Plan::WCCCCCCCC.into()) == 1, 'Game: WCCCCCCCC count');
        assert(counts.get(Plan::WFFFFFFFF.into()) == 2, 'Game: WFFFFFFFF count');
        assert(counts.get(Plan::WFFFFFFFR.into()) == 1, 'Game: WFFFFFFFR count');

        // [Assert] Bitmap is empty
        assert(game.tiles == 0, 'Game: Invalid tiles');
    }
}
