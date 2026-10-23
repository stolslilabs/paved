//! Recordable component: the moves of an attack (#643, `docs/architecture/pvp-attacks.md`,
//! section 2), in the order they were played: the plan of each tile, discarded or built with an
//! orientation at a position. They are the finish's replay and the defender's log: a replay costs
//! nothing more than these words and their `AttackPlayed` events. This component checks nothing of
//! a move: the system checks it before recording it.
//!
//! An attack is keyed by its attacker and its number (`id`), so its moves stay readable after the
//! attacker's next attack.
//!
//! Storage, flat: `record_moves`, `record_sizes` (new names only, `docs/architecture/upgrades.md`,
//! "Storage layout discipline").

use starknet::ContractAddress;

/// One move of an attack: the tile's plan, and either a discard (`orientation`, `x` and `y` 0) or
/// the tile built turned to `orientation` (1 North to 4 West) at `(x, y)`, the game's coordinates
/// (the starter at `CENTER`, `CENTER`).
#[derive(Copy, Drop, Serde, Debug, PartialEq)]
pub struct AttackMove {
    pub plan: u8,
    pub discard: bool,
    pub orientation: u8,
    pub x: u32,
    pub y: u32,
}

#[starknet::interface]
pub trait IRecordable<TContractState> {
    /// The moves of attack `id` of `attacker`, in order (empty: none).
    fn moves(self: @TContractState, attacker: ContractAddress, id: u32) -> Array<AttackMove>;
}

#[starknet::component]
pub mod RecordableComponent {
    use starknet::ContractAddress;
    use starknet::storage::{Map, StorageMapReadAccess, StorageMapWriteAccess};
    use super::{AttackMove, IRecordable};

    const TWO_POW_8: u128 = 0x100;
    const TWO_POW_16: u128 = 0x10000;
    const TWO_POW_32: u128 = 0x100000000;
    const TWO_POW_64: u128 = 0x10000000000000000;
    const MASK_8: u128 = 0xff;
    const MASK_32: u128 = 0xffffffff;

    #[storage]
    pub struct Storage {
        /// Move `index` of an attack (key `(attacker, id, index)`): `plan` [0, 8) · `discard`
        /// [8, 16) · `orientation` [16, 24) · `x` [32, 64) · `y` [64, 96).
        pub record_moves: Map<(ContractAddress, u32, u8), felt252>,
        /// The moves of an attack (key `(attacker, id)`).
        pub record_sizes: Map<(ContractAddress, u32), u8>,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        AttackPlayed: AttackPlayed,
    }

    /// Move `index` (from 0) of attack `id`: the replay's source, for the defender's log.
    #[derive(Drop, Debug, PartialEq, starknet::Event)]
    pub struct AttackPlayed {
        #[key]
        pub attacker: ContractAddress,
        pub id: u32,
        pub index: u8,
        pub plan: u8,
        pub discard: bool,
        pub orientation: u8,
        pub x: u32,
        pub y: u32,
    }

    #[embeddable_as(RecordableImpl)]
    pub impl Recordable<
        TContractState, +HasComponent<TContractState>,
    > of IRecordable<ComponentState<TContractState>> {
        fn moves(
            self: @ComponentState<TContractState>, attacker: ContractAddress, id: u32,
        ) -> Array<AttackMove> {
            self.moves_of(attacker, id)
        }
    }

    #[generate_trait]
    pub impl InternalImpl<
        TContractState, +HasComponent<TContractState>,
    > of InternalTrait<TContractState> {
        /// Records `move` as the next move of attack `id`. Emits `AttackPlayed`; returns its index.
        fn append(
            ref self: ComponentState<TContractState>,
            attacker: ContractAddress,
            id: u32,
            move: AttackMove,
        ) -> u8 {
            let index = self.record_sizes.read((attacker, id));
            let discard: u128 = if move.discard {
                1
            } else {
                0
            };
            let word: u128 = move.plan.into()
                + discard * TWO_POW_8
                + move.orientation.into() * TWO_POW_16
                + move.x.into() * TWO_POW_32
                + move.y.into() * TWO_POW_64;
            self.record_moves.write((attacker, id, index), word.into());
            self.record_sizes.write((attacker, id), index + 1);
            self
                .emit(
                    AttackPlayed {
                        attacker,
                        id,
                        index,
                        plan: move.plan,
                        discard: move.discard,
                        orientation: move.orientation,
                        x: move.x,
                        y: move.y,
                    },
                );
            index
        }

        fn size_of(
            self: @ComponentState<TContractState>, attacker: ContractAddress, id: u32,
        ) -> u8 {
            self.record_sizes.read((attacker, id))
        }

        fn moves_of(
            self: @ComponentState<TContractState>, attacker: ContractAddress, id: u32,
        ) -> Array<AttackMove> {
            let size = self.record_sizes.read((attacker, id));
            let mut moves: Array<AttackMove> = array![];
            let mut index: u8 = 0;
            while index < size {
                let word: u256 = self.record_moves.read((attacker, id, index)).into();
                let word = word.low;
                moves
                    .append(
                        AttackMove {
                            plan: (word & MASK_8).try_into().unwrap(),
                            discard: (word / TWO_POW_8) & MASK_8 == 1,
                            orientation: ((word / TWO_POW_16) & MASK_8).try_into().unwrap(),
                            x: ((word / TWO_POW_32) & MASK_32).try_into().unwrap(),
                            y: ((word / TWO_POW_64) & MASK_32).try_into().unwrap(),
                        },
                    );
                index += 1;
            }
            moves
        }
    }
}
