pub mod constants;
pub mod store;
pub mod events;

pub mod types {
    pub mod area;
    pub mod deck;
    pub mod plan;
    pub mod layout;
    pub mod mode;
    pub mod move;
    pub mod category;
    pub mod orientation;
    pub mod direction;
    pub mod role;
    pub mod spot;
}

pub mod elements {
    pub mod decks {
        pub mod interface;
        pub mod base;
        pub mod simple;
        pub mod tutorial;
    }

    pub mod layouts {
        pub mod interface;
        pub mod ccccccccc;
        pub mod cccccfffc;
        pub mod cccccfrfc;
        pub mod cfffcfffc;
        pub mod ffcfffcff;
        pub mod ffcfffffc;
        pub mod ffffcccff;
        pub mod ffffffcff;
        pub mod rfffrfcfr;
        pub mod rfffrfffr;
        pub mod rfrfcccfr;
        pub mod rfrfffcfr;
        pub mod rfrfffffr;
        pub mod rfrfrfcff;
        pub mod sfrfrfcfr;
        pub mod sfrfrfffr;
        pub mod sfrfrfrfr;
        pub mod wffffffff;
        pub mod wfffffffr;
    }
}

pub mod helpers {
    pub mod bitmap;
    pub mod math;
    pub mod multiplier;
    pub mod generic;
    pub mod simple;
    pub mod wonder;
    pub mod conflict;
}

pub mod models {
    pub mod game;
    pub mod player;
    pub mod builder;
    pub mod tile;
    pub mod character;
    pub mod tournament;
    pub mod index;
}

pub mod components {
    pub mod emitter;
    pub mod manageable;
    pub mod hostable;
    pub mod payable;
    pub mod playable;
    pub mod tutoriable;
}

pub mod systems {
    pub mod account;
    pub mod daily;
    pub mod weekly;
    pub mod tutorial;
}

pub mod mocks {
    pub mod token;
    pub mod erc20 {
        pub mod interface;
        pub mod erc20;
    }
}

#[cfg(test)]
pub mod tests {
    pub mod setup;
    pub mod e2e;
}
