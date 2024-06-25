// World

fn WORLD() -> starknet::ContractAddress {
    starknet::contract_address_const::<
        0x1e3b79a25df98dd5032e519c0637d0136f2e69f2cb1906d22dc336420a3ca16
    >()
}

fn TOKEN_ADDRESS() -> starknet::ContractAddress {
    starknet::contract_address_const::<
        0x21d38979aa1388702436102d42e0db359d32760ee2d939bf96b3941fc606153
    // 0x044e6bcc627e6201ce09f781d1aae44ea4c21c2fdef299e34fce55bef2d02210 // LORDS Sepolia
    // 0x49d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7
    // 0x51205c5e6ac3ad5691c28c0c5ffcdd62c70bddb63612f75a4bac9b2a85b9449
    // 0x0124aeb495b947201f5fac96fd1138e326ad86195b98df6dec9009158a533b49 // LORDS Starknet
    >()
}

// Game

const ROAD_BASE_POINTS: u32 = 100;
const FOREST_BASE_POINTS: u32 = 300;
const CITY_BASE_POINTS: u32 = 200;
const WONDER_BASE_POINTS: u32 = 900;
const DISCARD_POINTS: u32 = 50;

// Tournament

const DAILY_TOURNAMENT_PRICE: felt252 = 1_000_000_000_000_000_000;
const DAILY_TOURNAMENT_DURATION: u64 = 86400; // 1 day
const WEEKLY_TOURNAMENT_PRICE: felt252 = 1_000_000_000_000_000_000;
const WEEKLY_TOURNAMENT_DURATION: u64 = 604800; // 1 week

// Bonus curve

const BASE: u32 = 10235;
const MULTIPLIER: u32 = 10000;

// Packing / Unpacking

const MASK_8: u128 = 0xff;
