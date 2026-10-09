//! The economy of the paid Daily game (P8, `docs/architecture/economy.md`, sections 1, 2, 5 and 6,
//! P-31).
//!
//! - `purchase` (the game only): the price `P` is already on `Economy` (`Daily` pulls it from the
//!   player). 5 % goes to the referrer, if any; `BURN_BPS` (70 %) is swapped to PAVED through the
//!   Ekubo router (transfer, `swap`, `clear_minimum`, `clear`, in one call) and burned; the rest,
//!   with any USDC the router gave back, goes to the Vault, at once. The game's terms are frozen:
//!   the reference reward `R` (the PAVED bought, price-guarded, times the stake boost and the
//!   supply factor read after the burn) and the curve in force. `Economy` holds nothing after the
//!   call.
//! - `record` (the game only): the game's score; a game that ended within its day with a score of
//!   at least 100 enters the day's accumulator.
//! - `settle` (anyone, after the day): the day's mean is fixed on its first settlement (option B)
//!   and pushed once into the EMA; each recorded game is paid `R x h(score / mean)`, minted to its
//!   player, once.
//! - `configure`, `set_pool` (the owner, bounded and evented), `set_game` (the owner, once). The
//!   mean has no setter. No upgrade.
//!
//! The arithmetic lives in `curve` and `mean`.

// Internal imports

use paved::economy::ekubo::PoolKey;
use paved::economy::mean::Ema;

// Starknet imports

use starknet::ContractAddress;

// Constants

/// The price of one stake unit: 2 USDC (6 decimals).
pub const BASE_PRICE: u256 = 2_000_000;
pub const MAX_STAKE: u8 = 10;
pub const DAY: u64 = 86400;
/// One PAVED in base units (18 decimals).
pub const PAVED: u128 = 1_000_000_000_000_000_000;

// Bounds of `configure` (section 6)

pub const MIN_BURN_BPS: u16 = 5_000;
pub const MAX_BURN_BPS: u16 = 9_000;
pub const MIN_SIGMA_BPS: i16 = -3_000;
pub const MAX_SIGMA_BPS: i16 = 5_000;
pub const MIN_SLOPE_BPS: u32 = 1_000;
pub const MAX_SLOPE_BPS: u32 = 50_000;
pub const MIN_CAP: u8 = 1;
pub const MAX_CAP: u8 = 20;
pub const MIN_TARGET: u128 = 100_000 * PAVED;
pub const MAX_TARGET: u128 = 10_000_000 * PAVED;

/// The tunable parameters; a purchase freezes them into its game's terms.
#[derive(Copy, Drop, Serde, PartialEq, Debug)]
pub struct Config {
    /// The share of the price swapped and burned (bps).
    pub burn_bps: u16,
    /// The shift of the cliff from the mean (bps, signed).
    pub sigma_bps: i16,
    /// The slope `c` of the curve (bps).
    pub slope_bps: u32,
    /// The cap `H` of the curve, in units of `R`.
    pub cap: u8,
    /// The supply target `T` of the supply factor (PAVED base units).
    pub target: u128,
}

/// The decided configuration (P-31): 70 % burned, sigma 0, c 1.813, H 5, T 1,000,000 PAVED.
pub fn decided() -> Config {
    Config { burn_bps: 7_000, sigma_bps: 0, slope_bps: 18_130, cap: 5, target: 1_000_000 * PAVED }
}

/// Reverts unless every parameter is within the bounds of section 6.
pub fn validate(config: Config) {
    assert(
        config.burn_bps >= MIN_BURN_BPS && config.burn_bps <= MAX_BURN_BPS,
        'Economy: burn out of bounds',
    );
    assert(
        config.sigma_bps >= MIN_SIGMA_BPS && config.sigma_bps <= MAX_SIGMA_BPS,
        'Economy: sigma out of bounds',
    );
    assert(
        config.slope_bps >= MIN_SLOPE_BPS && config.slope_bps <= MAX_SLOPE_BPS,
        'Economy: slope out of bounds',
    );
    assert(config.cap >= MIN_CAP && config.cap <= MAX_CAP, 'Economy: cap out of bounds');
    assert(
        config.target >= MIN_TARGET && config.target <= MAX_TARGET, 'Economy: target out of bounds',
    );
}

