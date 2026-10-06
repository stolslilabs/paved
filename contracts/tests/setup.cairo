// Copy of src/tests/setup.cairo at P2; keep in sync: scripts/measure.sh check-setup
pub mod setup {
    // Core imports

    // Starknet imports

    pub use paved::mocks::token::IERC20DispatcherTrait;

    // Internal imports

    use paved::mocks::token::{
        IERC20Dispatcher, IERC20FaucetDispatcher, IERC20FaucetDispatcherTrait, Token,
    };
    use paved::models::builder::Builder;
    use paved::models::game::{Game, GameImpl};
    use paved::models::player::Player;
    use paved::models::tile::Tile;
    use paved::models::tournament::Tournament;
    use paved::store::{StoreImpl, StoreTrait};
    use paved::systems::account::{IAccountDispatcher, IAccountDispatcherTrait};
    use paved::systems::daily::IDailyDispatcher;
    pub use paved::systems::daily::IDailyDispatcherTrait;
    use paved::systems::tutorial::{ITutorialDispatcher, ITutorialDispatcherTrait};
    pub use paved::types::mode::Mode;
    use paved::types::plan::{Plan, PlanImpl};
    use snforge_std::{
        ContractClassTrait, DeclareResultTrait, declare, interact_with_state,
        start_cheat_caller_address, stop_cheat_caller_address,
    };
    use starknet::ContractAddress;

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

    pub fn OWNER() -> ContractAddress {
        starknet::contract_address_const::<'OWNER'>()
    }

    pub const PLAYER_NAME: felt252 = 'PLAYER';
    pub const ANYONE_NAME: felt252 = 'ANYONE';
    pub const SOMEONE_NAME: felt252 = 'SOMEONE';
    pub const NOONE_NAME: felt252 = 'NOONE';
    pub const GAME_NAME: felt252 = 'GAME';

    #[derive(Drop)]
    pub struct Systems {
        pub account: IAccountDispatcher,
        pub tutorial: ITutorialDispatcher,
        pub daily: IDailyDispatcher,
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

    /// Reads and writes the game state of a deployed contract, as `Store` does from inside it.
    #[derive(Copy, Drop)]
    pub struct TestStore {
        pub contract: ContractAddress,
    }

    #[generate_trait]
    pub impl TestStoreImpl of TestStoreTrait {
        fn new(contract: ContractAddress) -> TestStore {
            TestStore { contract }
        }

        fn game(self: TestStore, game_id: u32) -> Game {
            interact_with_state(self.contract, || StoreImpl::new().game(game_id))
        }

        fn player(self: TestStore, player_id: felt252) -> Player {
            interact_with_state(self.contract, || StoreImpl::new().player(player_id))
        }

        fn builder(self: TestStore, game: Game, player_id: felt252) -> Builder {
            interact_with_state(self.contract, || StoreImpl::new().builder(game, player_id))
        }

        fn tile(self: TestStore, game: Game, tile_id: u32) -> Tile {
            interact_with_state(self.contract, || StoreImpl::new().tile(game, tile_id))
        }

        fn tournament(self: TestStore, tournament_id: u64) -> Tournament {
            interact_with_state(self.contract, || StoreImpl::new().tournament(tournament_id))
        }

        fn set_game(self: TestStore, game: Game) {
            interact_with_state(self.contract, || StoreImpl::new().set_game(game))
        }

        fn set_tile(self: TestStore, tile: Tile) {
            interact_with_state(self.contract, || StoreImpl::new().set_tile(tile))
        }

        fn set_tournament(self: TestStore, tournament: Tournament) {
            interact_with_state(self.contract, || StoreImpl::new().set_tournament(tournament))
        }
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
        }
        seed
    }

    fn deploy(name: ByteArray, calldata: Array<felt252>) -> ContractAddress {
        let class = declare(name).unwrap().contract_class();
        let (address, _) = class.deploy(@calldata).unwrap();
        address
    }

    /// Deploys the token, `Account`, `Tutorial` and `Daily`, registers four players with tokens
    /// approved for `Daily`, and spawns a game of `mode` for `PLAYER` (none for `Mode::None`).
    /// Returns a `TestStore` of the contract of `mode` (`Daily` for `Mode::None`).
    #[inline]
    pub fn spawn_game(mode: Mode) -> (TestStore, Systems, Context) {
        // [Setup] Systems
        let owner: felt252 = OWNER().into();
        let token_address = deploy("Token", array![]);
        let account_address = deploy("Account", array![owner]);
        let tutorial_address = deploy("Tutorial", array![owner, account_address.into()]);
        let daily_address = deploy(
            "Daily", array![owner, account_address.into(), token_address.into()],
        );
        let systems = Systems {
            account: IAccountDispatcher { contract_address: account_address },
            tutorial: ITutorialDispatcher { contract_address: tutorial_address },
            daily: IDailyDispatcher { contract_address: daily_address },
        };

        // [Setup] Context
        let token = IERC20Dispatcher { contract_address: token_address };
        let faucet = IERC20FaucetDispatcher { contract_address: token_address };
        start_cheat_caller_address(token_address, ANYONE());
        faucet.mint();
        token.approve(daily_address, Token::FAUCET_AMOUNT);
        stop_cheat_caller_address(token_address);
        start_cheat_caller_address(account_address, ANYONE());
        systems.account.create(ANYONE_NAME, ANYONE());
        stop_cheat_caller_address(account_address);

        start_cheat_caller_address(token_address, SOMEONE());
        faucet.mint();
        token.approve(daily_address, Token::FAUCET_AMOUNT);
        stop_cheat_caller_address(token_address);
        start_cheat_caller_address(account_address, SOMEONE());
        systems.account.create(SOMEONE_NAME, SOMEONE());
        stop_cheat_caller_address(account_address);

        start_cheat_caller_address(token_address, NOONE());
        faucet.mint();
        token.approve(daily_address, Token::FAUCET_AMOUNT);
        stop_cheat_caller_address(token_address);
        start_cheat_caller_address(account_address, NOONE());
        systems.account.create(NOONE_NAME, NOONE());
        stop_cheat_caller_address(account_address);

        start_cheat_caller_address(token_address, PLAYER());
        faucet.mint();
        token.approve(daily_address, Token::FAUCET_AMOUNT);
        stop_cheat_caller_address(token_address);
        start_cheat_caller_address(account_address, PLAYER());
        systems.account.create(PLAYER_NAME, PLAYER());
        stop_cheat_caller_address(account_address);
        let duration: u64 = 0;

        // [Setup] Keep player as caller for game interactions
        start_cheat_caller_address(daily_address, PLAYER());
        start_cheat_caller_address(tutorial_address, PLAYER());

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
            token,
        };

        // [Return]
        let store = match mode {
            Mode::Tutorial => TestStoreTrait::new(tutorial_address),
            _ => TestStoreTrait::new(daily_address),
        };
        (store, systems, context)
    }
}
