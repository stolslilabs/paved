//! `Rewards`, the village rewards and the tiers (#642, part of #637;
//! `docs/architecture/village-rewards.md`).
//!
//! A game's end grants a reward: `Setup` hears it (a Challenge game over, a Story run that gains a
//! star, a PvP attack settled) and calls `grant`, an allowlisted granter's call, under the owner's
//! daily cap. A reward has no tiles until the player opens it (`open_reward`): Cartridge's VRF
//! (`DrawableComponent`, #638) draws its 3 tiles from the base deck's distribution, one draw per
//! transaction. The player then claims it in one gesture (`claim_reward`): the tile placed in its
//! village (`Village.place`, `Rewards` an allowlisted placer, #640), added as a copy of its plan,
//! or the Cobbles taken (`Setup.credit_reward`, `Rewards` an allowlisted reporter). There is no
//! inventory: the offer is gone after the claim.
//!
//! Copies are counted per plan, for the account (19 counters); a plan's tier is computed from its
//! copies (`tier_of`, two of a tier make one of the next), never stored, so a new tier needs no
//! migration. `Setup` reads it to sell the skins reserved to a tier (`ISetupSkins::set_skin_tier`).
//!
//! The rules A to E of the design note are the named constants below: an amendment of the owner's
//! is a change of one of them.

use paved::elements::decks::base::DeckImpl as BaseDeck;

/// Rule A: the games that grant a reward, as `Setup` hears them. A Story run grants only when it
/// gains a star (a run can be submitted again for nothing).
pub const GRANTS_CHALLENGE: bool = true;
pub const GRANTS_STORY: bool = true;
pub const GRANTS_PVP: bool = true;
/// Rule A: the rewards an account may be granted per chain day, the constructor's default; the
/// owner may set it from 1 to `MAX_DAILY_CAP` (`set_daily_cap`).
pub const DAILY_CAP: u16 = 10;
pub const MAX_DAILY_CAP: u16 = 1000;
/// Rule B: the Cobbles of "take Cobbles".
pub const REWARD_COBBLES: u8 = 5;
/// Rule D: a tile placed from a reward counts as a copy of its plan, as a merged one does.
pub const PLACE_COUNTS_COPY: bool = true;
/// Rule E: a merge needs no placed tile of its plan in the village (the account's tier does not
/// depend on a tile; the client's gesture drops it on one).
pub const MERGE_NEEDS_TILE: bool = false;

/// The sources of a grant (`RewardGranted.source`).
pub const SOURCE_CHALLENGE: u8 = 1;
pub const SOURCE_STORY: u8 = 2;
pub const SOURCE_PVP: u8 = 3;
/// The choices of a claim (`claim_reward`).
pub const CHOICE_PLACE: u8 = 1;
pub const CHOICE_MERGE: u8 = 2;
pub const CHOICE_COBBLES: u8 = 3;
/// The tiles of an offer.
pub const OFFER_TILES: u8 = 3;
/// The plans that count copies: the `Plan` codes 1 to 19 (`Setup`'s `PLANS`).
pub const PLANS: u8 = 19;
/// The kind of the VRF draw of an offer (`draw_salt(REWARD_KIND, player_id, index)`).
pub const REWARD_KIND: felt252 = 'REWARD';
/// The reward day: the quests' clock, `time / DAY` (`Setup`'s calendar).
pub const DAY: u64 = 86400;

/// A player's grants: the chain day of the last grant and the grants of that day, the rewards
/// granted and not opened, and the rewards opened (the next offer's index).
#[derive(Copy, Drop, Serde, Debug, PartialEq)]
pub struct RewardGrants {
    pub day: u32,
    pub today: u16,
    pub pending: u32,
    pub opened: u32,
}

/// A player's open offer: its index (the reward's number, from 0) and its 3 plans; plans 0: none.
#[derive(Copy, Drop, Serde, Debug, PartialEq)]
pub struct RewardOffer {
    pub index: u32,
    pub plan_1: u8,
    pub plan_2: u8,
    pub plan_3: u8,
}

