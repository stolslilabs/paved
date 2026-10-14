//! The staking Vault and its share, vPAVED (P8, `docs/architecture/economy.md` section 4, P-31,
//! P-55, P-56, `docs/architecture/vault-share.md`, its addendum).
//!
//! An OpenZeppelin ERC4626 over PAVED ("Vault PAVED", `vPAVED`, 18 decimals, offset 0): `deposit`,
//! `mint`, `withdraw` and `redeem`. The rate (PAVED per vPAVED) is `(total_assets + 1) /
//! (total_supply + 1)`, where `total_assets` is the PAVED the Vault holds. Only three things raise
//! it: PAVED reaching the Vault without shares (the margin of every purchase, which `Economy` sends
//! as PAVED by a plain transfer, or a donation), the exit fee, and the rounding, which always
//! favours the Vault.
//!
//! - The exit fee: `exit_fee` bps of the PAVED that leaves, on `withdraw` and `redeem` alike, kept
//!   in the Vault for the holders who stay (`Fee::Assets`). `max_withdraw` counts it.
//! - The inflation defence: the deployment deposits 1,000 PAVED of dead shares, held by the Vault
//!   itself (nothing can redeem them), before any purchase; a deposit that would mint no share
//!   reverts.
//! - Votes: `VotesComponent`, a timestamp clock, units counted in vPAVED once delegated.
//! - The owner (two-step) may replace the class (`upgrade`, P-56, D-17, P-42) and set the exit fee
//!   within `MAX_EXIT_FEE_BPS`; nothing else: no pause, no other setter, no way into the holders'
//!   PAVED but an upgrade.
//!
//! USDC sent to the Vault is stranded: it has no USDC path.

// Constants

/// The exit fee's default (1 %) and ceiling (5 %), in basis points.
pub const DEFAULT_EXIT_FEE_BPS: u16 = 100;
pub const MAX_EXIT_FEE_BPS: u16 = 500;
pub const BPS: u256 = 10_000;
/// The dead shares of the deployment: 1,000 PAVED deposited for the Vault itself.
pub const DEAD_ASSETS: u256 = 1_000_000_000_000_000_000_000;

#[starknet::interface]
pub trait IVault<TContractState> {
    /// The exit fee, in basis points of the PAVED that leaves.
    fn exit_fee(self: @TContractState) -> u16;
    /// Sets the exit fee, at most `MAX_EXIT_FEE_BPS`. The owner only.
    fn set_exit_fee(ref self: TContractState, fee: u16);
}

#[starknet::contract]
pub mod Vault {
    // Core imports

    use core::num::traits::Zero;

    // External imports

    use openzeppelin_governance::votes::VotesComponent;
    use openzeppelin_interfaces::erc20::IERC20;
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

    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};
    use starknet::{ClassHash, ContractAddress};

    // Local imports

    use super::{BPS, IVault, MAX_EXIT_FEE_BPS};

    // Errors

    pub mod errors {
        pub const ZERO_ADDRESS: felt252 = 'Vault: zero address';
        pub const FEE_TOO_HIGH: felt252 = 'Vault: fee too high';
        pub const ZERO_SHARES: felt252 = 'Vault: zero shares';
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
    }

    // Events

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        ExitFeeSet: ExitFeeSet,
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

    // Constructor

    /// `exit_fee` in basis points, at most `MAX_EXIT_FEE_BPS` (`DEFAULT_EXIT_FEE_BPS` at launch).
    #[constructor]
    fn constructor(
        ref self: ContractState, owner: ContractAddress, paved: ContractAddress, exit_fee: u16,
    ) {
        // [Check] An owner, an asset (the component checks it is not zero)
        assert(owner.is_non_zero(), errors::ZERO_ADDRESS);
        // [Effect] The share's metadata, its asset, the owner, the fee
        self.erc20.initializer("Vault PAVED", "vPAVED");
        self.erc4626.initializer(paved);
        self.ownable.initialize(owner);
        self.write_exit_fee(exit_fee);
    }

    // Hooks

    /// Every balance change (transfer, mint on deposit, burn on withdraw) moves the voting units
    /// after it, and the supply's checkpoint on a mint or a burn.
    impl ERC20HooksImpl of ERC20Component::ERC20HooksTrait<ContractState> {
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

    /// A deposit that would mint no share reverts. The exit fee, `Fee::Assets`, needs no move: the
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
            assert(shares.is_non_zero(), errors::ZERO_SHARES);
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
