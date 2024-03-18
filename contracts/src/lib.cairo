mod constants;
mod store;
mod events;

mod types {
    mod alliance;
    mod area;
    mod deck;
    mod plan;
    mod layout;
    mod mode;
    mod move;
    mod category;
    mod order;
    mod orientation;
    mod direction;
    mod role;
    mod spot;
    mod tournament;
}

mod layouts {
    mod interface;
    mod ccccccccc;
    mod cccccfffc;
    mod cccccfrfc;
    mod cfcfccccc;
    mod cfcfcfcfc;
    mod cfcfcfffc;
    mod cffcfcffc;
    mod cfffcfffc;
    mod cfffcfrfc;
    mod fccfcccfc;
    mod fccfcfcfc;
    mod ffcfcccff;
    mod ffcfcfcfc;
    mod ffcfffccc;
    mod ffcfffcfc;
    mod ffcfffcff;
    mod ffcfffffc;
    mod ffffcccff;
    mod ffffffcff;
    mod rfffffcfr;
    mod rfffrfcff;
    mod rfffrfcfr;
    mod rfffrfffr;
    mod rfrfcccff;
    mod rfrfcccfr;
    mod rfrfffccc;
    mod rfrfffcff;
    mod rfrfffcfr;
    mod rfrfffffr;
    mod rfrfrfcff;
    mod sfffffffr;
    mod sfrfrfcfr;
    mod sfrfrfffr;
    mod sfrfrfrfr;
    mod wcccccccc;
    mod wffffffff;
    mod wfffffffr;
}

mod decks {
    mod base;
    mod enhanced;
}

mod helpers {
    mod bitmap;
    mod multiplier;
    mod generic;
    mod simple;
    mod forest;
    mod wonder;
    mod conflict;
}

mod models {
    mod game;
    mod player;
    mod team;
    mod builder;
    mod tile;
    mod character;
}

mod systems {
    fn WORLD() -> starknet::ContractAddress {
        starknet::contract_address_const::<
            0x65d5daf2ac5c3bcf4409b6a7861ae90c03c32869ade9b825e6a0e29beff249e
        >()
    }

    mod host;
    mod manage;
    mod play;
}

#[cfg(test)]
mod tests {
    mod setup;
    mod solo;
    mod join;
    mod transfer;
    mod buy;
    mod draw;
    mod discard;
    mod build;
    mod cases;
}
