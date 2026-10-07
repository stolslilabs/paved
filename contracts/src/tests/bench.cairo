//! Bench tests of the leaderboard update (phase P6): `bench_*` primes a tournament and runs one
//! operation, `base_*` only primes it; the difference of their L2 gas is the operation.

use paved::tests::bench_backend::{ranked1, submit, top1};
use paved::tests::setup::setup;
use paved::types::mode::Mode;
use snforge_std::interact_with_state;
use starknet::ContractAddress;

const ID: u64 = 20000;

#[test]
fn test_base_full_rank1() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let c: ContractAddress = systems.daily.contract_address;
    interact_with_state(c, || {
        submit(c, ID, 101, 30);
    });
    interact_with_state(c, || {
        submit(c, ID, 102, 20);
    });
    interact_with_state(c, || {
        submit(c, ID, 103, 10);
    });
}

#[test]
fn test_bench_full_rank1() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let c: ContractAddress = systems.daily.contract_address;
    interact_with_state(c, || {
        submit(c, ID, 101, 30);
    });
    interact_with_state(c, || {
        submit(c, ID, 102, 20);
    });
    interact_with_state(c, || {
        submit(c, ID, 103, 10);
    });
    interact_with_state(c, || {
        submit(c, ID, 9, 40);
    });
}

#[test]
fn test_base_full_rank2() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let c: ContractAddress = systems.daily.contract_address;
    interact_with_state(c, || {
        submit(c, ID, 101, 30);
    });
    interact_with_state(c, || {
        submit(c, ID, 102, 20);
    });
    interact_with_state(c, || {
        submit(c, ID, 103, 10);
    });
}

#[test]
fn test_bench_full_rank2() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let c: ContractAddress = systems.daily.contract_address;
    interact_with_state(c, || {
        submit(c, ID, 101, 30);
    });
    interact_with_state(c, || {
        submit(c, ID, 102, 20);
    });
    interact_with_state(c, || {
        submit(c, ID, 103, 10);
    });
    interact_with_state(c, || {
        submit(c, ID, 9, 25);
    });
}

#[test]
fn test_base_full_rank3() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let c: ContractAddress = systems.daily.contract_address;
    interact_with_state(c, || {
        submit(c, ID, 101, 30);
    });
    interact_with_state(c, || {
        submit(c, ID, 102, 20);
    });
    interact_with_state(c, || {
        submit(c, ID, 103, 10);
    });
}

#[test]
fn test_bench_full_rank3() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let c: ContractAddress = systems.daily.contract_address;
    interact_with_state(c, || {
        submit(c, ID, 101, 30);
    });
    interact_with_state(c, || {
        submit(c, ID, 102, 20);
    });
    interact_with_state(c, || {
        submit(c, ID, 103, 10);
    });
    interact_with_state(c, || {
        submit(c, ID, 9, 15);
    });
}

#[test]
fn test_base_full_not_placed() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let c: ContractAddress = systems.daily.contract_address;
    interact_with_state(c, || {
        submit(c, ID, 101, 30);
    });
    interact_with_state(c, || {
        submit(c, ID, 102, 20);
    });
    interact_with_state(c, || {
        submit(c, ID, 103, 10);
    });
}

#[test]
fn test_bench_full_not_placed() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let c: ContractAddress = systems.daily.contract_address;
    interact_with_state(c, || {
        submit(c, ID, 101, 30);
    });
    interact_with_state(c, || {
        submit(c, ID, 102, 20);
    });
    interact_with_state(c, || {
        submit(c, ID, 103, 10);
    });
    interact_with_state(c, || {
        submit(c, ID, 9, 5);
    });
}

#[test]
fn test_base_full_score0() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let c: ContractAddress = systems.daily.contract_address;
    interact_with_state(c, || {
        submit(c, ID, 101, 30);
    });
    interact_with_state(c, || {
        submit(c, ID, 102, 20);
    });
    interact_with_state(c, || {
        submit(c, ID, 103, 10);
    });
}

