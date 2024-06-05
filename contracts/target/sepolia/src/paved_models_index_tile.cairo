impl TileIntrospect<> of dojo::database::introspect::Introspect<Tile<>> {
    #[inline(always)]
    fn size() -> Option<usize> {
        Option::Some(6)
    }

    fn layout() -> dojo::database::introspect::Layout {
        dojo::database::introspect::Layout::Fixed(array![251, 8, 8, 32, 32, 8].span())
    }

    #[inline(always)]
    fn ty() -> dojo::database::introspect::Ty {
        dojo::database::introspect::Ty::Struct(
            dojo::database::introspect::Struct {
                name: 'Tile',
                attrs: array![].span(),
                children: array![
                    dojo::database::introspect::Member {
                        name: 'game_id',
                        attrs: array!['key'].span(),
                        ty: dojo::database::introspect::Introspect::<u32>::ty()
                    },
                    dojo::database::introspect::Member {
                        name: 'id',
                        attrs: array!['key'].span(),
                        ty: dojo::database::introspect::Introspect::<u32>::ty()
                    },
                    dojo::database::introspect::Member {
                        name: 'player_id',
                        attrs: array![].span(),
                        ty: dojo::database::introspect::Introspect::<felt252>::ty()
                    },
                    dojo::database::introspect::Member {
                        name: 'plan',
                        attrs: array![].span(),
                        ty: dojo::database::introspect::Introspect::<u8>::ty()
                    },
                    dojo::database::introspect::Member {
                        name: 'orientation',
                        attrs: array![].span(),
                        ty: dojo::database::introspect::Introspect::<u8>::ty()
                    },
                    dojo::database::introspect::Member {
                        name: 'x',
                        attrs: array![].span(),
                        ty: dojo::database::introspect::Introspect::<u32>::ty()
                    },
                    dojo::database::introspect::Member {
                        name: 'y',
                        attrs: array![].span(),
                        ty: dojo::database::introspect::Introspect::<u32>::ty()
                    },
                    dojo::database::introspect::Member {
                        name: 'occupied_spot',
                        attrs: array![].span(),
                        ty: dojo::database::introspect::Introspect::<u8>::ty()
                    }
                ]
                    .span()
            }
        )
    }
}

impl TileModel of dojo::model::Model<Tile> {
    fn entity(
        world: dojo::world::IWorldDispatcher,
        keys: Span<felt252>,
        layout: dojo::database::introspect::Layout
    ) -> Tile {
        let values = dojo::world::IWorldDispatcherTrait::entity(
            world,
            869081004206174560295956314607858017005109201753612807171542223230436090978,
            keys,
            layout
        );

        // TODO: Generate method to deserialize from keys / values directly to avoid
        // serializing to intermediate array.
        let mut serialized = core::array::ArrayTrait::new();
        core::array::serialize_array_helper(keys, ref serialized);
        core::array::serialize_array_helper(values, ref serialized);
        let mut serialized = core::array::ArrayTrait::span(@serialized);

        let entity = core::serde::Serde::<Tile>::deserialize(ref serialized);

        if core::option::OptionTrait::<Tile>::is_none(@entity) {
            panic!(
                "Model `Tile`: deserialization failed. Ensure the length of the keys tuple is matching the number of #[key] fields in the model struct."
            );
        }

        core::option::OptionTrait::<Tile>::unwrap(entity)
    }

    #[inline(always)]
    fn name() -> ByteArray {
        "Tile"
    }

    #[inline(always)]
    fn version() -> u8 {
        1
    }

    #[inline(always)]
    fn selector() -> felt252 {
        869081004206174560295956314607858017005109201753612807171542223230436090978
    }

    #[inline(always)]
    fn instance_selector(self: @Tile) -> felt252 {
        Self::selector()
    }

    #[inline(always)]
    fn keys(self: @Tile) -> Span<felt252> {
        let mut serialized = core::array::ArrayTrait::new();
        core::serde::Serde::serialize(self.game_id, ref serialized);
        core::serde::Serde::serialize(self.id, ref serialized);
        core::array::ArrayTrait::span(@serialized)
    }

    #[inline(always)]
    fn values(self: @Tile) -> Span<felt252> {
        let mut serialized = core::array::ArrayTrait::new();
        core::array::ArrayTrait::append(ref serialized, *self.player_id);
        core::serde::Serde::serialize(self.plan, ref serialized);
        core::serde::Serde::serialize(self.orientation, ref serialized);
        core::serde::Serde::serialize(self.x, ref serialized);
        core::serde::Serde::serialize(self.y, ref serialized);
        core::serde::Serde::serialize(self.occupied_spot, ref serialized);
        core::array::ArrayTrait::span(@serialized)
    }

    #[inline(always)]
    fn layout() -> dojo::database::introspect::Layout {
        dojo::database::introspect::Introspect::<Tile>::layout()
    }

    #[inline(always)]
    fn instance_layout(self: @Tile) -> dojo::database::introspect::Layout {
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
trait Itile<T> {
    fn ensure_abi(self: @T, model: Tile);
}

#[starknet::contract]
mod tile {
    use super::Tile;
    use super::Itile;

    #[storage]
    struct Storage {}

    #[abi(embed_v0)]
    impl DojoModelImpl of dojo::model::IModel<ContractState> {
        fn selector(self: @ContractState) -> felt252 {
            dojo::model::Model::<Tile>::selector()
        }

        fn name(self: @ContractState) -> ByteArray {
            dojo::model::Model::<Tile>::name()
        }

        fn version(self: @ContractState) -> u8 {
            dojo::model::Model::<Tile>::version()
        }

        fn unpacked_size(self: @ContractState) -> Option<usize> {
            dojo::database::introspect::Introspect::<Tile>::size()
        }

        fn packed_size(self: @ContractState) -> Option<usize> {
            dojo::model::Model::<Tile>::packed_size()
        }

        fn layout(self: @ContractState) -> dojo::database::introspect::Layout {
            dojo::model::Model::<Tile>::layout()
        }

        fn schema(self: @ContractState) -> dojo::database::introspect::Ty {
            dojo::database::introspect::Introspect::<Tile>::ty()
        }
    }

    #[abi(embed_v0)]
    impl tileImpl of Itile<ContractState> {
        fn ensure_abi(self: @ContractState, model: Tile) {}
    }
}
