pub mod setup {
    // Core imports

    use core::num::traits::Zero;
    use openzeppelin_interfaces::erc4626::{IERC4626Dispatcher, IERC4626DispatcherTrait};
    use paved::mocks::router::{IMockRouterDispatcher, IMockRouterDispatcherTrait};
    use paved::mocks::token::IERC20Dispatcher;

    // Starknet imports

    pub use paved::mocks::token::IERC20DispatcherTrait;
    use paved::models::builder::Builder;
    use paved::models::game::{Game, GameImpl};
    use paved::models::tile::Tile;
    use paved::store::{StoreImpl, StoreTrait};
    use paved::systems::challenge::{
        IChallengeDispatcher, IChallengeDispatcherTrait as ChallengeDispatcherTrait,
        IChallengeDrawDispatcher, IChallengeDrawDispatcherTrait,
    };
    use paved::systems::collection::{ICollectionDispatcher, ICollectionDispatcherTrait};

    // Internal imports

    use paved::systems::economy::{IEconomyDispatcher, IEconomyDispatcherTrait, decided};
    use paved::systems::faucet::{IFaucetDispatcher, IFaucetDispatcherTrait};
    use paved::systems::setup::{ISetupDispatcher, ISetupDispatcherTrait};
    use paved::systems::token::{IPavedTokenDispatcher, IPavedTokenDispatcherTrait};
    use paved::systems::vault::{DEAD_ASSETS, DEFAULT_EXIT_FEE_BPS};
    pub use paved::types::mode::Mode;
    use paved::types::orientation::Orientation;
    use paved::types::plan::{Plan, PlanImpl};
    use snforge_std::{
        ContractClassTrait, DeclareResultTrait, declare, interact_with_state, load,
        start_cheat_caller_address, start_cheat_transaction_hash_global, stop_cheat_caller_address,
        store, test_address,
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
    pub const MEAN0: u64 = 3_980_000;
    pub const LAUNCH_RATE: u256 = 76_000_000_000_000_000_000_000_000_000_000;

    pub const PLAYER_NAME: felt252 = 'PLAYER';
    pub const ANYONE_NAME: felt252 = 'ANYONE';
    pub const SOMEONE_NAME: felt252 = 'SOMEONE';
    pub const NOONE_NAME: felt252 = 'NOONE';
    pub const GAME_NAME: felt252 = 'GAME';

    /// The storage key, in the test's own contract, of the last transaction hash `next_tx` gave.
    const TX_KEY: felt252 = 'PAVED_TEST_TX';

    /// Runs what follows in a transaction of its own: a new transaction hash for every contract
    /// (the hashes count up from 1 in each test). `Challenge` draws once per transaction (#645,
    /// `DrawableComponent`), and snforge's hash is otherwise one for the whole test.
    pub fn next_tx() {
        let tx = *load(test_address(), TX_KEY, 1)[0] + 1;
        store(test_address(), TX_KEY, array![tx].span());
        start_cheat_transaction_hash_global(tx);
    }

    /// `Challenge` as the tests call it: each call that can draw (`spawn`, `spawn_free`, `build`,
    /// `discard`, and `surrender` for its order) runs in a transaction of its own (`next_tx`), as
    /// a player's calls do on chain, and the test goes on in a fresh one, so that a raw or safe
    /// call that follows draws as the first of its transaction too.
    #[derive(Copy, Drop)]
    pub struct TestChallenge {
        pub contract_address: ContractAddress,
    }

    #[generate_trait]
    pub impl TestChallengeImpl of IChallengeDispatcherTrait {
        fn spawn(self: TestChallenge, stake: u8, referrer: ContractAddress, min_out: u256) -> u32 {
            next_tx();
            let game_id = self.dispatcher().spawn(stake, referrer, min_out);
            next_tx();
            game_id
        }

        fn spawn_free(self: TestChallenge) -> u32 {
            next_tx();
            let game_id = self.dispatcher().spawn_free();
            next_tx();
            game_id
        }

        fn discard(self: TestChallenge, game_id: u32) {
            next_tx();
            self.dispatcher().discard(game_id);
            next_tx();
        }

        fn surrender(self: TestChallenge, game_id: u32) {
            next_tx();
            self.dispatcher().surrender(game_id);
            next_tx();
        }

        fn build(self: TestChallenge, game_id: u32, orientation: Orientation, x: u32, y: u32) {
            next_tx();
            self.dispatcher().build(game_id, orientation, x, y);
            next_tx();
        }

        fn dispatcher(self: TestChallenge) -> IChallengeDispatcher {
            IChallengeDispatcher { contract_address: self.contract_address }
        }
    }

    /// Deploys the devnet's VRF mock and sets it as `challenge`'s provider, as `deploy.sh devnet`
    /// does (#645). Returns the mock.
    pub fn set_mock_vrf(challenge: ContractAddress) -> ContractAddress {
        let provider = deploy("MockVrfProvider", array![]);
        start_cheat_caller_address(challenge, OWNER());
        IChallengeDrawDispatcher { contract_address: challenge }.set_vrf_provider(provider);
        stop_cheat_caller_address(challenge);
        // [Info] snforge's hash is 0 until cheated, the stored hash of the last draw too
        next_tx();
        provider
    }

    #[derive(Drop)]
    pub struct Systems {
        pub challenge: TestChallenge,
        pub setup: ISetupDispatcher,
        pub economy: IEconomyDispatcher,
        pub collection: ICollectionDispatcher,
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

        fn builder(self: TestStore, game: Game, player_id: felt252) -> Builder {
            interact_with_state(self.contract, || StoreImpl::new().builder(game, player_id))
        }

        fn tile(self: TestStore, game: Game, tile_id: u32) -> Tile {
            interact_with_state(self.contract, || StoreImpl::new().tile(game, tile_id))
        }

        fn set_game(self: TestStore, game: Game) {
            interact_with_state(self.contract, || StoreImpl::new().set_game(game))
        }

        fn set_tile(self: TestStore, tile: Tile) {
            interact_with_state(self.contract, || StoreImpl::new().set_tile(tile))
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
    /// `OWNER`), `Faucet`, `MockRouter` seeded with 800,000 PAVED and 10,000 USDC, the `Vault`
    /// (vPAVED) with its 1,000 PAVED of dead shares and 199,000 PAVED deposited by `OWNER`,
    /// `Economy` (decided configuration, launch rate) as
    /// the token's minter. `Economy.set_game` is left to the caller. Returns `Economy` and USDC.
    pub fn deploy_economy() -> (ContractAddress, ContractAddress) {
        let owner = OWNER();
        let paved = deploy("PavedToken", array![owner.into(), owner.into()]);
        let usdc = deploy("Faucet", array![]);
        let router = deploy("MockRouter", array![paved.into(), usdc.into()]);
        let vault = deploy(
            "Vault", array![owner.into(), paved.into(), DEFAULT_EXIT_FEE_BPS.into()],
        );
        // [Setup] The pool, from the owner's PAVED and the faucet's USDC
        IFaucetDispatcher { contract_address: usdc }.mint(owner, 10_000 * USDC);
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
        // [Setup] The dead shares, held by the Vault itself, then the owner's stake
        start_cheat_caller_address(vault, owner);
        let erc4626 = IERC4626Dispatcher { contract_address: vault };
        erc4626.deposit(DEAD_ASSETS, vault);
        erc4626.deposit(200_000 * PAVED - DEAD_ASSETS, owner);
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

    /// Gives `who` the faucet's USDC, approved for `challenge`. A player needs nothing else (D-25).
    pub fn fund(usdc: ContractAddress, challenge: ContractAddress, who: ContractAddress) {
        IFaucetDispatcher { contract_address: usdc }.mint(who, FUNDS);
        start_cheat_caller_address(usdc, who);
        IERC20Dispatcher { contract_address: usdc }.approve(challenge, FUNDS);
        stop_cheat_caller_address(usdc);
    }

    /// Deploys the economy (`deploy_economy`), `Collection`, `Setup` and `Daily` (USDC as its
    /// token, reporting to `Setup`), wires `Economy` to `Daily`, `Setup` to `Economy` and
    /// `Collection` (the wiring), `Daily` as the reporter of `Setup` and the only minter of
    /// `Collection`, funds four players with USDC approved for `Daily`, and spawns a game of `mode`
    /// for `PLAYER` (none for `Mode::None`; a Daily game at stake 1). Returns a `TestStore` of
    /// `Daily`.
    #[inline]
    pub fn spawn_game(mode: Mode) -> (TestStore, Systems, Context) {
        // [Setup] Systems
        let owner: felt252 = OWNER().into();
        let (economy_address, token_address) = deploy_economy();
        let collection_address = deploy("Collection", array![owner]);
        let setup_address = deploy("Setup", array![owner]);
        let daily_address = deploy(
            "Challenge", array![owner, token_address.into(), setup_address.into()],
        );
        set_mock_vrf(daily_address);
        let systems = Systems {
            challenge: TestChallenge { contract_address: daily_address },
            setup: ISetupDispatcher { contract_address: setup_address },
            economy: IEconomyDispatcher { contract_address: economy_address },
            collection: ICollectionDispatcher { contract_address: collection_address },
        };
        start_cheat_caller_address(economy_address, OWNER());
        systems.economy.set_game(daily_address);
        stop_cheat_caller_address(economy_address);
        start_cheat_caller_address(collection_address, OWNER());
        systems.collection.set_minters(daily_address, Zero::zero());
        stop_cheat_caller_address(collection_address);
        start_cheat_caller_address(setup_address, OWNER());
        systems.setup.set_reporter(daily_address, true);
        systems.setup.set_economy(economy_address);
        systems.setup.set_collection(collection_address);
        stop_cheat_caller_address(setup_address);

        // [Setup] Context
        let token = IERC20Dispatcher { contract_address: token_address };
        fund(token_address, daily_address, ANYONE());
        fund(token_address, daily_address, SOMEONE());
        fund(token_address, daily_address, NOONE());
        fund(token_address, daily_address, PLAYER());
        let duration: u64 = 0;

        // [Setup] Keep player as caller for game interactions
        start_cheat_caller_address(daily_address, PLAYER());

        // [Setup] Game if mode is set
        let game_id = match mode {
            Mode::Challenge => systems.challenge.spawn(1, Zero::zero(), 0),
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
        let store = TestStoreTrait::new(daily_address);
        (store, systems, context)
    }
}
