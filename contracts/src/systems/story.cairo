//! `Story`, the system of Story mode on chain (#546, #548; `docs/architecture/story-mode.md`).
//!
//! The owner defines the campaigns and their levels in storage (`set_campaign`, `set_level`), keyed
//! by campaign id and level id, and may correct them or add more later. A player submits a whole
//! run of a level at its end, in one transaction (`submit_run`): the moves are replayed on the
//! level's fixed deck by the engine `Challenge` plays (`PlayableComponent::build` and `discard`,
//! the same structure state, placement and assessment), in a game of this contract's own storage.
//! The score gives the stars (1 finished, 2 at 70 % of the target rounded up, 3 at the target);
//! the best stars of a level are kept, 2 bits per level and player, and the stars newly gained are
//! paid in cobbles by `Setup`'s ledger (`ISetupStory::credit_story`, 5, 10 and 15 per star), once
//! per star, level and account. Nothing is paid in or permissioned: any account submits its own
//! run.

/// The most levels of a campaign: the stars of a campaign are 2 bits per level in a `u128`.
pub const MAX_LEVELS: u8 = 64;
/// The most tiles a level draws after its starter: the whole base deck (72 cards, the starter's
/// card withdrawn, 71), with a margin. The drawn tiles take the ids 2 to 73.
pub const MAX_TILES: u32 = 72;
/// The most tiles a level places before the first draw (level 10 of the Tutorial places 5).
pub const MAX_PLACED: u32 = 16;
/// The id of the first placed tile, clear of the drawn ones (`PREPLACED_ID` of the client engine).
pub const PLACED_ID: u32 = 200;
/// The stars of a level: 1 finished, 2 at least 70 % of the target (rounded up), 3 the target.
pub const MAX_STARS: u8 = 3;
pub const TWO_STARS_PERCENT: u64 = 70;
/// The plans of a level's deck held by one storage page, a byte each.
pub const PAGE_PLANS: u32 = 31;

/// A campaign: its number of levels (1 to `MAX_LEVELS`) and its unlock rule: the average stars per
/// level the player must hold over every level of the campaigns before it (the owner's rule is 2;
/// the first campaign is always open). `level_count` 0: no such campaign.
#[derive(Copy, Drop, Serde, Debug, PartialEq)]
pub struct StoryCampaign {
    pub level_count: u8,
    pub unlock_average: u8,
}

/// A tile a level writes before the first draw (its starter, and the tiles it places): a plan
/// code (1 to 19, `types/plan.cairo`), an orientation code (1 North to 4 West) and a position, in
/// the game's coordinates (the usual starter is at `CENTER`, `CENTER`).
#[derive(Copy, Drop, Serde, Debug, PartialEq)]
pub struct StoryTile {
    pub plan: u8,
    pub orientation: u8,
    pub x: u32,
    pub y: u32,
}

/// A level as the owner set it: the plans drawn after the starter, in draw order, the starter, the
/// tiles placed before the first draw, and the target score (3 stars: the optimum, or the best
/// score known for a long deck).
#[derive(Drop, Serde, Debug, PartialEq)]
pub struct StoryLevel {
    pub plans: Array<u8>,
    pub starter: StoryTile,
    pub placed: Array<StoryTile>,
    pub target: u32,
}

/// One move of a run, for the tile drawn at that step, as the client records it (#546, PVD-38's
/// `StoryMoveInput`): a discard (`discard` true; `orientation`, `x` and `y` are then ignored, 0 by
/// convention), or the tile built with `orientation` (1 North to 4 West) at `(x, y)`, the game's
/// coordinates, as `Challenge.build` takes them.
#[derive(Copy, Drop, Serde, Debug, PartialEq)]
pub struct StoryMove {
    pub discard: bool,
    pub orientation: u8,
    pub x: u32,
    pub y: u32,
}

/// A player's progress in a campaign: the best stars of level `l` in bits `2(l - 1)` and
/// `2(l - 1) + 1` of `stars`, and their sum.
#[derive(Copy, Drop, Serde, Debug, PartialEq)]
pub struct StoryProgress {
    pub stars: u128,
    pub total: u16,
}

