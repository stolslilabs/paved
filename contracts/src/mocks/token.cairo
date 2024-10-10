// SPDX-License-Identifier: MIT
// OpenZeppelin Contracts for Cairo v0.9.0 (presets/erc20.cairo)

/// # ERC20 Preset
///
/// The ERC20 contract offers basic functionality and provides a
/// fixed-supply mechanism for token distribution. The fixed supply is
/// set in the constructor.

use paved::mocks::erc20::interface::{IERC20Dispatcher, IERC20DispatcherTrait};

#[starknet::interface]
trait IERC20Faucet<TState> {
    fn mint(ref self: TState);
}

#[dojo::contract]
mod Token {
    const FAUCET_AMOUNT: u256 = 1_000_000_000_000_000_000_000_000; // 1E6 * 1E18
    use core::num::traits::Bounded;
    use core::Zeroable;
    use super::IERC20Faucet;
    use paved::mocks::erc20::interface;
    use starknet::ContractAddress;
    use starknet::get_caller_address;
    use starknet::storage::Map;

    #[storage]
    struct Storage {
        ERC20_name: felt252,
        ERC20_symbol: felt252,
        ERC20_total_supply: u256,
        ERC20_balances: Map<ContractAddress, u256>,
        ERC20_allowances: Map<(ContractAddress, ContractAddress), u256>,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        Transfer: Transfer,
        Approval: Approval,
    }

    /// Emitted when tokens are moved from address `from` to address `to`.
    #[derive(Drop, starknet::Event)]
    struct Transfer {
        #[key]
        from: ContractAddress,
        #[key]
        to: ContractAddress,
        value: u256
    }

    /// Emitted when the allowance of a `spender` for an `owner` is set by a call
    /// to `approve`. `value` is the new allowance.
    #[derive(Drop, starknet::Event)]
    struct Approval {
        #[key]
        owner: ContractAddress,
        #[key]
        spender: ContractAddress,
        value: u256
    }

    mod Errors {
        const APPROVE_FROM_ZERO: felt252 = 'ERC20: approve from 0';
        const APPROVE_TO_ZERO: felt252 = 'ERC20: approve to 0';
        const TRANSFER_FROM_ZERO: felt252 = 'ERC20: transfer from 0';
        const TRANSFER_TO_ZERO: felt252 = 'ERC20: transfer to 0';
        const BURN_FROM_ZERO: felt252 = 'ERC20: burn from 0';
        const MINT_TO_ZERO: felt252 = 'ERC20: mint to 0';
    }

    //
    // External
    //

    #[abi(embed_v0)]
    impl Faucet of IERC20Faucet<ContractState> {
        fn mint(ref self: ContractState) {
            let caller = get_caller_address();
            self._mint(caller, FAUCET_AMOUNT);
        }
    }

    #[abi(embed_v0)]
    impl ERC20 of interface::IERC20<ContractState> {
        /// Returns the value of tokens in existence.
        fn total_supply(self: @ContractState) -> u256 {
            self.ERC20_total_supply.read()
        }

        /// Returns the amount of tokens owned by `account`.
        fn balance_of(self: @ContractState, account: ContractAddress) -> u256 {
            self.ERC20_balances.read(account)
        }

        /// Returns the remaining number of tokens that `spender` is
        /// allowed to spend on behalf of `owner` through `transfer_from`.
        /// This is zero by default.
        /// This value changes when `approve` or `transfer_from` are called.
        fn allowance(
            self: @ContractState, owner: ContractAddress, spender: ContractAddress
        ) -> u256 {
            self.ERC20_allowances.read((owner, spender))
        }

        /// Moves `amount` tokens from the caller's token balance to `to`.
        ///
        /// Requirements:
        ///
        /// - `recipient` is not the zero address.
        /// - The caller has a balance of at least `amount`.
        ///
        /// Emits a `Transfer` event.
        fn transfer(ref self: ContractState, recipient: ContractAddress, amount: u256) -> bool {
            let sender = get_caller_address();
            self._transfer(sender, recipient, amount);
            true
        }

        /// Moves `amount` tokens from `from` to `to` using the allowance mechanism.
        /// `amount` is then deducted from the caller's allowance.
        ///
        /// Requirements:
        ///
        /// - `sender` is not the zero address.
        /// - `sender` must have a balance of at least `amount`.
        /// - `recipient` is not the zero address.
        /// - The caller has an allowance of `sender`'s tokens of at least `amount`.
        ///
        /// Emits a `Transfer` event.
        fn transfer_from(
            ref self: ContractState,
            sender: ContractAddress,
            recipient: ContractAddress,
            amount: u256
        ) -> bool {
            let caller = get_caller_address();
            self._spend_allowance(sender, caller, amount);
            self._transfer(sender, recipient, amount);
            true
        }

