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

    use paved::tests::mocks::erc20::{
        IERC20Dispatcher, IERC20DispatcherTrait, IERC20FaucetDispatcher,
        IERC20FaucetDispatcherTrait, ERC20
    };
    use paved::models::game::{Game, GameImpl};
    use paved::models::player::Player;
    use paved::models::builder::Builder;
    use paved::models::tile::Tile;
    use paved::models::tournament::Tournament;
    use paved::systems::host::{host, IHostDispatcher, IHostDispatcherTrait};
    use paved::systems::manage::{manage, IManageDispatcher, IManageDispatcherTrait};
    use paved::systems::play::{play, IPlayDispatcher, IPlayDispatcherTrait};
    use paved::types::plan::{Plan, PlanImpl};

    // Constants

    fn PLAYER() -> ContractAddress {
        starknet::contract_address_const::<'PLAYER'>()
    }

    fn ANYONE() -> ContractAddress {
        starknet::contract_address_const::<'ANYONE'>()
    }

    fn SOMEONE() -> ContractAddress {
        starknet::contract_address_const::<'SOMEONE'>()
    }

    fn NOONE() -> ContractAddress {
        starknet::contract_address_const::<'NOONE'>()
    }

    const PLAYER_NAME: felt252 = 'PLAYER';
    const ANYONE_NAME: felt252 = 'ANYONE';
    const SOMEONE_NAME: felt252 = 'SOMEONE';
    const NOONE_NAME: felt252 = 'NOONE';
    const PLAYER_ORDER_ID: u8 = 1;
    const ANYONE_ORDER_ID: u8 = 14;
    const SOMEONE_ORDER_ID: u8 = 7;
    const NOONE_ORDER_ID: u8 = 4;
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
        someone_id: felt252,
        someone_name: felt252,
        someone_order: u8,
        noone_id: felt252,
        noone_name: felt252,
        noone_order: u8,
        game_id: u32,
        game_name: felt252,
        game_duration: u64,
        erc20: IERC20Dispatcher,
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

    fn deploy_erc20() -> IERC20Dispatcher {
        let (address, _) = starknet::deploy_syscall(
            ERC20::TEST_CLASS_HASH.try_into().expect('Class hash conversion failed'),
            0,
            array![].span(),
            false
        )
            .expect('ERC20 deploy failed');
        IERC20Dispatcher { contract_address: address }
    }

    #[inline(always)]
    fn spawn_game() -> (IWorldDispatcher, Systems, Context) {
        // [Setup] World
        let mut models = core::array::ArrayTrait::new();
        models.append(paved::models::game::game::TEST_CLASS_HASH);
        models.append(paved::models::player::player::TEST_CLASS_HASH);
        models.append(paved::models::builder::builder::TEST_CLASS_HASH);
        models.append(paved::models::tile::tile::TEST_CLASS_HASH);
        models.append(paved::models::tournament::tournament::TEST_CLASS_HASH);
        let world = spawn_test_world(models);
        let erc20 = deploy_erc20();

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
        let faucet = IERC20FaucetDispatcher { contract_address: erc20.contract_address };
        set_contract_address(ANYONE());
        faucet.mint();
        erc20.approve(host_address, ERC20::FAUCET_AMOUNT);
        systems.manage.create(world, ANYONE_NAME, ANYONE_ORDER_ID, ANYONE());
        set_contract_address(SOMEONE());
        faucet.mint();
        erc20.approve(host_address, ERC20::FAUCET_AMOUNT);
        systems.manage.create(world, SOMEONE_NAME, SOMEONE_ORDER_ID, SOMEONE());
        set_contract_address(NOONE());
        faucet.mint();
        erc20.approve(host_address, ERC20::FAUCET_AMOUNT);
        systems.manage.create(world, NOONE_NAME, NOONE_ORDER_ID, NOONE());
        set_contract_address(PLAYER());
        faucet.mint();
        erc20.approve(host_address, ERC20::FAUCET_AMOUNT);
        systems.manage.create(world, PLAYER_NAME, PLAYER_ORDER_ID, PLAYER());
        let duration: u64 = 0;

        // [Setup] Game if mode is set
        let game_id = systems.host.create(world);

        let context = Context {
            player_id: PLAYER().into(),
            player_name: PLAYER_NAME,
            player_order: PLAYER_ORDER_ID,
            anyone_id: ANYONE().into(),
            anyone_name: ANYONE_NAME,
            anyone_order: ANYONE_ORDER_ID,
            someone_id: SOMEONE().into(),
            someone_name: SOMEONE_NAME,
            someone_order: SOMEONE_ORDER_ID,
            noone_id: NOONE().into(),
            noone_name: NOONE_NAME,
            noone_order: NOONE_ORDER_ID,
            game_id: game_id,
            game_name: GAME_NAME,
            game_duration: duration,
            erc20: erc20,
        };

        // [Return]
        (world, systems, context)
    }
}
