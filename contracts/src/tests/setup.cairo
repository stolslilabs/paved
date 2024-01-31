mod setup {
    // Core imports

    use debug::PrintTrait;

    // Starknet imports

    use starknet::ContractAddress;
    use starknet::testing::{set_contract_address};

    // Dojo imports

    use dojo::world::{IWorldDispatcherTrait, IWorldDispatcher};
    use dojo::test_utils::{spawn_test_world, deploy_contract};

    // Internal imports

    use stolsli::models::game::Game;
    use stolsli::models::builder::Builder;
    use stolsli::models::tile::Tile;
    use stolsli::systems::play::{play, IPlayDispatcher, IPlayDispatcherTrait};

    // Constants

    fn BUILDER() -> ContractAddress {
        starknet::contract_address_const::<'BUILDER'>()
    }

    fn ANYONE() -> ContractAddress {
        starknet::contract_address_const::<'ANYONE'>()
    }

    #[derive(Drop)]
    struct Systems {
        play: IPlayDispatcher,
    }

    #[derive(Drop)]
    struct Context {
        game_id: u32,
        endtime: u64,
        points_cap: u32,
        tiles_cap: u32,
    }

    fn spawn_game() -> (IWorldDispatcher, Systems, Context) {
        // [Setup] World
        let mut models = array::ArrayTrait::new();
        models.append(stolsli::models::game::game::TEST_CLASS_HASH);
        models.append(stolsli::models::builder::builder::TEST_CLASS_HASH);
        models.append(stolsli::models::tile::tile::TEST_CLASS_HASH);
        let world = spawn_test_world(models);

        // [Setup] Systems
        let play_address = deploy_contract(play::TEST_CLASS_HASH, array![].span());
        let systems = Systems { play: IPlayDispatcher { contract_address: play_address }, };

        // [Setup] Contracts
        let game_id = systems.play.create(world, 0, 0, 0);
        let endtime: u64 = 0;
        let points_cap: u32 = 0;
        let tiles_cap: u32 = 0;
        let context = Context { game_id, endtime, points_cap, tiles_cap, };

        // [Return]
        set_contract_address(BUILDER());
        (world, systems, context)
    }
}
