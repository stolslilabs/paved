use paved::types::deck::DeckTrait;
// Core imports

use core::poseidon::{PoseidonTrait, HashState};
use core::hash::HashStateTrait;
use core::debug::PrintTrait;

// External imports

use origami_random::deck::{Deck as OrigamiDeck, DeckTrait as OrigamiDeckTrait};

// Internal imports

use paved::constants;
use paved::models::tournament::TournamentTrait;
use paved::types::deck::{Deck, DeckImpl};
use paved::types::plan::{Plan, PlanImpl};
use paved::types::orientation::Orientation;
use paved::types::role::Role;
use paved::types::spot::Spot;
use paved::helpers::bitmap::Bitmap;

// Constants

const NONE: felt252 = 0;
const DAILY: felt252 = 'DAILY';
const WEEKLY: felt252 = 'WEEKLY';
const TUTORIAL: felt252 = 'TUTORIAL';
const DUEL: felt252 = 'DUEL';

#[derive(Copy, Drop, Serde, PartialEq)]
enum Mode {
    None,
    Daily,
    Weekly,
    Tutorial,
    Duel,
}

#[generate_trait]
impl ModeImpl of ModeTrait {
    #[inline]
    fn is_surrenderable(self: Mode) -> bool {
        self != Mode::Duel
    }

    #[inline]
    fn player_cap(self: Mode) -> u8 {
        match self {
            Mode::Daily => 1,
            Mode::Weekly => 1,
            Mode::Tutorial => 1,
            Mode::Duel => 2,
            _ => 0,
        }
    }

    #[inline]
    fn price(self: Mode) -> felt252 {
        match self {
            Mode::Daily => constants::DAILY_TOURNAMENT_PRICE,
            Mode::Weekly => constants::WEEKLY_TOURNAMENT_PRICE,
            Mode::Tutorial => 0,
            Mode::Duel => 0,
            _ => 0,
        }
    }

    #[inline]
    fn duration(self: Mode) -> u64 {
        match self {
            Mode::Daily => constants::DAILY_TOURNAMENT_DURATION,
            Mode::Weekly => constants::WEEKLY_TOURNAMENT_DURATION,
            _ => 0,
        }
    }

    #[inline]
    fn seed(self: Mode, time: u64, game_id: u32, salt: felt252) -> felt252 {
        match self {
            Mode::Daily => {
                let tournament_id = TournamentTrait::compute_id(time, self.duration());
                let state: HashState = PoseidonTrait::new();
                let state = state.update(salt);
                let state = state.update(tournament_id.into());
                state.finalize()
            },
            Mode::Weekly => {
                let state: HashState = PoseidonTrait::new();
                let state = state.update(salt);
                let state = state.update(game_id.into());
                let state = state.update(time.into());
                state.finalize()
            },
            Mode::Tutorial => 0,
            Mode::Duel => {
                let state: HashState = PoseidonTrait::new();
                let state = state.update(salt);
                let state = state.update(game_id.into());
                let state = state.update(time.into());
                state.finalize()
            },
            _ => 0,
        }
    }

    #[inline]
    fn deck(self: Mode) -> Deck {
        match self {
            Mode::Daily => Deck::Simple,
            Mode::Weekly => Deck::Base,
            Mode::Tutorial => Deck::Tutorial,
            Mode::Duel => Deck::Base,
            _ => Deck::None,
        }
    }

    #[inline]
    fn draw(self: Mode, seed: felt252, tiles: u128) -> (Plan, u128) {
        match self {
            Mode::Daily => self.standard_draw(seed, tiles),
            Mode::Weekly => self.standard_draw(seed, tiles),
            Mode::Tutorial => {
                let deck: Deck = self.deck();
                if tiles == 0 {
                    return (deck.plan(0), 1);
                };
                let index: u8 = 1 + Bitmap::most_significant_bit(tiles).unwrap();
                let plan: Plan = deck.plan(index.into());
                let tiles = Bitmap::set_bit_at(tiles, index.into(), true);
                (plan, tiles)
            },
            Mode::Duel => self.reset_draw(seed, tiles),
            _ => (Plan::None, tiles),
        }
    }

    #[inline]
    fn parameters(self: Mode, tiles: u128) -> (Orientation, u32, u32, Role, Spot) {
        let deck: Deck = self.deck();
        let index = Bitmap::most_significant_bit(tiles).unwrap();
        deck.parameters(index.into())
    }
}

