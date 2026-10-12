//! Where the leaderboard behind the interface keeps its ranking (L-1): what an upgrade of a
//! deployed `Daily` would see of the tournaments ranked before it.
//!
//! The native implementation kept a ranking in `PavedStorage.rankings` (four slots per tournament).
//! These tests write a ranking there, as a class deployed before the swap did, and read it back
//! through the interface: an implementation on other slots does not see it, and a submission
//! through the interface leaves those slots as they are.

use paved::leaderboard::{LeaderboardImpl, LeaderboardTrait, Submission};
use paved::store::{StoreImpl, StoreTrait};
use paved::tests::setup::setup;
use paved::types::mode::Mode;
use snforge_std::interact_with_state;
use starknet::ContractAddress;

const ID: u64 = 20000;
/// Scores 30, 20, 10 packed as the native ranking packs them (rank 1 in the low 32 bits).
const SCORES: felt252 = 30 + 20 * 0x100000000 + 10 * 0x10000000000000000;

fn daily() -> ContractAddress {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    systems.daily.contract_address
}

/// Writes a full native ranking for `ID`: players 101, 102, 103 with scores 30, 20, 10.
fn write_native(contract: ContractAddress) {
    interact_with_state(
        contract,
        || {
            let store = StoreImpl::new();
            let base = store.ranking_base(ID);
            store.ranking_write(base, 0, SCORES);
            store.ranking_write(base, 1, 101);
            store.ranking_write(base, 2, 102);
            store.ranking_write(base, 3, 103);
        },
    );
}

/// The ranking an earlier class wrote in the native slots, read through the interface: empty, the
/// package keeps its ranking elsewhere (on the native implementation this test fails: it reads
/// them).
#[test]
fn test_leaderboard_storage_package_does_not_read_the_native_slots() {
    let contract = daily();
    write_native(contract);
    let top = interact_with_state(contract, || LeaderboardImpl::new().top(ID));
    assert(top.first.score == 0 && top.first.player_id == 0, 'Storage: native slots read');
}

/// A submission through the interface leaves the native slots unchanged (package only, as above).
#[test]
fn test_leaderboard_storage_submit_leaves_the_native_slots() {
    let contract = daily();
    write_native(contract);
    let rank = interact_with_state(
        contract,
        || {
            LeaderboardImpl::new()
                .submit(ID, Submission { player_id: 7, game_id: 1, score: 25, time: 0 })
        },
    );
    assert(rank == 1, 'Storage: not ranked');
    let native = interact_with_state(contract, || StoreImpl::new().ranking(ID));
    assert(native.a == SCORES, 'Storage: scores written');
    assert(native.b == 101 && native.c == 102 && native.d == 103, 'Storage: players written');
}
