pub mod constants;
pub mod day;
pub mod events;
pub mod quests;
pub mod seed;
pub mod store;
pub mod views;
pub mod vrf;

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
    pub mod spot;
}

pub mod elements {
    pub mod decks {
        pub mod base;
        pub mod interface;
        pub mod simple;
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
    pub mod curve;
    pub mod ekubo;
    pub mod mean;
}

pub mod avatar {
    pub mod catalogue;
    pub mod item;
    pub mod look;
}

pub mod helpers {
    pub mod bitmap;
    pub mod math;
    pub mod multiplier;
    pub mod random_deck;
}

pub mod matchmaker {
    pub mod crowns;
    pub mod pool;
    pub mod village;
}

pub mod models {
    pub mod builder;
    pub mod game;
    pub mod index;
    pub mod tile;
}

pub mod components {
    pub mod drawable;
    pub mod hostable;
    pub mod ownable;
    pub mod payable;
    pub mod playable;
}

pub mod systems {
    pub mod avatar;
    pub mod challenge;
    pub mod collection;
    pub mod economy;
    pub mod faucet;
    pub mod matchmaker;
    pub mod setup;
    pub mod story;
    pub mod token;
    pub mod vault;
    pub mod village;
}

pub mod structure {
    pub mod assessment;
    pub mod forest;
    pub mod oriented;
    pub mod owners;
    pub mod placement;
    pub mod record;
    pub mod state;
    pub mod tables;
    pub mod walk;
}

pub mod mocks {
    pub mod account;
    pub mod drawer;
    pub mod reentrant_token;
    pub mod router;
    pub mod token;
    pub mod vrf;
    pub mod erc20 {
        pub mod erc20;
        pub mod interface;
    }
}

#[cfg(test)]
pub mod tests {
    pub mod avatar;
    pub mod collection;
    pub mod deck_walk;
    pub mod differential;
    pub mod differential_g7a;
    pub mod draw_mask;
    pub mod e2e;
    pub mod economy;
    pub mod golden;
    pub mod legacy;
    pub mod legacy_d18;
    pub mod legacy_g1;
    pub mod legacy_g5;
    pub mod legacy_g7a;
    pub mod matchmaker;
    pub mod matchmaker_system;
    pub mod oracle;
    pub mod owners;
    pub mod seed;
    pub mod setup;
    pub mod story;
    pub mod village;
    pub mod vrf;
    pub mod walk_cost;
    pub mod xp_level;
}
