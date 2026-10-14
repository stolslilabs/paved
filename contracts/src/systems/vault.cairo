//! The staking Vault and its share, stPAVED (P8, `docs/architecture/economy.md` section 4, P-31,
//! P-55, P-56, `docs/architecture/vault-share.md`).
//!
//! Stakers lock PAVED and earn the USDC that reaches the Vault (the margin of every purchase, or
//! any donation), pro rata of their stake. There is no `pay` entry point: income is whatever USDC
//! balance the Vault has not yet accounted for. Before every balance change the Vault syncs it
//! into `acc`, a reward per staked unit scaled by `ACC_SCALE` (1e36). USDC that arrives while
//! nobody stakes waits in the balance for the first staker.
//!
//! The stake is an ERC20 share, "Staked PAVED" (`stPAVED`, 18 decimals), minted 1:1 on `stake` and
//! burned 1:1 on `unstake` (not ERC4626, P-56). It is transferable: the ERC20 `before_update` hook
//! syncs the income, then settles both sides at their balances before the change, so a transfer
//! moves the stake and none of the USDC earned before it. The Vault itself never holds the share.
//! The share carries votes (`VotesComponent`, a timestamp clock): units count once delegated.
//!
//! Stranded USDC is accepted (P-56): shares held by a contract that cannot call `claim` (a pool,
//! an escrow, a bridge) earn USDC that stays in the Vault for good, claimable by no one else.
//!
//! The owner (two-step) may replace the class (`upgrade`, P-56, D-17, P-42), and has no other
//! power: no setter, no pause. The two token addresses are set in the constructor, and only a
//! holder moves their own shares and dividends.

// Starknet imports

use starknet::ContractAddress;

// Constants

/// Scale of the reward per staked unit: a sync loses less than 1e-36 USDC base unit per staked
/// unit.
pub const ACC_SCALE: u256 = 1_000_000_000_000_000_000_000_000_000_000_000_000;

#[starknet::interface]
pub trait IVault<TContractState> {
    /// Pulls `amount` PAVED from the caller (approve first) and mints them as many stPAVED.
    fn stake(ref self: TContractState, amount: u256);
    /// Burns `amount` stPAVED of the caller and returns as many PAVED; the USDC earned so far
    /// stays claimable.
    fn unstake(ref self: TContractState, amount: u256);
    /// Pays the caller's pending USDC; returns the amount paid.
    fn claim(ref self: TContractState) -> u256;
    /// The USDC `account` would receive from `claim` now, the unsynced income included.
    fn pending(self: @TContractState, account: ContractAddress) -> u256;
    /// The stPAVED balance of `account` (an alias of `balance_of`).
    fn staked(self: @TContractState, account: ContractAddress) -> u256;
    /// The stPAVED supply (an alias of `total_supply`).
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

    use openzeppelin_governance::votes::VotesComponent;
    use openzeppelin_interfaces::erc20::{IERC20Dispatcher, IERC20DispatcherTrait};
    use openzeppelin_interfaces::upgrades::IUpgradeable;
    use openzeppelin_token::erc20::ERC20Component;
    use openzeppelin_upgrades::UpgradeableComponent;
    use openzeppelin_utils::contract_clock::ERC6372TimestampClock;
    use openzeppelin_utils::cryptography::nonces::NoncesComponent;
    use openzeppelin_utils::cryptography::snip12::SNIP12Metadata;
    use paved::components::ownable::OwnableComponent;
    use paved::systems::token::DECIMALS;

    // Starknet imports

    use starknet::storage::{
        Map, StorageMapReadAccess, StorageMapWriteAccess, StoragePointerReadAccess,
        StoragePointerWriteAccess,
    };
    use starknet::{ClassHash, ContractAddress, get_caller_address, get_contract_address};

    // Local imports

    use super::{ACC_SCALE, IVault};

    // Errors