/// What a purchase of `stake` would pay and get now (the price of the current EMA and rate).
#[derive(Copy, Drop, Serde, PartialEq, Debug)]
pub struct Quote {
    pub price: u256,
    pub burn_quote: u256,
    /// What a referrer gets, when there is one; it comes out of the margin.
    pub referral: u256,
    /// The margin without a referrer.
    pub margin: u256,
    /// An estimate only: 99 % of the burn quote at the guard's swap rate. Never send it as
    /// `min_out`: the client quotes the pool and sends 99 % of that.
    pub min_out_hint: u256,
    /// The supply factor at the current supply (bps).
    pub factor: u32,
    /// Today's prior if today has one, else the EMA (points x 1,000).
    pub mean: u64,
    /// The cliff at that mean (points x 1,000).
    pub threshold: u64,
    pub slope: u32,
    pub cap: u8,
}

#[derive(Copy, Drop, Serde, PartialEq, Debug)]
/// A day's prior; its sum, weight and mean stay 0 until it closes (P-34).
pub struct DayView {
    pub prior: u64,
    pub sum: u128,
    pub weight: u32,
    pub mean: u64,
    pub closed: bool,
}

#[derive(Copy, Drop, Serde, PartialEq, Debug)]
pub struct TermsView {
    pub player: ContractAddress,
    pub time: u64,
    pub day: u64,
    pub stake: u8,
    pub reference: u128,
    pub sigma_bps: i16,
    pub slope_bps: u32,
    pub cap: u8,
    pub score: u32,
    pub recorded: bool,
    pub expired: bool,
    pub settled: bool,
    pub reward: u128,
}

#[derive(Copy, Drop, Serde, PartialEq, Debug)]
pub struct Addresses {
    pub paved: ContractAddress,
    pub usdc: ContractAddress,
    pub vault: ContractAddress,
    pub router: ContractAddress,
    pub game: ContractAddress,
}

/// The quote `MockRouter` serves on devnet (`quote(token_in, amount_in) -> amount_out`, the pool's
/// fee included). Ekubo's router has another shape (`quote_swap(RouteNode, TokenAmount) -> Delta`),
/// so `Economy.quote_swap` serves devnet only (`docs/architecture/economy.md`, section 5).
#[starknet::interface]
pub trait IQuote<TContractState> {
    fn quote(self: @TContractState, token_in: ContractAddress, amount_in: u128) -> u128;
}

#[starknet::interface]
pub trait IEconomy<TContractState> {
    /// Splits the price already on `Economy`, swaps and burns, pays the referrer and the Vault,
    /// freezes the game's terms; returns `R`. The game only.
    fn purchase(
        ref self: TContractState,
        game_id: u32,
        player: ContractAddress,
        day: u64,
        stake: u8,
        price: u256,
        referrer: ContractAddress,
        min_out: u256,
    ) -> u128;
    /// Records a purchased game's score, once. Before its expiry (24 h after its purchase) the
    /// score enters the mean of its purchase day; at or after it, the game is expired: no reward,
    /// no mean. The game only.
    fn record(ref self: TContractState, game_id: u32, score: u32);
    /// Pays every recorded game of `game_ids` from the end of the day after its purchase day; a
    /// game already settled is skipped. Returns the PAVED minted. Anyone.
    fn settle(ref self: TContractState, game_ids: Span<u32>) -> u256;
    /// Sets the parameters for the next purchases, within the bounds. The owner only.
    fn configure(ref self: TContractState, config: Config);
    /// Sets the PAVED/USDC pool and the swap's price bound. The owner only.
    fn set_pool(ref self: TContractState, pool_key: PoolKey, sqrt_ratio_limit: u256);
    /// Sets the game allowed to purchase and record, once. The owner only.
    fn set_game(ref self: TContractState, game: ContractAddress);
    fn quote(self: @TContractState, stake: u8) -> Quote;
    /// The PAVED the pool pays now for `usdc_in`, its fee included, from the router's quote
    /// (devnet: `MockRouter.quote`). The client takes `min_out` from it.
    fn quote_swap(self: @TContractState, usdc_in: u256) -> u256;
    fn day(self: @TContractState, day: u64) -> DayView;
    fn terms(self: @TContractState, game_id: u32) -> TermsView;
    fn config(self: @TContractState) -> Config;
    /// The EMA (sum and weight) and its mean, points x 1,000.
    fn ema(self: @TContractState) -> (Ema, u64);
    /// The guard's swap rate: PAVED base units per USDC base unit, x 1e18. It moves at most once
    /// per block.
    fn rate(self: @TContractState) -> u256;
    fn pool(self: @TContractState) -> (PoolKey, u256);
    fn addresses(self: @TContractState) -> Addresses;
    fn owner(self: @TContractState) -> ContractAddress;
}

