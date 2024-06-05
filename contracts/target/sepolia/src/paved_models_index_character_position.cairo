impl CharacterPositionIntrospect<> of dojo::database::introspect::Introspect<CharacterPosition<>> {
    #[inline(always)]
    fn size() -> Option<usize> {
        Option::Some(2)
    }

    fn layout() -> dojo::database::introspect::Layout {
        dojo::database::introspect::Layout::Fixed(array![251, 8].span())
    }

    #[inline(always)]
    fn ty() -> dojo::database::introspect::Ty {
        dojo::database::introspect::Ty::Struct(
            dojo::database::introspect::Struct {
                name: 'CharacterPosition',
                attrs: array![].span(),
                children: array![
                    dojo::database::introspect::Member {
                        name: 'game_id',
                        attrs: array!['key'].span(),
                        ty: dojo::database::introspect::Introspect::<u32>::ty()
                    },
                    dojo::database::introspect::Member {
                        name: 'tile_id',
                        attrs: array!['key'].span(),
                        ty: dojo::database::introspect::Introspect::<u32>::ty()
                    },
                    dojo::database::introspect::Member {
                        name: 'spot',
                        attrs: array!['key'].span(),
                        ty: dojo::database::introspect::Introspect::<u8>::ty()
                    },
                    dojo::database::introspect::Member {
                        name: 'player_id',
                        attrs: array![].span(),
                        ty: dojo::database::introspect::Introspect::<felt252>::ty()
                    },
                    dojo::database::introspect::Member {
                        name: 'index',
                        attrs: array![].span(),
                        ty: dojo::database::introspect::Introspect::<u8>::ty()
                    }
                ]
                    .span()
            }
        )
    }
}

impl CharacterPositionModel of dojo::model::Model<CharacterPosition> {
    fn entity(
        world: dojo::world::IWorldDispatcher,
        keys: Span<felt252>,
        layout: dojo::database::introspect::Layout
    ) -> CharacterPosition {
        let values = dojo::world::IWorldDispatcherTrait::entity(
            world,
            1195487500683216123226991652047291669373848360895288795231546990450706279451,
            keys,
            layout
        );

        // TODO: Generate method to deserialize from keys / values directly to avoid
        // serializing to intermediate array.
        let mut serialized = core::array::ArrayTrait::new();
        core::array::serialize_array_helper(keys, ref serialized);
        core::array::serialize_array_helper(values, ref serialized);
        let mut serialized = core::array::ArrayTrait::span(@serialized);

        let entity = core::serde::Serde::<CharacterPosition>::deserialize(ref serialized);

        if core::option::OptionTrait::<CharacterPosition>::is_none(@entity) {
            panic!(
                "Model `CharacterPosition`: deserialization failed. Ensure the length of the keys tuple is matching the number of #[key] fields in the model struct."
            );
        }

        core::option::OptionTrait::<CharacterPosition>::unwrap(entity)
    }

    #[inline(always)]
    fn name() -> ByteArray {
        "CharacterPosition"
    }

    #[inline(always)]
    fn version() -> u8 {
        1
    }

    #[inline(always)]
    fn selector() -> felt252 {
        1195487500683216123226991652047291669373848360895288795231546990450706279451
    }

    #[inline(always)]
    fn instance_selector(self: @CharacterPosition) -> felt252 {
        Self::selector()
    }

    #[inline(always)]
    fn keys(self: @CharacterPosition) -> Span<felt252> {
        let mut serialized = core::array::ArrayTrait::new();
        core::serde::Serde::serialize(self.game_id, ref serialized);
        core::serde::Serde::serialize(self.tile_id, ref serialized);
        core::serde::Serde::serialize(self.spot, ref serialized);
        core::array::ArrayTrait::span(@serialized)
    }

    #[inline(always)]
    fn values(self: @CharacterPosition) -> Span<felt252> {
        let mut serialized = core::array::ArrayTrait::new();
        core::array::ArrayTrait::append(ref serialized, *self.player_id);
        core::serde::Serde::serialize(self.index, ref serialized);
        core::array::ArrayTrait::span(@serialized)
    }

    #[inline(always)]
    fn layout() -> dojo::database::introspect::Layout {
        dojo::database::introspect::Introspect::<CharacterPosition>::layout()
    }

    #[inline(always)]
    fn instance_layout(self: @CharacterPosition) -> dojo::database::introspect::Layout {
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
trait Icharacter_position<T> {
    fn ensure_abi(self: @T, model: CharacterPosition);
}

#[starknet::contract]
mod character_position {
    use super::CharacterPosition;
    use super::Icharacter_position;

    #[storage]
    struct Storage {}

    #[abi(embed_v0)]
    impl DojoModelImpl of dojo::model::IModel<ContractState> {
        fn selector(self: @ContractState) -> felt252 {
            dojo::model::Model::<CharacterPosition>::selector()
        }

        fn name(self: @ContractState) -> ByteArray {
            dojo::model::Model::<CharacterPosition>::name()
        }

        fn version(self: @ContractState) -> u8 {
            dojo::model::Model::<CharacterPosition>::version()
        }

        fn unpacked_size(self: @ContractState) -> Option<usize> {
            dojo::database::introspect::Introspect::<CharacterPosition>::size()
        }

        fn packed_size(self: @ContractState) -> Option<usize> {
            dojo::model::Model::<CharacterPosition>::packed_size()
        }

        fn layout(self: @ContractState) -> dojo::database::introspect::Layout {
            dojo::model::Model::<CharacterPosition>::layout()
        }

        fn schema(self: @ContractState) -> dojo::database::introspect::Ty {
            dojo::database::introspect::Introspect::<CharacterPosition>::ty()
        }
    }

    #[abi(embed_v0)]
    impl character_positionImpl of Icharacter_position<ContractState> {
        fn ensure_abi(self: @ContractState, model: CharacterPosition) {}
    }
}
