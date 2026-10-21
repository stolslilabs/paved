//! `Matchmaker`, the PvP matchmaker (#639, part of #637; `docs/architecture/matchmaker.md`): the
//! pool of villages in crown buckets, the opponent drawn from Cartridge's VRF, the shields, and the
//! crowns an attack moves. The rules are the pure library `paved::matchmaker` (ported from the
//! owner's POC, bal7hazar/matchmaker at 8639f232); this system implements its `PoolStore` on its
//! storage and adds the callers' checks, the VRF draw, the Cobbles of "Next" and the events.
//!
//! Callers:
//! - the player: `search` (free) and `next` (`NEXT_PRICE` Cobbles, spent in `Setup`) draw an
//!   opponent and fix the offer;
//! - an operator (a system the owner allows: #640 creates villages, #643 runs attacks): `join`,
//!   `start_attack`, `settle`, and `set_crowns` (#644's season reset);
//! - anyone: `release_shields`, which puts back expired shields (every attack start does it too);
//! - the owner: the operators, `Setup`, the VRF provider, the NPC villages, `upgrade`.
//!
//! The client puts `request_random(Matchmaker, Salt(vrfSalt(MATCH_KIND, attacker, draws)))` first
//! in the multicall of `search` and `next`, `draws` being the village's draw counter (`village`).

use paved::matchmaker::crowns::Settlement;
use paved::matchmaker::village::{Queue, Village};
use starknet::ContractAddress;

/// The kind of the matchmaker's VRF draws (`paved::vrf::draw_salt`); the game id is the attacker.
pub const MATCH_KIND: felt252 = 'MATCH';
/// The Cobbles of each "Next" (proposed, #639).
pub const NEXT_PRICE: u32 = 1;
/// The reason of the Cobbles "Next" spends in `Setup` (`CobblesSpent.reason`).
pub const NEXT_REASON: felt252 = 'MATCH_NEXT';
/// The most expired shields one `release_shields` call puts back.
pub const MAX_RELEASES: u32 = 16;

/// An attacker's drawn opponent and the offer fixed at the draw; `started` once the attack began.
/// A zero opponent: none.
#[derive(Copy, Drop, Serde, Debug, PartialEq)]
pub struct Match {
    pub opponent: ContractAddress,
    pub offer: u8,
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
    /// A new village joins, behind its initial shield (`INITIAL_SHIELD`). An operator only.
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
    /// The offer of an attack of `attacker` on `defender` at their crowns now.
    fn offer(self: @TContractState, attacker: ContractAddress, defender: ContractAddress) -> u8;
    /// Bit `b` set iff bucket `b` is non-empty.
    fn registry(self: @TContractState) -> felt252;
    fn bucket_size(self: @TContractState, bucket: u8) -> u32;
    fn slot(self: @TContractState, bucket: u8, index: u32) -> ContractAddress;
    fn queue(self: @TContractState, queue: u8) -> Queue;
    fn queue_entry(self: @TContractState, queue: u8, seq: u64) -> ContractAddress;
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
    use paved::components::drawable::DrawableComponent;
    use paved::components::ownable::OwnableComponent;
    use paved::matchmaker::crowns::{Settlement, offer_of};
    use paved::matchmaker::pool::{PoolStore, PoolTrait, QUEUE_ATTACK, QUEUE_INITIAL};
    use paved::matchmaker::village::{Queue, STATUS_NONE, STATUS_POOL, Village};
    use paved::systems::setup::{ISetupSpendDispatcher, ISetupSpendDispatcherTrait};
    use starknet::storage::{
        Map, StorageMapReadAccess, StorageMapWriteAccess, StoragePointerReadAccess,
        StoragePointerWriteAccess,
    };
    use starknet::{ClassHash, ContractAddress, get_block_timestamp, get_caller_address};
    use super::{
        IMatchmaker, IMatchmakerAdmin, MATCH_KIND, MAX_RELEASES, Match, NEXT_PRICE, NEXT_REASON,
    };