#[starknet::interface]
pub trait IRewards<TContractState> {
    /// Grants `player_id` one reward for `source`: an allowlisted granter only
    /// (`'Rewards: not granter'`). Under the day's cap the pending rewards grow by one and it
    /// returns true (emits `RewardGranted`); at the cap it does nothing and returns false, so a
    /// game's end never reverts for a reward.
    fn grant(ref self: TContractState, player_id: felt252, source: u8) -> bool;
    /// Opens the caller's next pending reward (`'Rewards: no reward'`), with no offer open
    /// (`'Rewards: offer open'`): the VRF draws its 3 tiles from the base deck's distribution. The
    /// client puts the provider's `request_random(Rewards, Salt(draw_salt(REWARD_KIND, caller,
    /// opened)))` first. Emits `RewardOpened`; returns the offer.
    fn open_reward(ref self: TContractState) -> RewardOffer;
    /// Claims the caller's open offer (`'Rewards: no offer'`) in one gesture: `CHOICE_PLACE` builds
    /// tile `slot` (0 to 2) turned to `orientation` at `(x, y)` in its village (every rule of
    /// `Village.place`), `CHOICE_MERGE` adds it as a copy of its plan, `CHOICE_COBBLES` credits
    /// `REWARD_COBBLES` on `Setup` (`slot` ignored). The offer is cleared. Emits `RewardClaimed`;
    /// returns the plan's copies after it (0 for the Cobbles).
    fn claim_reward(
        ref self: TContractState, choice: u8, slot: u8, orientation: u8, x: u32, y: u32,
    ) -> u32;
    /// The grants at the block's time: a word of an earlier day reads 0 granted today.
    fn grants(self: @TContractState, player_id: felt252) -> RewardGrants;
    fn offer(self: @TContractState, player_id: felt252) -> RewardOffer;
    /// The copies of each plan, plan 1 first (19).
    fn copies(self: @TContractState, player_id: felt252) -> Array<u32>;
    /// The tier of a plan (`tier_of` its copies); 0 outside 1 to 19.
    fn tier(self: @TContractState, player_id: felt252, plan: u8) -> u8;
}

/// The wiring of `Rewards`, set by the owner.
#[starknet::interface]
pub trait IRewardsAdmin<TContractState> {
    fn set_setup(ref self: TContractState, setup: starknet::ContractAddress);
    fn set_village(ref self: TContractState, village: starknet::ContractAddress);
    /// Allows or forbids `granter` to grant (`Setup`): the owner only. Emits `GranterSet`.
    fn set_granter(ref self: TContractState, granter: starknet::ContractAddress, allowed: bool);
    /// 1 to `MAX_DAILY_CAP` (`'Rewards: invalid cap'`). Emits `DailyCapSet`.
    fn set_daily_cap(ref self: TContractState, cap: u16);
    fn set_vrf_provider(ref self: TContractState, provider: starknet::ContractAddress);
    fn setup(self: @TContractState) -> starknet::ContractAddress;
    fn village(self: @TContractState) -> starknet::ContractAddress;
    fn is_granter(self: @TContractState, granter: starknet::ContractAddress) -> bool;
    fn daily_cap(self: @TContractState) -> u16;
}

/// The tier of `copies` copies: 0 under 2 (the base), then `floor(log2(copies))`: 2 copies tier 1,
/// 4 tier 2, 8 tier 3, 16 tier 4, and so on with no cap.
pub fn tier_of(copies: u32) -> u8 {
    let mut tier: u8 = 0;
    let mut left = copies;
    while left >= 2 {
        left /= 2;
        tier += 1;
    }
    tier
}

/// The 3 plans an offer's random draws: three independent draws from the base deck's 72 tiles,
/// each from its own 64 bits of the random (the low half's two, the high half's low 64).
pub fn offer_plans(random: felt252) -> (u8, u8, u8) {
    let value: u256 = random.into();
    let lane = 0x10000000000000000_u128;
    (deck_plan(value.low % lane), deck_plan(value.low / lane), deck_plan(value.high % lane))
}

fn deck_plan(lane: u128) -> u8 {
    let index: u32 = (lane % 72).try_into().unwrap();
    BaseDeck::plan(index).into()
}

