//! `Matchmaker`, the PvP matchmaker (#639, part of #637; `docs/architecture/matchmaker.md`): the
//! pool of villages in crown buckets, the opponent drawn from Cartridge's VRF, the shields, and the
//! crowns an attack moves. It is composed of small pieces, each a component with its own storage
//! and events (owner decision of 2026-10-21, `docs/architecture/matchmaker.md`, section 11):
//! `CrownableComponent` (the crown counts), `BucketableComponent` (the pool, ported from the
//! owner's POC, bal7hazar/matchmaker at 8639f232) and `ShieldableComponent` (the shield queues).
//! This system holds what joins them: who has joined, the draws, the matches, the callers' checks,
//! the Cobbles of "Next".
//!
//! Callers:
//! - the player: `search` (free) and `next` (`NEXT_PRICE` Cobbles, spent in `Setup`) draw an
//!   opponent and fix the offer and the 0-star cost;
//! - an operator (a system the owner allows: #640 creates villages, #643 runs attacks): `join`,
//!   `start_attack`, `settle`, and `set_crowns` (#644's season reset);
//! - anyone: `release_shields`, which puts back expired shields (every attack start does it too);
//! - the owner: the operators, `Setup`, the VRF provider, the NPC villages, `upgrade`.
//!
//! The client puts `request_random(Matchmaker, Salt(vrfSalt(MATCH_KIND, attacker, draws)))` first
//! in the multicall of `search` and `next`, `draws` being the village's draw counter (`village`).

use paved::matchmaker::crowns::Settlement;
use starknet::ContractAddress;

/// The kind of the matchmaker's VRF draws (`paved::vrf::draw_salt`); the game id is the attacker.
pub const MATCH_KIND: felt252 = 'MATCH';
/// The Cobbles of each "Next" (owner decision, 2026-10-21).
pub const NEXT_PRICE: u32 = 1;
/// The reason of the Cobbles "Next" spends in `Setup` (`CobblesSpent.reason`).
pub const NEXT_REASON: felt252 = 'MATCH_NEXT';
/// The most expired shields one `release_shields` call puts back.
pub const MAX_RELEASES: u32 = 16;
/// The expired shields each attack start puts back in the pool.
pub const RELEASES_PER_ATTACK: u32 = 2;
/// NPC villages are the addresses 1 to `MAX_NPC`: no account can be deployed there.
pub const MAX_NPC: u8 = 255;

/// Not in the matchmaker: never joined, or an NPC removed.
pub const STATUS_NONE: u8 = 0;
/// A player's village: in the pool (`place(village).listed`) or behind a shield
/// (`shield(village).up`), exactly one of the two.
pub const STATUS_PLAYER: u8 = 1;
/// An NPC village (a Story level, cold start): always in the pool, never shielded.
pub const STATUS_NPC: u8 = 2;

/// A village's membership: its status and its VRF draw counter (kept when an NPC is removed). One
/// felt: `status` [0, 8) · `draws` [8, 40).
#[derive(Copy, Drop, Serde, Debug, PartialEq, Default)]
pub struct Village {
    pub status: u8,
    pub draws: u32,
}

pub impl VillagePacking of starknet::storage_access::StorePacking<Village, felt252> {
    fn pack(value: Village) -> felt252 {
        let word: u64 = value.status.into() + value.draws.into() * 0x100;
        word.into()
    }

    fn unpack(value: felt252) -> Village {
        let word: u64 = value.try_into().unwrap();
        Village {
            status: (word & 0xff).try_into().unwrap(), draws: (word / 0x100).try_into().unwrap(),
        }
    }
}

/// An attacker's drawn opponent, the offer and the 0-star cost fixed at the draw; `started` once
/// the attack began. A zero opponent: none.
#[derive(Copy, Drop, Serde, Debug, PartialEq)]
pub struct Match {
    pub opponent: ContractAddress,
    pub offer: u8,
    pub cost: u8,
    pub started: bool,
}