    pub mod errors {
        pub const ZERO_SETUP: felt252 = 'Matchmaker: setup is zero';
        pub const ZERO_VILLAGE: felt252 = 'Matchmaker: village is zero';
        pub const NOT_OPERATOR: felt252 = 'Matchmaker: not operator';
        pub const NO_OPPONENT: felt252 = 'Matchmaker: no opponent';
        pub const OPPONENT_DRAWN: felt252 = 'Matchmaker: opponent drawn';
        pub const NOTHING_DRAWN: felt252 = 'Matchmaker: nothing drawn';
        pub const ATTACK_STARTED: felt252 = 'Matchmaker: attack started';
        pub const NO_ATTACK: felt252 = 'Matchmaker: no attack';
        pub const NOT_JOINED: felt252 = 'Matchmaker: not joined';
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

    // Storage: new contract, flat components (`docs/architecture/upgrades.md`)

    #[storage]
    struct Storage {
        #[substorage(v0)]
        ownable: OwnableComponent::Storage,
        #[substorage(v0)]
        upgradeable: UpgradeableComponent::Storage,
        #[substorage(v0)]
        drawable: DrawableComponent::Storage,
        /// Bit `b` set iff bucket `b` is non-empty (bits 0 to 250).
        registry: felt252,
        /// The villages in bucket `b`.
        bucket_sizes: Map<u8, u32>,
        /// The village at index `i` of bucket `b`, for `i < bucket_sizes[b]`.
        slots: Map<(u8, u32), ContractAddress>,
        /// One packed slot per village (`paved::matchmaker::village`).
        villages: Map<ContractAddress, Village>,
        /// Shield queue `q`: `head` [0, 64) · `tail` [64, 128).
        queues: Map<u8, Queue>,
        /// Queue `q`'s entry at sequence `n`, live for `head <= n < tail` while the village's slot
        /// names it.
        queue_entries: Map<(u8, u64), ContractAddress>,
        /// An attacker's drawn opponent (zero: none).
        match_opponents: Map<ContractAddress, ContractAddress>,
        /// An attacker's match: `offer` [0, 8) · `started` [8].
        match_states: Map<ContractAddress, u16>,
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
        OperatorSet: OperatorSet,
        SetupSet: SetupSet,
        VillageJoined: VillageJoined,
        NpcSet: NpcSet,
        NpcRemoved: NpcRemoved,
        OpponentDrawn: OpponentDrawn,
        AttackStarted: AttackStarted,
        ShieldRaised: ShieldRaised,
        ShieldDropped: ShieldDropped,
        ShieldReleased: ShieldReleased,
        CrownsSettled: CrownsSettled,
        CrownsSet: CrownsSet,
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

    /// An opponent drawn for `attacker` by its VRF draw `draw_index`, with the offer fixed now;
    /// `paid`: a "Next", for `NEXT_PRICE` Cobbles.
    #[derive(Drop, Debug, PartialEq, starknet::Event)]
    pub struct OpponentDrawn {
        #[key]
        pub attacker: ContractAddress,
        pub opponent: ContractAddress,
        pub offer: u8,
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
    }

    /// A village shielded until `until`: queue 0 after an attack, 1 for a new village.
    #[derive(Drop, Debug, PartialEq, starknet::Event)]
    pub struct ShieldRaised {
        #[key]
        pub village: ContractAddress,
        pub queue: u8,
        pub until: u64,
    }

    /// A shielded village attacked: its shield dropped, it is back in the pool.
    #[derive(Drop, Debug, PartialEq, starknet::Event)]
    pub struct ShieldDropped {
        #[key]
        pub village: ContractAddress,
    }

    /// A shield ended: the village is back in the pool.
    #[derive(Drop, Debug, PartialEq, starknet::Event)]
    pub struct ShieldReleased {
        #[key]
        pub village: ContractAddress,
    }

    /// An attack settled: its stars, the offer, the crowns that moved and both counts after it.
    #[derive(Drop, Debug, PartialEq, starknet::Event)]
    pub struct CrownsSettled {
        #[key]
        pub attacker: ContractAddress,
        #[key]
        pub defender: ContractAddress,
        pub stars: u8,
        pub offer: u8,
        pub gained: u32,
        pub lost: u32,
        pub attacker_crowns: u32,
        pub defender_crowns: u32,
    }