        /// Sets `amount` as the allowance of `spender` over the caller’s tokens.
        ///
        /// Requirements:
        ///
        /// - `spender` is not the zero address.
        ///
        /// Emits an `Approval` event.
        fn approve(ref self: ContractState, spender: ContractAddress, amount: u256) -> bool {
            let caller = get_caller_address();
            self._approve(caller, spender, amount);
            true
        }
    }

    #[abi(embed_v0)]
    impl ERC20Metadata of interface::IERC20Metadata<ContractState> {
        /// Returns the ticker symbol of the token, usually a shorter version of the name.
        fn symbol(self: @ContractState) -> felt252 {
            'LORDS'
        }

        /// Returns the number of decimals used to get its user representation.
        fn decimals(self: @ContractState) -> u8 {
            18
        }
    }

    /// Adds camelCase support for `IERC20`.
    #[abi(embed_v0)]
    impl ERC20CamelOnly of interface::IERC20CamelOnly<ContractState> {
        fn totalSupply(self: @ContractState) -> u256 {
            self.total_supply()
        }

        fn balanceOf(self: @ContractState, account: ContractAddress) -> u256 {
            self.balance_of(account)
        }

        fn transferFrom(
            ref self: ContractState,
            sender: ContractAddress,
            recipient: ContractAddress,
            amount: u256
        ) -> bool {
            self.transfer_from(sender, recipient, amount)
        }
    }

    //
    // Internal
    //

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        /// Internal method that moves an `amount` of tokens from `from` to `to`.
        ///
        /// Requirements:
        ///
        /// - `sender` is not the zero address.
        /// - `sender` must have at least a balance of `amount`.
        /// - `recipient` is not the zero address.
        ///
        /// Emits a `Transfer` event.
        fn _transfer(
            ref self: ContractState,
            sender: ContractAddress,
            recipient: ContractAddress,
            amount: u256
        ) {
            assert(!sender.is_zero(), Errors::TRANSFER_FROM_ZERO);
            assert(!recipient.is_zero(), Errors::TRANSFER_TO_ZERO);
            self.ERC20_balances.write(sender, self.ERC20_balances.read(sender) - amount);
            self.ERC20_balances.write(recipient, self.ERC20_balances.read(recipient) + amount);
            self.emit(Transfer { from: sender, to: recipient, value: amount });
        }

        /// Internal method that sets `amount` as the allowance of `spender` over the
        /// `owner`s tokens.
        ///
        /// Requirements:
        ///
        /// - `owner` is not the zero address.
        /// - `spender` is not the zero address.
        ///
        /// Emits an `Approval` event.
        fn _approve(
            ref self: ContractState, owner: ContractAddress, spender: ContractAddress, amount: u256
        ) {
            assert(!owner.is_zero(), Errors::APPROVE_FROM_ZERO);
            assert(!spender.is_zero(), Errors::APPROVE_TO_ZERO);
            self.ERC20_allowances.write((owner, spender), amount);
            self.emit(Approval { owner, spender, value: amount });
        }

        /// Creates a `value` amount of tokens and assigns them to `account`.
        ///
        /// Requirements:
        ///
        /// - `recipient` is not the zero address.
        ///
        /// Emits a `Transfer` event with `from` set to the zero address.
        fn _mint(ref self: ContractState, recipient: ContractAddress, amount: u256) {
            assert(!recipient.is_zero(), Errors::MINT_TO_ZERO);
            self.ERC20_total_supply.write(self.ERC20_total_supply.read() + amount);
            self.ERC20_balances.write(recipient, self.ERC20_balances.read(recipient) + amount);
            self.emit(Transfer { from: core::Zeroable::zero(), to: recipient, value: amount });
        }

        /// Destroys `amount` of tokens from `account`.
        ///
        /// Requirements:
        ///
        /// - `account` is not the zero address.
        /// - `account` must have at least a balance of `amount`.
        ///
        /// Emits a `Transfer` event with `to` set to the zero address.
        fn _burn(ref self: ContractState, account: ContractAddress, amount: u256) {
            assert(!account.is_zero(), Errors::BURN_FROM_ZERO);
            self.ERC20_total_supply.write(self.ERC20_total_supply.read() - amount);
            self.ERC20_balances.write(account, self.ERC20_balances.read(account) - amount);
            self.emit(Transfer { from: account, to: core::Zeroable::zero(), value: amount });
        }

        /// Updates `owner`s allowance for `spender` based on spent `amount`.
        /// Does not update the allowance value in case of infinite allowance.
        ///
        /// Requirements:
        ///
        /// - `spender` must have at least an allowance of `amount` from `owner`.
        ///
        /// Possibly emits an `Approval` event.
        fn _spend_allowance(
            ref self: ContractState, owner: ContractAddress, spender: ContractAddress, amount: u256
        ) {
            let current_allowance = self.ERC20_allowances.read((owner, spender));
            if current_allowance != Bounded::MAX {
                self._approve(owner, spender, current_allowance - amount);
            }
        }
    }
}
