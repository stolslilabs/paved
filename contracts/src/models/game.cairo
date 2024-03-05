// Core imports

use debug::PrintTrait;
use dict::{Felt252Dict, Felt252DictTrait};

// External imports

use origami::random::deck::{Deck, DeckTrait};

// Internal imports

use stolsli::constants;
use stolsli::store::{Store, StoreImpl};
use stolsli::events::{Scored};
use stolsli::helpers::bitmap::Bitmap;
use stolsli::helpers::generic::GenericCount;
use stolsli::helpers::forest::ForestCount;
use stolsli::helpers::wonder::WonderCount;
use stolsli::helpers::conflict::Conflict;
use stolsli::types::plan::Plan;
use stolsli::types::spot::{Spot, SpotImpl};
use stolsli::types::area::Area;
use stolsli::types::role::Role;
use stolsli::types::category::{Category, CategoryImpl};
use stolsli::types::layout::{Layout, LayoutImpl};
use stolsli::types::direction::{Direction, DirectionImpl};
use stolsli::types::orientation::Orientation;
use stolsli::types::move::{Move, MoveImpl};
use stolsli::models::player::{Player, PlayerImpl};
use stolsli::models::builder::{Builder, BuilderImpl};
use stolsli::models::character::{Character, CharacterPosition, CharacterImpl, CharacterAssert,};
use stolsli::models::tile::{Tile, TilePosition, TileImpl};
use stolsli::models::team::{Team, TeamImpl};

mod errors {
    const INVALID_NAME: felt252 = 'Game: invalid name';
    const INVALID_HOST: felt252 = 'Game: invalid host';
    const TRANSFER_SAME_HOST: felt252 = 'Game: transfer to same host';
    const PLAYER_NOT_HOST: felt252 = 'Game: player is not host';
    const PLAYER_IS_HOST: felt252 = 'Game: player is host';
    const GAME_NOT_EXISTS: felt252 = 'Game: does not exist';
    const GAME_ALREADY_STARTED: felt252 = 'Game: already started';
    const GAME_NOT_STARTED: felt252 = 'Game: not yet started';
    const STRUCTURE_NOT_IDLE: felt252 = 'Game: structure not idle';
    const GAME_IS_OVER: felt252 = 'Game: is over';
    const GAME_NOT_OVER: felt252 = 'Game: not over';
}

#[derive(Model, Copy, Drop, Serde)]
struct Game {
    #[key]
    id: u32,
    name: felt252,
    host: felt252,
    tiles: u128,
    tile_count: u32,
    start_time: u64,
    duration: u64,
    prize: felt252,
    score: u32,
}

#[generate_trait]
impl GameImpl of GameTrait {
    #[inline(always)]
    fn new(id: u32, name: felt252, host: felt252, time: u64, duration: u64) -> Game {
        // [Check] Validate parameters
        assert(host != 0, errors::INVALID_HOST);
        // TODO: Hard coded prize pool until it comes from player fees
        let prize = constants::PRIZE_POOL;
        Game { id, name, host, tiles: 0, tile_count: 0, start_time: 0, duration, prize, score: 0 }
    }

    #[inline(always)]
    fn nullify(ref self: Game) {
        // [Effect] Nullify the game
        self.name = 0;
        self.host = 0;
        self.tiles = 0;
        self.tile_count = 0;
        self.start_time = 0;
        self.duration = 0;
        self.prize = 0;
        self.score = 0;
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
    }

    #[inline(always)]
    fn transfer(ref self: Game, host: felt252) {
        assert(host != 0, errors::INVALID_HOST);
        assert(self.host != host, errors::TRANSFER_SAME_HOST);
        self.host = host;
    }

    #[inline(always)]
    fn start(ref self: Game, time: u64) {
        self.start_time = time;
    }