#[starknet::interface]
pub trait IMatchmaker<TContractState> {
    /// Draws an opponent for the caller, for free: the caller has joined and has no opponent drawn,
    /// or its drawn opponent left the pool (shielded by another attack). Emits `OpponentDrawn`.
    fn search(ref self: TContractState) -> ContractAddress;
    /// Draws another opponent for the caller, for `NEXT_PRICE` Cobbles spent in `Setup`; the caller
    /// has an opponent drawn and no attack started. Emits `OpponentDrawn`.
    fn next(ref self: TContractState) -> ContractAddress;
    /// A new village joins at 0 crowns, behind its initial shield (`INITIAL_SHIELD`). An operator
    /// only.
    fn join(ref self: TContractState, player: ContractAddress);
    /// Starts the attack of `attacker` on its drawn opponent: puts back expired shields, drops the
    /// attacker's shield, shields the opponent (not an NPC), and fixes the match. Returns the
    /// opponent and the offer. An operator only.
    fn start_attack(ref self: TContractState, attacker: ContractAddress) -> (ContractAddress, u8);
    /// Settles the started attack of `attacker` with its stars (0 to 3): the crowns move and the
    /// match ends. An operator only. Emits `CrownsSettled`.
    fn settle(ref self: TContractState, attacker: ContractAddress, stars: u8) -> Settlement;
    /// Sets a village's crowns (the season reset of #644). An operator only.
    fn set_crowns(ref self: TContractState, village: ContractAddress, crowns: u32);
    /// Puts back at most `max` (at most `MAX_RELEASES`) expired shields. Anyone. Returns how many.
    fn release_shields(ref self: TContractState, max: u32) -> u32;
    fn village(self: @TContractState, village: ContractAddress) -> Village;
    fn current_match(self: @TContractState, attacker: ContractAddress) -> Match;
    /// The offer and the 0-star cost of an attack of `attacker` on `defender` at their crowns now.
    fn terms(
        self: @TContractState, attacker: ContractAddress, defender: ContractAddress,
    ) -> (u8, u8);
    fn is_operator(self: @TContractState, operator: ContractAddress) -> bool;
}

#[starknet::interface]
pub trait IMatchmakerAdmin<TContractState> {
    fn set_operator(ref self: TContractState, operator: ContractAddress, allowed: bool);
    fn set_setup(ref self: TContractState, setup: ContractAddress);
    fn setup(self: @TContractState) -> ContractAddress;
    fn set_vrf_provider(ref self: TContractState, provider: ContractAddress);
    /// Puts NPC village `npc_id` (1 to 255, its address; a Story level, #643 maps it) in the pool
    /// at `crowns`, or moves it. Emits `NpcSet`.
    fn set_npc(ref self: TContractState, npc_id: u8, crowns: u32);
    /// Takes NPC village `npc_id` out of the pool. Emits `NpcRemoved`.
    fn remove_npc(ref self: TContractState, npc_id: u8);
}

#[starknet::contract]
pub mod Matchmaker {
    use core::num::traits::Zero;
    use openzeppelin_interfaces::upgrades::IUpgradeable;
    use openzeppelin_upgrades::UpgradeableComponent;
    use paved::components::bucketable::BucketableComponent;
    use paved::components::crownable::CrownableComponent;
    use paved::components::drawable::DrawableComponent;
    use paved::components::ownable::OwnableComponent;
    use paved::components::shieldable::{
        ATTACK_SHIELD, INITIAL_SHIELD, QUEUE_ATTACK, QUEUE_INITIAL, ShieldableComponent,
    };
    use paved::matchmaker::crowns::{Settlement, cost_of, offer_of};
    use paved::systems::setup::{ISetupSpendDispatcher, ISetupSpendDispatcherTrait};
    use starknet::storage::{
        Map, StorageMapReadAccess, StorageMapWriteAccess, StoragePointerReadAccess,
        StoragePointerWriteAccess,
    };
    use starknet::{ClassHash, ContractAddress, get_block_timestamp, get_caller_address};
    use super::{
        IMatchmaker, IMatchmakerAdmin, MATCH_KIND, MAX_NPC, MAX_RELEASES, Match, NEXT_PRICE,
        NEXT_REASON, RELEASES_PER_ATTACK, STATUS_NONE, STATUS_NPC, STATUS_PLAYER, Village,
    };