    #[derive(Drop, Debug, PartialEq, starknet::Event)]
    pub struct CrownsSet {
        #[key]
        pub village: ContractAddress,
        pub crowns: u32,
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

    // The library's storage

    impl StoragePoolStore of PoolStore<ContractState> {
        fn read_registry(ref self: ContractState) -> felt252 {
            self.registry.read()
        }
        fn write_registry(ref self: ContractState, registry: felt252) {
            self.registry.write(registry);
        }
        fn read_bucket_size(ref self: ContractState, bucket: u8) -> u32 {
            self.bucket_sizes.read(bucket)
        }
        fn write_bucket_size(ref self: ContractState, bucket: u8, size: u32) {
            self.bucket_sizes.write(bucket, size);
        }
        fn read_slot(ref self: ContractState, bucket: u8, index: u32) -> ContractAddress {
            self.slots.read((bucket, index))
        }
        fn write_slot(ref self: ContractState, bucket: u8, index: u32, village: ContractAddress) {
            self.slots.write((bucket, index), village);
        }
        fn read_village(ref self: ContractState, address: ContractAddress) -> Village {
            self.villages.read(address)
        }
        fn write_village(ref self: ContractState, address: ContractAddress, village: Village) {
            self.villages.write(address, village);
        }
        fn read_queue(ref self: ContractState, queue: u8) -> Queue {
            self.queues.read(queue)
        }
        fn write_queue(ref self: ContractState, queue: u8, value: Queue) {
            self.queues.write(queue, value);
        }
        fn read_entry(ref self: ContractState, queue: u8, seq: u64) -> ContractAddress {
            self.queue_entries.read((queue, seq))
        }
        fn write_entry(ref self: ContractState, queue: u8, seq: u64, village: ContractAddress) {
            self.queue_entries.write((queue, seq), village);
        }
    }