#[starknet::contract]
pub mod Rewards {
    use core::num::traits::Zero;
    use openzeppelin_interfaces::upgrades::IUpgradeable;
    use openzeppelin_upgrades::UpgradeableComponent;
    use paved::components::drawable::DrawableComponent;
    use paved::components::ownable::OwnableComponent;
    use paved::systems::setup::{ISetupRewardsDispatcher, ISetupRewardsDispatcherTrait};
    use paved::systems::village::{IVillageDispatcher, IVillageDispatcherTrait};
    use starknet::storage::{
        Map, StorageMapReadAccess, StorageMapWriteAccess, StoragePointerReadAccess,
        StoragePointerWriteAccess,
    };
    use starknet::{ClassHash, ContractAddress, get_block_timestamp, get_caller_address};
    use super::{
        CHOICE_COBBLES, CHOICE_MERGE, CHOICE_PLACE, DAY, IRewards, IRewardsAdmin, MAX_DAILY_CAP,
        MERGE_NEEDS_TILE, OFFER_TILES, PLACE_COUNTS_COPY, PLANS, REWARD_COBBLES, REWARD_KIND,
        RewardGrants, RewardOffer, offer_plans, tier_of,
    };

    pub mod errors {
        pub const ZERO_ADDRESS: felt252 = 'Rewards: address is zero';
        pub const NOT_GRANTER: felt252 = 'Rewards: not granter';
        pub const NO_REWARD: felt252 = 'Rewards: no reward';
        pub const OFFER_OPEN: felt252 = 'Rewards: offer open';
        pub const NO_OFFER: felt252 = 'Rewards: no offer';
        pub const INVALID_CHOICE: felt252 = 'Rewards: invalid choice';
        pub const INVALID_SLOT: felt252 = 'Rewards: invalid slot';
        pub const INVALID_CAP: felt252 = 'Rewards: invalid cap';
        pub const NO_TILE_OF_PLAN: felt252 = 'Rewards: no tile of plan';
    }

    // Packing

    const TWO_POW_8: u128 = 0x100;
    const TWO_POW_16: u128 = 0x10000;
    const TWO_POW_24: u128 = 0x1000000;
    const TWO_POW_32: u128 = 0x100000000;
    const TWO_POW_48: u128 = 0x1000000000000;
    const TWO_POW_80: u128 = 0x100000000000000000000;
    const MASK_8: u128 = 0xff;
    const MASK_16: u128 = 0xffff;
    const MASK_32: u128 = 0xffffffff;

    component!(path: OwnableComponent, storage: ownable, event: OwnableEvent);
    #[abi(embed_v0)]
    impl OwnableImpl = OwnableComponent::OwnableImpl<ContractState>;
    impl OwnableInternalImpl = OwnableComponent::InternalImpl<ContractState>;
    component!(path: UpgradeableComponent, storage: upgradeable, event: UpgradeableEvent);
    impl UpgradeableInternalImpl = UpgradeableComponent::InternalImpl<ContractState>;
    component!(path: DrawableComponent, storage: drawable, event: DrawableEvent);
    #[abi(embed_v0)]
    impl DrawableImpl = DrawableComponent::DrawableImpl<ContractState>;
    impl DrawableInternalImpl = DrawableComponent::InternalImpl<ContractState>;