#[starknet::interface]
pub trait IStory<TContractState> {
    /// Sets a campaign, owner only: `campaign_id` 1, or the one after a campaign that exists;
    /// `level_count` 1 to 64; `unlock_average` 0 to 3. Correctable: a lower `level_count` makes the
    /// levels above it unplayable, their stars kept. Emits `CampaignSet`.
    fn set_campaign(ref self: TContractState, campaign_id: u8, level_count: u8, unlock_average: u8);
    /// Sets a level of a campaign that exists, owner only: `level_id` 1 to its `level_count`;
    /// `plans` 1 to 72 plan codes, the deck after the starter in draw order; `placed` at most 16
    /// tiles, on distinct positions, none on the starter's; `target` non-zero. Correctable: a
    /// player's stars and best score are kept (stars already paid stay paid). Emits `LevelSet`.
    fn set_level(
        ref self: TContractState,
        campaign_id: u8,
        level_id: u8,
        plans: Span<u8>,
        starter: StoryTile,
        placed: Span<StoryTile>,
        target: u32,
    );
    /// The caller's whole run of level `level_index` (its `level_id`, from 1) of a campaign, one
    /// move per drawn tile: replayed on the level's deck (`'Tile: cannot place'`, `'Tile: no
    /// neighbors'`, `'Tile: already exists'` on an illegal move), scored, and its stars kept if
    /// better; the stars newly gained are paid in cobbles by `Setup`. A level is locked until the
    /// one before it is finished (1 star); the first level of a campaign, until the caller has
    /// finished it, until the caller holds `unlock_average` stars per level over the levels the
    /// campaigns before it have now. Emits `RunSubmitted`; returns the run's stars.
    fn submit_run(
        ref self: TContractState, campaign_id: u8, level_index: u8, moves: Span<StoryMove>,
    ) -> u8;
    fn campaign(self: @TContractState, campaign_id: u8) -> StoryCampaign;
    fn level(self: @TContractState, campaign_id: u8, level_id: u8) -> StoryLevel;
    fn progress(self: @TContractState, player_id: felt252, campaign_id: u8) -> StoryProgress;
    /// The best stars (0 to 3) of a player on a level.
    fn stars(self: @TContractState, player_id: felt252, campaign_id: u8, level_id: u8) -> u8;
    fn best_score(self: @TContractState, player_id: felt252, campaign_id: u8, level_id: u8) -> u32;
}

/// The `Setup` whose ledger pays the stars, set by the owner (as `IChallengeSetup`).
#[starknet::interface]
pub trait IStorySetup<TContractState> {
    /// Sets the `Setup` paid from from now on: the owner only, never zero. Emits `SetupSet`.
    fn set_setup(ref self: TContractState, setup: starknet::ContractAddress);
    fn setup(self: @TContractState) -> starknet::ContractAddress;
}

/// The stars of `score` against `target`: 1 (a finished run), 2 from 70 % of the target rounded
/// up, 3 from the target.
pub fn stars_of(score: u32, target: u32) -> u8 {
    if score >= target {
        3
    } else if score.into() * 100_u64 >= target.into() * TWO_STARS_PERCENT {
        2
    } else {
        1
    }
}

/// The unit of level `level_id`'s two bits in a progress word: `4^(level_id - 1)`.
pub fn star_unit(level_id: u8) -> u128 {
    let mut unit: u128 = 1;
    let mut i: u8 = 1;
    while i < level_id {
        unit *= 4;
        i += 1;
    }
    unit
}

/// The stars of `level_id` in a progress word.
pub fn stars_at(stars: u128, level_id: u8) -> u8 {
    ((stars / star_unit(level_id)) % 4).try_into().unwrap()
}

