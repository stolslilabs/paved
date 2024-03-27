mod setup {
    // Core imports

    use core::debug::PrintTrait;

    // Starknet imports

    use starknet::ContractAddress;
    use starknet::testing::{set_contract_address};

    // Dojo imports

    use dojo::world::{IWorldDispatcherTrait, IWorldDispatcher};
    use dojo::test_utils::{spawn_test_world, deploy_contract};

    // Internal imports

    use paved::models::game::{Game, GameImpl};
    use paved::models::player::Player;
    use paved::models::builder::Builder;
    use paved::models::team::Team;
    use paved::models::tile::Tile;
    use paved::systems::host::{host, IHostDispatcher, IHostDispatcherTrait};
    use paved::systems::manage::{manage, IManageDispatcher, IManageDispatcherTrait};
    use paved::systems::play::{play, IPlayDispatcher, IPlayDispatcherTrait};
    use paved::types::plan::{Plan, PlanImpl};
    use paved::types::mode::Mode;

    // Constants

    fn PLAYER() -> ContractAddress {
        starknet::contract_address_const::<'PLAYER'>()
    }

    fn ANYONE() -> ContractAddress {
        starknet::contract_address_const::<'ANYONE'>()
    }

    const PLAYER_NAME: felt252 = 'PLAYER';
    const ANYONE_NAME: felt252 = 'ANYONE';
    const PLAYER_ORDER_ID: u8 = 1;
    const ANYONE_ORDER_ID: u8 = 14;
    const GAME_NAME: felt252 = 'GAME';

    #[derive(Drop)]
    struct Systems {
        host: IHostDispatcher,
        manage: IManageDispatcher,
        play: IPlayDispatcher,
    }

    #[derive(Drop)]
    struct Context {
        player_id: felt252,
        player_name: felt252,
        player_order: u8,
        anyone_id: felt252,
        anyone_name: felt252,
        anyone_order: u8,
        game_id: u32,
        game_name: felt252,
        game_duration: u64,
        mode: Mode,
    }

    fn compute_seed(game: Game, target: Plan) -> felt252 {
        let mut seed: felt252 = 0;
        loop {
            let mut mut_game = game;
            mut_game.seed = seed;
            let (_, plan) = mut_game.draw_plan();
            if plan == target {
                break;
            } else {
                seed += 1;
            }
        };
        seed
    }

    #[inline(always)]
    fn spawn_game(mode: Mode) -> (IWorldDispatcher, Systems, Context) {
        // [Setup] World
        let mut models = core::array::ArrayTrait::new();
        models.append(paved::models::game::game::TEST_CLASS_HASH);
        models.append(paved::models::player::player::TEST_CLASS_HASH);
        models.append(paved::models::builder::builder::TEST_CLASS_HASH);
        models.append(paved::models::team::team::TEST_CLASS_HASH);
        models.append(paved::models::tile::tile::TEST_CLASS_HASH);
        let world = spawn_test_world(models);

        // [Setup] Systems
        let host_address = deploy_contract(host::TEST_CLASS_HASH, array![].span());
        let manage_address = deploy_contract(manage::TEST_CLASS_HASH, array![].span());
        let play_address = deploy_contract(play::TEST_CLASS_HASH, array![].span());
        let systems = Systems {
            host: IHostDispatcher { contract_address: host_address },
            manage: IManageDispatcher { contract_address: manage_address },
            play: IPlayDispatcher { contract_address: play_address },
        };

        // [Setup] Context
        set_contract_address(ANYONE());
        systems.manage.create(world, ANYONE_NAME, ANYONE_ORDER_ID, ANYONE());
        set_contract_address(PLAYER());
        systems.manage.create(world, PLAYER_NAME, PLAYER_ORDER_ID, PLAYER());
        let duration: u64 = 0;
        let game_id = systems.host.create(world, GAME_NAME, duration, mode.into());
        let context = Context {
            player_id: PLAYER().into(),
            player_name: PLAYER_NAME,
            player_order: PLAYER_ORDER_ID,
            anyone_id: ANYONE().into(),
            anyone_name: ANYONE_NAME,
            anyone_order: ANYONE_ORDER_ID,
            game_id: game_id,
            game_name: GAME_NAME,
            game_duration: duration,
            mode: mode,
        };

        // [Return]
        (world, systems, context)
    }
}