    #[storage]
    struct Storage {
        #[substorage(v0)]
        ownable: OwnableComponent::Storage,
        #[substorage(v0)]
        upgradeable: UpgradeableComponent::Storage,
        #[substorage(v0)]
        drawable: DrawableComponent::Storage,
        /// The `Setup` that grants and pays the Cobbles (constructor, `set_setup`).
        setup: ContractAddress,
        /// The `Village` the tiles are placed in (constructor, `set_village`).
        village: ContractAddress,
        /// The granters the owner allows (`set_granter`): `Setup`.
        granters: Map<ContractAddress, bool>,
        /// The rewards an account may be granted per chain day (`set_daily_cap`).
        daily_cap: u16,
        /// A player's grants (key `player_id`): `day` [0, 32) · `today` [32, 48) · `pending`
        /// [48, 80) · `opened` [80, 112) (`super::RewardGrants`).
        grants: Map<felt252, felt252>,
        /// A player's open offer (key `player_id`): `plan_1` [0, 8) · `plan_2` [8, 16) · `plan_3`
        /// [16, 24) · `index` [24, 56); 0: no offer.
        offers: Map<felt252, felt252>,
        /// The copies of a plan (key `(player_id, plan)`, plan 1 to 19).
        copies: Map<(felt252, u8), u32>,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        #[flat]
        OwnableEvent: OwnableComponent::Event,
        #[flat]
        UpgradeableEvent: UpgradeableComponent::Event,
        #[flat]
        DrawableEvent: DrawableComponent::Event,
        SetupSet: SetupSet,
        VillageSet: VillageSet,
        GranterSet: GranterSet,
        DailyCapSet: DailyCapSet,
        RewardGranted: RewardGranted,
        RewardOpened: RewardOpened,
        RewardClaimed: RewardClaimed,
    }

    #[derive(Drop, Debug, PartialEq, starknet::Event)]
    pub struct SetupSet {
        pub setup: ContractAddress,
    }

    #[derive(Drop, Debug, PartialEq, starknet::Event)]
    pub struct VillageSet {
        pub village: ContractAddress,
    }

    #[derive(Drop, Debug, PartialEq, starknet::Event)]
    pub struct GranterSet {
        #[key]
        pub granter: ContractAddress,
        pub allowed: bool,
    }

    #[derive(Drop, Debug, PartialEq, starknet::Event)]
    pub struct DailyCapSet {
        pub cap: u16,
    }

    /// A reward granted: its source (`SOURCE_*`), the chain day, that day's grants and the pending
    /// rewards after it.
    #[derive(Drop, Debug, PartialEq, starknet::Event)]
    pub struct RewardGranted {
        #[key]
        pub player_id: felt252,
        pub source: u8,
        pub day: u32,
        pub today: u16,
        pub pending: u32,
    }

    /// A reward opened: its index and the 3 plans the VRF drew.
    #[derive(Drop, Debug, PartialEq, starknet::Event)]
    pub struct RewardOpened {
        #[key]
        pub player_id: felt252,
        pub index: u32,
        pub plan_1: u8,
        pub plan_2: u8,
        pub plan_3: u8,
    }

    /// A reward claimed: the choice (`CHOICE_*`), the plan taken (0 for the Cobbles), the plan's
    /// copies and tier after it, and the Cobbles credited (0 unless the Cobbles were taken).
    #[derive(Drop, Debug, PartialEq, starknet::Event)]
    pub struct RewardClaimed {
        #[key]
        pub player_id: felt252,
        pub index: u32,
        pub choice: u8,
        pub plan: u8,
        pub copies: u32,
        pub tier: u8,
        pub cobbles: u8,
    }

    #[constructor]
    fn constructor(
        ref self: ContractState,
        owner: ContractAddress,
        setup: ContractAddress,
        village: ContractAddress,
        provider: ContractAddress,
        daily_cap: u16,
    ) {
        assert(setup.is_non_zero() && village.is_non_zero(), errors::ZERO_ADDRESS);
        assert_cap(daily_cap);
        self.ownable.initialize(owner);
        self.setup.write(setup);
        self.village.write(village);
        self.daily_cap.write(daily_cap);
        self.drawable.set_provider(provider);
    }

    #[abi(embed_v0)]
    impl RewardsImpl of IRewards<ContractState> {
        fn grant(ref self: ContractState, player_id: felt252, source: u8) -> bool {
            // [Check] An allowed granter, under the day's cap
            assert(self.granters.read(get_caller_address()), errors::NOT_GRANTER);
            let mut grants = self.grants_of(player_id);
            if grants.today >= self.daily_cap.read() || grants.pending == 0xffffffff {
                return false;
            }
            // [Effect] One reward pending
            grants.today += 1;
            grants.pending += 1;
            self.write_grants(player_id, grants);
            self
                .emit(
                    RewardGranted {
                        player_id,
                        source,
                        day: grants.day,
                        today: grants.today,
                        pending: grants.pending,
                    },
                );
            true
        }

