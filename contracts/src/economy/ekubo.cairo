//! The part of Ekubo's router that the economy calls (P8, `docs/architecture/economy.md`,
//! section 5).
//!
//! Declared here instead of depending on Ekubo: only the types and entry points `Economy` uses,
//! with the same field order and types as Ekubo's deployed router, so that they serialize the same
//! way (the same ABI). Calling pattern: transfer the input to the router, `swap`, then
//! `clear_minimum` the output and `clear` the input's leftover. `MockRouter` implements the same
//! entry points on devnet.

// Starknet imports

use starknet::ContractAddress;

/// A signed 129-bit integer: a magnitude and a sign (`true` is negative).
#[derive(Copy, Drop, Serde, PartialEq, Debug)]
pub struct i129 {
    pub mag: u128,
    pub sign: bool,
}

/// A pool: two tokens with `token0 < token1`, a fee as a 0.128 fixed-point fraction of the input,
/// a tick spacing and an extension (zero for none).
#[derive(Copy, Drop, Serde, PartialEq, Debug)]
pub struct PoolKey {
    pub token0: ContractAddress,
    pub token1: ContractAddress,
    pub fee: u128,
    pub tick_spacing: u128,
    pub extension: ContractAddress,
}

/// One swap through one pool, up to a price bound.
#[derive(Copy, Drop, Serde, PartialEq, Debug)]
pub struct RouteNode {
    pub pool_key: PoolKey,
    pub sqrt_ratio_limit: u256,
    pub skip_ahead: u128,
}

/// The token and amount of a swap; a positive amount is an exact input.
#[derive(Copy, Drop, Serde, PartialEq, Debug)]
pub struct TokenAmount {
    pub token: ContractAddress,
    pub amount: i129,
}

/// The change of the pool's balances: positive is what the pool received, negative what it paid.
#[derive(Copy, Drop, Serde, PartialEq, Debug)]
pub struct Delta {
    pub amount0: i129,
    pub amount1: i129,
}

#[starknet::interface]
pub trait IRouter<TContractState> {
    /// Swaps with the tokens the router holds; the output stays on the router until cleared.
    fn swap(ref self: TContractState, node: RouteNode, token_amount: TokenAmount) -> Delta;
}

#[starknet::interface]
pub trait IClear<TContractState> {
    /// Sends the router's whole balance of `token` to the caller; returns the amount.
    fn clear(self: @TContractState, token: ContractAddress) -> u256;
    /// As `clear`, and reverts if the amount is below `minimum`.
    fn clear_minimum(self: @TContractState, token: ContractAddress, minimum: u256) -> u256;
}
