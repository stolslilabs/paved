mod constants;
mod store;

mod types {
    mod area;
    mod plan;
    mod layout;
    mod move;
    mod category;
    mod order;
    mod orientation;
    mod direction;
    mod role;
    mod spot;
}

mod layouts {
    mod interface;
    mod ccccccccc;
    mod cccccfffc;
    mod cccccfrfc;
    mod cfffcfffc;
    mod cfffcfrfc;
    mod ffcfffcfc;
    mod ffcfffcff;
    mod ffcfffffc;
    mod ffffcccff;
    mod ffffffcff;
    mod rfffrfcfr;
    mod rfffrfffr;
    mod rfrfcccfr;
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

mod helpers {
    mod bitmap;
    mod generic;
    mod conflict;
    mod road;
    mod forest;
}

mod models {
    mod game;
    mod builder;
    mod tile;
    mod character;
}

mod systems {
    mod play;
}

#[cfg(test)]
mod tests {
    mod setup;
    mod create;
    mod buy;
    mod draw;
    mod discard;
    mod build;
}
