mod setup {
    // Core imports

    use starknet::SyscallResultTrait;
    use core::debug::PrintTrait;

    // Starknet imports

    use starknet::ContractAddress;
    use starknet::deploy_syscall;
    use starknet::testing::{set_contract_address};

    // Dojo imports

    use dojo::world::{IWorldDispatcherTrait, IWorldDispatcher};
    use dojo::utils::test::spawn_test_world;

    // Internal imports

    use paved::mocks::token::{
        IERC20Dispatcher, IERC20DispatcherTrait, IERC20FaucetDispatcher,
        IERC20FaucetDispatcherTrait, Token
    };
    use paved::models::index;
    use paved::models::game::{Game, GameImpl};
    use paved::systems::account::{Account, IAccountDispatcher, IAccountDispatcherTrait};
    use paved::systems::daily::{Daily, IDailyDispatcher, IDailyDispatcherTrait};
    use paved::systems::weekly::{Weekly, IWeeklyDispatcher, IWeeklyDispatcherTrait};
    use paved::systems::tutorial::{Tutorial, ITutorialDispatcher, ITutorialDispatcherTrait};
    use paved::systems::duel::{Duel, IDuelDispatcher, IDuelDispatcherTrait};
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
    const GAME_DURATION: u64 = 100;
    const GAME_PRICE: felt252 = 100;

    #[derive(Drop)]
    struct Systems {
        account: IAccountDispatcher,
        tutorial: ITutorialDispatcher,
        daily: IDailyDispatcher,
        weekly: IWeeklyDispatcher,
        duel: IDuelDispatcher,
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
        game_price: felt252,
        game_duration: u64,
        token: IERC20Dispatcher,
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
        let token_address = world
            .deploy_contract('token', Token::TEST_CLASS_HASH.try_into().unwrap());
        let account_address = world
            .deploy_contract('account', Account::TEST_CLASS_HASH.try_into().unwrap());
        let tutorial_address = world
            .deploy_contract('tutorial', Tutorial::TEST_CLASS_HASH.try_into().unwrap());
        let daily_address = world
            .deploy_contract('daily', Daily::TEST_CLASS_HASH.try_into().unwrap());
        let weekly_address = world
            .deploy_contract('weekly', Weekly::TEST_CLASS_HASH.try_into().unwrap());
        let duel_address = world.deploy_contract('duel', Duel::TEST_CLASS_HASH.try_into().unwrap());
        let systems = Systems {
            account: IAccountDispatcher { contract_address: account_address },
            tutorial: ITutorialDispatcher { contract_address: tutorial_address },
            daily: IDailyDispatcher { contract_address: daily_address },
            weekly: IWeeklyDispatcher { contract_address: weekly_address },
            duel: IDuelDispatcher { contract_address: duel_address },
        };
        // [Setup] Permissions
        world.grant_writer(dojo::utils::bytearray_hash(@"paved"), account_address);
        world.grant_writer(dojo::utils::bytearray_hash(@"paved"), tutorial_address);
        world.grant_writer(dojo::utils::bytearray_hash(@"paved"), daily_address);
        world.grant_writer(dojo::utils::bytearray_hash(@"paved"), weekly_address);
        world.grant_writer(dojo::utils::bytearray_hash(@"paved"), duel_address);
        world.grant_writer(dojo::utils::bytearray_hash(@"paved"), PLAYER());
        world.grant_writer(dojo::utils::bytearray_hash(@"paved"), ANYONE());
        world.grant_writer(dojo::utils::bytearray_hash(@"paved"), SOMEONE());
        world.grant_writer(dojo::utils::bytearray_hash(@"paved"), NOONE());

        // [Setup] Initialize
        let daily_calldata: Array<felt252> = array![token_address.into(),];
        world
            .init_contract(
                dojo::utils::selector_from_names(@"paved", @"Daily"), daily_calldata.span()
            );
        let weekly_calldata: Array<felt252> = array![token_address.into(),];
        world
            .init_contract(
                dojo::utils::selector_from_names(@"paved", @"Weekly"), weekly_calldata.span()
            );
        let duel_calldata: Array<felt252> = array![token_address.into(),];
        world
            .init_contract(
                dojo::utils::selector_from_names(@"paved", @"Duel"), duel_calldata.span()
            );

        // [Setup] Context
        let token = IERC20Dispatcher { contract_address: token_address };
        let faucet = IERC20FaucetDispatcher { contract_address: token_address };
        set_contract_address(ANYONE());
        faucet.mint();
        token.approve(daily_address, Token::FAUCET_AMOUNT);
        token.approve(weekly_address, Token::FAUCET_AMOUNT);
        token.approve(duel_address, Token::FAUCET_AMOUNT);
        systems.account.create(ANYONE_NAME);
        set_contract_address(SOMEONE());
        faucet.mint();
        token.approve(daily_address, Token::FAUCET_AMOUNT);
        token.approve(weekly_address, Token::FAUCET_AMOUNT);
        token.approve(duel_address, Token::FAUCET_AMOUNT);
        systems.account.create(SOMEONE_NAME);
        set_contract_address(NOONE());
        faucet.mint();
        token.approve(daily_address, Token::FAUCET_AMOUNT);
        token.approve(weekly_address, Token::FAUCET_AMOUNT);
        token.approve(duel_address, Token::FAUCET_AMOUNT);
        systems.account.create(NOONE_NAME);
        set_contract_address(PLAYER());
        faucet.mint();
        token.approve(daily_address, Token::FAUCET_AMOUNT);
        token.approve(weekly_address, Token::FAUCET_AMOUNT);
        token.approve(duel_address, Token::FAUCET_AMOUNT);
        systems.account.create(PLAYER_NAME);

        // [Setup] Game if mode is set
        let game_id = match mode {
            Mode::Daily => systems.daily.spawn(),
            Mode::Weekly => systems.weekly.spawn(),
            Mode::Tutorial => systems.tutorial.spawn(),
            Mode::Duel => systems.duel.spawn(GAME_NAME, GAME_DURATION, GAME_PRICE),
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
            game_price: GAME_PRICE,
            game_duration: GAME_DURATION,
            token,
        };

        // [Return]
        (world, systems, context)
    }
}
