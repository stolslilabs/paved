//! The staking Vault (P8, `docs/architecture/economy.md` section 4, P-31).
//!
//! Stakers lock PAVED and earn the USDC that reaches the Vault (the margin of every purchase, or
//! any donation), pro rata of their stake. There is no `pay` entry point: income is whatever USDC
//! balance the Vault has not yet accounted for. Before every action the Vault syncs it into `acc`,
//! a reward per staked unit scaled by `ACC_SCALE` (1e36). USDC that arrives while nobody stakes
//! waits in the balance for the first staker.
//!
//! No owner, no setter, no pause, no upgrade: the two token addresses are set in the constructor
//! and only a staker moves their own stake and dividends.

// Starknet imports

use starknet::ContractAddress;

// Constants

/// Scale of the reward per staked unit: a sync loses less than 1e-36 USDC base unit per staked
/// unit.
pub const ACC_SCALE: u256 = 1_000_000_000_000_000_000_000_000_000_000_000_000;

#[starknet::interface]
pub trait IVault<TContractState> {
    /// Pulls `amount` PAVED from the caller (approve first) and adds it to their stake.
    fn stake(ref self: TContractState, amount: u256);
    /// Returns `amount` PAVED of the caller's stake; the USDC earned so far stays claimable.
    fn unstake(ref self: TContractState, amount: u256);
    /// Pays the caller's pending USDC; returns the amount paid.
    fn claim(ref self: TContractState) -> u256;
    /// The USDC `account` would receive from `claim` now, the unsynced income included.
    fn pending(self: @TContractState, account: ContractAddress) -> u256;
    fn staked(self: @TContractState, account: ContractAddress) -> u256;
    fn total_staked(self: @TContractState) -> u256;
    /// The reward per staked unit, scaled by `ACC_SCALE`, as of the last sync.
    fn acc(self: @TContractState) -> u256;
    /// The USDC balance already distributed into `acc` and not yet claimed.
    fn accounted(self: @TContractState) -> u256;
    /// The staked token (PAVED) and the dividend token (USDC).
    fn tokens(self: @TContractState) -> (ContractAddress, ContractAddress);
}

#[starknet::contract]
pub mod Vault {
    // Core imports

    use core::num::traits::Zero;

    // External imports

    use openzeppelin_interfaces::erc20::{IERC20Dispatcher, IERC20DispatcherTrait};

    // Starknet imports

    use starknet::storage::{
        Map, StorageMapReadAccess, StorageMapWriteAccess, StoragePointerReadAccess,
        StoragePointerWriteAccess,
    };
    use starknet::{ContractAddress, get_caller_address, get_contract_address};

    // Local imports

    use super::{ACC_SCALE, IVault};

    // Errors

    pub mod errors {
        pub const ZERO_TOKEN: felt252 = 'Vault: zero token';
        pub const SAME_TOKEN: felt252 = 'Vault: same token';
        pub const ZERO_AMOUNT: felt252 = 'Vault: zero amount';
        pub const NOT_ENOUGH_STAKED: felt252 = 'Vault: not enough staked';
        pub const TRANSFER_FAILED: felt252 = 'Vault: transfer failed';
    }

    // Storage

    #[storage]
    struct Storage {
        paved: ContractAddress,
        usdc: ContractAddress,
        total_staked: u256,
        acc: u256,
        accounted: u256,
        stakes: Map<ContractAddress, u256>,
        /// `acc` at the account's last settlement.
        snapshots: Map<ContractAddress, u256>,
        /// USDC settled to the account and not yet claimed.
        owed: Map<ContractAddress, u256>,
    }

