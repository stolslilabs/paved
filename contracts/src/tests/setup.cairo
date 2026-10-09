pub mod setup {
    // Core imports

    use core::num::traits::Zero;

    // Internal imports

    use paved::economy::economy::{IEconomyDispatcher, IEconomyDispatcherTrait, decided};
    use paved::economy::token::{IPavedTokenDispatcher, IPavedTokenDispatcherTrait};
    use paved::economy::vault::{IVaultDispatcher, IVaultDispatcherTrait};
    use paved::mocks::router::{IMockRouterDispatcher, IMockRouterDispatcherTrait};
    use paved::mocks::token::IERC20Dispatcher;

    // Starknet imports

    pub use paved::mocks::token::IERC20DispatcherTrait;
    use paved::mocks::usdc::{IMockUSDCDispatcher, IMockUSDCDispatcherTrait};
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

    /// One USDC (6 decimals) and one PAVED (18 decimals), in base units.
    pub const USDC: u256 = 1_000_000;
    pub const PAVED: u256 = 1_000_000_000_000_000_000;
    /// What each player gets from the USDC faucet and approves for `Daily`.
    pub const FUNDS: u256 = 1_000 * USDC;
    /// The initial mean of `Economy` (points x 1,000) and the launch rate after the pool's fee
    /// (`docs/architecture/economy.md`, section 5): what the deploy passes.
    pub const MEAN0: u64 = 3_353_000;
    pub const LAUNCH_RATE: u256 = 76_000_000_000_000_000_000_000_000_000_000;

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
        pub economy: IEconomyDispatcher,
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

    /// The economy as `scripts/deploy.sh devnet` wires it: `PavedToken` (its initial supply to
    /// `OWNER`), `MockUSDC`, `MockRouter` seeded with 800,000 PAVED and 10,000 USDC, the `Vault`
    /// with 200,000 PAVED staked by `OWNER`, `Economy` (decided configuration, launch rate) as
    /// the token's minter. `Economy.set_game` is left to the caller. Returns `Economy` and USDC.
    pub fn deploy_economy() -> (ContractAddress, ContractAddress) {
        let owner = OWNER();
        let paved = deploy("PavedToken", array![owner.into(), owner.into()]);
        let usdc = deploy("MockUSDC", array![]);
        let router = deploy("MockRouter", array![paved.into(), usdc.into()]);
        let vault = deploy("Vault", array![paved.into(), usdc.into()]);
        // [Setup] The pool, from the owner's PAVED and the faucet's USDC
        IMockUSDCDispatcher { contract_address: usdc }.mint(owner, 10_000 * USDC);
        let paved_token = IERC20Dispatcher { contract_address: paved };
        start_cheat_caller_address(paved, owner);
        paved_token.approve(router, 800_000 * PAVED);
        paved_token.approve(vault, 200_000 * PAVED);
        stop_cheat_caller_address(paved);
        start_cheat_caller_address(usdc, owner);
        IERC20Dispatcher { contract_address: usdc }.approve(router, 10_000 * USDC);
        stop_cheat_caller_address(usdc);
        let (amount0, amount1) = if paved < usdc {
            (800_000 * PAVED, 10_000 * USDC)
        } else {
            (10_000 * USDC, 800_000 * PAVED)
        };
        start_cheat_caller_address(router, owner);
        IMockRouterDispatcher { contract_address: router }.add_liquidity(amount0, amount1);
        stop_cheat_caller_address(router);
        // [Setup] The owner's stake
        start_cheat_caller_address(vault, owner);
        IVaultDispatcher { contract_address: vault }.stake(200_000 * PAVED);
        stop_cheat_caller_address(vault);
        // [Setup] Economy, the token's minter
        let pool_key = IMockRouterDispatcher { contract_address: router }.pool_key();
        let mut calldata: Array<felt252> = array![
            owner.into(), paved.into(), usdc.into(), vault.into(), router.into(),
        ];
        pool_key.serialize(ref calldata);
        0_u256.serialize(ref calldata);
        decided().serialize(ref calldata);
        MEAN0.serialize(ref calldata);
        LAUNCH_RATE.serialize(ref calldata);
        let economy = deploy("Economy", calldata);
        start_cheat_caller_address(paved, owner);
        IPavedTokenDispatcher { contract_address: paved }.set_minter(economy);
        stop_cheat_caller_address(paved);
        (economy, usdc)
    }

    /// Gives `who` the faucet's USDC, approved for `daily`, and registers it as a player.
    fn register(
        account: IAccountDispatcher,
        usdc: ContractAddress,
        daily: ContractAddress,
        who: ContractAddress,
        name: felt252,
    ) {
        IMockUSDCDispatcher { contract_address: usdc }.mint(who, FUNDS);
        start_cheat_caller_address(usdc, who);
        IERC20Dispatcher { contract_address: usdc }.approve(daily, FUNDS);
        stop_cheat_caller_address(usdc);
        start_cheat_caller_address(account.contract_address, who);
        account.create(name, who);
        stop_cheat_caller_address(account.contract_address);
    }

    /// Deploys the economy (`deploy_economy`) and `Account`, declares `Lobby`, deploys `Tutorial`
    /// and `Daily` (with the class hash of `Lobby`, USDC as its token), wires `Economy` to `Daily`
    /// and `Account` to `Economy`, registers four players with USDC approved for `Daily`, and
    /// spawns a game of `mode` for `PLAYER` (none for `Mode::None`; a Daily game at stake 1).
    /// Returns a `TestStore` of the contract of `mode` (`Daily` for `Mode::None`).
    #[inline]
    pub fn spawn_game(mode: Mode) -> (TestStore, Systems, Context) {
        // [Setup] Systems
        let owner: felt252 = OWNER().into();
        let (economy_address, token_address) = deploy_economy();
        let account_address = deploy("Account", array![owner]);
        let lobby: felt252 = (*declare("Lobby").unwrap().contract_class().class_hash).into();
        let tutorial_address = deploy("Tutorial", array![owner, account_address.into(), lobby]);
        let daily_address = deploy(
            "Daily", array![owner, account_address.into(), token_address.into(), lobby],
        );
        let systems = Systems {
            account: IAccountDispatcher { contract_address: account_address },
            tutorial: ITutorialDispatcher { contract_address: tutorial_address },
            daily: IDailyDispatcher { contract_address: daily_address },
            economy: IEconomyDispatcher { contract_address: economy_address },
        };
        start_cheat_caller_address(economy_address, OWNER());
        systems.economy.set_game(daily_address);
        stop_cheat_caller_address(economy_address);
        start_cheat_caller_address(account_address, OWNER());
        systems.account.set_economy(economy_address);
        stop_cheat_caller_address(account_address);

        // [Setup] Context
        let token = IERC20Dispatcher { contract_address: token_address };
        register(systems.account, token_address, daily_address, ANYONE(), ANYONE_NAME);
        register(systems.account, token_address, daily_address, SOMEONE(), SOMEONE_NAME);
        register(systems.account, token_address, daily_address, NOONE(), NOONE_NAME);
        register(systems.account, token_address, daily_address, PLAYER(), PLAYER_NAME);
        let duration: u64 = 0;

        // [Setup] Keep player as caller for game interactions
        start_cheat_caller_address(daily_address, PLAYER());
        start_cheat_caller_address(tutorial_address, PLAYER());

        // [Setup] Game if mode is set
        let game_id = match mode {
            Mode::Daily => systems.daily.spawn(1, Zero::zero(), 0),
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