#[test]
fn test_bench_full_score0() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let c: ContractAddress = systems.daily.contract_address;
    interact_with_state(c, || {
        submit(c, ID, 101, 30);
    });
    interact_with_state(c, || {
        submit(c, ID, 102, 20);
    });
    interact_with_state(c, || {
        submit(c, ID, 103, 10);
    });
    interact_with_state(c, || {
        submit(c, ID, 9, 0);
    });
}

#[test]
fn test_base_full_player0() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let c: ContractAddress = systems.daily.contract_address;
    interact_with_state(c, || {
        submit(c, ID, 101, 30);
    });
    interact_with_state(c, || {
        submit(c, ID, 102, 20);
    });
    interact_with_state(c, || {
        submit(c, ID, 103, 10);
    });
}

#[test]
fn test_bench_full_player0() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let c: ContractAddress = systems.daily.contract_address;
    interact_with_state(c, || {
        submit(c, ID, 101, 30);
    });
    interact_with_state(c, || {
        submit(c, ID, 102, 20);
    });
    interact_with_state(c, || {
        submit(c, ID, 103, 10);
    });
    interact_with_state(c, || {
        submit(c, ID, 0, 40);
    });
}

#[test]
fn test_base_top_full() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let c: ContractAddress = systems.daily.contract_address;
    interact_with_state(c, || {
        submit(c, ID, 101, 30);
    });
    interact_with_state(c, || {
        submit(c, ID, 102, 20);
    });
    interact_with_state(c, || {
        submit(c, ID, 103, 10);
    });
}

#[test]
fn test_bench_top_full() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let c: ContractAddress = systems.daily.contract_address;
    interact_with_state(c, || {
        submit(c, ID, 101, 30);
    });
    interact_with_state(c, || {
        submit(c, ID, 102, 20);
    });
    interact_with_state(c, || {
        submit(c, ID, 103, 10);
    });
    interact_with_state(c, || {
        top1(c, ID);
    });
}

#[test]
fn test_base_ranked_full() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let c: ContractAddress = systems.daily.contract_address;
    interact_with_state(c, || {
        submit(c, ID, 101, 30);
    });
    interact_with_state(c, || {
        submit(c, ID, 102, 20);
    });
    interact_with_state(c, || {
        submit(c, ID, 103, 10);
    });
}

#[test]
fn test_bench_ranked_full() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let c: ContractAddress = systems.daily.contract_address;
    interact_with_state(c, || {
        submit(c, ID, 101, 30);
    });
    interact_with_state(c, || {
        submit(c, ID, 102, 20);
    });
    interact_with_state(c, || {
        submit(c, ID, 103, 10);
    });
    interact_with_state(c, || {
        ranked1(c, ID);
    });
}

#[test]
fn test_base_ranked_empty() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let c: ContractAddress = systems.daily.contract_address;
}

#[test]
fn test_bench_ranked_empty() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let c: ContractAddress = systems.daily.contract_address;
    interact_with_state(c, || {
        ranked1(c, ID);
    });
}

#[test]
fn test_base_first1() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let c: ContractAddress = systems.daily.contract_address;
}

#[test]
fn test_bench_first1() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let c: ContractAddress = systems.daily.contract_address;
    interact_with_state(c, || {
        submit(c, ID, 1, 30);
    });
}

#[test]
fn test_base_first2() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let c: ContractAddress = systems.daily.contract_address;
    interact_with_state(c, || {
        submit(c, ID, 101, 30);
    });
}

#[test]
fn test_bench_first2() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let c: ContractAddress = systems.daily.contract_address;
    interact_with_state(c, || {
        submit(c, ID, 101, 30);
    });
    interact_with_state(c, || {
        submit(c, ID, 2, 20);
    });
}

#[test]
fn test_base_first3() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let c: ContractAddress = systems.daily.contract_address;
    interact_with_state(c, || {
        submit(c, ID, 101, 30);
    });
    interact_with_state(c, || {
        submit(c, ID, 102, 20);
    });
}

