// TEST ONLY: never deploy this contract. It moves no balance and calls back into `Daily`.

//! A token whose `transferFrom` and `transfer` call back into `Daily` once, during a `Lobby`
//! library call, to see whether the state written before the transfer holds (S1 audit, P-26:
//! checks, effects, interactions). It reports whether the re-entry reverted.

use starknet::ContractAddress;

/// What the re-entry calls: `Daily.spawn(1, 0, 0)`.
pub const SPAWN: u8 = 1;
/// `Daily.claim(tournament_id, rank)`.
pub const CLAIM: u8 = 2;
/// `Daily.claim(tournament_id, 0)`, the sponsors' reclaim (P-37).
pub const RECLAIM: u8 = 3;
/// `Daily.sponsor(1000)`.
pub const SPONSOR: u8 = 4;

#[starknet::interface]
pub trait IReentrantToken<TContractState> {
    /// Arms one re-entry into `daily`, made on the next transfer, whatever it is.
    fn arm(
        ref self: TContractState, daily: ContractAddress, action: u8, tournament_id: u64, rank: u8,
    );
    /// How many re-entries ran and how many of them reverted.
    fn outcome(self: @TContractState) -> (u32, u32);
    /// The first panic datum of the reverted re-entry (0 if none reverted).
    fn error(self: @TContractState) -> felt252;
    /// The sum paid into this token by `transferFrom`, and the recipient of the last one.
    fn paid(self: @TContractState) -> (u256, ContractAddress);
    fn transferFrom(
        ref self: TContractState, sender: ContractAddress, recipient: ContractAddress, amount: u256,
    ) -> bool;
    fn transfer(ref self: TContractState, recipient: ContractAddress, amount: u256) -> bool;
}

#[starknet::contract]
pub mod ReentrantToken {
    use core::num::traits::Zero;
    use paved::systems::daily::{IDailySafeDispatcher, IDailySafeDispatcherTrait};
    use starknet::ContractAddress;
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};
    use super::{CLAIM, IReentrantToken, RECLAIM, SPAWN, SPONSOR};

    #[storage]
    struct Storage {
        daily: ContractAddress,
        action: u8,
        tournament_id: u64,
        rank: u8,
        attempts: u32,
        reverted: u32,
        error: felt252,
        paid: u256,
        last_recipient: ContractAddress,
    }

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        /// The one re-entry, if armed and not yet made.
        fn reenter(ref self: ContractState) {
            let action = self.action.read();
            if action == 0 || self.attempts.read() != 0 {
                return;
            }
            self.attempts.write(1);
            let daily = IDailySafeDispatcher { contract_address: self.daily.read() };
            let result = if action == SPAWN {
                match daily.spawn(1, Zero::zero(), 0) {
                    Result::Ok(_) => Result::Ok(()),
                    Result::Err(e) => Result::Err(e),
                }
            } else if action == CLAIM {
                daily.claim(self.tournament_id.read(), self.rank.read())
            } else if action == RECLAIM {
                daily.claim(self.tournament_id.read(), 0)
            } else {
                assert(action == SPONSOR, 'Reentrant: unknown action');
                daily.sponsor(1000)
            };
            if let Result::Err(data) = result {
                self.reverted.write(self.reverted.read() + 1);
                self.error.write(*data.at(0));
            }
        }
    }

    #[abi(embed_v0)]
    impl ReentrantTokenImpl of IReentrantToken<ContractState> {
        fn arm(
            ref self: ContractState,
            daily: ContractAddress,
            action: u8,
            tournament_id: u64,
            rank: u8,
        ) {
            self.daily.write(daily);
            self.action.write(action);
            self.tournament_id.write(tournament_id);
            self.rank.write(rank);
            self.attempts.write(0);
            self.reverted.write(0);
            self.error.write(0);
        }

        fn outcome(self: @ContractState) -> (u32, u32) {
            (self.attempts.read(), self.reverted.read())
        }

        fn error(self: @ContractState) -> felt252 {
            self.error.read()
        }

        fn paid(self: @ContractState) -> (u256, ContractAddress) {
            (self.paid.read(), self.last_recipient.read())
        }

        fn transferFrom(
            ref self: ContractState,
            sender: ContractAddress,
            recipient: ContractAddress,
            amount: u256,
        ) -> bool {
            self.paid.write(self.paid.read() + amount);
            self.last_recipient.write(recipient);
            self.reenter();
            true
        }

        fn transfer(ref self: ContractState, recipient: ContractAddress, amount: u256) -> bool {
            self.reenter();
            true
        }
    }
}