    pub mod errors {
        pub const ZERO_SETUP: felt252 = 'Matchmaker: setup is zero';
        pub const ZERO_VILLAGE: felt252 = 'Matchmaker: village is zero';
        pub const NOT_OPERATOR: felt252 = 'Matchmaker: not operator';
        pub const NO_OPPONENT: felt252 = 'Matchmaker: no opponent';
        pub const OPPONENT_DRAWN: felt252 = 'Matchmaker: opponent drawn';
        pub const OPPONENT_SHIELDED: felt252 = 'Matchmaker: opponent shielded';
        pub const NOTHING_DRAWN: felt252 = 'Matchmaker: nothing drawn';
        pub const ATTACK_STARTED: felt252 = 'Matchmaker: attack started';
        pub const NO_ATTACK: felt252 = 'Matchmaker: no attack';
        pub const ALREADY_JOINED: felt252 = 'Matchmaker: already joined';
        pub const NOT_JOINED: felt252 = 'Matchmaker: not joined';
        pub const NOT_NPC: felt252 = 'Matchmaker: not an npc';
        pub const IS_NPC: felt252 = 'Matchmaker: npc cannot play';
        pub const INVALID_NPC: felt252 = 'Matchmaker: invalid npc';
        pub const TOO_MANY_RELEASES: felt252 = 'Matchmaker: too many releases';
    }

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
    component!(path: CrownableComponent, storage: crownable, event: CrownableEvent);
    #[abi(embed_v0)]
    impl CrownableImpl = CrownableComponent::CrownableImpl<ContractState>;
    impl CrownableInternalImpl = CrownableComponent::InternalImpl<ContractState>;
    component!(path: BucketableComponent, storage: bucketable, event: BucketableEvent);
    #[abi(embed_v0)]
    impl BucketableImpl = BucketableComponent::BucketableImpl<ContractState>;
    impl BucketableInternalImpl = BucketableComponent::InternalImpl<ContractState>;
    component!(path: ShieldableComponent, storage: shieldable, event: ShieldableEvent);
    #[abi(embed_v0)]
    impl ShieldableImpl = ShieldableComponent::ShieldableImpl<ContractState>;
    impl ShieldableInternalImpl = ShieldableComponent::InternalImpl<ContractState>;

    // Storage: new contract, flat components (`docs/architecture/upgrades.md`)

    #[storage]
    struct Storage {
        #[substorage(v0)]
        ownable: OwnableComponent::Storage,
        #[substorage(v0)]
        upgradeable: UpgradeableComponent::Storage,
        #[substorage(v0)]
        drawable: DrawableComponent::Storage,
        #[substorage(v0)]
        crownable: CrownableComponent::Storage,
        #[substorage(v0)]
        bucketable: BucketableComponent::Storage,
        #[substorage(v0)]
        shieldable: ShieldableComponent::Storage,
        /// Each village's membership (`Village`).
        villages: Map<ContractAddress, Village>,
        /// An attacker's drawn opponent (zero: none).
        match_opponents: Map<ContractAddress, ContractAddress>,
        /// An attacker's match: `offer` [0, 8) · `cost` [8, 16) · `started` [16].
        match_states: Map<ContractAddress, u32>,
        /// The systems allowed to create villages and run attacks.
        operators: Map<ContractAddress, bool>,
        /// The `Setup` where "Next" spends Cobbles.
        setup: ContractAddress,
    }

