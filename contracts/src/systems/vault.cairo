//! The staking Vault and its share, vPAVED (P8, `docs/architecture/economy.md` section 4, P-31,
//! P-55, P-56, D-31, `docs/architecture/vault-share.md`, its addenda).
//!
//! An OpenZeppelin ERC4626 over PAVED ("Vault PAVED", `vPAVED`, 18 decimals, offset 0): `deposit`,
//! `mint`, `withdraw` and `redeem`. The rate (PAVED per vPAVED) is `(total_assets + 1) /
//! (total_supply + 1)`, where `total_assets` is the PAVED the Vault holds. Only PAVED reaching the
//! Vault without shares (a donation), the exit fee and the rounding, which always favours the
//! Vault, raise it (D-31: no longer the purchases).
//!
//! - The USDC reward, as Nums' Vault (D-31, `cartridge-gg/nums` at `4f8f405`): `Economy` pays the
//!   margin of every purchase in USDC (`pay`), shared among the holders by a per-share index; every
//!   balance change (transfer, mint, burn) first settles both sides at their balances before it, so
//!   a share earns only what is paid while it is held. A holder takes its USDC whenever it likes
//!   (`claim`); the owner collects what a contract holder cannot (`collect`, never an account's).
//! - The exit fee: `exit_fee` bps of the PAVED that leaves, on `withdraw` and `redeem` alike, kept
//!   in the Vault for the holders who stay (`Fee::Assets`). `max_withdraw` counts it.
//! - No dead shares (D-31): the owner's deposit after the deployment is the first. A deposit that
//!   would mint no share reverts.
//! - Votes: `VotesComponent`, a timestamp clock, units counted in vPAVED once delegated.
//! - The owner (two-step) may replace the class (`upgrade`, P-56, D-17, P-42), set the exit fee
//!   within `MAX_EXIT_FEE_BPS`, pause the Vault (deposits, exits, claims) and close it (exits,
//!   claims), as Nums (D-31), and collect a contract holder's USDC. Neither flag stops `pay` (the
//!   purchases), the transfers or the votes.

// Constants

/// The exit fee's default (5 %) and the owner's ceiling (10 %), in basis points (owner, 2026-10-14,
/// P-56).
pub const DEFAULT_EXIT_FEE_BPS: u16 = 500;
pub const MAX_EXIT_FEE_BPS: u16 = 1_000;
pub const BPS: u256 = 10_000;
/// The scale of the reward index (Nums' `TEN_POW_36`): USDC base units per vPAVED base unit,
/// times `10^36`.
pub const REWARD_SCALE: u256 = 1_000_000_000_000_000_000_000_000_000_000_000_000;

#[starknet::interface]
pub trait IVault<TContractState> {
    /// The exit fee, in basis points of the PAVED that leaves.
    fn exit_fee(self: @TContractState) -> u16;
    /// Sets the exit fee, at most `MAX_EXIT_FEE_BPS`. The owner only.
    fn set_exit_fee(ref self: TContractState, fee: u16);
    /// The token the holders earn, USDC.
    fn reward_token(self: @TContractState) -> starknet::ContractAddress;
    /// USDC base units earned per vPAVED base unit since the deployment, times `REWARD_SCALE`.
    fn reward_index(self: @TContractState) -> u256;
    /// The USDC `account` can claim now.
    fn claimable_of(self: @TContractState, account: starknet::ContractAddress) -> u256;
    /// The USDC paid out of `account`'s position so far, by its claims or the owner's collects.
    fn claimed_of(self: @TContractState, account: starknet::ContractAddress) -> u256;
    /// All the USDC `account`'s position has earned: `claimed_of + claimable_of`.
    fn earned_of(self: @TContractState, account: starknet::ContractAddress) -> u256;
    /// All the USDC paid to the holders, and all of it paid out.
    fn total_paid(self: @TContractState) -> u256;
    fn total_claimed(self: @TContractState) -> u256;
    /// USDC paid while no share existed, shared at the next payment.
    fn reward_waiting(self: @TContractState) -> u256;
    /// Pulls `amount` USDC from the caller (approved) and shares it among the holders of now.
    /// Anyone (`Economy`, at every purchase); never paused.
    fn pay(ref self: TContractState, amount: u256);
    /// Pays the caller all its claimable USDC; returns it. Reverts when paused, closed, or with
    /// nothing to claim.
    fn claim(ref self: TContractState) -> u256;
    /// Pays a contract holder's claimable USDC to the owner; never an account's. The owner only.
    fn collect(ref self: TContractState, holder: starknet::ContractAddress) -> u256;
    fn is_paused(self: @TContractState) -> bool;
    fn is_open(self: @TContractState) -> bool;
    /// Stops deposits, mints, withdraws, redeems and claims. The owner only.
    fn pause(ref self: TContractState);
    fn unpause(ref self: TContractState);
    /// `close` stops withdraws, redeems and claims; deposits go on. The owner only.
    fn open(ref self: TContractState);
    fn close(ref self: TContractState);
}

