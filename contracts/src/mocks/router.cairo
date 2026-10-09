// TEST AND DEVNET ONLY: never deploy this contract on a public network. Its reserves are open to
// anyone's liquidity and it ignores price limits.

//! A stand-in for Ekubo's router on devnet and in tests (P8, `docs/architecture/economy.md`
//! section 5). It implements the three entry points `Economy` calls (`swap`, `clear`,
//! `clear_minimum`, declared in `paved::economy::ekubo`) over its own constant-product reserves of
//! one pair, with Ekubo's 5 % fee:
//!
//! - fee = ceil(amount_in x FEE / 2^128), kept in the pool, as Ekubo rounds a fee;
//! - out = floor(reserve_out x (amount_in - fee) / (reserve_in + amount_in - fee)).
//!
//! As on Ekubo, the input must already be on the router, and the output stays there until cleared.
//! Exact input only; the pool key must be `pool_key()`; `sqrt_ratio_limit` and `skip_ahead` are
//! ignored.

// Internal imports

use paved::economy::ekubo::PoolKey;

// Starknet imports

use starknet::ContractAddress;

// Constants

/// Ekubo's 5 % fee: floor(0.05 x 2^128).
pub const FEE: u128 = 0xccccccccccccccccccccccccccccccc;
/// The tick spacing Nums uses with that fee (informational: the mock has no ticks).
pub const TICK_SPACING: u128 = 0x56a4c;
pub const TWO_POW_128: u256 = 0x100000000000000000000000000000000;

#[starknet::interface]
pub trait IMockRouter<TContractState> {
    /// Pulls `amount0` of token0 and `amount1` of token1 from the caller (approve first) into the
    /// reserves. Anyone may add; nobody can remove.
    fn add_liquidity(ref self: TContractState, amount0: u256, amount1: u256);
    /// The output of an exact-input swap of `amount_in` of `token_in`, at the current reserves.
    fn quote(self: @TContractState, token_in: ContractAddress, amount_in: u128) -> u128;
    fn reserves(self: @TContractState) -> (u256, u256);
    /// The key of the one pool, as `swap` expects it.
    fn pool_key(self: @TContractState) -> PoolKey;
}

#[starknet::contract]
pub mod MockRouter {
    // Core imports

    use core::num::traits::Zero;

    // External imports

    use openzeppelin_interfaces::erc20::{IERC20Dispatcher, IERC20DispatcherTrait};

    // Internal imports

    use paved::economy::ekubo::{Delta, IClear, IRouter, PoolKey, RouteNode, TokenAmount, i129};