    // Events

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        #[flat]
        OwnableEvent: OwnableComponent::Event,
        #[flat]
        UpgradeableEvent: UpgradeableComponent::Event,
        #[flat]
        DrawableEvent: DrawableComponent::Event,
        #[flat]
        CrownableEvent: CrownableComponent::Event,
        #[flat]
        BucketableEvent: BucketableComponent::Event,
        #[flat]
        ShieldableEvent: ShieldableComponent::Event,
        OperatorSet: OperatorSet,
        SetupSet: SetupSet,
        VillageJoined: VillageJoined,
        NpcSet: NpcSet,
        NpcRemoved: NpcRemoved,
        OpponentDrawn: OpponentDrawn,
        AttackStarted: AttackStarted,
    }

    #[derive(Drop, Debug, PartialEq, starknet::Event)]
    pub struct OperatorSet {
        #[key]
        pub operator: ContractAddress,
        pub allowed: bool,
    }

    #[derive(Drop, Debug, PartialEq, starknet::Event)]
    pub struct SetupSet {
        pub setup: ContractAddress,
    }

    /// A village joined at 0 crowns, behind its initial shield (its `ShieldRaised` follows).
    #[derive(Drop, Debug, PartialEq, starknet::Event)]
    pub struct VillageJoined {
        #[key]
        pub village: ContractAddress,
    }

    /// An NPC village in the pool at `crowns` (set or moved).
    #[derive(Drop, Debug, PartialEq, starknet::Event)]
    pub struct NpcSet {
        #[key]
        pub npc_id: u8,
        pub crowns: u32,
    }

    #[derive(Drop, Debug, PartialEq, starknet::Event)]
    pub struct NpcRemoved {
        #[key]
        pub npc_id: u8,
    }

    /// An opponent drawn for `attacker` by its VRF draw `draw_index`, with the offer and the 0-star
    /// cost fixed now; `paid`: a "Next", for `NEXT_PRICE` Cobbles.
    #[derive(Drop, Debug, PartialEq, starknet::Event)]
    pub struct OpponentDrawn {
        #[key]
        pub attacker: ContractAddress,
        pub opponent: ContractAddress,
        pub offer: u8,
        pub cost: u8,
        pub draw_index: u32,
        pub paid: bool,
    }

    #[derive(Drop, Debug, PartialEq, starknet::Event)]
    pub struct AttackStarted {
        #[key]
        pub attacker: ContractAddress,
        #[key]
        pub defender: ContractAddress,
        pub offer: u8,
        pub cost: u8,
    }

    #[constructor]
    fn constructor(
        ref self: ContractState,
        owner: ContractAddress,
        setup: ContractAddress,
        vrf_provider: ContractAddress,
    ) {
        assert(setup.is_non_zero(), errors::ZERO_SETUP);
        self.ownable.initialize(owner);
        self.setup.write(setup);
        self.drawable.set_provider(vrf_provider);
    }

    #[abi(embed_v0)]
    impl MatchmakerImpl of IMatchmaker<ContractState> {
        fn search(ref self: ContractState) -> ContractAddress {
            let attacker = get_caller_address();
            // [Check] No attack started; a drawn opponent only if it left the pool
            let current = self.match_of(attacker);
            assert(!current.started, errors::ATTACK_STARTED);
            if current.opponent.is_non_zero() {
                assert(!self.bucketable.is_listed(current.opponent), errors::OPPONENT_DRAWN);
            }
            self.draw_opponent(attacker, false)
        }

        fn next(ref self: ContractState) -> ContractAddress {
            let attacker = get_caller_address();
            // [Check] An opponent drawn, no attack started
            let current = self.match_of(attacker);
            assert(current.opponent.is_non_zero(), errors::NOTHING_DRAWN);
            assert(!current.started, errors::ATTACK_STARTED);
            // [Interaction] The Cobbles of "Next", spent in `Setup` (reverts if too few)
            let setup = ISetupSpendDispatcher { contract_address: self.setup.read() };
            setup.spend_cobbles(attacker.into(), NEXT_PRICE, NEXT_REASON);
            self.draw_opponent(attacker, true)
        }

        fn join(ref self: ContractState, player: ContractAddress) {
            self.assert_operator();
            // [Check] Not zero (a zero opponent means none in a match), not an NPC's address, new
            assert(player.is_non_zero(), errors::ZERO_VILLAGE);
            assert(!is_npc_address(player), errors::IS_NPC);
            let village = self.villages.read(player);
            assert(village.status == STATUS_NONE, errors::ALREADY_JOINED);
            // [Effect] A player at 0 crowns, behind its initial shield; its draw counter survives
            self.villages.write(player, Village { status: STATUS_PLAYER, draws: village.draws });
            self.emit(VillageJoined { village: player });
            let until = get_block_timestamp() + INITIAL_SHIELD;
            self.shieldable.raise(player, QUEUE_INITIAL, until);
        }

        fn start_attack(
            ref self: ContractState, attacker: ContractAddress,
        ) -> (ContractAddress, u8) {
            self.assert_operator();
            // [Check] An opponent drawn, no attack started
            let mut current = self.match_of(attacker);
            assert(current.opponent.is_non_zero(), errors::NOTHING_DRAWN);
            assert(!current.started, errors::ATTACK_STARTED);
            let defender = current.opponent;
            assert(self.villages.read(attacker).status == STATUS_PLAYER, errors::NOT_JOINED);
            let now = get_block_timestamp();
            // [Effect] Expired shields back in the pool
            self.release(now, RELEASES_PER_ATTACK);
            // [Effect] The attacker's shield, if any, is dropped: back in the pool at once
            if self.shieldable.is_up(attacker) {
                self.shieldable.lower(attacker);
                self.bucketable.insert(attacker, self.crownable.crowns_of(attacker));
            }
            // [Effect] The defender leaves the pool behind an attack shield (an NPC stays)
            assert(self.bucketable.is_listed(defender), errors::OPPONENT_SHIELDED);
            if self.villages.read(defender).status == STATUS_PLAYER {
                self.bucketable.remove(defender);
                self.shieldable.raise(defender, QUEUE_ATTACK, now + ATTACK_SHIELD);
            }
            // [Effect] The match is fixed
            current.started = true;
            self.write_match(attacker, current);
            self
                .emit(
                    AttackStarted { attacker, defender, offer: current.offer, cost: current.cost },
                );
            (defender, current.offer)
        }

        fn settle(ref self: ContractState, attacker: ContractAddress, stars: u8) -> Settlement {
            self.assert_operator();
            // [Check] An attack started
            let current = self.match_of(attacker);
            assert(current.started, errors::NO_ATTACK);
            // [Effect] The crowns move, each listed village's bucket with them; the match ends
            let defender = current.opponent;
            let npc = is_npc_address(defender);
            let outcome = self
                .crownable
                .settle(attacker, defender, current.offer, current.cost, stars, npc);
            self.bucketable.follow(attacker, outcome.attacker);
            if !npc {
                self.bucketable.follow(defender, outcome.defender);
            }
            self
                .write_match(
                    attacker, Match { opponent: Zero::zero(), offer: 0, cost: 0, started: false },
                );
            outcome
        }

        fn set_crowns(ref self: ContractState, village: ContractAddress, crowns: u32) {
            self.assert_operator();
            assert(self.villages.read(village).status != STATUS_NONE, errors::NOT_JOINED);
            self.crownable.set(village, crowns);
            self.bucketable.follow(village, crowns);
        }

        fn release_shields(ref self: ContractState, max: u32) -> u32 {
            assert(max <= MAX_RELEASES, errors::TOO_MANY_RELEASES);
            self.release(get_block_timestamp(), max)
        }

        fn village(self: @ContractState, village: ContractAddress) -> Village {
            self.villages.read(village)
        }

        fn current_match(self: @ContractState, attacker: ContractAddress) -> Match {
            self.match_of(attacker)
        }

        fn terms(
            self: @ContractState, attacker: ContractAddress, defender: ContractAddress,
        ) -> (u8, u8) {
            let a = self.crownable.crowns_of(attacker);
            let d = self.crownable.crowns_of(defender);
            (offer_of(a, d), cost_of(a, d))
        }

        fn is_operator(self: @ContractState, operator: ContractAddress) -> bool {
            self.operators.read(operator)
        }
    }

    #[abi(embed_v0)]
    impl MatchmakerAdminImpl of IMatchmakerAdmin<ContractState> {
        fn set_operator(ref self: ContractState, operator: ContractAddress, allowed: bool) {
            self.ownable.assert_only_owner();
            self.operators.write(operator, allowed);
            self.emit(OperatorSet { operator, allowed });
        }

        fn set_setup(ref self: ContractState, setup: ContractAddress) {
            self.ownable.assert_only_owner();
            assert(setup.is_non_zero(), errors::ZERO_SETUP);
            self.setup.write(setup);
            self.emit(SetupSet { setup });
        }

        fn setup(self: @ContractState) -> ContractAddress {
            self.setup.read()
        }

        fn set_vrf_provider(ref self: ContractState, provider: ContractAddress) {
            self.ownable.assert_only_owner();
            self.drawable.set_provider(provider);
        }

        fn set_npc(ref self: ContractState, npc_id: u8, crowns: u32) {
            self.ownable.assert_only_owner();
            assert(npc_id != 0, errors::INVALID_NPC);
            let address = npc_address(npc_id);
            let village = self.villages.read(address);
            self.crownable.set(address, crowns);
            if village.status == STATUS_NONE {
                // [Effect] A new (or removed) NPC enters the pool
                self.villages.write(address, Village { status: STATUS_NPC, draws: village.draws });
                self.bucketable.insert(address, crowns);
            } else {
                // [Effect] A listed NPC moves with its crowns
                self.bucketable.follow(address, crowns);
            }
            self.emit(NpcSet { npc_id, crowns });
        }

        fn remove_npc(ref self: ContractState, npc_id: u8) {
            self.ownable.assert_only_owner();
            assert(npc_id != 0, errors::INVALID_NPC);
            let address = npc_address(npc_id);
            let village = self.villages.read(address);
            assert(village.status == STATUS_NPC, errors::NOT_NPC);
            self.bucketable.remove(address);
            self.villages.write(address, Village { status: STATUS_NONE, draws: village.draws });
            self.emit(NpcRemoved { npc_id });
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

    /// An NPC village's address: its id. No account can be deployed at such an address.
    fn npc_address(npc_id: u8) -> ContractAddress {
        let address: felt252 = npc_id.into();
        address.try_into().unwrap()
    }

    /// Whether `village` is an NPC's address (1 to `MAX_NPC`), set or removed.
    fn is_npc_address(village: ContractAddress) -> bool {
        let address: felt252 = village.into();
        let address: u256 = address.into();
        address != 0 && address <= MAX_NPC.into()
    }

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn assert_operator(self: @ContractState) {
            assert(self.operators.read(get_caller_address()), errors::NOT_OPERATOR);
        }

        fn match_of(self: @ContractState, attacker: ContractAddress) -> Match {
            let state = self.match_states.read(attacker);
            Match {
                opponent: self.match_opponents.read(attacker),
                offer: (state & 0xff).try_into().unwrap(),
                cost: ((state / 0x100) & 0xff).try_into().unwrap(),
                started: state / 0x10000 == 1,
            }
        }

        fn write_match(ref self: ContractState, attacker: ContractAddress, value: Match) {
            let started: u32 = if value.started {
                0x10000
            } else {
                0
            };
            self.match_opponents.write(attacker, value.opponent);
            self
                .match_states
                .write(attacker, value.offer.into() + value.cost.into() * 0x100 + started);
        }

        /// Takes down at most `max` shields that ended by `now` and puts their villages back in
        /// the pool at their crowns. Returns how many.
        fn release(ref self: ContractState, now: u64, max: u32) -> u32 {
            let released = self.shieldable.release(now, max);
            let count = released.len();
            for village in released {
                self.bucketable.insert(village, self.crownable.crowns_of(village));
            }
            count
        }

        /// Draws the attacker's opponent from the VRF (its draw `draws`, then counted) and fixes
        /// the offer and the 0-star cost from the crowns now.
        fn draw_opponent(
            ref self: ContractState, attacker: ContractAddress, paid: bool,
        ) -> ContractAddress {
            // [Check] The attacker has joined and is a player
            let mut village = self.villages.read(attacker);
            assert(village.status != STATUS_NONE, errors::NOT_JOINED);
            assert(village.status == STATUS_PLAYER, errors::IS_NPC);
            // [Interaction] The draw's random, then the draw counted
            let draw_index = village.draws;
            let random = self.drawable.draw_random(MATCH_KIND, attacker.into(), draw_index);
            village.draws += 1;
            self.villages.write(attacker, village);
            // [Effect] The opponent, its offer and its cost
            let crowns = self.crownable.crowns_of(attacker);
            let opponent = self
                .bucketable
                .draw(attacker, crowns, random)
                .expect(errors::NO_OPPONENT);
            let defender = self.crownable.crowns_of(opponent);
            let offer = offer_of(crowns, defender);
            let cost = cost_of(crowns, defender);
            self.write_match(attacker, Match { opponent, offer, cost, started: false });
            self.emit(OpponentDrawn { attacker, opponent, offer, cost, draw_index, paid });
            opponent
        }
    }
}