#[starknet::contract]
pub mod Economy {
    // Core imports

    use core::num::traits::Zero;

    // External imports

    use openzeppelin_interfaces::erc20::{IERC20Dispatcher, IERC20DispatcherTrait};

    // Internal imports

    use paved::economy::curve;
    use paved::economy::ekubo::{
        IClearDispatcher, IClearDispatcherTrait, IRouterDispatcher, IRouterDispatcherTrait, PoolKey,
        RouteNode, TokenAmount, i129,
    };
    use paved::economy::mean::{Day, DayTrait, Ema, EmaTrait};
    use paved::economy::token::{IPavedTokenDispatcher, IPavedTokenDispatcherTrait};

    // Starknet imports

    use starknet::storage::{
        Map, StorageMapReadAccess, StorageMapWriteAccess, StoragePointerReadAccess,
        StoragePointerWriteAccess,
    };
    use starknet::{ContractAddress, get_block_timestamp, get_caller_address, get_contract_address};

    // Local imports

    use super::{
        Addresses, BASE_PRICE, Config, DAY, DayView, IEconomy, IQuoteDispatcher,
        IQuoteDispatcherTrait, MAX_STAKE, Quote, TermsView, validate,
    };

    // Errors

    pub mod errors {
        pub const NOT_OWNER: felt252 = 'Economy: not owner';
        pub const NOT_GAME: felt252 = 'Economy: not the game';
        pub const GAME_SET: felt252 = 'Economy: game already set';
        pub const ZERO_ADDRESS: felt252 = 'Economy: zero address';
        pub const WRONG_POOL: felt252 = 'Economy: wrong pool';
        pub const WRONG_STAKE: felt252 = 'Economy: wrong stake';
        pub const WRONG_PRICE: felt252 = 'Economy: wrong price';
        pub const WRONG_DAY: felt252 = 'Economy: wrong day';
        pub const PURCHASED: felt252 = 'Economy: already purchased';
        pub const NOT_PAID: felt252 = 'Economy: price not paid';
        pub const UNKNOWN_GAME: felt252 = 'Economy: unknown game';
        pub const RECORDED: felt252 = 'Economy: already recorded';
        pub const NOT_RECORDED: felt252 = 'Economy: not recorded';
        pub const TOO_EARLY: felt252 = 'Economy: day cannot close yet';
        pub const ZERO_RATE: felt252 = 'Economy: zero rate';
        pub const RATE_OVERFLOW: felt252 = 'Economy: rate overflow';
        pub const AMOUNT_TOO_LARGE: felt252 = 'Economy: amount too large';
        pub const BELOW_MIN_OUT: felt252 = 'Economy: swap below min_out';
        pub const TRANSFER_FAILED: felt252 = 'Economy: transfer failed';
    }

    // Packed records

    const TWO_POW_8: u256 = 0x100;
    const TWO_POW_16: u256 = 0x10000;
    const TWO_POW_32: u256 = 0x100000000;
    const TWO_POW_40: u256 = 0x10000000000;
    const TWO_POW_128: u256 = 0x100000000000000000000000000000000;
    const SIGMA_OFFSET: i32 = 32768;

    const PURCHASED: u8 = 0;
    const RECORDED: u8 = 1;
    const SETTLED: u8 = 2;

    /// What a purchase freezes (one slot): `R`, the purchase time (its day and its expiry) and
    /// the curve in force.
    #[derive(Copy, Drop, PartialEq, Debug)]
    struct Terms {
        reference: u128,
        /// Packed in 40 bits (until the year 36,000).
        time: u64,
        stake: u8,
        sigma_bps: i16,
        slope_bps: u32,
        cap: u8,
    }

    /// The price guard's swap rate and the block time of its last move (one slot). The rate moves
    /// at most once per block.
    #[derive(Copy, Drop, PartialEq, Debug)]
    struct Guard {
        rate: u128,
        updated: u64,
    }

    impl GuardStorePacking of starknet::storage_access::StorePacking<Guard, felt252> {
        fn pack(value: Guard) -> felt252 {
            let packed: u256 = value.rate.into() + value.updated.into() * TWO_POW_128;
            packed.try_into().unwrap()
        }

        fn unpack(value: felt252) -> Guard {
            let packed: u256 = value.into();
            Guard { rate: packed.low, updated: packed.high.try_into().unwrap() }
        }
    }

