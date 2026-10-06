pub mod constants;
pub mod events;
pub mod store;

pub mod types {
    pub mod area;
    pub mod category;
    pub mod deck;
    pub mod direction;
    pub mod layout;
    pub mod mode;
    pub mod move;
    pub mod orientation;
    pub mod plan;
    pub mod role;
    pub mod spot;
}

pub mod elements {
    pub mod decks {
        pub mod base;
        pub mod interface;
        pub mod simple;
        pub mod tutorial;
    }

    pub mod layouts {
        pub mod ccccccccc;
        pub mod cccccfffc;
        pub mod cccccfrfc;
        pub mod cfffcfffc;
        pub mod ffcfffcff;
        pub mod ffcfffffc;
        pub mod ffffcccff;
        pub mod ffffffcff;
        pub mod interface;
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
    pub mod config_templates;
    pub mod config_validation;
    pub mod conflict;
    pub mod economy_curve;
    pub mod generic;
    pub mod math;
    pub mod multiplier;
    pub mod simple;
    pub mod wonder;
}

pub mod models {
    pub mod builder;
    pub mod character;
    pub mod economy;
    pub mod game;
    pub mod index;
    pub mod player;
    pub mod tile;
    pub mod tournament;
}

pub mod components {
    pub mod emitter;
    pub mod hostable;
    pub mod manageable;
    pub mod payable;
    pub mod playable;
    pub mod tutoriable;
}

pub mod systems {
    pub mod account;
    pub mod configurable;
    pub mod daily;
    pub mod economy;
    pub mod tutorial;
    pub mod weekly;
}

pub mod mocks {
    pub mod token;
    pub mod erc20 {
        pub mod erc20;
        pub mod interface;
    }
}

#[cfg(test)]
pub mod tests {
    pub mod e2e;
    pub mod setup;
}