    pub mod errors {
        pub const ZERO_TOKEN: felt252 = 'Vault: zero token';
        pub const ZERO_OWNER: felt252 = 'Vault: zero owner';
        pub const SAME_TOKEN: felt252 = 'Vault: same token';
        pub const ZERO_AMOUNT: felt252 = 'Vault: zero amount';
        pub const NOT_ENOUGH_STAKED: felt252 = 'Vault: not enough staked';
        pub const TRANSFER_FAILED: felt252 = 'Vault: transfer failed';
        pub const VAULT_RECIPIENT: felt252 = 'Vault: vault recipient';
    }

    // Components

    component!(path: ERC20Component, storage: erc20, event: ERC20Event);
    component!(path: VotesComponent, storage: erc20_votes, event: VotesEvent);
    component!(path: NoncesComponent, storage: nonces, event: NoncesEvent);
    component!(path: OwnableComponent, storage: ownable, event: OwnableEvent);
    component!(path: UpgradeableComponent, storage: upgradeable, event: UpgradeableEvent);

    #[abi(embed_v0)]
    impl ERC20MixinImpl = ERC20Component::ERC20MixinImpl<ContractState>;
    impl ERC20InternalImpl = ERC20Component::InternalImpl<ContractState>;
    #[abi(embed_v0)]
    impl VotesImpl = VotesComponent::VotesImpl<ContractState>;
    impl VotesInternalImpl = VotesComponent::InternalImpl<ContractState>;
    #[abi(embed_v0)]
    impl NoncesImpl = NoncesComponent::NoncesImpl<ContractState>;
    #[abi(embed_v0)]
    impl OwnableImpl = OwnableComponent::OwnableImpl<ContractState>;
    impl OwnableInternalImpl = OwnableComponent::InternalImpl<ContractState>;
    impl UpgradeableInternalImpl = UpgradeableComponent::InternalImpl<ContractState>;

    impl ERC20Config of ERC20Component::ImmutableConfig {
        const DECIMALS: u8 = DECIMALS;
    }

    /// The SNIP-12 domain of `delegate_by_sig`.
    impl SNIP12MetadataImpl of SNIP12Metadata {
        fn name() -> felt252 {
            'Staked PAVED'
        }

        fn version() -> felt252 {
            '1'
        }
    }

    // Storage

    #[storage]
    struct Storage {
        /// The share: `ERC20_balances` is the stake, `ERC20_total_supply` the total staked.
        #[substorage(v0)]
        erc20: ERC20Component::Storage,
        #[substorage(v0)]
        erc20_votes: VotesComponent::Storage,
        #[substorage(v0)]
        nonces: NoncesComponent::Storage,
        /// `owner` and `pending_owner`, flat.
        #[substorage(v0)]
        ownable: OwnableComponent::Storage,
        #[substorage(v0)]
        upgradeable: UpgradeableComponent::Storage,
        paved: ContractAddress,
        usdc: ContractAddress,
        acc: u256,
        accounted: u256,
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
        #[flat]
        ERC20Event: ERC20Component::Event,
        #[flat]
        VotesEvent: VotesComponent::Event,
        #[flat]
        NoncesEvent: NoncesComponent::Event,
        #[flat]
        OwnableEvent: OwnableComponent::Event,
        #[flat]
        UpgradeableEvent: UpgradeableComponent::Event,
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
    fn constructor(
        ref self: ContractState, owner: ContractAddress, paved: ContractAddress, usdc: ContractAddress,
    ) {
        // [Check] An owner and two distinct tokens
        assert(owner.is_non_zero(), errors::ZERO_OWNER);
        assert(paved.is_non_zero() && usdc.is_non_zero(), errors::ZERO_TOKEN);
        assert(paved != usdc, errors::SAME_TOKEN);
        // [Effect] The share's metadata, the owner, the tokens for good
        self.erc20.initializer("Staked PAVED", "stPAVED");
        self.ownable.initialize(owner);
        self.paved.write(paved);
        self.usdc.write(usdc);
    }

    // Hooks

