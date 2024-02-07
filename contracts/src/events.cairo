//! Events definition.

#[derive(Drop, starknet::Event)]
struct Scored {
    game_id: u32,
    builder_id: felt252,
    order_id: u8,
    points: u32,
}