/// The stars held over levels 1 to `level_count` of a progress word (the levels a campaign has
/// now).
pub fn stars_over(stars: u128, level_count: u8) -> u32 {
    let mut word = stars;
    let mut sum: u32 = 0;
    let mut level: u8 = 0;
    while level < level_count && word != 0 {
        sum += (word % 4).try_into().unwrap();
        word /= 4;
        level += 1;
    }
    sum
}

#[starknet::contract]
pub mod Story {
    use core::num::traits::{Bounded, Zero};
    use openzeppelin_interfaces::upgrades::IUpgradeable;
    use openzeppelin_upgrades::UpgradeableComponent;
    use paved::components::ownable::OwnableComponent;
    use paved::events::Event as PavedEvent;
    use paved::models::game::{Game, GameImpl};
    use paved::models::tile::{TileAssert, TileImpl, TilePositionAssert};
    use paved::store::{Store, StoreImpl};
    use paved::structure::placement::{self, NeighborhoodTrait};
    use paved::structure::state::StructuresTrait;
    use paved::systems::setup::{ISetupStoryDispatcher, ISetupStoryDispatcherTrait};
    use paved::types::mode::Mode;
    use paved::types::orientation::Orientation;
    use paved::types::plan::Plan;
    use starknet::storage::{
        Map, StorageMapReadAccess, StorageMapWriteAccess, StoragePointerReadAccess,
        StoragePointerWriteAccess,
    };
    use starknet::{ClassHash, ContractAddress, get_block_timestamp, get_caller_address};
    use super::{
        IStory, IStorySetup, MAX_LEVELS, MAX_PLACED, MAX_STARS, MAX_TILES, PAGE_PLANS, PLACED_ID,
        StoryCampaign, StoryLevel, StoryMove, StoryProgress, StoryTile, star_unit, stars_at,
        stars_of, stars_over,
    };

    pub mod errors {
        pub const ZERO_SETUP_ADDRESS: felt252 = 'Story: setup is zero';
        pub const INVALID_CAMPAIGN: felt252 = 'Story: invalid campaign';
        pub const INVALID_LEVEL_COUNT: felt252 = 'Story: invalid level count';
        pub const INVALID_UNLOCK: felt252 = 'Story: invalid unlock';
        pub const INVALID_LEVEL: felt252 = 'Story: invalid level';
        pub const INVALID_PLANS: felt252 = 'Story: invalid plans';
        pub const INVALID_PLAN: felt252 = 'Story: invalid plan';
        pub const INVALID_TILE: felt252 = 'Story: invalid tile';
        pub const TOO_MANY_PLACED: felt252 = 'Story: too many placed';
        pub const INVALID_TARGET: felt252 = 'Story: invalid target';
        pub const NO_LEVEL: felt252 = 'Story: no level';
        pub const LEVEL_LOCKED: felt252 = 'Story: level locked';
        pub const CAMPAIGN_LOCKED: felt252 = 'Story: campaign locked';
        pub const INVALID_MOVES: felt252 = 'Story: invalid moves';
        pub const INVALID_POSITION: felt252 = 'Story: invalid position';
        pub const INVALID_ORIENTATION: felt252 = 'Story: invalid orientation';
    }

    // Packing

    const TWO_POW_8: u128 = 0x100;
    const TWO_POW_16: u128 = 0x10000;
    const TWO_POW_32: u128 = 0x100000000;
    const TWO_POW_48: u128 = 0x1000000000000;
    const TWO_POW_128: felt252 = 0x100000000000000000000000000000000;
    const MASK_8: u128 = 0xff;
    const MASK_16: u128 = 0xffff;
    const MASK_32: u128 = 0xffffffff;

    component!(path: OwnableComponent, storage: ownable, event: OwnableEvent);
    #[abi(embed_v0)]
    impl OwnableImpl = OwnableComponent::OwnableImpl<ContractState>;
    impl OwnableInternalImpl = OwnableComponent::InternalImpl<ContractState>;
    component!(path: UpgradeableComponent, storage: upgradeable, event: UpgradeableEvent);
    impl UpgradeableInternalImpl = UpgradeableComponent::InternalImpl<ContractState>;