#[starknet::contract]
pub mod Vault {
    // Core imports

    use core::num::traits::Zero;

    // External imports

    use openzeppelin_governance::votes::VotesComponent;
    use openzeppelin_interfaces::accounts::ISRC6_ID;
    use openzeppelin_interfaces::erc20::{IERC20, IERC20Dispatcher, IERC20DispatcherTrait};
    use openzeppelin_interfaces::introspection::{ISRC5Dispatcher, ISRC5DispatcherTrait};
    use openzeppelin_interfaces::upgrades::IUpgradeable;
    use openzeppelin_token::erc20::ERC20Component;
    use openzeppelin_token::erc20::extensions::erc4626::ERC4626Component::Fee;
    use openzeppelin_token::erc20::extensions::erc4626::{
        DefaultConfig as ERC4626DefaultConfig, ERC4626Component, ERC4626SelfAssetsManagement,
    };
    use openzeppelin_upgrades::UpgradeableComponent;
    use openzeppelin_utils::contract_clock::ERC6372TimestampClock;
    use openzeppelin_utils::cryptography::nonces::NoncesComponent;
    use openzeppelin_utils::cryptography::snip12::SNIP12Metadata;
    use openzeppelin_utils::math;
    use openzeppelin_utils::math::Rounding;
    use paved::components::ownable::OwnableComponent;
    use paved::systems::token::DECIMALS;

    // Starknet imports

    use starknet::storage::{
        Map, StorageMapReadAccess, StorageMapWriteAccess, StoragePointerReadAccess,
        StoragePointerWriteAccess,
    };
    use starknet::{ClassHash, ContractAddress, get_caller_address, get_contract_address};

    // Local imports

    use super::{BPS, IVault, MAX_EXIT_FEE_BPS, REWARD_SCALE};

    // Errors

    pub mod errors {
        pub const ZERO_ADDRESS: felt252 = 'Vault: zero address';
        pub const FEE_TOO_HIGH: felt252 = 'Vault: fee too high';
        pub const ZERO_SHARES: felt252 = 'Vault: zero shares';
        pub const PAUSED: felt252 = 'Vault: paused';
        pub const NOT_PAUSED: felt252 = 'Vault: not paused';
        pub const CLOSED: felt252 = 'Vault: closed';
        pub const OPEN: felt252 = 'Vault: open';
        pub const NOTHING_TO_CLAIM: felt252 = 'Vault: nothing to claim';
        pub const ACCOUNT_HOLDER: felt252 = 'Vault: holder is an account';
        pub const TRANSFER_FAILED: felt252 = 'Vault: transfer failed';
    }

    // Components

    component!(path: ERC20Component, storage: erc20, event: ERC20Event);
    component!(path: ERC4626Component, storage: erc4626, event: ERC4626Event);
    component!(path: VotesComponent, storage: erc20_votes, event: VotesEvent);
    component!(path: NoncesComponent, storage: nonces, event: NoncesEvent);
    component!(path: OwnableComponent, storage: ownable, event: OwnableEvent);
    component!(path: UpgradeableComponent, storage: upgradeable, event: UpgradeableEvent);