#[generate_trait]
impl Private of PrivateTrait {
    #[inline]
    fn standard_draw(self: Mode, seed: felt252, tiles: u128) -> (Plan, u128) {
        let game_deck: Deck = self.deck();
        let number: u32 = game_deck.total_count().into();
        let mut deck: OrigamiDeck = OrigamiDeckTrait::from_bitmap(seed, number, tiles);
        let plan_id: u8 = deck.draw().into();
        // Update bitmap if deck is not empty, otherwise reset
        let index = plan_id - 1;
        let tiles = Bitmap::set_bit_at(tiles, index.into(), true);
        (game_deck.plan(plan_id.into()), tiles)
    }

    #[inline]
    fn reset_draw(self: Mode, seed: felt252, tiles: u128) -> (Plan, u128) {
        let game_deck: Deck = self.deck();
        let number: u32 = game_deck.total_count().into();
        let mut deck: OrigamiDeck = OrigamiDeckTrait::from_bitmap(seed, number, tiles);
        let plan_id: u8 = deck.draw().into();
        // Update bitmap if deck is not empty, otherwise reset
        let tiles = if deck.remaining == 0 {
            0
        } else {
            let index = plan_id - 1;
            Bitmap::set_bit_at(tiles, index.into(), true)
        };
        (game_deck.plan(plan_id.into()), tiles)
    }
}

impl IntoModeFelt252 of core::Into<Mode, felt252> {
    #[inline]
    fn into(self: Mode) -> felt252 {
        match self {
            Mode::Daily => DAILY,
            Mode::Weekly => WEEKLY,
            Mode::Tutorial => TUTORIAL,
            Mode::Duel => DUEL,
            _ => NONE,
        }
    }
}

impl IntoModeU8 of core::Into<Mode, u8> {
    #[inline]
    fn into(self: Mode) -> u8 {
        match self {
            Mode::Daily => 1,
            Mode::Weekly => 2,
            Mode::Tutorial => 3,
            Mode::Duel => 4,
            _ => 0,
        }
    }
}

impl IntoU8Mode of core::Into<u8, Mode> {
    #[inline]
    fn into(self: u8) -> Mode {
        match self {
            0 => Mode::None,
            1 => Mode::Daily,
            2 => Mode::Weekly,
            3 => Mode::Tutorial,
            4 => Mode::Duel,
            _ => Mode::None,
        }
    }
}

impl ModePrint of PrintTrait<Mode> {
    #[inline]
    fn print(self: Mode) {
        let felt: felt252 = self.into();
        felt.print();
    }
}

#[cfg(test)]
mod tests {
    // Core imports

    use core::debug::PrintTrait;

    // Local imports

    use super::{Mode, ModeTrait, NONE, DAILY, WEEKLY, TUTORIAL, Deck};

    // Constants

    const UNKNOWN_FELT: felt252 = 'UNKNOWN';
    const UNKNOWN_U8: u8 = 42;

    #[test]
    fn test_mode_into_felt() {
        assert(NONE == Mode::None.into(), 'Mode: wrong None');
        assert(DAILY == Mode::Daily.into(), 'Mode: wrong Daily');
        assert(WEEKLY == Mode::Weekly.into(), 'Mode: wrong Weekly');
        assert(TUTORIAL == Mode::Tutorial.into(), 'Mode: wrong Tutorial');
    }

    #[test]
    fn test_felt_into_mode() {
        assert(NONE == Mode::None.into(), 'Mode: wrong None');
        assert(DAILY == Mode::Daily.into(), 'Mode: wrong Daily');
        assert(WEEKLY == Mode::Weekly.into(), 'Mode: wrong Weekly');
        assert(TUTORIAL == Mode::Tutorial.into(), 'Mode: wrong Tutorial');
    }

    #[test]
    fn test_mode_into_u8() {
        assert(0_u8 == Mode::None.into(), 'Mode: wrong None');
        assert(1_u8 == Mode::Daily.into(), 'Mode: wrong Daily');
        assert(2_u8 == Mode::Weekly.into(), 'Mode: wrong Weekly');
        assert(3_u8 == Mode::Tutorial.into(), 'Mode: wrong Tutorial');
    }

    #[test]
    fn test_u8_into_mode() {
        assert(Mode::None == 0_u8.into(), 'Mode: wrong None');
        assert(Mode::Daily == 1_u8.into(), 'Mode: wrong Daily');
        assert(Mode::Weekly == 2_u8.into(), 'Mode: wrong Weekly');
        assert(Mode::Tutorial == 3_u8.into(), 'Mode: wrong Tutorial');
    }

    #[test]
    fn test_unknown_u8_into_mode() {
        assert(Mode::None == UNKNOWN_U8.into(), 'Mode: wrong Unknown');
    }

    #[test]
    fn test_mode_deck() {
        let mode: Mode = Mode::Duel;
        assert(Deck::Base == mode.deck(), 'Mode: wrong deck');
    }
}