        fn open_reward(ref self: ContractState) -> RewardOffer {
            let player_id: felt252 = get_caller_address().into();
            // [Check] A pending reward, no offer open
            let mut grants = self.grants_of(player_id);
            assert(grants.pending != 0, errors::NO_REWARD);
            assert(self.offers.read(player_id) == 0, errors::OFFER_OPEN);
            // [Effect] The reward opened, its 3 tiles drawn (the salt: the player and the index)
            let index = grants.opened;
            grants.pending -= 1;
            grants.opened += 1;
            self.write_grants(player_id, grants);
            let random = self.drawable.draw_random(REWARD_KIND, player_id, index);
            let (plan_1, plan_2, plan_3) = offer_plans(random);
            let offer = RewardOffer { index, plan_1, plan_2, plan_3 };
            self.write_offer(player_id, offer);
            self.emit(RewardOpened { player_id, index, plan_1, plan_2, plan_3 });
            offer
        }

        fn claim_reward(
            ref self: ContractState, choice: u8, slot: u8, orientation: u8, x: u32, y: u32,
        ) -> u32 {
            let player_id: felt252 = get_caller_address().into();
            // [Check] An open offer, a choice, a slot for a tile
            let offer = self.offer_of(player_id);
            assert(offer.plan_1 != 0, errors::NO_OFFER);
            assert(choice >= CHOICE_PLACE && choice <= CHOICE_COBBLES, errors::INVALID_CHOICE);
            // [Effect] The offer is gone, whatever the choice
            self.offers.write(player_id, 0);
            if choice == CHOICE_COBBLES {
                // [Interaction] The Cobbles, on `Setup`'s ledger
                ISetupRewardsDispatcher { contract_address: self.setup.read() }
                    .credit_reward(player_id, offer.index, REWARD_COBBLES);
                self
                    .emit(
                        RewardClaimed {
                            player_id,
                            index: offer.index,
                            choice,
                            plan: 0,
                            copies: 0,
                            tier: 0,
                            cobbles: REWARD_COBBLES,
                        },
                    );
                return 0;
            }
            assert(slot < OFFER_TILES, errors::INVALID_SLOT);
            let plan = if slot == 0 {
                offer.plan_1
            } else if slot == 1 {
                offer.plan_2
            } else {
                offer.plan_3
            };
            let village = IVillageDispatcher { contract_address: self.village.read() };
            // [Check] Rule E: a merge on a placed tile of its plan, when the rule asks for one
            if choice == CHOICE_MERGE && MERGE_NEEDS_TILE {
                let mut found = false;
                for tile in village.tiles(player_id) {
                    if tile.plan == plan {
                        found = true;
                    }
                }
                assert(found, errors::NO_TILE_OF_PLAN);
            }
            // [Effect] The copy (rule D: a placed tile counts too)
            let mut copies = self.copies.read((player_id, plan));
            if choice == CHOICE_MERGE || PLACE_COUNTS_COPY {
                if copies != 0xffffffff {
                    copies += 1;
                }
                self.copies.write((player_id, plan), copies);
            }
            // [Interaction] The tile placed, with every rule of the village
            if choice == CHOICE_PLACE {
                village.place(player_id, plan, orientation, x, y);
            }
            self
                .emit(
                    RewardClaimed {
                        player_id,
                        index: offer.index,
                        choice,
                        plan,
                        copies,
                        tier: tier_of(copies),
                        cobbles: 0,
                    },
                );
            copies
        }

        fn grants(self: @ContractState, player_id: felt252) -> RewardGrants {
            self.grants_of(player_id)
        }

        fn offer(self: @ContractState, player_id: felt252) -> RewardOffer {
            self.offer_of(player_id)
        }

        fn copies(self: @ContractState, player_id: felt252) -> Array<u32> {
            let mut copies: Array<u32> = array![];
            let mut plan: u8 = 1;
            while plan <= PLANS {
                copies.append(self.copies.read((player_id, plan)));
                plan += 1;
            }
            copies
        }

