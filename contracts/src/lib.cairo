pub mod constants;
pub mod events;
pub mod leaderboard;
pub mod quests;
pub mod store;
pub mod views;

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

pub mod economy {
    pub mod ekubo;
    pub mod token;
    pub mod vault;
}

pub mod helpers {
    pub mod bitmap;
    pub mod math;
    pub mod multiplier;
    pub mod random_deck;
}

pub mod models {
    pub mod builder;
    pub mod character;
    pub mod game;
    pub mod index;
    pub mod player;
    pub mod tile;
    pub mod tournament;
}

pub mod components {
    pub mod hostable;
    pub mod manageable;
    pub mod ownable;
    pub mod payable;
    pub mod playable;
    pub mod tutoriable;
}

pub mod systems {
    pub mod account;
    pub mod collection;
    pub mod daily;
    pub mod lobby;
    pub mod tutorial;
}

pub mod structure {
    pub mod assessment;
    pub mod forest;
    pub mod oriented;
    pub mod placement;
    pub mod record;
    pub mod state;
    pub mod tables;
}

pub mod mocks {
    pub mod router;
    pub mod token;
    pub mod usdc;
    pub mod erc20 {
        pub mod erc20;
        pub mod interface;
    }
}

#[cfg(test)]
pub mod tests {
    pub mod bench;
    pub mod bench_backend;
    pub mod collection;
    pub mod differential;
    pub mod e2e;
    pub mod economy;
    pub mod golden;
    pub mod leaderboard;
    pub mod oracle;
    pub mod setup;
}