    // Storage. The games the runs are replayed in live in `PavedStorage` (`paved::store`), under
    // the node `selector!("paved")`: no member here is named `paved`.

    #[storage]
    struct Storage {
        #[substorage(v0)]
        ownable: OwnableComponent::Storage,
        #[substorage(v0)]
        upgradeable: UpgradeableComponent::Storage,
        /// The `Setup` that pays the stars; written by the constructor and `set_setup`.
        setup: ContractAddress,
        /// A campaign (key `campaign_id`): `level_count` [0, 8) · `unlock_average` [8, 16).
        campaigns: Map<u8, felt252>,
        /// A level's header (key `(campaign_id, level_id)`): the number of plans [0, 8), of placed
        /// tiles [8, 16), the target [16, 48); the starter in the high half (`tile_word`). 0: no
        /// level.
        levels: Map<(u8, u8), felt252>,
        /// A level's plans, `PAGE_PLANS` per page, a byte each, the first in the lowest byte (key
        /// `(campaign_id, level_id, page)`).
        level_plans: Map<(u8, u8, u8), felt252>,
        /// A level's placed tiles (key `(campaign_id, level_id, index)`, `tile_word`).
        level_placed: Map<(u8, u8, u8), felt252>,
        /// A player's stars in a campaign (key `(player_id, campaign_id)`): 2 bits per level in the
        /// low half (`StoryProgress.stars`), their sum in the high half.
        progress: Map<(felt252, u8), felt252>,
        /// A player's best score on a level (key `(player_id, campaign_id, level_id)`).
        best_scores: Map<(felt252, u8, u8), u32>,
    }