        fn tier(self: @ContractState, player_id: felt252, plan: u8) -> u8 {
            if plan == 0 || plan > PLANS {
                return 0;
            }
            tier_of(self.copies.read((player_id, plan)))
        }
    }

    #[abi(embed_v0)]
    impl RewardsAdminImpl of IRewardsAdmin<ContractState> {
        fn set_setup(ref self: ContractState, setup: ContractAddress) {
            self.ownable.assert_only_owner();
            assert(setup.is_non_zero(), errors::ZERO_ADDRESS);
            self.setup.write(setup);
            self.emit(SetupSet { setup });
        }

        fn set_village(ref self: ContractState, village: ContractAddress) {
            self.ownable.assert_only_owner();
            assert(village.is_non_zero(), errors::ZERO_ADDRESS);
            self.village.write(village);
            self.emit(VillageSet { village });
        }

        fn set_granter(ref self: ContractState, granter: ContractAddress, allowed: bool) {
            self.ownable.assert_only_owner();
            self.granters.write(granter, allowed);
            self.emit(GranterSet { granter, allowed });
        }

        fn set_daily_cap(ref self: ContractState, cap: u16) {
            self.ownable.assert_only_owner();
            assert_cap(cap);
            self.daily_cap.write(cap);
            self.emit(DailyCapSet { cap });
        }

        fn set_vrf_provider(ref self: ContractState, provider: ContractAddress) {
            self.ownable.assert_only_owner();
            self.drawable.set_provider(provider);
        }

        fn setup(self: @ContractState) -> ContractAddress {
            self.setup.read()
        }

        fn village(self: @ContractState) -> ContractAddress {
            self.village.read()
        }

        fn is_granter(self: @ContractState, granter: ContractAddress) -> bool {
            self.granters.read(granter)
        }

        fn daily_cap(self: @ContractState) -> u16 {
            self.daily_cap.read()
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
        /// The grants today: a word of an earlier day keeps its pending and opened, 0 today.
        fn grants_of(self: @ContractState, player_id: felt252) -> RewardGrants {
            let day: u32 = (get_block_timestamp() / DAY).try_into().unwrap();
            let word: u256 = self.grants.read(player_id).into();
            let low = word.low;
            let stored: u32 = (low & MASK_32).try_into().unwrap();
            let today: u16 = if stored == day {
                ((low / TWO_POW_32) & MASK_16).try_into().unwrap()
            } else {
                0
            };
            RewardGrants {
                day,
                today,
                pending: ((low / TWO_POW_48) & MASK_32).try_into().unwrap(),
                opened: ((low / TWO_POW_80) & MASK_32).try_into().unwrap(),
            }
        }

        fn write_grants(ref self: ContractState, player_id: felt252, grants: RewardGrants) {
            let word: u128 = grants.day.into()
                + grants.today.into() * TWO_POW_32
                + grants.pending.into() * TWO_POW_48
                + grants.opened.into() * TWO_POW_80;
            self.grants.write(player_id, word.into());
        }

        fn offer_of(self: @ContractState, player_id: felt252) -> RewardOffer {
            let word: u256 = self.offers.read(player_id).into();
            let low = word.low;
            RewardOffer {
                index: ((low / TWO_POW_24) & MASK_32).try_into().unwrap(),
                plan_1: (low & MASK_8).try_into().unwrap(),
                plan_2: ((low / TWO_POW_8) & MASK_8).try_into().unwrap(),
                plan_3: ((low / TWO_POW_16) & MASK_8).try_into().unwrap(),
            }
        }

        fn write_offer(ref self: ContractState, player_id: felt252, offer: RewardOffer) {
            let word: u128 = offer.plan_1.into()
                + offer.plan_2.into() * TWO_POW_8
                + offer.plan_3.into() * TWO_POW_16
                + offer.index.into() * TWO_POW_24;
            self.offers.write(player_id, word.into());
        }
    }

    /// A daily cap: 1 to `MAX_DAILY_CAP`.
    fn assert_cap(cap: u16) {
        assert(cap != 0 && cap <= MAX_DAILY_CAP, errors::INVALID_CAP);
    }
}
