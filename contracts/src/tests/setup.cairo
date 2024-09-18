mod setup {
    // Core imports

    use core::debug::PrintTrait;

    // Starknet imports

    use starknet::ContractAddress;
    use starknet::testing::{set_contract_address};

    // Dojo imports

    use dojo::world::{IWorldDispatcherTrait, IWorldDispatcher};
    use dojo::utils::test::spawn_test_world;

    // Internal imports

    use paved::mocks::token::{
        IERC20Dispatcher, IERC20DispatcherTrait, IERC20FaucetDispatcher,
        IERC20FaucetDispatcherTrait, token
    };
    use paved::models::index;
    use paved::models::game::{Game, GameImpl};
    use paved::systems::account::{account, IAccountDispatcher, IAccountDispatcherTrait};
    use paved::systems::daily::{daily, IDailyDispatcher, IDailyDispatcherTrait};
    use paved::systems::tutorial::{tutorial, ITutorialDispatcher, ITutorialDispatcherTrait};
    use paved::types::plan::{Plan, PlanImpl};
    use paved::types::mode::Mode;

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
    const GAME_NAME: felt252 = 'GAME';

    #[derive(Drop)]
    struct Systems {
        account: IAccountDispatcher,
        daily: IDailyDispatcher,
        tutorial: ITutorialDispatcher,
    }

    #[derive(Drop)]
    struct Context {
        player_id: felt252,
        player_name: felt252,
        anyone_id: felt252,
        anyone_name: felt252,
        someone_id: felt252,
        someone_name: felt252,
        noone_id: felt252,
        noone_name: felt252,
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

    #[inline]
    fn deploy_erc20() -> IERC20Dispatcher {
        let (address, _) = starknet::deploy_syscall(
            token::TEST_CLASS_HASH.try_into().expect('Class hash conversion failed'),
            0,
            array![].span(),
            false
        )
            .expect('ERC20 deploy failed');
        IERC20Dispatcher { contract_address: address }
    }

    #[inline]
    fn spawn_game(mode: Mode) -> (IWorldDispatcher, Systems, Context) {
        // [Setup] World
        let models = array![
            index::player::TEST_CLASS_HASH,
            index::game::TEST_CLASS_HASH,
            index::builder::TEST_CLASS_HASH,
            index::tile::TEST_CLASS_HASH,
            index::tile_position::TEST_CLASS_HASH,
            index::char::TEST_CLASS_HASH,
            index::char_position::TEST_CLASS_HASH,
            index::tournament::TEST_CLASS_HASH,
        ];
        let world = spawn_test_world(array!["paved"].span(), models.span());

        // [Setup] Systems
        let erc20 = deploy_erc20();
        let account_address = world
            .deploy_contract('account', account::TEST_CLASS_HASH.try_into().unwrap());
        let daily_address = world
            .deploy_contract('daily', daily::TEST_CLASS_HASH.try_into().unwrap());
        let tutorial_address = world
            .deploy_contract('tutorial', tutorial::TEST_CLASS_HASH.try_into().unwrap());
        let systems = Systems {
            account: IAccountDispatcher { contract_address: account_address },
            daily: IDailyDispatcher { contract_address: daily_address },
            tutorial: ITutorialDispatcher { contract_address: tutorial_address },
        };

        // [Setup] Permissions
        world.grant_writer(dojo::utils::bytearray_hash(@"paved"), account_address);
        world.grant_writer(dojo::utils::bytearray_hash(@"paved"), daily_address);
        world.grant_writer(dojo::utils::bytearray_hash(@"paved"), tutorial_address);
        world.grant_writer(dojo::utils::bytearray_hash(@"paved"), PLAYER());
        world.grant_writer(dojo::utils::bytearray_hash(@"paved"), ANYONE());
        world.grant_writer(dojo::utils::bytearray_hash(@"paved"), SOMEONE());
        world.grant_writer(dojo::utils::bytearray_hash(@"paved"), NOONE());

        // [Setup] Initialize
        let daily_calldata: Array<felt252> = array![erc20.contract_address.into(),];
        world
            .init_contract(
                dojo::utils::selector_from_names(@"paved", @"daily"), daily_calldata.span()
            );

        // [Setup] Context
        let faucet = IERC20FaucetDispatcher { contract_address: erc20.contract_address };
        set_contract_address(ANYONE());
        faucet.mint();
        erc20.approve(daily_address, token::FAUCET_AMOUNT);
        systems.account.create(ANYONE_NAME, ANYONE());
        set_contract_address(SOMEONE());
        faucet.mint();
        erc20.approve(daily_address, token::FAUCET_AMOUNT);
        systems.account.create(SOMEONE_NAME, SOMEONE());
        set_contract_address(NOONE());
        faucet.mint();
        erc20.approve(daily_address, token::FAUCET_AMOUNT);
        systems.account.create(NOONE_NAME, NOONE());
        set_contract_address(PLAYER());
        faucet.mint();
        erc20.approve(daily_address, token::FAUCET_AMOUNT);
        systems.account.create(PLAYER_NAME, PLAYER());
        let duration: u64 = 0;

        // [Setup] Game if mode is set
        let game_id = match mode {
            Mode::Daily => systems.daily.spawn(),
            Mode::Tutorial => systems.tutorial.spawn(),
            _ => 0,
        };

        let context = Context {
            player_id: PLAYER().into(),
            player_name: PLAYER_NAME,
            anyone_id: ANYONE().into(),
            anyone_name: ANYONE_NAME,
            someone_id: SOMEONE().into(),
            someone_name: SOMEONE_NAME,
            noone_id: NOONE().into(),
            noone_name: NOONE_NAME,
            game_id: game_id,
            game_name: GAME_NAME,
            game_duration: duration,
            erc20: erc20,
        };

        // [Return]
        (world, systems, context)
    }
}