    /// Every balance change (transfer, mint on `stake`, burn on `unstake`) syncs the income, then
    /// settles both sides at their balances before the change (`docs/architecture/vault-share.md`
    /// section 3), and moves the voting units after it.
    impl ERC20HooksImpl of ERC20Component::ERC20HooksTrait<ContractState> {
        fn before_update(
            ref self: ERC20Component::ComponentState<ContractState>,
            from: ContractAddress,
            recipient: ContractAddress,
            amount: u256,
        ) {
            let mut contract_state = self.get_contract_mut();
            // [Check] The Vault never holds its own share (it could never claim what it earns)
            assert(recipient != get_contract_address(), errors::VAULT_RECIPIENT);
            // [Effect] Fold the income in at the supply that earned it, then settle both sides
            contract_state.sync();
            if from.is_non_zero() {
                contract_state.settle(from);
            }
            if recipient.is_non_zero() {
                contract_state.settle(recipient);
            }
        }

        fn after_update(
            ref self: ERC20Component::ComponentState<ContractState>,
            from: ContractAddress,
            recipient: ContractAddress,
            amount: u256,
        ) {
            // [Effect] Move the voting units between the delegates, and the supply's checkpoint
            let mut contract_state = self.get_contract_mut();
            contract_state.erc20_votes.transfer_voting_units(from, recipient, amount);
        }
    }

    // Implementations

    #[abi(embed_v0)]
    impl VaultImpl of IVault<ContractState> {
        fn stake(ref self: ContractState, amount: u256) {
            // [Check] Amount
            assert(amount.is_non_zero(), errors::ZERO_AMOUNT);
            // [Effect] Mint the shares (the hook syncs the income and settles the caller first)
            let account = get_caller_address();
            self.erc20.mint(account, amount);
            // [Interaction] Pull the PAVED
            let paved = IERC20Dispatcher { contract_address: self.paved.read() };
            let ok = paved.transfer_from(account, get_contract_address(), amount);
            assert(ok, errors::TRANSFER_FAILED);
            self.emit(Staked { account, amount, total_staked: self.erc20.total_supply() });
        }

        fn unstake(ref self: ContractState, amount: u256) {
            // [Check] Amount
            assert(amount.is_non_zero(), errors::ZERO_AMOUNT);
            let account = get_caller_address();
            assert(amount <= self.erc20.balance_of(account), errors::NOT_ENOUGH_STAKED);
            // [Effect] Burn the shares (the hook syncs the income and settles the caller first)
            self.erc20.burn(account, amount);
            // [Interaction] Return the PAVED
            let paved = IERC20Dispatcher { contract_address: self.paved.read() };
            assert(paved.transfer(account, amount), errors::TRANSFER_FAILED);
            self.emit(Unstaked { account, amount, total_staked: self.erc20.total_supply() });
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
                + self.erc20.balance_of(account)
                    * (acc - self.snapshots.read(account))
                    / ACC_SCALE
        }

        fn staked(self: @ContractState, account: ContractAddress) -> u256 {
            self.erc20.balance_of(account)
        }

        fn total_staked(self: @ContractState) -> u256 {
            self.erc20.total_supply()
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

    #[abi(embed_v0)]
    impl UpgradeableImpl of IUpgradeable<ContractState> {
        /// Replaces the class, keeping the storage (OpenZeppelin's `Upgraded`). The owner only.
        fn upgrade(ref self: ContractState, new_class_hash: ClassHash) {
            self.ownable.assert_only_owner();
            self.upgradeable.upgrade(new_class_hash);
        }
    }

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        /// The accumulator and the accounted balance once the unaccounted USDC is distributed.
        /// Nothing is distributed while nobody stakes: the USDC waits for the first staker.
        fn synced(self: @ContractState) -> (u256, u256) {
            let acc = self.acc.read();
            let accounted = self.accounted.read();
            let total_staked = self.erc20.total_supply();
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
            self.emit(Distributed { amount, acc, total_staked: self.erc20.total_supply() });
        }

        /// Moves what `account` earned since its last settlement into its owed USDC.
        fn settle(ref self: ContractState, account: ContractAddress) {
            let acc = self.acc.read();
            let earned = self.erc20.balance_of(account)
                * (acc - self.snapshots.read(account))
                / ACC_SCALE;
            if earned.is_non_zero() {
                self.owed.write(account, self.owed.read(account) + earned);
            }
            self.snapshots.write(account, acc);
        }
    }
}