#[test]
fn test_bench_first3() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let c: ContractAddress = systems.daily.contract_address;
    interact_with_state(c, || {
        submit(c, ID, 101, 30);
    });
    interact_with_state(c, || {
        submit(c, ID, 102, 20);
    });
    interact_with_state(c, || {
        submit(c, ID, 3, 10);
    });
}

#[test]
fn test_base_h10_rank1() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let c: ContractAddress = systems.daily.contract_address;
    interact_with_state(c, || {
        submit(c, ID, 101, 30);
    });
    interact_with_state(c, || {
        submit(c, ID, 102, 20);
    });
    interact_with_state(c, || {
        submit(c, ID, 103, 10);
    });
    interact_with_state(c, || {
        submit(c, ID, 104, 1);
    });
    interact_with_state(c, || {
        submit(c, ID, 105, 2);
    });
    interact_with_state(c, || {
        submit(c, ID, 106, 3);
    });
    interact_with_state(c, || {
        submit(c, ID, 107, 4);
    });
    interact_with_state(c, || {
        submit(c, ID, 108, 5);
    });
    interact_with_state(c, || {
        submit(c, ID, 109, 6);
    });
    interact_with_state(c, || {
        submit(c, ID, 110, 7);
    });
}

#[test]
fn test_bench_h10_rank1() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let c: ContractAddress = systems.daily.contract_address;
    interact_with_state(c, || {
        submit(c, ID, 101, 30);
    });
    interact_with_state(c, || {
        submit(c, ID, 102, 20);
    });
    interact_with_state(c, || {
        submit(c, ID, 103, 10);
    });
    interact_with_state(c, || {
        submit(c, ID, 104, 1);
    });
    interact_with_state(c, || {
        submit(c, ID, 105, 2);
    });
    interact_with_state(c, || {
        submit(c, ID, 106, 3);
    });
    interact_with_state(c, || {
        submit(c, ID, 107, 4);
    });
    interact_with_state(c, || {
        submit(c, ID, 108, 5);
    });
    interact_with_state(c, || {
        submit(c, ID, 109, 6);
    });
    interact_with_state(c, || {
        submit(c, ID, 110, 7);
    });
    interact_with_state(c, || {
        submit(c, ID, 9, 40);
    });
}

#[test]
fn test_base_h10_not_placed() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let c: ContractAddress = systems.daily.contract_address;
    interact_with_state(c, || {
        submit(c, ID, 101, 30);
    });
    interact_with_state(c, || {
        submit(c, ID, 102, 20);
    });
    interact_with_state(c, || {
        submit(c, ID, 103, 10);
    });
    interact_with_state(c, || {
        submit(c, ID, 104, 1);
    });
    interact_with_state(c, || {
        submit(c, ID, 105, 2);
    });
    interact_with_state(c, || {
        submit(c, ID, 106, 3);
    });
    interact_with_state(c, || {
        submit(c, ID, 107, 4);
    });
    interact_with_state(c, || {
        submit(c, ID, 108, 5);
    });
    interact_with_state(c, || {
        submit(c, ID, 109, 6);
    });
    interact_with_state(c, || {
        submit(c, ID, 110, 7);
    });
}

#[test]
fn test_bench_h10_not_placed() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let c: ContractAddress = systems.daily.contract_address;
    interact_with_state(c, || {
        submit(c, ID, 101, 30);
    });
    interact_with_state(c, || {
        submit(c, ID, 102, 20);
    });
    interact_with_state(c, || {
        submit(c, ID, 103, 10);
    });
    interact_with_state(c, || {
        submit(c, ID, 104, 1);
    });
    interact_with_state(c, || {
        submit(c, ID, 105, 2);
    });
    interact_with_state(c, || {
        submit(c, ID, 106, 3);
    });
    interact_with_state(c, || {
        submit(c, ID, 107, 4);
    });
    interact_with_state(c, || {
        submit(c, ID, 108, 5);
    });
    interact_with_state(c, || {
        submit(c, ID, 109, 6);
    });
    interact_with_state(c, || {
        submit(c, ID, 110, 7);
    });
    interact_with_state(c, || {
        submit(c, ID, 9, 5);
    });
}