    #[abi(embed_v0)]
    impl ERC20Impl = ERC20Component::ERC20Impl<ContractState>;
    #[abi(embed_v0)]
    impl ERC20CamelOnlyImpl = ERC20Component::ERC20CamelOnlyImpl<ContractState>;
    impl ERC20InternalImpl = ERC20Component::InternalImpl<ContractState>;
    #[abi(embed_v0)]
    impl ERC4626Impl = ERC4626Component::ERC4626Impl<ContractState>;
    #[abi(embed_v0)]
    impl ERC4626MetadataImpl = ERC4626Component::ERC4626MetadataImpl<ContractState>;
    impl ERC4626InternalImpl = ERC4626Component::InternalImpl<ContractState>;
    #[abi(embed_v0)]
    impl VotesImpl = VotesComponent::VotesImpl<ContractState>;
    impl VotesInternalImpl = VotesComponent::InternalImpl<ContractState>;
    #[abi(embed_v0)]
    impl NoncesImpl = NoncesComponent::NoncesImpl<ContractState>;
    #[abi(embed_v0)]
    impl OwnableImpl = OwnableComponent::OwnableImpl<ContractState>;
    impl OwnableInternalImpl = OwnableComponent::InternalImpl<ContractState>;
    impl UpgradeableInternalImpl = UpgradeableComponent::InternalImpl<ContractState>;

    /// The ERC20's own decimals are not read: `ERC4626MetadataImpl` gives PAVED's 18 plus the
    /// offset 0 (`ERC4626DefaultConfig`).
    impl ERC20Config of ERC20Component::ImmutableConfig {
        const DECIMALS: u8 = DECIMALS;
    }

    /// The SNIP-12 domain of `delegate_by_sig`.
    impl SNIP12MetadataImpl of SNIP12Metadata {
        fn name() -> felt252 {
            'vPAVED'
        }

        fn version() -> felt252 {
            '1'
        }
    }

    // Storage

    #[storage]
    struct Storage {
        /// The share: `ERC20_balances` and `ERC20_total_supply`.
        #[substorage(v0)]
        erc20: ERC20Component::Storage,
        /// `ERC4626_asset`, PAVED.
        #[substorage(v0)]
        erc4626: ERC4626Component::Storage,
        #[substorage(v0)]
        erc20_votes: VotesComponent::Storage,
        #[substorage(v0)]
        nonces: NoncesComponent::Storage,
        /// `owner` and `pending_owner`, flat.
        #[substorage(v0)]
        ownable: OwnableComponent::Storage,
        #[substorage(v0)]
        upgradeable: UpgradeableComponent::Storage,
        /// The exit fee, in basis points.
        exit_fee: u16,
        // The USDC reward (D-31), appended (P-42)
        /// The reward token, USDC.
        usdc: ContractAddress,
        /// Nums' `total_reward`: USDC base units per vPAVED base unit, times `REWARD_SCALE`.
        reward_index: u256,
        /// Nums' `current_reward`: the index at the account's last settlement.
        reward_snapshots: Map<ContractAddress, u256>,
        /// Nums' `pending_reward`: settled and not yet paid out, times `REWARD_SCALE` (a claim
        /// keeps the fraction under one base unit).
        reward_pending: Map<ContractAddress, u256>,
        /// USDC paid out of each position (claims and collects).
        reward_claimed: Map<ContractAddress, u256>,
        /// USDC paid while no share existed.
        reward_waiting: u256,
        total_paid: u256,
        total_claimed: u256,
        /// Nums' pause: deposits, exits and claims stop.
        paused: bool,
        /// Nums' `open` flag, inverted so that the Vault starts open: exits and claims stop.
        closed: bool,
    }

