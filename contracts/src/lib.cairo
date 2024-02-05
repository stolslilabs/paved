mod constants;
mod store;

mod types {
    mod alliance;
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
    mod simple;
    mod forest;
    mod wonder;
    mod conflict;
}

mod models {
    mod game;
    mod team;
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
    mod spawn;
    mod buy;
    mod draw;
    mod discard;
    mod build;
    mod cases {
        mod case_001 {
            mod test_case;
        }
        mod case_002 {
            mod test_case;
        }
        mod case_003 {
            mod test_case;
        }
        mod case_004 {
            mod test_case;
        }
        mod case_005 {
            mod test_case;
        }
        mod case_006 {
            mod test_case;
        }
        mod case_007 {
            mod test_case;
        }
        mod case_008 {
            mod test_case;
        }
        mod case_009 {
            mod test_case;
        }
        mod case_010 {
            mod test_case;
        }
    }
}
