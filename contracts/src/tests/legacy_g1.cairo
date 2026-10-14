//! The spawn of `Challenge` before G1 (main at f94c34f), frozen for two tests: the games that stay
//! open across the G1 upgrade (`e2e/upgrade_g1.cairo`) and the walk's cost before and after
//! (`walk_cost.cairo`).
//!
//! G1 changed one function, `DeckTrait::tiles` (the deck walk of the spawn). Its body at f94c34f is
//! kept here as `tiles_before_g1`, with its `paved::` paths kept. `ChallengeBeforeG1` spawns as
//! `Challenge.spawn` of f94c34f did (`spawn_from` with `TokenSeed`: the wiring, `spawn_with` with
//! the frozen `Game::start`, the purchase, the mint), on the same storage node
//! (`selector!("paved")`) and the same storage fields (`ownable`, `payable`, `setup`), and upgrades
//! as `Challenge` does (owner only). Everything after the spawn (the draws, the builds, the game
//! over) is the current class's: the test upgrades before the first move.

use core::hash::HashStateTrait;
use core::poseidon::{HashState, PoseidonTrait};
use paved::helpers::bitmap::Bitmap;
use paved::types::deck::{Deck, DeckImpl};
use starknet::{ClassHash, ContractAddress};

#[starknet::interface]
pub trait IChallengeBeforeG1<TContractState> {
    fn spawn(ref self: TContractState, stake: u8, referrer: ContractAddress, min_out: u256) -> u32;
    fn upgrade(ref self: TContractState, new_class_hash: ClassHash);
}

const MULTIPLIER: u128 = 10_000;

/// `DeckTrait::tiles` of f94c34f: one Poseidon per free index, each removed with a probability over
/// `MULTIPLIER`.
pub fn tiles_before_g1(self: Deck, mut tiles: u128, seed: felt252) -> u128 {
    match self {
        Deck::Simple => {
            let total_count: u128 = self.total_count().into();
            let mut to_removes = total_count - self.count().into();
            let mut index: u8 = 0;
            loop {
                // [Check] Stop if nothing else to remove
                if to_removes == 0 {
                    break tiles;
                }
                // [Check] Check if the tile is free, otherwise skip
                let value = Bitmap::get_bit_at(tiles, index);
                if value {
                    index += 1;
                    continue;
                }
                // [Check] Remove the tile from the deck with a dynamic probability
                let state: HashState = PoseidonTrait::new();
                let state = state.update(seed);
                let state = state.update(index.into());
                let random_u256: u256 = state.finalize().into();
                let random: u128 = random_u256.low % MULTIPLIER;
                let probability: u128 = to_removes.into()
                    * MULTIPLIER
                    / (total_count - index.into()).into();
                if random <= probability {
                    to_removes -= 1;
                    tiles = Bitmap::set_bit_at(tiles, index, true);
                }
                index += 1;
            }
        },
        _ => tiles,
    }
}

#[starknet::contract]
pub mod ChallengeBeforeG1 {
    use core::num::traits::{Pow, Zero};
    use openzeppelin_upgrades::UpgradeableComponent;
    use paved::components::ownable::OwnableComponent;
    use paved::components::payable::{IERC20Dispatcher, IERC20DispatcherTrait, PayableComponent};
    use paved::day::day_id;
    use paved::events::{Event as PavedEvent, GameSpawned};
    use paved::models::builder::BuilderImpl;
    use paved::models::game::{Game, GameImpl};
    use paved::models::tile::{Tile, TileTrait};
    use paved::seed::{SeedSource, TokenSeed};
    use paved::store::{Store, StoreImpl};
    use paved::systems::collection::{ICollectionDispatcher, ICollectionDispatcherTrait};
    use paved::systems::economy::{DAY, IEconomyDispatcher, IEconomyDispatcherTrait};
    use paved::systems::setup::{ISetupDispatcher, ISetupDispatcherTrait};
    use paved::types::deck::{Deck, DeckImpl};
    use paved::types::mode::{Mode, ModeTrait};
    use paved::types::orientation::Orientation;
    use paved::types::plan::Plan;
    use starknet::storage::StoragePointerReadAccess;
    use starknet::{
        ClassHash, ContractAddress, get_block_timestamp, get_caller_address, get_contract_address,
    };
    use super::tiles_before_g1;