    #[abi(embed_v0)]
    impl MatchmakerImpl of IMatchmaker<ContractState> {
        fn search(ref self: ContractState) -> ContractAddress {
            let attacker = get_caller_address();
            // [Check] No attack started; a drawn opponent only if it left the pool
            let current = self.match_of(attacker);
            assert(!current.started, errors::ATTACK_STARTED);
            if current.opponent.is_non_zero() {
                let opponent = self.villages.read(current.opponent);
                assert(opponent.status != STATUS_POOL, errors::OPPONENT_DRAWN);
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
            // [Check] Not zero: a zero opponent means none in a match
            assert(player.is_non_zero(), errors::ZERO_VILLAGE);
            let village = PoolTrait::join(ref self, player, get_block_timestamp(), true);
            self.emit(VillageJoined { village: player });
            self
                .emit(
                    ShieldRaised {
                        village: player, queue: QUEUE_INITIAL, until: village.shield_until,
                    },
                );
        }

        fn start_attack(
            ref self: ContractState, attacker: ContractAddress,
        ) -> (ContractAddress, u8) {
            self.assert_operator();
            // [Check] An opponent drawn, no attack started
            let mut current = self.match_of(attacker);
            assert(current.opponent.is_non_zero(), errors::NOTHING_DRAWN);
            assert(!current.started, errors::ATTACK_STARTED);
            // [Effect] Expired shields back, the attacker's shield dropped, the defender shielded
            let defender = current.opponent;
            let start = PoolTrait::start(ref self, attacker, defender, get_block_timestamp());
            for village in start.released {
                self.emit(ShieldReleased { village });
            }
            if start.dropped {
                self.emit(ShieldDropped { village: attacker });
            }
            if start.shield_until != 0 {
                self
                    .emit(
                        ShieldRaised {
                            village: defender, queue: QUEUE_ATTACK, until: start.shield_until,
                        },
                    );
            }
            // [Effect] The match is fixed
            current.started = true;
            self.write_match(attacker, current);
            self.emit(AttackStarted { attacker, defender, offer: current.offer });
            (defender, current.offer)
        }

        fn settle(ref self: ContractState, attacker: ContractAddress, stars: u8) -> Settlement {
            self.assert_operator();
            // [Check] An attack started
            let current = self.match_of(attacker);
            assert(current.started, errors::NO_ATTACK);
            // [Effect] The crowns move, the match ends
            let defender = current.opponent;
            let outcome = PoolTrait::settle(ref self, attacker, defender, current.offer, stars);
            self.write_match(attacker, Match { opponent: Zero::zero(), offer: 0, started: false });
            self
                .emit(
                    CrownsSettled {
                        attacker,
                        defender,
                        stars,
                        offer: current.offer,
                        gained: outcome.gained,
                        lost: outcome.lost,
                        attacker_crowns: outcome.attacker,
                        defender_crowns: outcome.defender,
                    },
                );
            outcome
        }

        fn set_crowns(ref self: ContractState, village: ContractAddress, crowns: u32) {
            self.assert_operator();
            PoolTrait::set_crowns(ref self, village, crowns);
            self.emit(CrownsSet { village, crowns });
        }

        fn release_shields(ref self: ContractState, max: u32) -> u32 {
            assert(max <= MAX_RELEASES, errors::TOO_MANY_RELEASES);
            let mut registry = PoolTrait::load(ref self);
            let released = PoolTrait::release(ref self, ref registry, get_block_timestamp(), max);
            PoolTrait::flush(ref self, registry);
            let count = released.len();
            for village in released {
                self.emit(ShieldReleased { village });
            }
            count
        }

        fn village(self: @ContractState, village: ContractAddress) -> Village {
            self.villages.read(village)
        }

        fn current_match(self: @ContractState, attacker: ContractAddress) -> Match {
            self.match_of(attacker)
        }

        fn offer(self: @ContractState, attacker: ContractAddress, defender: ContractAddress) -> u8 {
            offer_of(self.villages.read(attacker).crowns, self.villages.read(defender).crowns)
        }

        fn registry(self: @ContractState) -> felt252 {
            self.registry.read()
        }

        fn bucket_size(self: @ContractState, bucket: u8) -> u32 {
            self.bucket_sizes.read(bucket)
        }

        fn slot(self: @ContractState, bucket: u8, index: u32) -> ContractAddress {
            self.slots.read((bucket, index))
        }

        fn queue(self: @ContractState, queue: u8) -> Queue {
            self.queues.read(queue)
        }

        fn queue_entry(self: @ContractState, queue: u8, seq: u64) -> ContractAddress {
            self.queue_entries.read((queue, seq))
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
            PoolTrait::set_npc(ref self, npc_address(npc_id), crowns);
            self.emit(NpcSet { npc_id, crowns });
        }

        fn remove_npc(ref self: ContractState, npc_id: u8) {
            self.ownable.assert_only_owner();
            assert(npc_id != 0, errors::INVALID_NPC);
            PoolTrait::remove_npc(ref self, npc_address(npc_id));
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
                started: state / 0x100 == 1,
            }
        }

        fn write_match(ref self: ContractState, attacker: ContractAddress, value: Match) {
            let started: u16 = if value.started {
                0x100
            } else {
                0
            };
            self.match_opponents.write(attacker, value.opponent);
            self.match_states.write(attacker, value.offer.into() + started);
        }

        /// Draws the attacker's opponent from the VRF (its draw `draws`, then counted) and fixes
        /// the offer from the crowns now.
        fn draw_opponent(
            ref self: ContractState, attacker: ContractAddress, paid: bool,
        ) -> ContractAddress {
            // [Check] The attacker has joined and is a player
            let mut village = self.villages.read(attacker);
            assert(village.status != STATUS_NONE, errors::NOT_JOINED);
            assert(!village.npc, errors::IS_NPC);
            // [Interaction] The draw's random, then the draw counted
            let draw_index = village.draws;
            let random = self.drawable.draw_random(MATCH_KIND, attacker.into(), draw_index);
            village.draws += 1;
            self.villages.write(attacker, village);
            // [Effect] The opponent and its offer
            let registry = PoolTrait::load(ref self);
            let opponent = PoolTrait::draw(ref self, registry, village, random)
                .expect(errors::NO_OPPONENT);
            let offer = offer_of(village.crowns, self.villages.read(opponent).crowns);
            self.write_match(attacker, Match { opponent, offer, started: false });
            self.emit(OpponentDrawn { attacker, opponent, offer, draw_index, paid });
            opponent
        }
    }
}