    #[inline(always)]
    fn is_over(self: Game, time: u64) -> bool {
        let endtime = self.start_time + self.duration;
        self.duration != 0 && time >= endtime
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
        ref team: Team,
        ref player: Player,
        score: u32,
        ref events: Array<Scored>
    ) {
        self.score += score;
        team.score += score;
        player.score += score;
        builder.score += score;
        let event = Scored {
            game_id: self.id,
            tile_id: 0,
            x: 0,
            y: 0,
            player_id: player.id,
            player_name: player.name,
            order_id: team.order,
            points: score
        };
        events.append(event);
    }

    #[inline(always)]
    fn sub_score(
        ref self: Game, ref builder: Builder, ref team: Team, ref player: Player, ref score: u32,
    ) {
        // [Check] Update score
        if builder.score < score {
            score = builder.score;
        };
        self.score -= score;
        team.score -= score;
        player.score -= score;
        builder.score -= score;
    }

    #[inline(always)]
    fn draw_plan(ref self: Game, seed: felt252) -> (u32, Plan) {
        let number: u32 = constants::TOTAL_TILE_COUNT.into();
        let mut deck: Deck = DeckTrait::from_bitmap(seed, number, self.tiles);
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
        (self.tile_count, plan_id.into())
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
            Category::Stop => { return; },
            Category::Wonder => {
                let (score, mut character) = WonderCount::start(self, tile, at, ref store);
                // [Effect] Solve and collect the character
                if 0 != score.into() {
                    WonderCount::solve(ref self, base, ref character, ref events, ref store);
                }
            },
        };
    }
}

impl ZeroableGame of Zeroable<Game> {
    #[inline(always)]
    fn zero() -> Game {
        Game {
            id: 0,
            name: 0,
            host: 0,
            tiles: 0,
            tile_count: 0,
            start_time: 0,
            duration: 0,
            prize: 0,
            score: 0
        }
    }

    #[inline(always)]
    fn is_zero(self: Game) -> bool {
        0 == self.host.into()
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
    fn assert_host(self: Game, host: felt252) {
        assert(self.host == host, errors::PLAYER_NOT_HOST);
    }

    #[inline(always)]
    fn assert_not_host(self: Game, host: felt252) {
        assert(self.host != host, errors::PLAYER_IS_HOST);
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
}


#[cfg(test)]
mod tests {
    // Core imports

    use debug::PrintTrait;
    use dict::{Felt252Dict, Felt252DictTrait};

    // Local imports

    use super::{Game, GameTrait, GameImpl, constants, Plan};

    // Constants

    const GAME_ID: u32 = 1;
    const NAME: felt252 = 'NAME';
    const HOST: felt252 = 'HOST';
    const SEED: felt252 = 'SEED';

    #[test]
    fn test_game_new() {
        let game = GameImpl::new(GAME_ID, NAME, HOST, 0, 0);
        assert(game.id == GAME_ID, 'Game: Invalid id');
        assert(game.tiles == 0, 'Game: Invalid tiles');
        assert(game.tile_count == 0, 'Game: Invalid tile_count');
    }

    #[test]
    fn test_game_add_tile() {
        let mut game = GameImpl::new(GAME_ID, NAME, HOST, 0, 0);
        let tile_count = game.tile_count;
        let tile_id = game.add_tile();
        assert(tile_id == GAME_ID, 'Game: Invalid tile_id');
        assert(game.tile_count == tile_count + 1, 'Game: Invalid tile_count');
    }

    #[test]
    fn test_game_draw_plan() {
        let mut game = GameImpl::new(GAME_ID, NAME, HOST, 0, 0);
        let (tile_count, plan_id) = game.draw_plan(SEED);
        assert(tile_count == 1, 'Game: Invalid tile_count');
        assert(plan_id.into() < constants::TOTAL_TILE_COUNT, 'Game: Invalid plan_id');
        assert(game.tile_count == 1, 'Game: Invalid tile_count');
        assert(game.tiles > 0, 'Game: Invalid tiles');
    }

    #[test]
    fn test_game_draw_planes() {
        let mut game = GameImpl::new(GAME_ID, NAME, HOST, 0, 0);
        let mut counts: Felt252Dict<u8> = Default::default();
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