#[test]
fn test_base_h10_top() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let c: ContractAddress = systems.daily.contract_address;
    interact_with_state(c, || {
        submit(c, ID, 101, 30);
    });
    interact_with_state(c, || {
        submit(c, ID, 102, 20);
    });
    interact_with_state(c, || {
        submit(c, ID, 103, 10);
    });
    interact_with_state(c, || {
        submit(c, ID, 104, 1);
    });
    interact_with_state(c, || {
        submit(c, ID, 105, 2);
    });
    interact_with_state(c, || {
        submit(c, ID, 106, 3);
    });
    interact_with_state(c, || {
        submit(c, ID, 107, 4);
    });
    interact_with_state(c, || {
        submit(c, ID, 108, 5);
    });
    interact_with_state(c, || {
        submit(c, ID, 109, 6);
    });
    interact_with_state(c, || {
        submit(c, ID, 110, 7);
    });
}

#[test]
fn test_bench_h10_top() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let c: ContractAddress = systems.daily.contract_address;
    interact_with_state(c, || {
        submit(c, ID, 101, 30);
    });
    interact_with_state(c, || {
        submit(c, ID, 102, 20);
    });
    interact_with_state(c, || {
        submit(c, ID, 103, 10);
    });
    interact_with_state(c, || {
        submit(c, ID, 104, 1);
    });
    interact_with_state(c, || {
        submit(c, ID, 105, 2);
    });
    interact_with_state(c, || {
        submit(c, ID, 106, 3);
    });
    interact_with_state(c, || {
        submit(c, ID, 107, 4);
    });
    interact_with_state(c, || {
        submit(c, ID, 108, 5);
    });
    interact_with_state(c, || {
        submit(c, ID, 109, 6);
    });
    interact_with_state(c, || {
        submit(c, ID, 110, 7);
    });
    interact_with_state(c, || {
        top1(c, ID);
    });
}

#[test]
fn test_base_h100_rank1() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let c: ContractAddress = systems.daily.contract_address;
    interact_with_state(
        c,
        || {
            let mut i: u32 = 0;
            submit(c, ID, 101, 30);
            submit(c, ID, 102, 20);
            submit(c, ID, 103, 10);
            while i < 97 {
                submit(c, ID, 104, i % 9 + 1);
                i += 1;
            }
        },
    );
}

#[test]
fn test_bench_h100_rank1() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let c: ContractAddress = systems.daily.contract_address;
    interact_with_state(
        c,
        || {
            let mut i: u32 = 0;
            submit(c, ID, 101, 30);
            submit(c, ID, 102, 20);
            submit(c, ID, 103, 10);
            while i < 97 {
                submit(c, ID, 104, i % 9 + 1);
                i += 1;
            }
        },
    );
    interact_with_state(c, || {
        submit(c, ID, 9, 40);
    });
}

#[test]
fn test_base_h100_not_placed() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let c: ContractAddress = systems.daily.contract_address;
    interact_with_state(
        c,
        || {
            let mut i: u32 = 0;
            submit(c, ID, 101, 30);
            submit(c, ID, 102, 20);
            submit(c, ID, 103, 10);
            while i < 97 {
                submit(c, ID, 104, i % 9 + 1);
                i += 1;
            }
        },
    );
}

#[test]
fn test_bench_h100_not_placed() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let c: ContractAddress = systems.daily.contract_address;
    interact_with_state(
        c,
        || {
            let mut i: u32 = 0;
            submit(c, ID, 101, 30);
            submit(c, ID, 102, 20);
            submit(c, ID, 103, 10);
            while i < 97 {
                submit(c, ID, 104, i % 9 + 1);
                i += 1;
            }
        },
    );
    interact_with_state(c, || {
        submit(c, ID, 9, 5);
    });
}

#[test]
fn test_base_h100_top() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let c: ContractAddress = systems.daily.contract_address;
    interact_with_state(
        c,
        || {
            let mut i: u32 = 0;
            submit(c, ID, 101, 30);
            submit(c, ID, 102, 20);
            submit(c, ID, 103, 10);
            while i < 97 {
                submit(c, ID, 104, i % 9 + 1);
                i += 1;
            }
        },
    );
}

