mod constants;
mod store;
mod events;

mod types {
    mod area;
    mod deck;
    mod plan;
    mod layout;
    mod mode;
    mod move;
    mod category;
    mod orientation;
    mod direction;
    mod role;
    mod spot;
}

mod elements {
    mod decks {
        mod interface;
        mod base;
        mod simple;
        mod tutorial;
        // mod enhanced;
    }

    mod layouts {
        mod interface;
        mod ccccccccc;
        mod cccccfffc;
        mod cccccfrfc;
        mod cfffcfffc;
        mod ffcfffcff;
        mod ffcfffffc;
        mod ffffcccff;
        mod ffffffcff;
        mod rfffrfcfr;
        mod rfffrfffr;
        mod rfrfcccfr;
        mod rfrfffcfr;
        mod rfrfffffr;
        mod rfrfrfcff;
        mod sfrfrfcfr;
        mod sfrfrfffr;
        mod sfrfrfrfr;
        mod wffffffff;
        mod wfffffffr;
    }
}

mod helpers {
    mod bitmap;
    mod math;
    mod multiplier;
    mod generic;
    mod simple;
    mod wonder;
    mod conflict;
}

mod models {
    mod game;
    mod player;
    mod builder;
    mod tile;
    mod character;
    mod tournament;
    mod index;
}

mod components {
    mod manageable;
    mod hostable;
    mod payable;
    mod playable;
    mod tutoriable;
}

mod systems {
    mod account;
    mod daily;
    mod weekly;
    mod tutorial;
    mod duel;
}

mod mocks {
    mod token;
    mod erc20 {
        mod interface;
        mod erc20;
    }
}

#[cfg(test)]
mod tests {
    mod setup;
    mod tutorial;
    mod daily {
        mod ranked;
        mod discard;
        mod build;
    }
    mod weekly {
        mod ranked;
        mod discard;
        mod build;
    }
    mod duel {
        mod ranked;
        mod discard;
        mod build;
    }
}