    // Events

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        #[flat]
        PavedEvent: PavedEvent,
        #[flat]
        OwnableEvent: OwnableComponent::Event,
        #[flat]
        UpgradeableEvent: UpgradeableComponent::Event,
        SetupSet: SetupSet,
        CampaignSet: CampaignSet,
        LevelSet: LevelSet,
        RunSubmitted: RunSubmitted,
    }

    #[derive(Drop, Debug, PartialEq, starknet::Event)]
    pub struct SetupSet {
        pub setup: ContractAddress,
    }

    #[derive(Drop, Debug, PartialEq, starknet::Event)]
    pub struct CampaignSet {
        #[key]
        pub campaign_id: u8,
        pub level_count: u8,
        pub unlock_average: u8,
    }

    /// A level set or corrected: its number of drawn tiles and of placed tiles, and its target.
    #[derive(Drop, Debug, PartialEq, starknet::Event)]
    pub struct LevelSet {
        #[key]
        pub campaign_id: u8,
        #[key]
        pub level_id: u8,
        pub tiles: u8,
        pub placed: u8,
        pub target: u32,
    }

    /// A run replayed: its game (in this contract), score and stars; the player's best stars on
    /// the level after it, the stars it gained (paid now) and the cobbles `Setup` credited for
    /// them (its `CobblesClaimed`, one per star, carry the balance).
    #[derive(Drop, Debug, PartialEq, starknet::Event)]
    pub struct RunSubmitted {
        #[key]
        pub player_id: felt252,
        #[key]
        pub campaign_id: u8,
        #[key]
        pub level_id: u8,
        pub game_id: u32,
        pub score: u32,
        pub stars: u8,
        pub best_stars: u8,
        pub gained: u8,
        pub cobbles: u32,
    }

    #[constructor]
    fn constructor(
        ref self: ContractState, owner: ContractAddress, setup_address: ContractAddress,
    ) {
        assert(setup_address.is_non_zero(), errors::ZERO_SETUP_ADDRESS);
        self.ownable.initialize(owner);
        self.setup.write(setup_address);
    }

    #[abi(embed_v0)]
    impl StoryImpl of IStory<ContractState> {
        fn set_campaign(
            ref self: ContractState, campaign_id: u8, level_count: u8, unlock_average: u8,
        ) {
            // [Check] The owner; the campaigns are numbered from 1 with no gap
            self.ownable.assert_only_owner();
            assert(campaign_id != 0, errors::INVALID_CAMPAIGN);
            if campaign_id > 1 {
                assert(
                    self.campaign_of(campaign_id - 1).level_count != 0, errors::INVALID_CAMPAIGN,
                );
            }
            assert(level_count != 0 && level_count <= MAX_LEVELS, errors::INVALID_LEVEL_COUNT);
            assert(unlock_average <= MAX_STARS, errors::INVALID_UNLOCK);
            // [Effect] Set
            let word: u128 = level_count.into() + unlock_average.into() * TWO_POW_8;
            self.campaigns.write(campaign_id, word.into());
            self.emit(CampaignSet { campaign_id, level_count, unlock_average });
        }

        fn set_level(
            ref self: ContractState,
            campaign_id: u8,
            level_id: u8,
            plans: Span<u8>,
            starter: StoryTile,
            placed: Span<StoryTile>,
            target: u32,
        ) {
            // [Check] The owner, a level of a campaign that exists
            self.ownable.assert_only_owner();
            let campaign = self.campaign_of(campaign_id);
            assert(campaign.level_count != 0, errors::INVALID_CAMPAIGN);
            assert(level_id != 0 && level_id <= campaign.level_count, errors::INVALID_LEVEL);
            // [Check] The deck, the tiles written before the first draw, the target
            assert(plans.len() != 0 && plans.len() <= MAX_TILES, errors::INVALID_PLANS);
            for plan in plans {
                assert_plan(*plan);
            }
            assert_tile(starter);
            assert(placed.len() <= MAX_PLACED, errors::TOO_MANY_PLACED);
            let mut i = 0;
            while i < placed.len() {
                let tile = *placed.at(i);
                assert_tile(tile);
                assert(tile.x != starter.x || tile.y != starter.y, errors::INVALID_TILE);
                let mut j = i + 1;
                while j < placed.len() {
                    let other = *placed.at(j);
                    assert(tile.x != other.x || tile.y != other.y, errors::INVALID_TILE);
                    j += 1;
                }
                i += 1;
            }
            assert(target != 0, errors::INVALID_TARGET);
            // [Effect] The header, the plans by page, the placed tiles
            let key = (campaign_id, level_id);
            let tiles: u8 = plans.len().try_into().unwrap();
            let count: u8 = placed.len().try_into().unwrap();
            let low: u128 = tiles.into() + count.into() * TWO_POW_8 + target.into() * TWO_POW_16;
            self.levels.write(key, low.into() + tile_word(starter) * TWO_POW_128);
            let mut page: u8 = 0;
            let mut word: u256 = 0;
            let mut unit: u256 = 1;
            let mut index: u32 = 0;
            for plan in plans {
                word += (*plan).into() * unit;
                unit *= 0x100;
                index += 1;
                if index % PAGE_PLANS == 0 || index == plans.len() {
                    self.level_plans.write((campaign_id, level_id, page), word.try_into().unwrap());
                    page += 1;
                    word = 0;
                    unit = 1;
                }
            }
            let mut index: u8 = 0;
            for tile in placed {
                self.level_placed.write((campaign_id, level_id, index), tile_word(*tile));
                index += 1;
            }
            self.emit(LevelSet { campaign_id, level_id, tiles, placed: count, target });
        }

        fn submit_run(
            ref self: ContractState, campaign_id: u8, level_index: u8, moves: Span<StoryMove>,
        ) -> u8 {
            let level_id = level_index;
            let player_id: felt252 = get_caller_address().into();
            // [Check] The level exists and is in its campaign
            let campaign = self.campaign_of(campaign_id);
            assert(campaign.level_count != 0, errors::INVALID_CAMPAIGN);
            assert(level_id != 0 && level_id <= campaign.level_count, errors::INVALID_LEVEL);
            let level = self.level_of(campaign_id, level_id);
            assert(level.target != 0, errors::NO_LEVEL);
            // [Check] The level is unlocked: the one before it finished; for the first one, the
            // campaign's average over the levels the campaigns before it have now (the stars of a
            // level the owner removed do not count). A first level the player has finished stays
            // open: the campaign was open then, and its later levels stay open too
            let progress = self.progress_of(player_id, campaign_id);
            if level_id > 1 {
                assert(stars_at(progress.stars, level_id - 1) != 0, errors::LEVEL_LOCKED);
            } else if campaign_id > 1 && stars_at(progress.stars, 1) == 0 {
                let mut levels: u32 = 0;
                let mut stars: u32 = 0;
                let mut id: u8 = 1;
                while id < campaign_id {
                    let count = self.campaign_of(id).level_count;
                    levels += count.into();
                    stars += stars_over(self.progress_of(player_id, id).stars, count);
                    id += 1;
                }
                assert(stars >= levels * campaign.unlock_average.into(), errors::CAMPAIGN_LOCKED);
            }
            // [Check] One move per drawn tile; [Effect] the run, replayed
            assert(moves.len() == level.plans.len(), errors::INVALID_MOVES);
            let (game_id, score) = replay(player_id, @level, moves);
            // [Effect] The best score and the best stars; the stars gained are paid
            let stars = stars_of(score, level.target);
            let key = (player_id, campaign_id, level_id);
            if score > self.best_scores.read(key) {
                self.best_scores.write(key, score);
            }
            let held = stars_at(progress.stars, level_id);
            let (best_stars, gained) = if stars > held {
                let unit = star_unit(level_id);
                let raised = StoryProgress {
                    stars: progress.stars + (stars - held).into() * unit,
                    total: progress.total + (stars - held).into(),
                };
                self.write_progress(player_id, campaign_id, raised);
                (stars, stars - held)
            } else {
                (held, 0)
            };
            // [Interaction] The cobbles of the stars gained, from `Setup`'s ledger
            let cobbles = if gained != 0 {
                ISetupStoryDispatcher { contract_address: self.setup_address() }
                    .credit_story(player_id, campaign_id, level_id, held, stars)
            } else {
                0
            };
            self
                .emit(
                    RunSubmitted {
                        player_id,
                        campaign_id,
                        level_id,
                        game_id,
                        score,
                        stars,
                        best_stars,
                        gained,
                        cobbles,
                    },
                );
            stars
        }

        fn campaign(self: @ContractState, campaign_id: u8) -> StoryCampaign {
            self.campaign_of(campaign_id)
        }

        fn level(self: @ContractState, campaign_id: u8, level_id: u8) -> StoryLevel {
            self.level_of(campaign_id, level_id)
        }

        fn progress(self: @ContractState, player_id: felt252, campaign_id: u8) -> StoryProgress {
            self.progress_of(player_id, campaign_id)
        }

        fn stars(self: @ContractState, player_id: felt252, campaign_id: u8, level_id: u8) -> u8 {
            if level_id == 0 || level_id > MAX_LEVELS {
                return 0;
            }
            stars_at(self.progress_of(player_id, campaign_id).stars, level_id)
        }

        fn best_score(
            self: @ContractState, player_id: felt252, campaign_id: u8, level_id: u8,
        ) -> u32 {
            self.best_scores.read((player_id, campaign_id, level_id))
        }
    }

    #[abi(embed_v0)]
    impl StorySetupImpl of IStorySetup<ContractState> {
        fn set_setup(ref self: ContractState, setup: ContractAddress) {
            self.ownable.assert_only_owner();
            assert(setup.is_non_zero(), errors::ZERO_SETUP_ADDRESS);
            self.setup.write(setup);
            self.emit(SetupSet { setup });
        }

        fn setup(self: @ContractState) -> ContractAddress {
            self.setup.read()
        }
    }

    #[abi(embed_v0)]
    impl UpgradeableImpl of IUpgradeable<ContractState> {
        /// Replaces the class, keeping the storage (OpenZeppelin's `Upgraded`). The owner only.
        fn upgrade(ref self: ContractState, new_class_hash: ClassHash) {
            self.ownable.assert_only_owner();
            self.upgradeable.upgrade(new_class_hash);
        }
    }

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn setup_address(self: @ContractState) -> ContractAddress {
            let setup = self.setup.read();
            assert(setup.is_non_zero(), errors::ZERO_SETUP_ADDRESS);
            setup
        }

        fn campaign_of(self: @ContractState, campaign_id: u8) -> StoryCampaign {
            let word: u256 = self.campaigns.read(campaign_id).into();
            StoryCampaign {
                level_count: (word.low & MASK_8).try_into().unwrap(),
                unlock_average: ((word.low / TWO_POW_8) & MASK_8).try_into().unwrap(),
            }
        }

        /// The level as set; a level never set has no plans and target 0.
        fn level_of(self: @ContractState, campaign_id: u8, level_id: u8) -> StoryLevel {
            let header: u256 = self.levels.read((campaign_id, level_id)).into();
            let tiles: u32 = (header.low & MASK_8).try_into().unwrap();
            let count: u8 = ((header.low / TWO_POW_8) & MASK_8).try_into().unwrap();
            let mut plans: Array<u8> = array![];
            let mut page: u8 = 0;
            while plans.len() < tiles {
                let mut word: u256 = self.level_plans.read((campaign_id, level_id, page)).into();
                let mut i = 0;
                while i < PAGE_PLANS && plans.len() < tiles {
                    plans.append((word.low & MASK_8).try_into().unwrap());
                    word /= 0x100;
                    i += 1;
                }
                page += 1;
            }
            let mut placed: Array<StoryTile> = array![];
            let mut index: u8 = 0;
            while index < count {
                let word: u256 = self.level_placed.read((campaign_id, level_id, index)).into();
                placed.append(tile_of(word.low));
                index += 1;
            }
            StoryLevel {
                plans,
                starter: tile_of(header.high),
                placed,
                target: ((header.low / TWO_POW_16) & MASK_32).try_into().unwrap(),
            }
        }

        fn progress_of(self: @ContractState, player_id: felt252, campaign_id: u8) -> StoryProgress {
            let word: u256 = self.progress.read((player_id, campaign_id)).into();
            StoryProgress { stars: word.low, total: (word.high & MASK_16).try_into().unwrap() }
        }

        fn write_progress(
            ref self: ContractState, player_id: felt252, campaign_id: u8, progress: StoryProgress,
        ) {
            let word: felt252 = progress.stars.into() + progress.total.into() * TWO_POW_128;
            self.progress.write((player_id, campaign_id), word);
        }
    }

    /// A plan code a deck can hold: 1 to 19.
    fn assert_plan(plan: u8) {
        let value: Plan = plan.into();
        let code: u8 = value.into();
        assert(plan != 0 && code == plan, errors::INVALID_PLAN);
    }

    /// A tile a level writes: a plan, an orientation (1 to 4) and a position whose 8 neighbours are
    /// in `u32`.
    fn assert_tile(tile: StoryTile) {
        assert_plan(tile.plan);
        assert(tile.orientation >= 1 && tile.orientation <= 4, errors::INVALID_TILE);
        assert_position(tile.x, tile.y);
    }

    /// As `Challenge.build`: the position has its 8 neighbours in `u32`.
    fn assert_position(x: u32, y: u32) {
        assert(
            x != 0 && y != 0 && x != Bounded::<u32>::MAX && y != Bounded::<u32>::MAX,
            errors::INVALID_POSITION,
        );
    }

    /// A tile in 80 bits: plan [0, 8) · orientation [8, 16) · x [16, 48) · y [48, 80).
    fn tile_word(tile: StoryTile) -> felt252 {
        let word: u128 = tile.plan.into()
            + tile.orientation.into() * TWO_POW_8
            + tile.x.into() * TWO_POW_16
            + tile.y.into() * TWO_POW_48;
        word.into()
    }

    fn tile_of(word: u128) -> StoryTile {
        StoryTile {
            plan: (word & MASK_8).try_into().unwrap(),
            orientation: ((word / TWO_POW_8) & MASK_8).try_into().unwrap(),
            x: ((word / TWO_POW_16) & MASK_32).try_into().unwrap(),
            y: ((word / TWO_POW_48) & MASK_32).try_into().unwrap(),
        }
    }

    /// The usual starter: `RFFFRFCFR` facing South at `CENTER` (`Game::start`), whose words come
    /// from constants (`placement::place_starter`).
    fn is_usual_starter(tile: StoryTile) -> bool {
        let plan: u8 = Plan::RFFFRFCFR.into();
        let south: u8 = Orientation::South.into();
        tile.plan == plan
            && tile.orientation == south
            && tile.x == paved::constants::CENTER
            && tile.y == paved::constants::CENTER
    }

    /// Writes a tile of the level before the first draw, without a move: placed on the structure
    /// state with its neighbours, nothing checked or scored (`Store::set_tile`, `place_alone`).
    fn write_tile(store: Store, game_id: u32, id: u32, tile: StoryTile) {
        let mut written = TileImpl::new(game_id, id, tile.plan.into());
        written.settle(tile.orientation.into(), tile.x, tile.y);
        store.set_tile(written);
    }

    /// Replays a run in a new game of this contract: the starter (tile 1) and the placed tiles
    /// (from `PLACED_ID`) are written, then each plan of the deck is drawn in order and built or
    /// discarded by its move, as `PlayableComponent::build` and `discard` do (the same checks,
    /// placement, assessment and discard penalty), with no random draw. Returns the game and its
    /// score.
    fn replay(player_id: felt252, level: @StoryLevel, moves: Span<StoryMove>) -> (u32, u32) {
        let mut store: Store = StoreImpl::new();
        let game_id = store.uuid();
        let mut game: Game = GameImpl::new(
            game_id, get_block_timestamp(), Mode::Challenge, player_id,
        );
        game.tile_limit = (level.plans.len() + 1).try_into().unwrap();
        // [Effect] The starter, tile 1
        let starter = *level.starter;
        let id = game.add_tile();
        if is_usual_starter(starter) {
            let mut tile = TileImpl::new(game_id, id, Plan::RFFFRFCFR);
            tile.settle(Orientation::South, starter.x, starter.y);
            placement::place_starter(store, tile);
        } else {
            write_tile(store, game_id, id, starter);
        }
        // [Effect] The placed tiles
        let mut index = 0;
        for tile in level.placed.span() {
            write_tile(store, game_id, PLACED_ID + index, *tile);
            index += 1;
        }
        // [Effect] Each drawn tile, built or discarded
        let mut plans = level.plans.span();
        let mut moves = moves;
        while let Option::Some(plan) = plans.pop_front() {
            let move = *moves.pop_front().unwrap();
            let id = game.add_tile();
            let mut tile = TileImpl::new(game_id, id, (*plan).into());
            if move.discard {
                // [Effect] A discard: the penalty, at most the score
                let mut malus = paved::constants::DISCARD_POINTS;
                game.sub_score(ref malus);
                game.discarded += 1;
                continue;
            }
            // [Check] An orientation, a free position with the 8 neighbours in `u32`
            assert(move.orientation >= 1 && move.orientation <= 4, errors::INVALID_ORIENTATION);
            assert_position(move.x, move.y);
            store.tile_position(game, move.x, move.y).assert_not_exists();
            // [Effect] Built, if it fits its neighbours
            let around = NeighborhoodTrait::read(game_id, move.x, move.y);
            tile.settle(move.orientation.into(), move.x, move.y);
            placement::assert_fits(tile, @around);
            let mut structures = StructuresTrait::new(game_id);
            let (refs, closes) = placement::place_move(ref structures, tile, @around);
            structures.track(tile, refs);
            if closes {
                game.assess(tile, refs, @around, ref structures, ref store);
            }
            structures.flush(store);
            game.built += 1;
        }
        (game_id, game.score)
    }
}
