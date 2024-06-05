impl GameIntrospect<> of dojo::database::introspect::Introspect<Game<>> {
    #[inline(always)]
    fn size() -> Option<usize> {
        Option::Some(7)
    }

    fn layout() -> dojo::database::introspect::Layout {
        dojo::database::introspect::Layout::Fixed(array![1, 128, 32, 64, 32, 251, 8].span())
    }

    #[inline(always)]
    fn ty() -> dojo::database::introspect::Ty {
        dojo::database::introspect::Ty::Struct(
            dojo::database::introspect::Struct {
                name: 'Game',
                attrs: array![].span(),
                children: array![
                    dojo::database::introspect::Member {
                        name: 'id',
                        attrs: array!['key'].span(),
                        ty: dojo::database::introspect::Introspect::<u32>::ty()
                    },
                    dojo::database::introspect::Member {
                        name: 'over',
                        attrs: array![].span(),
                        ty: dojo::database::introspect::Introspect::<bool>::ty()
                    },
                    dojo::database::introspect::Member {
                        name: 'tiles',
                        attrs: array![].span(),
                        ty: dojo::database::introspect::Introspect::<u128>::ty()
                    },
                    dojo::database::introspect::Member {
                        name: 'tile_count',
                        attrs: array![].span(),
                        ty: dojo::database::introspect::Introspect::<u32>::ty()
                    },
                    dojo::database::introspect::Member {
                        name: 'start_time',
                        attrs: array![].span(),
                        ty: dojo::database::introspect::Introspect::<u64>::ty()
                    },
                    dojo::database::introspect::Member {
                        name: 'score',
                        attrs: array![].span(),
                        ty: dojo::database::introspect::Introspect::<u32>::ty()
                    },
                    dojo::database::introspect::Member {
                        name: 'seed',
                        attrs: array![].span(),
                        ty: dojo::database::introspect::Introspect::<felt252>::ty()
                    },
                    dojo::database::introspect::Member {
                        name: 'mode',
                        attrs: array![].span(),
                        ty: dojo::database::introspect::Introspect::<u8>::ty()
                    }
                ]
                    .span()
            }
        )
    }
}

impl GameModel of dojo::model::Model<Game> {
    fn entity(
        world: dojo::world::IWorldDispatcher,
        keys: Span<felt252>,
        layout: dojo::database::introspect::Layout
    ) -> Game {
        let values = dojo::world::IWorldDispatcherTrait::entity(
            world,
            809207162367191365940534803646588317926450746492606805385189886939607822064,
            keys,
            layout
        );

        // TODO: Generate method to deserialize from keys / values directly to avoid
        // serializing to intermediate array.
        let mut serialized = core::array::ArrayTrait::new();
        core::array::serialize_array_helper(keys, ref serialized);
        core::array::serialize_array_helper(values, ref serialized);
        let mut serialized = core::array::ArrayTrait::span(@serialized);

        let entity = core::serde::Serde::<Game>::deserialize(ref serialized);

        if core::option::OptionTrait::<Game>::is_none(@entity) {
            panic!(
                "Model `Game`: deserialization failed. Ensure the length of the keys tuple is matching the number of #[key] fields in the model struct."
            );
        }

        core::option::OptionTrait::<Game>::unwrap(entity)
    }

    #[inline(always)]
    fn name() -> ByteArray {
        "Game"
    }

    #[inline(always)]
    fn version() -> u8 {
        1
    }

    #[inline(always)]
    fn selector() -> felt252 {
        809207162367191365940534803646588317926450746492606805385189886939607822064
    }

    #[inline(always)]
    fn instance_selector(self: @Game) -> felt252 {
        Self::selector()
    }

    #[inline(always)]
    fn keys(self: @Game) -> Span<felt252> {
        let mut serialized = core::array::ArrayTrait::new();
        core::serde::Serde::serialize(self.id, ref serialized);
        core::array::ArrayTrait::span(@serialized)
    }

    #[inline(always)]
    fn values(self: @Game) -> Span<felt252> {
        let mut serialized = core::array::ArrayTrait::new();
        core::serde::Serde::serialize(self.over, ref serialized);
        core::serde::Serde::serialize(self.tiles, ref serialized);
        core::serde::Serde::serialize(self.tile_count, ref serialized);
        core::serde::Serde::serialize(self.start_time, ref serialized);
        core::serde::Serde::serialize(self.score, ref serialized);
        core::array::ArrayTrait::append(ref serialized, *self.seed);
        core::serde::Serde::serialize(self.mode, ref serialized);
        core::array::ArrayTrait::span(@serialized)
    }

    #[inline(always)]
    fn layout() -> dojo::database::introspect::Layout {
        dojo::database::introspect::Introspect::<Game>::layout()
    }

    #[inline(always)]
    fn instance_layout(self: @Game) -> dojo::database::introspect::Layout {
        Self::layout()
    }

    #[inline(always)]
    fn packed_size() -> Option<usize> {
        let layout = Self::layout();

        match layout {
            dojo::database::introspect::Layout::Fixed(layout) => {
                let mut span_layout = layout;
                Option::Some(dojo::packing::calculate_packed_size(ref span_layout))
            },
            dojo::database::introspect::Layout::Struct(_) => Option::None,
            dojo::database::introspect::Layout::Array(_) => Option::None,
            dojo::database::introspect::Layout::Tuple(_) => Option::None,
            dojo::database::introspect::Layout::Enum(_) => Option::None,
            dojo::database::introspect::Layout::ByteArray => Option::None,
        }
    }
}

#[starknet::interface]
trait Igame<T> {
    fn ensure_abi(self: @T, model: Game);
}

#[starknet::contract]
mod game {
    use super::Game;
    use super::Igame;

    #[storage]
    struct Storage {}

    #[abi(embed_v0)]
    impl DojoModelImpl of dojo::model::IModel<ContractState> {
        fn selector(self: @ContractState) -> felt252 {
            dojo::model::Model::<Game>::selector()
        }

        fn name(self: @ContractState) -> ByteArray {
            dojo::model::Model::<Game>::name()
        }

        fn version(self: @ContractState) -> u8 {
            dojo::model::Model::<Game>::version()
        }

        fn unpacked_size(self: @ContractState) -> Option<usize> {
            dojo::database::introspect::Introspect::<Game>::size()
        }

        fn packed_size(self: @ContractState) -> Option<usize> {
            dojo::model::Model::<Game>::packed_size()
        }

        fn layout(self: @ContractState) -> dojo::database::introspect::Layout {
            dojo::model::Model::<Game>::layout()
        }

        fn schema(self: @ContractState) -> dojo::database::introspect::Ty {
            dojo::database::introspect::Introspect::<Game>::ty()
        }
    }

    #[abi(embed_v0)]
    impl gameImpl of Igame<ContractState> {
        fn ensure_abi(self: @ContractState, model: Game) {}
    }
}