    // Events

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        Staked: Staked,
        Unstaked: Unstaked,
        Claimed: Claimed,
        Distributed: Distributed,
    }

    #[derive(Drop, starknet::Event)]
    pub struct Staked {
        #[key]
        pub account: ContractAddress,
        pub amount: u256,
        pub total_staked: u256,
    }

    #[derive(Drop, starknet::Event)]
    pub struct Unstaked {
        #[key]
        pub account: ContractAddress,
        pub amount: u256,
        pub total_staked: u256,
    }

    #[derive(Drop, starknet::Event)]
    pub struct Claimed {
        #[key]
        pub account: ContractAddress,
        pub amount: u256,
    }

    /// New USDC income folded into `acc` by a sync.
    #[derive(Drop, starknet::Event)]
    pub struct Distributed {
        pub amount: u256,
        pub acc: u256,
        pub total_staked: u256,
    }

    // Constructor

    #[constructor]
    fn constructor(ref self: ContractState, paved: ContractAddress, usdc: ContractAddress) {
        // [Check] Two distinct tokens
        assert(paved.is_non_zero() && usdc.is_non_zero(), errors::ZERO_TOKEN);
        assert(paved != usdc, errors::SAME_TOKEN);
        // [Effect] Store them, for good
        self.paved.write(paved);
        self.usdc.write(usdc);
    }

    // Implementations

    #[abi(embed_v0)]
    impl VaultImpl of IVault<ContractState> {
        fn stake(ref self: ContractState, amount: u256) {
            // [Check] Amount
            assert(amount.is_non_zero(), errors::ZERO_AMOUNT);
            // [Effect] Sync the income to the current stakers, settle the caller
            let account = get_caller_address();
            self.sync();
            self.settle(account);
            // [Effect] Add to the stake
            let total_staked = self.total_staked.read() + amount;
            self.stakes.write(account, self.stakes.read(account) + amount);
            self.total_staked.write(total_staked);
            // [Interaction] Pull the PAVED
            let paved = IERC20Dispatcher { contract_address: self.paved.read() };
            let ok = paved.transfer_from(account, get_contract_address(), amount);
            assert(ok, errors::TRANSFER_FAILED);
            self.emit(Staked { account, amount, total_staked });
        }

        fn unstake(ref self: ContractState, amount: u256) {
            // [Check] Amount
            assert(amount.is_non_zero(), errors::ZERO_AMOUNT);
            let account = get_caller_address();
            let stake = self.stakes.read(account);
            assert(amount <= stake, errors::NOT_ENOUGH_STAKED);
            // [Effect] Sync the income to the current stakers, settle the caller
            self.sync();
            self.settle(account);
            // [Effect] Remove from the stake
            let total_staked = self.total_staked.read() - amount;
            self.stakes.write(account, stake - amount);
            self.total_staked.write(total_staked);
            // [Interaction] Return the PAVED
            let paved = IERC20Dispatcher { contract_address: self.paved.read() };
            assert(paved.transfer(account, amount), errors::TRANSFER_FAILED);
            self.emit(Unstaked { account, amount, total_staked });
        }

        fn claim(ref self: ContractState) -> u256 {
            // [Effect] Sync, settle, empty the caller's dividends
            let account = get_caller_address();
            self.sync();
            self.settle(account);
            let amount = self.owed.read(account);
            if amount.is_zero() {
                return 0;
            }
            self.owed.write(account, 0);
            self.accounted.write(self.accounted.read() - amount);
            // [Interaction] Pay the USDC
            let usdc = IERC20Dispatcher { contract_address: self.usdc.read() };
            assert(usdc.transfer(account, amount), errors::TRANSFER_FAILED);
            self.emit(Claimed { account, amount });
            amount
        }

        fn pending(self: @ContractState, account: ContractAddress) -> u256 {
            // [Compute] The accumulator after a sync, then the account's settlement
            let (acc, _) = self.synced();
            self.owed.read(account)
                + self.stakes.read(account) * (acc - self.snapshots.read(account)) / ACC_SCALE
        }

        fn staked(self: @ContractState, account: ContractAddress) -> u256 {
            self.stakes.read(account)
        }

        fn total_staked(self: @ContractState) -> u256 {
            self.total_staked.read()
        }

        fn acc(self: @ContractState) -> u256 {
            self.acc.read()
        }

        fn accounted(self: @ContractState) -> u256 {
            self.accounted.read()
        }

        fn tokens(self: @ContractState) -> (ContractAddress, ContractAddress) {
            (self.paved.read(), self.usdc.read())
        }
    }

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        /// The accumulator and the accounted balance once the unaccounted USDC is distributed.
        /// Nothing is distributed while nobody stakes: the USDC waits for the first staker.
        fn synced(self: @ContractState) -> (u256, u256) {
            let acc = self.acc.read();
            let accounted = self.accounted.read();
            let total_staked = self.total_staked.read();
            if total_staked.is_zero() {
                return (acc, accounted);
            }
            let usdc = IERC20Dispatcher { contract_address: self.usdc.read() };
            let income = usdc.balance_of(get_contract_address()) - accounted;
            (acc + income * ACC_SCALE / total_staked, accounted + income)
        }

        fn sync(ref self: ContractState) {
            let (acc, accounted) = self.synced();
            let amount = accounted - self.accounted.read();
            if amount.is_zero() {
                return;
            }
            self.acc.write(acc);
            self.accounted.write(accounted);
            self.emit(Distributed { amount, acc, total_staked: self.total_staked.read() });
        }

        /// Moves what `account` earned since its last settlement into its owed USDC.
        fn settle(ref self: ContractState, account: ContractAddress) {
            let acc = self.acc.read();
            let earned = self.stakes.read(account)
                * (acc - self.snapshots.read(account))
                / ACC_SCALE;
            if earned.is_non_zero() {
                self.owed.write(account, self.owed.read(account) + earned);
            }
            self.snapshots.write(account, acc);
        }
    }
}