    /// What the game's end and its settlement write (one slot).
    #[derive(Copy, Drop, PartialEq, Debug)]
    struct Outcome {
        score: u32,
        status: u8,
        /// Recorded at or after its expiry: no reward, no mean.
        expired: bool,
        reward: u128,
    }

    fn sigma_to_u16(sigma: i16) -> u256 {
        let shifted: i32 = sigma.into() + SIGMA_OFFSET;
        let shifted: u32 = shifted.try_into().unwrap();
        shifted.into()
    }

    fn sigma_from_u16(value: u256) -> i16 {
        let value: u32 = value.try_into().unwrap();
        let value: i32 = value.try_into().unwrap();
        (value - SIGMA_OFFSET).try_into().unwrap()
    }

    impl TermsStorePacking of starknet::storage_access::StorePacking<Terms, felt252> {
        fn pack(value: Terms) -> felt252 {
            let mut high: u256 = value.cap.into();
            high = high * TWO_POW_32 + value.slope_bps.into();
            high = high * TWO_POW_16 + sigma_to_u16(value.sigma_bps);
            high = high * TWO_POW_8 + value.stake.into();
            assert(value.time.into() < TWO_POW_40, 'Economy: time overflow');
            high = high * TWO_POW_40 + value.time.into();
            let packed: u256 = value.reference.into() + high * TWO_POW_128;
            packed.try_into().unwrap()
        }

        fn unpack(value: felt252) -> Terms {
            let packed: u256 = value.into();
            let mut high: u256 = packed.high.into();
            let time = (high % TWO_POW_40).try_into().unwrap();
            high /= TWO_POW_40;
            let stake = (high % TWO_POW_8).try_into().unwrap();
            high /= TWO_POW_8;
            let sigma_bps = sigma_from_u16(high % TWO_POW_16);
            high /= TWO_POW_16;
            let slope_bps = (high % TWO_POW_32).try_into().unwrap();
            high /= TWO_POW_32;
            let cap = high.try_into().unwrap();
            Terms { reference: packed.low, time, stake, sigma_bps, slope_bps, cap }
        }
    }

    impl OutcomeStorePacking of starknet::storage_access::StorePacking<Outcome, felt252> {
        fn pack(value: Outcome) -> felt252 {
            let expired: u256 = if value.expired {
                1
            } else {
                0
            };
            let high: u256 = value.score.into()
                + value.status.into() * TWO_POW_32
                + expired * TWO_POW_32 * TWO_POW_8;
            let packed: u256 = value.reward.into() + high * TWO_POW_128;
            packed.try_into().unwrap()
        }

        fn unpack(value: felt252) -> Outcome {
            let packed: u256 = value.into();
            let high: u256 = packed.high.into();
            Outcome {
                reward: packed.low,
                score: (high % TWO_POW_32).try_into().unwrap(),
                status: (high / TWO_POW_32 % TWO_POW_8).try_into().unwrap(),
                expired: high / (TWO_POW_32 * TWO_POW_8) != 0,
            }
        }
    }

    impl ConfigStorePacking of starknet::storage_access::StorePacking<Config, felt252> {
        fn pack(value: Config) -> felt252 {
            let mut high: u256 = value.cap.into();
            high = high * TWO_POW_32 + value.slope_bps.into();
            high = high * TWO_POW_16 + sigma_to_u16(value.sigma_bps);
            high = high * TWO_POW_16 + value.burn_bps.into();
            let packed: u256 = value.target.into() + high * TWO_POW_128;
            packed.try_into().unwrap()
        }

        fn unpack(value: felt252) -> Config {
            let packed: u256 = value.into();
            let mut high: u256 = packed.high.into();
            let burn_bps = (high % TWO_POW_16).try_into().unwrap();
            high /= TWO_POW_16;
            let sigma_bps = sigma_from_u16(high % TWO_POW_16);
            high /= TWO_POW_16;
            let slope_bps = (high % TWO_POW_32).try_into().unwrap();
            high /= TWO_POW_32;
            let cap = high.try_into().unwrap();
            Config { burn_bps, sigma_bps, slope_bps, cap, target: packed.low }
        }
    }

    // Storage

    #[storage]
    struct Storage {
        owner: ContractAddress,
        game: ContractAddress,
        paved: ContractAddress,
        usdc: ContractAddress,
        vault: ContractAddress,
        router: ContractAddress,
        /// The pool key's fee, tick spacing and extension (its tokens are PAVED and USDC).
        pool_fee: u128,
        tick_spacing: u128,
        extension: ContractAddress,
        sqrt_ratio_limit: u256,
        config: Config,
        ema: Ema,
        guard: Guard,
        /// The player of a purchased game (zero: not purchased).
        players: Map<u32, ContractAddress>,
        terms: Map<u32, Terms>,
        outcomes: Map<u32, Outcome>,
        days: Map<u64, Day>,
        /// A closed day's mean (zero: open).
        means: Map<u64, u64>,
    }