#[test]
fn test_bench_h100_top() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let c: ContractAddress = systems.daily.contract_address;
    interact_with_state(
        c,
        || {
            let mut i: u32 = 0;
            submit(c, ID, 101, 30);
            submit(c, ID, 102, 20);
            submit(c, ID, 103, 10);
            while i < 97 {
                submit(c, ID, 104, i % 9 + 1);
                i += 1;
            }
        },
    );
    interact_with_state(c, || {
        top1(c, ID);
    });
}

#[test]
fn test_base_h1000_rank1() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let c: ContractAddress = systems.daily.contract_address;
    interact_with_state(
        c,
        || {
            let mut i: u32 = 0;
            submit(c, ID, 101, 30);
            submit(c, ID, 102, 20);
            submit(c, ID, 103, 10);
            while i < 997 {
                submit(c, ID, 104, i % 9 + 1);
                i += 1;
            }
        },
    );
}

#[test]
fn test_bench_h1000_rank1() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let c: ContractAddress = systems.daily.contract_address;
    interact_with_state(
        c,
        || {
            let mut i: u32 = 0;
            submit(c, ID, 101, 30);
            submit(c, ID, 102, 20);
            submit(c, ID, 103, 10);
            while i < 997 {
                submit(c, ID, 104, i % 9 + 1);
                i += 1;
            }
        },
    );
    interact_with_state(c, || {
        submit(c, ID, 9, 40);
    });
}

#[test]
fn test_base_h1000_not_placed() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let c: ContractAddress = systems.daily.contract_address;
    interact_with_state(
        c,
        || {
            let mut i: u32 = 0;
            submit(c, ID, 101, 30);
            submit(c, ID, 102, 20);
            submit(c, ID, 103, 10);
            while i < 997 {
                submit(c, ID, 104, i % 9 + 1);
                i += 1;
            }
        },
    );
}

#[test]
fn test_bench_h1000_not_placed() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let c: ContractAddress = systems.daily.contract_address;
    interact_with_state(
        c,
        || {
            let mut i: u32 = 0;
            submit(c, ID, 101, 30);
            submit(c, ID, 102, 20);
            submit(c, ID, 103, 10);
            while i < 997 {
                submit(c, ID, 104, i % 9 + 1);
                i += 1;
            }
        },
    );
    interact_with_state(c, || {
        submit(c, ID, 9, 5);
    });
}

#[test]
fn test_base_h1000_top() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let c: ContractAddress = systems.daily.contract_address;
    interact_with_state(
        c,
        || {
            let mut i: u32 = 0;
            submit(c, ID, 101, 30);
            submit(c, ID, 102, 20);
            submit(c, ID, 103, 10);
            while i < 997 {
                submit(c, ID, 104, i % 9 + 1);
                i += 1;
            }
        },
    );
}

#[test]
fn test_bench_h1000_top() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let c: ContractAddress = systems.daily.contract_address;
    interact_with_state(
        c,
        || {
            let mut i: u32 = 0;
            submit(c, ID, 101, 30);
            submit(c, ID, 102, 20);
            submit(c, ID, 103, 10);
            while i < 997 {
                submit(c, ID, 104, i % 9 + 1);
                i += 1;
            }
        },
    );
    interact_with_state(c, || {
        top1(c, ID);
    });
}

/// The cost of `interact_with_state` itself, which every `bench_*` pays and the operation does not:
/// the figures of the table are `bench - base - (bench_noop - base_noop)`.
#[test]
fn test_base_noop() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let c: ContractAddress = systems.daily.contract_address;
    interact_with_state(c, || {
        submit(c, ID, 101, 30);
    });
}

#[test]
fn test_bench_noop() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let c: ContractAddress = systems.daily.contract_address;
    interact_with_state(c, || {
        submit(c, ID, 101, 30);
    });
    interact_with_state(c, || {});
}