    component!(path: OwnableComponent, storage: ownable, event: OwnableEvent);
    impl OwnableInternalImpl = OwnableComponent::InternalImpl<ContractState>;
    component!(path: UpgradeableComponent, storage: upgradeable, event: UpgradeableEvent);
    impl UpgradeableInternalImpl = UpgradeableComponent::InternalImpl<ContractState>;

    component!(path: PayableComponent, storage: payable, event: PayableEvent);

    /// The fields of `Challenge` that its spawn reads, under the same names (so the same
    /// addresses): the owner, the payment token and the `Setup`.
    #[storage]
    struct Storage {
        #[substorage(v0)]
        ownable: OwnableComponent::Storage,
        #[substorage(v0)]
        upgradeable: UpgradeableComponent::Storage,
        #[substorage(v0)]
        payable: PayableComponent::Storage,
        setup: ContractAddress,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        #[flat]
        OwnableEvent: OwnableComponent::Event,
        #[flat]
        UpgradeableEvent: UpgradeableComponent::Event,
        #[flat]
        PayableEvent: PayableComponent::Event,
    }

    #[abi(embed_v0)]
    impl ChallengeBeforeG1Impl of super::IChallengeBeforeG1<ContractState> {
        /// `Challenge.spawn` of f94c34f: `spawn_from` with the token's seed.
        fn spawn(
            ref self: ContractState, stake: u8, referrer: ContractAddress, min_out: u256,
        ) -> u32 {
            // [Interaction] The wiring, in one call to `Setup`
            let wiring = ISetupDispatcher { contract_address: self.setup.read() }.wiring();
            // [Effect] Spawn a game
            let (game_id, unit) = spawn_with(
                Mode::Challenge, @TokenSeed { contract: get_contract_address() },
            );
            // [Interaction] The game is purchased (no referral: the test passes none)
            assert(referrer.is_zero(), 'Legacy: no referral');
            let player = get_caller_address();
            let price = stake.into() * unit;
            let token = IERC20Dispatcher { contract_address: self.payable.token_address.read() };
            assert(token.transferFrom(player, wiring.economy, price), 'ERC20: pay failed');
            IEconomyDispatcher { contract_address: wiring.economy }
                .purchase(
                    game_id, player, get_block_timestamp() / DAY, stake, price, referrer, min_out,
                );
            // [Interaction] The game is minted to its player
            ICollectionDispatcher { contract_address: wiring.collection }
                .mint(player, game_id.into());
            game_id
        }

        fn upgrade(ref self: ContractState, new_class_hash: ClassHash) {
            self.ownable.assert_only_owner();
            self.upgradeable.upgrade(new_class_hash);
        }
    }

    /// `HostableComponent::spawn_with` of f94c34f, with its `Game::start`.
    fn spawn_with(mode: Mode, source: @TokenSeed) -> (u32, u256) {
        let store: Store = StoreImpl::new();
        let player_id: felt252 = get_caller_address().into();
        let game_id = store.uuid();
        let time = get_block_timestamp();
        let mut game = GameImpl::new(game_id, time, mode, player_id);
        let seed = source.seed(mode, time, game.id, game.seed);
        let tile = start(ref game, time, seed);
        store.set_tile(tile);
        let mut builder = BuilderImpl::new(game.id, player_id);
        let (tile_id, plan) = game.draw_plan();
        let tile = builder.reveal(tile_id, plan);
        store.set_tile(tile);
        let day = day_id(time, game.duration());
        store.set_game(game);
        store
            .emit(
                PavedEvent::GameSpawned(
                    GameSpawned {
                        game_id,
                        player_id: player_id,
                        mode: game.mode,
                        day_id: day,
                        start_time: time,
                        price: game.price(),
                    },
                ),
            );
        let amount: u256 = game.price().into();
        (game_id, amount)
    }

    /// `GameImpl::start` of f94c34f: the deck is walked by `tiles_before_g1`.
    fn start(ref game: Game, time: u64, seed: felt252) -> Tile {
        let tile_id = game.add_tile();
        let mut tile = TileTrait::new(game.id, tile_id, Plan::RFFFRFCFR);
        tile.orientation = Orientation::South.into();
        let plan: Plan = tile.plan.into();
        let deck: Deck = game.deck();
        let mut indexes = deck.indexes(plan);
        let index = indexes.pop_front().unwrap();
        game.tiles = game.tiles | 2_u128.pow(index.into());
        game.seed = seed;
        game.tiles = tiles_before_g1(deck, game.tiles, game.seed);
        game.start_time = time;
        tile
    }
}
