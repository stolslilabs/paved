impl BuilderIntrospect<> of dojo::database::introspect::Introspect<Builder<>> {
    #[inline(always)]
    fn size() -> Option<usize> {
        Option::Some(2)
    }

    fn layout() -> dojo::database::introspect::Layout {
        dojo::database::introspect::Layout::Fixed(array![32, 8].span())
    }

    #[inline(always)]
    fn ty() -> dojo::database::introspect::Ty {
        dojo::database::introspect::Ty::Struct(
            dojo::database::introspect::Struct {
                name: 'Builder',
                attrs: array![].span(),
                children: array![
                    dojo::database::introspect::Member {
                        name: 'game_id',
                        attrs: array!['key'].span(),
                        ty: dojo::database::introspect::Introspect::<u32>::ty()
                    },
                    dojo::database::introspect::Member {
                        name: 'player_id',
                        attrs: array!['key'].span(),
                        ty: dojo::database::introspect::Introspect::<felt252>::ty()
                    },
                    dojo::database::introspect::Member {
                        name: 'tile_id',
                        attrs: array![].span(),
                        ty: dojo::database::introspect::Introspect::<u32>::ty()
                    },
                    dojo::database::introspect::Member {
                        name: 'characters',
                        attrs: array![].span(),
                        ty: dojo::database::introspect::Introspect::<u8>::ty()
                    }
                ]
                    .span()
            }
        )
    }
}

impl BuilderModel of dojo::model::Model<Builder> {
    fn entity(
        world: dojo::world::IWorldDispatcher,
        keys: Span<felt252>,
        layout: dojo::database::introspect::Layout
    ) -> Builder {
        let values = dojo::world::IWorldDispatcherTrait::entity(
            world,
            684525700476410301496300246829909804741456508419247876748708022013923520576,
            keys,
            layout
        );

        // TODO: Generate method to deserialize from keys / values directly to avoid
        // serializing to intermediate array.
        let mut serialized = core::array::ArrayTrait::new();
        core::array::serialize_array_helper(keys, ref serialized);
        core::array::serialize_array_helper(values, ref serialized);
        let mut serialized = core::array::ArrayTrait::span(@serialized);

        let entity = core::serde::Serde::<Builder>::deserialize(ref serialized);

        if core::option::OptionTrait::<Builder>::is_none(@entity) {
            panic!(
                "Model `Builder`: deserialization failed. Ensure the length of the keys tuple is matching the number of #[key] fields in the model struct."
            );
        }

        core::option::OptionTrait::<Builder>::unwrap(entity)
    }

    #[inline(always)]
    fn name() -> ByteArray {
        "Builder"
    }

    #[inline(always)]
    fn version() -> u8 {
        1
    }

    #[inline(always)]
    fn selector() -> felt252 {
        684525700476410301496300246829909804741456508419247876748708022013923520576
    }

    #[inline(always)]
    fn instance_selector(self: @Builder) -> felt252 {
        Self::selector()
    }

    #[inline(always)]
    fn keys(self: @Builder) -> Span<felt252> {
        let mut serialized = core::array::ArrayTrait::new();
        core::serde::Serde::serialize(self.game_id, ref serialized);
        core::array::ArrayTrait::append(ref serialized, *self.player_id);
        core::array::ArrayTrait::span(@serialized)
    }

    #[inline(always)]
    fn values(self: @Builder) -> Span<felt252> {
        let mut serialized = core::array::ArrayTrait::new();
        core::serde::Serde::serialize(self.tile_id, ref serialized);
        core::serde::Serde::serialize(self.characters, ref serialized);
        core::array::ArrayTrait::span(@serialized)
    }

    #[inline(always)]
    fn layout() -> dojo::database::introspect::Layout {
        dojo::database::introspect::Introspect::<Builder>::layout()
    }

    #[inline(always)]
    fn instance_layout(self: @Builder) -> dojo::database::introspect::Layout {
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
trait Ibuilder<T> {
    fn ensure_abi(self: @T, model: Builder);
}

#[starknet::contract]
mod builder {
    use super::Builder;
    use super::Ibuilder;

    #[storage]
    struct Storage {}

    #[abi(embed_v0)]
    impl DojoModelImpl of dojo::model::IModel<ContractState> {
        fn selector(self: @ContractState) -> felt252 {
            dojo::model::Model::<Builder>::selector()
        }

        fn name(self: @ContractState) -> ByteArray {
            dojo::model::Model::<Builder>::name()
        }

        fn version(self: @ContractState) -> u8 {
            dojo::model::Model::<Builder>::version()
        }

        fn unpacked_size(self: @ContractState) -> Option<usize> {
            dojo::database::introspect::Introspect::<Builder>::size()
        }

        fn packed_size(self: @ContractState) -> Option<usize> {
            dojo::model::Model::<Builder>::packed_size()
        }

        fn layout(self: @ContractState) -> dojo::database::introspect::Layout {
            dojo::model::Model::<Builder>::layout()
        }

        fn schema(self: @ContractState) -> dojo::database::introspect::Ty {
            dojo::database::introspect::Introspect::<Builder>::ty()
        }
    }

    #[abi(embed_v0)]
    impl builderImpl of Ibuilder<ContractState> {
        fn ensure_abi(self: @ContractState, model: Builder) {}
    }
}