    // Events

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        ExitFeeSet: ExitFeeSet,
        Paid: Paid,
        Claimed: Claimed,
        Collected: Collected,
        Paused: Paused,
        Unpaused: Unpaused,
        Opened: Opened,
        Closed: Closed,
        #[flat]
        ERC20Event: ERC20Component::Event,
        #[flat]
        ERC4626Event: ERC4626Component::Event,
        #[flat]
        VotesEvent: VotesComponent::Event,
        #[flat]
        NoncesEvent: NoncesComponent::Event,
        #[flat]
        OwnableEvent: OwnableComponent::Event,
        #[flat]
        UpgradeableEvent: UpgradeableComponent::Event,
    }

    #[derive(Drop, Debug, PartialEq, starknet::Event)]
    pub struct ExitFeeSet {
        pub previous: u16,
        pub fee: u16,
    }

    /// USDC shared among the holders; `index` is the reward index after it.
    #[derive(Drop, Debug, PartialEq, starknet::Event)]
    pub struct Paid {
        #[key]
        pub payer: ContractAddress,
        pub amount: u256,
        pub index: u256,
    }

    #[derive(Drop, Debug, PartialEq, starknet::Event)]
    pub struct Claimed {
        #[key]
        pub account: ContractAddress,
        pub amount: u256,
    }

    /// A contract holder's USDC, paid to the owner (`recipient`).
    #[derive(Drop, Debug, PartialEq, starknet::Event)]
    pub struct Collected {
        #[key]
        pub holder: ContractAddress,
        pub recipient: ContractAddress,
        pub amount: u256,
    }

    #[derive(Drop, Debug, PartialEq, starknet::Event)]
    pub struct Paused {
        pub account: ContractAddress,
    }

    #[derive(Drop, Debug, PartialEq, starknet::Event)]
    pub struct Unpaused {
        pub account: ContractAddress,
    }

    #[derive(Drop, Debug, PartialEq, starknet::Event)]
    pub struct Opened {
        pub account: ContractAddress,
    }

    #[derive(Drop, Debug, PartialEq, starknet::Event)]
    pub struct Closed {
        pub account: ContractAddress,
    }

    // Constructor

    /// `exit_fee` in basis points, at most `MAX_EXIT_FEE_BPS` (`DEFAULT_EXIT_FEE_BPS` at launch);
    /// `usdc` the reward token. The Vault starts open and not paused, with no share.
    #[constructor]
    fn constructor(
        ref self: ContractState,
        owner: ContractAddress,
        paved: ContractAddress,
        usdc: ContractAddress,
        exit_fee: u16,
    ) {
        // [Check] An owner, a reward token, an asset (the component checks it is not zero)
        assert(owner.is_non_zero() && usdc.is_non_zero(), errors::ZERO_ADDRESS);
        // [Effect] The share's metadata, its asset, the reward token, the owner, the fee
        self.erc20.initializer("Vault PAVED", "vPAVED");
        self.erc4626.initializer(paved);
        self.usdc.write(usdc);
        self.ownable.initialize(owner);
        self.write_exit_fee(exit_fee);
    }

    // Hooks

    /// Every balance change (transfer, mint on deposit, burn on withdraw) first settles the reward
    /// of both sides at their balances before it (Nums, `before_update`), then moves the voting
    /// units after it, and the supply's checkpoint on a mint or a burn.
    impl ERC20HooksImpl of ERC20Component::ERC20HooksTrait<ContractState> {
        fn before_update(
            ref self: ERC20Component::ComponentState<ContractState>,
            from: ContractAddress,
            recipient: ContractAddress,
            amount: u256,
        ) {
            let mut contract_state = self.get_contract_mut();
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
            let mut contract_state = self.get_contract_mut();
            contract_state.erc20_votes.transfer_voting_units(from, recipient, amount);
        }
    }

    /// Deposits and mints stop while paused, and one that would mint no share reverts; withdraws
    /// and redeems stop while paused or closed. The exit fee, `Fee::Assets`, needs no move: the
    /// component sends out only the assets net of it, so it stays in `total_assets`.
    impl ERC4626HooksImpl of ERC4626Component::ERC4626HooksTrait<ContractState> {
        fn before_deposit(
            ref self: ERC4626Component::ComponentState<ContractState>,
            caller: ContractAddress,
            receiver: ContractAddress,
            assets: u256,
            shares: u256,
            fee: Option<Fee>,
        ) {
            let contract_state = self.get_contract();
            assert(!contract_state.paused.read(), errors::PAUSED);
            assert(shares.is_non_zero(), errors::ZERO_SHARES);
        }

        fn before_withdraw(
            ref self: ERC4626Component::ComponentState<ContractState>,
            caller: ContractAddress,
            receiver: ContractAddress,
            owner: ContractAddress,
            assets: u256,
            shares: u256,
            fee: Option<Fee>,
        ) {
            let contract_state = self.get_contract();
            assert(!contract_state.paused.read(), errors::PAUSED);
            assert(!contract_state.closed.read(), errors::CLOSED);
        }
    }

    /// The exit fee is `f = exit_fee / 10_000` of the PAVED the holder receives, on both exits,
    /// rounded up: on a `withdraw` of `a`, `a x f` on top (the shares of `a + fee` burn); on a
    /// `redeem` worth `v`, `v x f / (1 + f)` inside (the holder gets `v - fee`). No entry fee.
    impl FeeConfigImpl of ERC4626Component::FeeConfigTrait<ContractState> {
        fn calculate_withdraw_fee(
            self: @ERC4626Component::ComponentState<ContractState>, assets: u256, shares: u256,
        ) -> Option<Fee> {
            let fee: u256 = self.get_contract().exit_fee.read().into();
            Option::Some(Fee::Assets(math::u256_mul_div(assets, fee, BPS, Rounding::Ceil)))
        }

        fn calculate_redeem_fee(
            self: @ERC4626Component::ComponentState<ContractState>, assets: u256, shares: u256,
        ) -> Option<Fee> {
            let fee: u256 = self.get_contract().exit_fee.read().into();
            Option::Some(Fee::Assets(math::u256_mul_div(assets, fee, fee + BPS, Rounding::Ceil)))
        }
    }

    /// `max_withdraw` is what redeeming the whole balance pays, the fee taken: `withdraw` of it
    /// burns at most the balance.
    impl LimitConfigImpl of ERC4626Component::LimitConfigTrait<ContractState> {
        fn withdraw_limit(
            self: @ERC4626Component::ComponentState<ContractState>, owner: ContractAddress,
        ) -> Option<u256> {
            let contract_state = self.get_contract();
            let shares = contract_state.erc20.balance_of(owner);
            Option::Some(contract_state.erc4626._preview_redeem_assets(shares))
        }
    }

    // Implementations

    #[abi(embed_v0)]
    impl VaultImpl of IVault<ContractState> {
        fn exit_fee(self: @ContractState) -> u16 {
            self.exit_fee.read()
        }

        fn set_exit_fee(ref self: ContractState, fee: u16) {
            self.ownable.assert_only_owner();
            self.write_exit_fee(fee);
        }

        fn reward_token(self: @ContractState) -> ContractAddress {
            self.usdc.read()
        }

        fn reward_index(self: @ContractState) -> u256 {
            self.reward_index.read()
        }

        fn claimable_of(self: @ContractState, account: ContractAddress) -> u256 {
            self.pending_of(account) / REWARD_SCALE
        }

        fn claimed_of(self: @ContractState, account: ContractAddress) -> u256 {
            self.reward_claimed.read(account)
        }

        fn earned_of(self: @ContractState, account: ContractAddress) -> u256 {
            self.reward_claimed.read(account) + self.pending_of(account) / REWARD_SCALE
        }

        fn total_paid(self: @ContractState) -> u256 {
            self.total_paid.read()
        }

        fn total_claimed(self: @ContractState) -> u256 {
            self.total_claimed.read()
        }

        fn reward_waiting(self: @ContractState) -> u256 {
            self.reward_waiting.read()
        }

        fn pay(ref self: ContractState, amount: u256) {
            if amount.is_zero() {
                return;
            }
            // [Effect] The index rises by the payment over the shares of now; with no share, it
            // waits for the next payment (Nums reverts, which would stop the purchases)
            let supply = self.erc20.total_supply();
            let waiting = self.reward_waiting.read();
            let shared = amount + waiting;
            let mut index = self.reward_index.read();
            if supply.is_zero() {
                self.reward_waiting.write(shared);
            } else {
                index += shared * REWARD_SCALE / supply;
                self.reward_index.write(index);
                if waiting.is_non_zero() {
                    self.reward_waiting.write(0);
                }
            }
            self.total_paid.write(self.total_paid.read() + amount);
            // [Interaction] Pull the USDC
            let payer = get_caller_address();
            let usdc = IERC20Dispatcher { contract_address: self.usdc.read() };
            assert(
                usdc.transfer_from(payer, get_contract_address(), amount), errors::TRANSFER_FAILED,
            );
            self.emit(Paid { payer, amount, index });
        }

        fn claim(ref self: ContractState) -> u256 {
            // [Check] Neither paused nor closed
            self.assert_not_paused();
            assert(!self.closed.read(), errors::CLOSED);
            // [Effect] Take the caller's USDC out of its position
            let account = get_caller_address();
            let amount = self.take(account);
            assert(amount.is_non_zero(), errors::NOTHING_TO_CLAIM);
            // [Interaction] Pay it
            self.send(account, amount);
            self.emit(Claimed { account, amount });
            amount
        }

        fn collect(ref self: ContractState, holder: ContractAddress) -> u256 {
            // [Check] The owner; a contract holder, never an account (Nums: an SRC5 probe for
            // `ISRC6_ID`, which a holder without SRC5 makes revert); the Vault itself is no account
            self.ownable.assert_only_owner();
            assert(holder.is_non_zero(), errors::ZERO_ADDRESS);
            if holder != get_contract_address() {
                let src5 = ISRC5Dispatcher { contract_address: holder };
                assert(!src5.supports_interface(ISRC6_ID), errors::ACCOUNT_HOLDER);
            }
            // [Effect] Take the holder's USDC out of its position
            let amount = self.take(holder);
            assert(amount.is_non_zero(), errors::NOTHING_TO_CLAIM);
            // [Interaction] Pay it to the owner
            let recipient = get_caller_address();
            self.send(recipient, amount);
            self.emit(Collected { holder, recipient, amount });
            amount
        }

        fn is_paused(self: @ContractState) -> bool {
            self.paused.read()
        }

        fn is_open(self: @ContractState) -> bool {
            !self.closed.read()
        }

        fn pause(ref self: ContractState) {
            self.ownable.assert_only_owner();
            self.assert_not_paused();
            self.paused.write(true);
            self.emit(Paused { account: get_caller_address() });
        }

        fn unpause(ref self: ContractState) {
            self.ownable.assert_only_owner();
            assert(self.paused.read(), errors::NOT_PAUSED);
            self.paused.write(false);
            self.emit(Unpaused { account: get_caller_address() });
        }

        fn open(ref self: ContractState) {
            self.ownable.assert_only_owner();
            assert(self.closed.read(), errors::OPEN);
            self.closed.write(false);
            self.emit(Opened { account: get_caller_address() });
        }

        fn close(ref self: ContractState) {
            self.ownable.assert_only_owner();
            assert(!self.closed.read(), errors::CLOSED);
            self.closed.write(true);
            self.emit(Closed { account: get_caller_address() });
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
        fn write_exit_fee(ref self: ContractState, fee: u16) {
            // [Check] Within the ceiling
            assert(fee <= MAX_EXIT_FEE_BPS, errors::FEE_TOO_HIGH);
            // [Effect] Store it
            let previous = self.exit_fee.read();
            self.exit_fee.write(fee);
            self.emit(ExitFeeSet { previous, fee });
        }

        fn assert_not_paused(self: @ContractState) {
            assert(!self.paused.read(), errors::PAUSED);
        }

        /// The account's reward, times `REWARD_SCALE`, as if settled now (Nums' `claimable`).
        fn pending_of(self: @ContractState, account: ContractAddress) -> u256 {
            let delta = self.reward_index.read() - self.reward_snapshots.read(account);
            self.reward_pending.read(account) + self.erc20.balance_of(account) * delta
        }

        /// Moves what the account's balance earned since its last settlement into its pending
        /// reward, at the balance it holds now (before any change of it).
        fn settle(ref self: ContractState, account: ContractAddress) {
            let index = self.reward_index.read();
            let snapshot = self.reward_snapshots.read(account);
            if index == snapshot {
                return;
            }
            let balance = self.erc20.balance_of(account);
            if balance.is_non_zero() {
                let pending = self.reward_pending.read(account);
                self.reward_pending.write(account, pending + balance * (index - snapshot));
            }
            self.reward_snapshots.write(account, index);
        }

        /// Settles the account and takes its whole USDC out of its position, keeping the fraction
        /// under one base unit; returns the USDC taken.
        fn take(ref self: ContractState, account: ContractAddress) -> u256 {
            self.settle(account);
            let pending = self.reward_pending.read(account);
            let amount = pending / REWARD_SCALE;
            if amount.is_zero() {
                return 0;
            }
            self.reward_pending.write(account, pending % REWARD_SCALE);
            self.reward_claimed.write(account, self.reward_claimed.read(account) + amount);
            self.total_claimed.write(self.total_claimed.read() + amount);
            amount
        }

        fn send(ref self: ContractState, to: ContractAddress, amount: u256) {
            let usdc = IERC20Dispatcher { contract_address: self.usdc.read() };
            assert(usdc.transfer(to, amount), errors::TRANSFER_FAILED);
        }
    }

    #[generate_trait]
    impl PreviewImpl of PreviewTrait {
        /// `preview_redeem`, for the withdraw limit.
        fn _preview_redeem_assets(
            self: @ERC4626Component::ComponentState<ContractState>, shares: u256,
        ) -> u256 {
            let value = self._convert_to_assets(shares, Rounding::Floor);
            let fee: u256 = self.get_contract().exit_fee.read().into();
            value - math::u256_mul_div(value, fee, fee + BPS, Rounding::Ceil)
        }
    }
}
