pub mod setup {
    // Core imports

    // Starknet imports

    use starknet::ContractAddress;

    // Dojo imports

    use dojo::world::{IWorldDispatcherTrait, IWorldDispatcher};
    use dojo_cairo_test::{spawn_test_world, NamespaceDef, TestResource};
    use snforge_std::{
        declare, DeclareResultTrait, start_cheat_caller_address, stop_cheat_caller_address
    };

    // Internal imports

    use paved::mocks::token::{
        IERC20Dispatcher, IERC20FaucetDispatcher, IERC20FaucetDispatcherTrait, Token
    };
    use paved::models::game::{Game, GameImpl};
    use paved::systems::account::{IAccountDispatcher, IAccountDispatcherTrait};
    use paved::systems::economy::{IEconomyDispatcher, IEconomyDispatcherTrait};
    use paved::systems::configurable::{IConfigurableDispatcher};
    use paved::systems::daily::{IDailyDispatcher};
    use paved::systems::weekly::{IWeeklyDispatcher};
    use paved::systems::tutorial::{ITutorialDispatcher, ITutorialDispatcherTrait};
    use paved::types::plan::{Plan, PlanImpl};
    pub use paved::types::mode::Mode;
    pub use paved::mocks::token::IERC20DispatcherTrait;
    pub use paved::systems::daily::IDailyDispatcherTrait;
    pub use paved::systems::weekly::IWeeklyDispatcherTrait;
    pub use paved::systems::configurable::IConfigurableDispatcherTrait;

    // Constants

    pub fn PLAYER() -> ContractAddress {
        starknet::contract_address_const::<'PLAYER'>()
    }

    pub fn ANYONE() -> ContractAddress {
        starknet::contract_address_const::<'ANYONE'>()
    }

    pub fn SOMEONE() -> ContractAddress {
        starknet::contract_address_const::<'SOMEONE'>()
    }

    pub fn NOONE() -> ContractAddress {
        starknet::contract_address_const::<'NOONE'>()
    }

    pub const PLAYER_NAME: felt252 = 'PLAYER';
    pub const ANYONE_NAME: felt252 = 'ANYONE';
    pub const SOMEONE_NAME: felt252 = 'SOMEONE';
    pub const NOONE_NAME: felt252 = 'NOONE';
    pub const GAME_NAME: felt252 = 'GAME';

    #[derive(Drop)]
    pub struct Systems {
        pub account: IAccountDispatcher,
        pub economy: IEconomyDispatcher,
        pub configurable: IConfigurableDispatcher,
        pub tutorial: ITutorialDispatcher,
        pub daily: IDailyDispatcher,
        pub weekly: IWeeklyDispatcher,
    }

    #[derive(Drop)]
    pub struct Context {
        pub player_id: felt252,
        pub player_name: felt252,
        pub anyone_id: felt252,
        pub anyone_name: felt252,
        pub someone_id: felt252,
        pub someone_name: felt252,
        pub noone_id: felt252,
        pub noone_name: felt252,
        pub game_id: u32,
        pub game_name: felt252,
        pub game_duration: u64,
        pub token: IERC20Dispatcher,
    }

