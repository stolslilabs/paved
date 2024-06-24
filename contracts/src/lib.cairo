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
    mod emitter;
    mod initializable;
    mod ownable;
    mod manageable;
    mod hostable;
    mod payable;
    mod playable;
}

mod systems {
    mod account;
    mod daily;
}

#[cfg(test)]
mod tests {
    // mod setup;
    // mod ranked;
    // mod discard;
    // mod build;
    // mod cases;

    mod mocks {
        mod erc20;
    }
}