    // Events

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        Purchased: Purchased,
        Recorded: Recorded,
        DayClosed: DayClosed,
        Settled: Settled,
        EconomyConfigured: EconomyConfigured,
        PoolSet: PoolSet,
        GameSet: GameSet,
    }

    #[derive(Drop, Debug, PartialEq, starknet::Event)]
    pub struct Purchased {
        #[key]
        pub game_id: u32,
        #[key]
        pub player_id: felt252,
        pub day: u64,
        pub stake: u8,
        pub price: u256,
        pub referrer: ContractAddress,
        pub referral: u256,
        pub burned_quote: u256,
        pub burned: u256,
        pub margin: u256,
        pub supply: u256,
        pub factor: u32,
        pub reference: u128,
    }

    #[derive(Drop, Debug, PartialEq, starknet::Event)]
    pub struct Recorded {
        #[key]
        pub game_id: u32,
        pub score: u32,
        pub expired: bool,
    }

    #[derive(Drop, Debug, PartialEq, starknet::Event)]
    pub struct DayClosed {
        #[key]
        pub day: u64,
        pub mean: u64,
        pub weight: u32,
        pub prior: u64,
        pub ema_after: u64,
    }

    #[derive(Drop, Debug, PartialEq, starknet::Event)]
    pub struct Settled {
        #[key]
        pub game_id: u32,
        #[key]
        pub player_id: felt252,
        pub day: u64,
        pub score: u32,
        pub threshold: u64,
        pub reward: u128,
    }

    #[derive(Drop, Debug, PartialEq, starknet::Event)]
    pub struct EconomyConfigured {
        pub burn_bps: u16,
        pub sigma_bps: i16,
        pub slope_bps: u32,
        pub cap: u8,
        pub target: u128,
    }

    #[derive(Drop, Debug, PartialEq, starknet::Event)]
    pub struct PoolSet {
        pub pool_key: PoolKey,
        pub sqrt_ratio_limit: u256,
    }

    #[derive(Drop, Debug, PartialEq, starknet::Event)]
    pub struct GameSet {
        pub game: ContractAddress,
    }

    // Constructor

    /// `mean` is the initial mean (points x 1,000, at least 100 points); `rate` the guard's
    /// initial swap rate (PAVED base units per USDC base unit x 1e18, after the pool's fee; not
    /// zero).
    #[constructor]
    fn constructor(
        ref self: ContractState,
        owner: ContractAddress,
        paved: ContractAddress,
        usdc: ContractAddress,
        vault: ContractAddress,
        router: ContractAddress,
        pool_key: PoolKey,
        sqrt_ratio_limit: u256,
        config: Config,
        mean: u64,
        rate: u256,
    ) {
        // [Check] Addresses
        assert(owner.is_non_zero(), errors::ZERO_ADDRESS);
        assert(paved.is_non_zero() && usdc.is_non_zero(), errors::ZERO_ADDRESS);
        assert(vault.is_non_zero() && router.is_non_zero(), errors::ZERO_ADDRESS);
        // [Check] The guard is on from the first purchase
        assert(rate != 0, errors::ZERO_RATE);
        // [Effect] Store them, the pool, the configuration and the initial mean
        self.owner.write(owner);
        self.paved.write(paved);
        self.usdc.write(usdc);
        self.vault.write(vault);
        self.router.write(router);
        self.write_pool(pool_key, sqrt_ratio_limit);
        self.write_config(config);
        self.ema.write(EmaTrait::new(mean));
        let rate: u128 = rate.try_into().expect(errors::RATE_OVERFLOW);
        self.guard.write(Guard { rate, updated: 0 });
    }

    // Implementations

    #[abi(embed_v0)]
    impl EconomyImpl of IEconomy<ContractState> {
        fn purchase(
            ref self: ContractState,
            game_id: u32,
            player: ContractAddress,
            day: u64,
            stake: u8,
            price: u256,
            referrer: ContractAddress,
            min_out: u256,
        ) -> u128 {
            // [Check] The game, the stake, its price, today, a new game
            self.assert_game();
            assert(stake >= 1 && stake <= MAX_STAKE, errors::WRONG_STAKE);
            assert(price == stake.into() * BASE_PRICE, errors::WRONG_PRICE);
            assert(day == get_block_timestamp() / DAY, errors::WRONG_DAY);
            assert(player.is_non_zero(), errors::ZERO_ADDRESS);
            assert(self.players.read(game_id).is_zero(), errors::PURCHASED);
            let this = get_contract_address();
            let usdc = IERC20Dispatcher { contract_address: self.usdc.read() };
            assert(usdc.balance_of(this) >= price, errors::NOT_PAID);

            // [Effect] The game is purchased; the day gets its prior on its first purchase
            self.players.write(game_id, player);
            let mut today = self.days.read(day);
            if today.prior == 0 {
                today = DayTrait::new(self.ema.read().mean());
                self.days.write(day, today);
            }

            // [Interaction] The referral, out of the margin
            let config = self.config.read();
            let referred = referrer.is_non_zero() && referrer != player;
            let (referral, quote, _) = curve::split(price, config.burn_bps, referred);
            if referral != 0 {
                assert(usdc.transfer(referrer, referral), errors::TRANSFER_FAILED);
            }

            // [Interaction] Swap the burn quote, burn the whole PAVED balance (what it bought, and
            // anything sent to the router or to Economy before)
            let bought = self.swap(usdc, quote, min_out);
            let paved = IERC20Dispatcher { contract_address: self.paved.read() };
            let burned = paved.balance_of(this);
            IPavedTokenDispatcher { contract_address: paved.contract_address }.burn(burned);

            // [Interaction] The margin, and any USDC the router gave back, to the Vault
            let margin = usdc.balance_of(this);
            if margin != 0 {
                assert(usdc.transfer(self.vault.read(), margin), errors::TRANSFER_FAILED);
            }

            // [Compute] R: the guarded PAVED the swap paid out, the stake boost, the supply after
            // the burn
            let supply = paved.total_supply();
            let factor = curve::supply_factor(supply, config.target.into());
            let guard = self.guard.read();
            let rate: u256 = guard.rate.into();
            let counted = curve::guarded(bought, quote, rate);
            let reference = curve::reference(counted, stake, factor);

            // [Effect] The rate, at most once per block, and the terms
            let now = get_block_timestamp();
            if now != guard.updated {
                let next = curve::next_rate(rate, bought, quote);
                self
                    .guard
                    .write(
                        Guard { rate: next.try_into().expect(errors::RATE_OVERFLOW), updated: now },
                    );
            }
            let terms = Terms {
                reference,
                time: get_block_timestamp(),
                stake,
                sigma_bps: config.sigma_bps,
                slope_bps: config.slope_bps,
                cap: config.cap,
            };
            self.terms.write(game_id, terms);
            self
                .emit(
                    Purchased {
                        game_id,
                        player_id: player.into(),
                        day,
                        stake,
                        price,
                        referrer: if referred {
                            referrer
                        } else {
                            Zero::zero()
                        },
                        referral,
                        burned_quote: quote,
                        burned,
                        margin,
                        supply,
                        factor,
                        reference,
                    },
                );
            reference
        }

        fn record(ref self: ContractState, game_id: u32, score: u32) {
            // [Check] The game, a purchased game, not yet recorded
            self.assert_game();
            assert(self.players.read(game_id).is_non_zero(), errors::UNKNOWN_GAME);
            let outcome = self.outcomes.read(game_id);
            assert(outcome.status == PURCHASED, errors::RECORDED);

            // [Effect] The score; before its expiry, it enters the mean of its purchase day (P-34)
            let terms = self.terms.read(game_id);
            let expired = get_block_timestamp() >= terms.time + DAY;
            self.outcomes.write(game_id, Outcome { score, status: RECORDED, expired, reward: 0 });
            let day = terms.time / DAY;
            if !expired && self.means.read(day) == 0 {
                let mut state = self.days.read(day);
                state.add(score, terms.stake);
                self.days.write(day, state);
            }
            self.emit(Recorded { game_id, score, expired });
        }

        fn settle(ref self: ContractState, game_ids: Span<u32>) -> u256 {
            let now = get_block_timestamp();
            let token = IPavedTokenDispatcher { contract_address: self.paved.read() };
            let mut minted: u256 = 0;
            for game_id in game_ids {
                let game_id = *game_id;
                // [Check] A recorded game, not settled, whose day can close: from the end of the
                // next day, when every game of the day has ended or expired (P-34)
                let player = self.players.read(game_id);
                assert(player.is_non_zero(), errors::UNKNOWN_GAME);
                let outcome = self.outcomes.read(game_id);
                if outcome.status == SETTLED {
                    continue;
                }
                assert(outcome.status == RECORDED, errors::NOT_RECORDED);
                let terms = self.terms.read(game_id);
                let day = terms.time / DAY;
                assert(now >= (day + 2) * DAY, errors::TOO_EARLY);

                // [Compute] The reward against the day's mean; an expired game gets nothing
                let mean = self.close(day);
                let threshold = curve::threshold(mean, terms.sigma_bps);
                let reward = if outcome.expired {
                    0
                } else {
                    curve::payout(
                        terms.reference, outcome.score, threshold, terms.slope_bps, terms.cap,
                    )
                };

                // [Effect] Settled, once
                self
                    .outcomes
                    .write(
                        game_id,
                        Outcome {
                            score: outcome.score, status: SETTLED, expired: outcome.expired, reward,
                        },
                    );
                self
                    .emit(
                        Settled {
                            game_id,
                            player_id: player.into(),
                            day,
                            score: outcome.score,
                            threshold,
                            reward,
                        },
                    );

                // [Interaction] Mint
                if reward != 0 {
                    token.mint(player, reward.into());
                    minted += reward.into();
                }
            }
            minted
        }

        fn configure(ref self: ContractState, config: Config) {
            self.assert_owner();
            self.write_config(config);
        }

        fn set_pool(ref self: ContractState, pool_key: PoolKey, sqrt_ratio_limit: u256) {
            self.assert_owner();
            self.write_pool(pool_key, sqrt_ratio_limit);
        }

        fn set_game(ref self: ContractState, game: ContractAddress) {
            // [Check] The owner, once, a real address
            self.assert_owner();
            assert(self.game.read().is_zero(), errors::GAME_SET);
            assert(game.is_non_zero(), errors::ZERO_ADDRESS);
            // [Effect] Set it for good
            self.game.write(game);
            self.emit(GameSet { game });
        }

        fn quote(self: @ContractState, stake: u8) -> Quote {
            assert(stake >= 1 && stake <= MAX_STAKE, errors::WRONG_STAKE);
            let config = self.config.read();
            let price = stake.into() * BASE_PRICE;
            let (referral, burn_quote, _) = curve::split(price, config.burn_bps, true);
            let supply = IERC20Dispatcher { contract_address: self.paved.read() }.total_supply();
            let prior = self.days.read(get_block_timestamp() / DAY).prior;
            let mean = if prior != 0 {
                prior
            } else {
                self.ema.read().mean()
            };
            let rate: u256 = self.guard.read().rate.into();
            Quote {
                price,
                burn_quote,
                referral,
                margin: price - burn_quote,
                min_out_hint: burn_quote * rate * 99 / (100 * curve::RATE_SCALE),
                factor: curve::supply_factor(supply, config.target.into()),
                mean,
                threshold: curve::threshold(mean, config.sigma_bps),
                slope: config.slope_bps,
                cap: config.cap,
            }
        }

        fn quote_swap(self: @ContractState, usdc_in: u256) -> u256 {
            let amount: u128 = usdc_in.try_into().expect(errors::AMOUNT_TOO_LARGE);
            IQuoteDispatcher { contract_address: self.router.read() }
                .quote(self.usdc.read(), amount)
                .into()
        }

        fn day(self: @ContractState, day: u64) -> DayView {
            let state = self.days.read(day);
            let mean = self.means.read(day);
            if mean == 0 {
                return DayView { prior: state.prior, sum: 0, weight: 0, mean: 0, closed: false };
            }
            DayView { prior: state.prior, sum: state.sum, weight: state.weight, mean, closed: true }
        }

        fn terms(self: @ContractState, game_id: u32) -> TermsView {
            let terms = self.terms.read(game_id);
            let outcome = self.outcomes.read(game_id);
            TermsView {
                player: self.players.read(game_id),
                time: terms.time,
                day: terms.time / DAY,
                stake: terms.stake,
                reference: terms.reference,
                sigma_bps: terms.sigma_bps,
                slope_bps: terms.slope_bps,
                cap: terms.cap,
                score: outcome.score,
                recorded: outcome.status != PURCHASED,
                expired: outcome.expired,
                settled: outcome.status == SETTLED,
                reward: outcome.reward,
            }
        }

        fn config(self: @ContractState) -> Config {
            self.config.read()
        }

        fn ema(self: @ContractState) -> (Ema, u64) {
            let ema = self.ema.read();
            (ema, ema.mean())
        }

        fn rate(self: @ContractState) -> u256 {
            self.guard.read().rate.into()
        }

        fn pool(self: @ContractState) -> (PoolKey, u256) {
            (self.pool_key(), self.sqrt_ratio_limit.read())
        }

        fn addresses(self: @ContractState) -> Addresses {
            Addresses {
                paved: self.paved.read(),
                usdc: self.usdc.read(),
                vault: self.vault.read(),
                router: self.router.read(),
                game: self.game.read(),
            }
        }

        fn owner(self: @ContractState) -> ContractAddress {
            self.owner.read()
        }
    }

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn assert_owner(self: @ContractState) {
            assert(get_caller_address() == self.owner.read(), errors::NOT_OWNER);
        }

        /// The game is set and is the caller.
        fn assert_game(self: @ContractState) {
            let game = self.game.read();
            assert(game.is_non_zero() && get_caller_address() == game, errors::NOT_GAME);
        }

        fn write_config(ref self: ContractState, config: Config) {
            validate(config);
            self.config.write(config);
            self
                .emit(
                    EconomyConfigured {
                        burn_bps: config.burn_bps,
                        sigma_bps: config.sigma_bps,
                        slope_bps: config.slope_bps,
                        cap: config.cap,
                        target: config.target,
                    },
                );
        }

        /// PAVED and USDC in Ekubo's token order.
        fn tokens(self: @ContractState) -> (ContractAddress, ContractAddress) {
            let paved = self.paved.read();
            let usdc = self.usdc.read();
            if paved < usdc {
                (paved, usdc)
            } else {
                (usdc, paved)
            }
        }

        fn pool_key(self: @ContractState) -> PoolKey {
            let (token0, token1) = self.tokens();
            PoolKey {
                token0,
                token1,
                fee: self.pool_fee.read(),
                tick_spacing: self.tick_spacing.read(),
                extension: self.extension.read(),
            }
        }

        /// A pool on PAVED and USDC only, in Ekubo's token order.
        fn write_pool(ref self: ContractState, pool_key: PoolKey, sqrt_ratio_limit: u256) {
            let (token0, token1) = self.tokens();
            assert(pool_key.token0 == token0 && pool_key.token1 == token1, errors::WRONG_POOL);
            self.pool_fee.write(pool_key.fee);
            self.tick_spacing.write(pool_key.tick_spacing);
            self.extension.write(pool_key.extension);
            self.sqrt_ratio_limit.write(sqrt_ratio_limit);
            self.emit(PoolSet { pool_key, sqrt_ratio_limit });
        }

        /// Ekubo's pattern in one call: the quote to the router, `swap`, the PAVED back (at least
        /// `min_out`), the unswapped USDC back. Returns the PAVED the swap paid out, from its
        /// delta: the router's balance may hold more, sent there by anyone.
        fn swap(
            ref self: ContractState, usdc: IERC20Dispatcher, quote: u256, min_out: u256,
        ) -> u256 {
            let router = self.router.read();
            assert(usdc.transfer(router, quote), errors::TRANSFER_FAILED);
            let node = RouteNode {
                pool_key: self.pool_key(),
                sqrt_ratio_limit: self.sqrt_ratio_limit.read(),
                skip_ahead: 0,
            };
            let amount = i129 { mag: quote.try_into().unwrap(), sign: false };
            let delta = IRouterDispatcher { contract_address: router }
                .swap(node, TokenAmount { token: usdc.contract_address, amount });
            let paved = self.paved.read();
            let out = if paved < usdc.contract_address {
                delta.amount0
            } else {
                delta.amount1
            };
            // [Check] The swap itself paid at least `min_out`: the router's balance may hold more
            assert(out.mag.into() >= min_out, errors::BELOW_MIN_OUT);
            let clear = IClearDispatcher { contract_address: router };
            clear.clear_minimum(paved, min_out);
            clear.clear(usdc.contract_address);
            out.mag.into()
        }

        /// The day's mean; on the first call after the day, fixes it and pushes the day into the
        /// EMA once.
        fn close(ref self: ContractState, day: u64) -> u64 {
            let mean = self.means.read(day);
            if mean != 0 {
                return mean;
            }
            let state = self.days.read(day);
            let mean = state.mean();
            self.means.write(day, mean);
            let mut ema = self.ema.read();
            ema.push(state.average(), state.weight);
            self.ema.write(ema);
            self
                .emit(
                    DayClosed {
                        day, mean, weight: state.weight, prior: state.prior, ema_after: ema.mean(),
                    },
                );
            mean
        }
    }
}