    pub fn compute_seed(game: Game, target: Plan) -> felt252 {
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
    fn declared_class_hash(name: ByteArray) -> starknet::ClassHash {
        *declare(name).unwrap().contract_class().class_hash
    }

    #[inline]
    pub fn spawn_game(mode: Mode) -> (IWorldDispatcher, Systems, Context) {
        // [Setup] Declarations
        let world_class_hash = declared_class_hash("world");
        let model_player_class_hash = declared_class_hash("m_Player");
        let model_game_class_hash = declared_class_hash("m_Game");
        let model_builder_class_hash = declared_class_hash("m_Builder");
        let model_tile_class_hash = declared_class_hash("m_Tile");
        let model_tile_position_class_hash = declared_class_hash("m_TilePosition");
        let model_char_class_hash = declared_class_hash("m_Char");
        let model_char_position_class_hash = declared_class_hash("m_CharPosition");
        let model_tournament_class_hash = declared_class_hash("m_Tournament");
        let model_economy_config_class_hash = declared_class_hash("m_EconomyConfig");
        let model_economy_state_class_hash = declared_class_hash("m_EconomyState");
        let model_entry_settlement_class_hash = declared_class_hash("m_EntrySettlement");
        let model_game_config_template_class_hash = declared_class_hash("m_GameConfigTemplate");
        let model_game_config_snapshot_class_hash = declared_class_hash("m_GameConfigSnapshot");
        let model_config_policy_class_hash = declared_class_hash("m_ConfigPolicy");
        let token_class_hash = declared_class_hash("Token");
        let account_class_hash = declared_class_hash("Account");
        let economy_class_hash = declared_class_hash("Economy");
        let configurable_class_hash = declared_class_hash("Configurable");
        let tutorial_class_hash = declared_class_hash("Tutorial");
        let daily_class_hash = declared_class_hash("Daily");
        let weekly_class_hash = declared_class_hash("Weekly");

        // [Setup] World
        let resources = array![
            TestResource::Model(model_player_class_hash),
            TestResource::Model(model_game_class_hash),
            TestResource::Model(model_builder_class_hash),
            TestResource::Model(model_tile_class_hash),
            TestResource::Model(model_tile_position_class_hash),
            TestResource::Model(model_char_class_hash),
            TestResource::Model(model_char_position_class_hash),
            TestResource::Model(model_tournament_class_hash),
            TestResource::Model(model_economy_config_class_hash),
            TestResource::Model(model_economy_state_class_hash),
            TestResource::Model(model_entry_settlement_class_hash),
            TestResource::Model(model_game_config_template_class_hash),
            TestResource::Model(model_game_config_snapshot_class_hash),
            TestResource::Model(model_config_policy_class_hash),
        ];
        let namespaces = array![NamespaceDef { namespace: "paved", resources: resources.span() }];
        let world = spawn_test_world(world_class_hash, namespaces.span());
        let mut dispatcher = world.dispatcher;

        // [Setup] Systems
        let token_address = dispatcher.register_contract('token', "paved", token_class_hash);
        let account_address = dispatcher.register_contract('account', "paved", account_class_hash);
        let economy_address = dispatcher.register_contract('economy', "paved", economy_class_hash);
        let configurable_address = dispatcher
            .register_contract('configurable', "paved", configurable_class_hash);
        let tutorial_address = dispatcher
            .register_contract('tutorial', "paved", tutorial_class_hash);
        let daily_address = dispatcher.register_contract('daily', "paved", daily_class_hash);
        let weekly_address = dispatcher.register_contract('weekly', "paved", weekly_class_hash);
        let systems = Systems {
            account: IAccountDispatcher { contract_address: account_address },
            economy: IEconomyDispatcher { contract_address: economy_address },
            configurable: IConfigurableDispatcher { contract_address: configurable_address },
            tutorial: ITutorialDispatcher { contract_address: tutorial_address },
            daily: IDailyDispatcher { contract_address: daily_address },
            weekly: IWeeklyDispatcher { contract_address: weekly_address },
        };

        // [Setup] Permissions
        dispatcher.grant_writer(dojo::utils::bytearray_hash(@"paved"), account_address);
        dispatcher.grant_writer(dojo::utils::bytearray_hash(@"paved"), economy_address);
        dispatcher.grant_writer(dojo::utils::bytearray_hash(@"paved"), configurable_address);
        dispatcher.grant_writer(dojo::utils::bytearray_hash(@"paved"), tutorial_address);
        dispatcher.grant_writer(dojo::utils::bytearray_hash(@"paved"), daily_address);
        dispatcher.grant_writer(dojo::utils::bytearray_hash(@"paved"), weekly_address);
        dispatcher.grant_writer(dojo::utils::bytearray_hash(@"paved"), PLAYER());
        dispatcher.grant_writer(dojo::utils::bytearray_hash(@"paved"), ANYONE());
        dispatcher.grant_writer(dojo::utils::bytearray_hash(@"paved"), SOMEONE());
        dispatcher.grant_writer(dojo::utils::bytearray_hash(@"paved"), NOONE());

        // [Setup] Initialize
        let daily_calldata: Array<felt252> = array![token_address.into(),];
        dispatcher
            .init_contract(
                dojo::utils::selector_from_names(@"paved", @"Daily"), daily_calldata.span()
            );
        let weekly_calldata: Array<felt252> = array![token_address.into(),];
        dispatcher
            .init_contract(
                dojo::utils::selector_from_names(@"paved", @"Weekly"), weekly_calldata.span()
            );
        let configurable_calldata: Array<felt252> = array![token_address.into(),];
        dispatcher
            .init_contract(
                dojo::utils::selector_from_names(@"paved", @"Configurable"),
                configurable_calldata.span()
            );

        // [Setup] Context
        let token = IERC20Dispatcher { contract_address: token_address };
        let faucet = IERC20FaucetDispatcher { contract_address: token_address };
        start_cheat_caller_address(token_address, ANYONE());
        faucet.mint();
        token.approve(daily_address, Token::FAUCET_AMOUNT);
        token.approve(weekly_address, Token::FAUCET_AMOUNT);
        token.approve(configurable_address, Token::FAUCET_AMOUNT);
        stop_cheat_caller_address(token_address);
        start_cheat_caller_address(account_address, ANYONE());
        systems.account.create(ANYONE_NAME, ANYONE());
        stop_cheat_caller_address(account_address);

        start_cheat_caller_address(token_address, SOMEONE());
        faucet.mint();
        token.approve(daily_address, Token::FAUCET_AMOUNT);
        token.approve(weekly_address, Token::FAUCET_AMOUNT);
        token.approve(configurable_address, Token::FAUCET_AMOUNT);
        stop_cheat_caller_address(token_address);
        start_cheat_caller_address(account_address, SOMEONE());
        systems.account.create(SOMEONE_NAME, SOMEONE());
        stop_cheat_caller_address(account_address);

        start_cheat_caller_address(token_address, NOONE());
        faucet.mint();
        token.approve(daily_address, Token::FAUCET_AMOUNT);
        token.approve(weekly_address, Token::FAUCET_AMOUNT);
        token.approve(configurable_address, Token::FAUCET_AMOUNT);
        stop_cheat_caller_address(token_address);
        start_cheat_caller_address(account_address, NOONE());
        systems.account.create(NOONE_NAME, NOONE());
        stop_cheat_caller_address(account_address);

        start_cheat_caller_address(token_address, PLAYER());
        faucet.mint();
        token.approve(daily_address, Token::FAUCET_AMOUNT);
        token.approve(weekly_address, Token::FAUCET_AMOUNT);
        token.approve(configurable_address, Token::FAUCET_AMOUNT);
        stop_cheat_caller_address(token_address);
        start_cheat_caller_address(account_address, PLAYER());
        systems.account.create(PLAYER_NAME, PLAYER());
        stop_cheat_caller_address(account_address);
        let duration: u64 = 0;

        // [Setup] Keep player as caller for game interactions
        start_cheat_caller_address(daily_address, PLAYER());
        start_cheat_caller_address(weekly_address, PLAYER());
        start_cheat_caller_address(configurable_address, PLAYER());
        start_cheat_caller_address(tutorial_address, PLAYER());

        // [Setup] Game if mode is set
        let game_id = match mode {
            Mode::Daily => systems.daily.spawn(),
            Mode::Weekly => systems.weekly.spawn(),
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
            token,
        };

        // [Return]
        (dispatcher, systems, context)
    }
}