    // Starknet imports

    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};
    use starknet::{ContractAddress, get_caller_address, get_contract_address};

    // Local imports

    use super::{FEE, IMockRouter, TICK_SPACING, TWO_POW_128};

    // Errors

    pub mod errors {
        pub const SAME_TOKEN: felt252 = 'MockRouter: same token';
        pub const ZERO_TOKEN: felt252 = 'MockRouter: zero token';
        pub const WRONG_POOL: felt252 = 'MockRouter: wrong pool';
        pub const WRONG_TOKEN: felt252 = 'MockRouter: wrong token';
        pub const EXACT_INPUT_ONLY: felt252 = 'MockRouter: exact input only';
        pub const NO_LIQUIDITY: felt252 = 'MockRouter: no liquidity';
        pub const INPUT_NOT_PAID: felt252 = 'MockRouter: input not paid';
        pub const ZERO_OUTPUT: felt252 = 'MockRouter: zero output';
        pub const TRANSFER_FAILED: felt252 = 'MockRouter: transfer failed';
        pub const MINIMUM: felt252 = 'CLEAR_AT_LEAST_MINIMUM';
    }

    // Storage

    #[storage]
    struct Storage {
        token0: ContractAddress,
        token1: ContractAddress,
        reserve0: u256,
        reserve1: u256,
    }

    // Events

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        Swapped: Swapped,
    }

    #[derive(Drop, starknet::Event)]
    pub struct Swapped {
        pub token_in: ContractAddress,
        pub amount_in: u128,
        pub amount_out: u128,
    }

    // Constructor

    /// The pair, in either order (the pool's `token0` is the smaller address, as on Ekubo).
    #[constructor]
    fn constructor(ref self: ContractState, token_a: ContractAddress, token_b: ContractAddress) {
        assert(token_a.is_non_zero() && token_b.is_non_zero(), errors::ZERO_TOKEN);
        assert(token_a != token_b, errors::SAME_TOKEN);
        let (token0, token1) = if token_a < token_b {
            (token_a, token_b)
        } else {
            (token_b, token_a)
        };
        self.token0.write(token0);
        self.token1.write(token1);
    }

    // Implementations

    #[abi(embed_v0)]
    impl RouterImpl of IRouter<ContractState> {
        fn swap(ref self: ContractState, node: RouteNode, token_amount: TokenAmount) -> Delta {
            // [Check] The pool and an exact input
            assert(node.pool_key == self.pool_key(), errors::WRONG_POOL);
            assert(!token_amount.amount.sign, errors::EXACT_INPUT_ONLY);
            let amount_in = token_amount.amount.mag;
            let zero_for_one = self.direction(token_amount.token);
            let (reserve_in, reserve_out) = self.ordered(zero_for_one);
            // [Check] The input is on the router, beyond the reserves
            let token = IERC20Dispatcher { contract_address: token_amount.token };
            let balance = token.balance_of(get_contract_address());
            assert(balance >= reserve_in + amount_in.into(), errors::INPUT_NOT_PAID);
            // [Effect] Move the reserves; the output stays on the router until cleared
            let amount_out = self.quote(token_amount.token, amount_in);
            assert(amount_out.is_non_zero(), errors::ZERO_OUTPUT);
            let reserve_in = reserve_in + amount_in.into();
            let reserve_out = reserve_out - amount_out.into();
            let paid = i129 { mag: amount_in, sign: false };
            let received = i129 { mag: amount_out, sign: true };
            self.emit(Swapped { token_in: token_amount.token, amount_in, amount_out });
            if zero_for_one {
                self.reserve0.write(reserve_in);
                self.reserve1.write(reserve_out);
                Delta { amount0: paid, amount1: received }
            } else {
                self.reserve1.write(reserve_in);
                self.reserve0.write(reserve_out);
                Delta { amount0: received, amount1: paid }
            }
        }
    }

    #[abi(embed_v0)]
    impl ClearImpl of IClear<ContractState> {
        fn clear(self: @ContractState, token: ContractAddress) -> u256 {
            self.clear_minimum(token, 0)
        }

        fn clear_minimum(self: @ContractState, token: ContractAddress, minimum: u256) -> u256 {
            // [Compute] What the router holds beyond the reserves
            let dispatcher = IERC20Dispatcher { contract_address: token };
            let this = get_contract_address();
            let amount = dispatcher.balance_of(this) - self.reserve_of(token);
            // [Check] At least the minimum
            assert(amount >= minimum, errors::MINIMUM);
            // [Interaction] Send it to the caller
            if amount.is_non_zero() {
                assert(dispatcher.transfer(get_caller_address(), amount), errors::TRANSFER_FAILED);
            }
            amount
        }
    }

    #[abi(embed_v0)]
    impl MockRouterImpl of IMockRouter<ContractState> {
        fn add_liquidity(ref self: ContractState, amount0: u256, amount1: u256) {
            // [Effect] Grow the reserves
            self.reserve0.write(self.reserve0.read() + amount0);
            self.reserve1.write(self.reserve1.read() + amount1);
            // [Interaction] Pull the tokens
            let caller = get_caller_address();
            let this = get_contract_address();
            let token0 = IERC20Dispatcher { contract_address: self.token0.read() };
            let token1 = IERC20Dispatcher { contract_address: self.token1.read() };
            assert(token0.transfer_from(caller, this, amount0), errors::TRANSFER_FAILED);
            assert(token1.transfer_from(caller, this, amount1), errors::TRANSFER_FAILED);
        }

        fn quote(self: @ContractState, token_in: ContractAddress, amount_in: u128) -> u128 {
            let (reserve_in, reserve_out) = self.ordered(self.direction(token_in));
            assert(reserve_in.is_non_zero() && reserve_out.is_non_zero(), errors::NO_LIQUIDITY);
            // [Compute] Ekubo's fee, rounded up, then the constant product, rounded down
            let product: u256 = amount_in.into() * FEE.into();
            let fee = (product + TWO_POW_128 - 1) / TWO_POW_128;
            let net = amount_in.into() - fee;
            let out = reserve_out * net / (reserve_in + net);
            out.try_into().unwrap()
        }

        fn reserves(self: @ContractState) -> (u256, u256) {
            (self.reserve0.read(), self.reserve1.read())
        }

        fn pool_key(self: @ContractState) -> PoolKey {
            PoolKey {
                token0: self.token0.read(),
                token1: self.token1.read(),
                fee: FEE,
                tick_spacing: TICK_SPACING,
                extension: Zero::zero(),
            }
        }
    }

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        /// `true` when `token_in` is token0.
        fn direction(self: @ContractState, token_in: ContractAddress) -> bool {
            if token_in == self.token0.read() {
                return true;
            }
            assert(token_in == self.token1.read(), errors::WRONG_TOKEN);
            false
        }

        /// (reserve of the input, reserve of the output).
        fn ordered(self: @ContractState, zero_for_one: bool) -> (u256, u256) {
            if zero_for_one {
                (self.reserve0.read(), self.reserve1.read())
            } else {
                (self.reserve1.read(), self.reserve0.read())
            }
        }

        fn reserve_of(self: @ContractState, token: ContractAddress) -> u256 {
            if token == self.token0.read() {
                return self.reserve0.read();
            }
            if token == self.token1.read() {
                return self.reserve1.read();
            }
            0
        }
    }
}
