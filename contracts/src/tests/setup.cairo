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

    use paved::constants;
    use paved::tests::mocks::erc20::{
        IERC20Dispatcher, IERC20DispatcherTrait, IERC20FaucetDispatcher,
        IERC20FaucetDispatcherTrait, ERC20
    };
    use paved::models::game::{Game, GameImpl};
    use paved::models::player::Player;
    use paved::models::builder::Builder;
    use paved::models::tile::Tile;
    use paved::models::tournament::Tournament;
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
    fn spawn_game(mode: Mode) -> (IWorldDispatcher, Systems, Context) {
        // [Setup] World
        let mut models = core::array::ArrayTrait::new();
        models.append(paved::models::index::game::TEST_CLASS_HASH);
        models.append(paved::models::index::player::TEST_CLASS_HASH);
        models.append(paved::models::index::builder::TEST_CLASS_HASH);
        models.append(paved::models::index::tile::TEST_CLASS_HASH);
        models.append(paved::models::index::tournament::TEST_CLASS_HASH);
        let mut world = spawn_test_world(models);
        let erc20 = deploy_erc20();

        // [Setup] SystemsDrop
        let account_calldata: Array<felt252> = array![];
        let account_address = world
            .deploy_contract(
                'account', account::TEST_CLASS_HASH.try_into().unwrap(), account_calldata.span()
            );
        let daily_calldata: Array<felt252> = array![constants::TOKEN_ADDRESS().into(),];
        let daily_address = world
            .deploy_contract(
                'daily', daily::TEST_CLASS_HASH.try_into().unwrap(), daily_calldata.span()
            );
        let tutorial_calldata: Array<felt252> = array![];
        let tutorial_address = world
            .deploy_contract(
                'tutorial', tutorial::TEST_CLASS_HASH.try_into().unwrap(), tutorial_calldata.span()
            );
        let systems = Systems {
            account: IAccountDispatcher { contract_address: account_address },
            daily: IDailyDispatcher { contract_address: daily_address },
            tutorial: ITutorialDispatcher { contract_address: tutorial_address },
        };

        // [Setup] Context
        let faucet = IERC20FaucetDispatcher { contract_address: erc20.contract_address };
        set_contract_address(ANYONE());
        faucet.mint();
        erc20.approve(daily_address, ERC20::FAUCET_AMOUNT);
        systems.account.create(ANYONE_NAME, ANYONE());
        set_contract_address(SOMEONE());
        faucet.mint();
        erc20.approve(daily_address, ERC20::FAUCET_AMOUNT);
        systems.account.create(SOMEONE_NAME, SOMEONE());
        set_contract_address(NOONE());
        faucet.mint();
        erc20.approve(daily_address, ERC20::FAUCET_AMOUNT);
        systems.account.create(NOONE_NAME, NOONE());
        set_contract_address(PLAYER());
        faucet.mint();
        erc20.approve(daily_address, ERC20::FAUCET_AMOUNT);
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
