impl TournamentIntrospect<> of dojo::database::introspect::Introspect<Tournament<>> {
    #[inline(always)]
    fn size() -> Option<usize> {
        Option::Some(10)
    }

    fn layout() -> dojo::database::introspect::Layout {
        dojo::database::introspect::Layout::Fixed(
            array![251, 251, 251, 251, 32, 32, 32, 1, 1, 1].span()
        )
    }

    #[inline(always)]
    fn ty() -> dojo::database::introspect::Ty {
        dojo::database::introspect::Ty::Struct(
            dojo::database::introspect::Struct {
                name: 'Tournament',
                attrs: array![].span(),
                children: array![
                    dojo::database::introspect::Member {
                        name: 'id',
                        attrs: array!['key'].span(),
                        ty: dojo::database::introspect::Introspect::<u64>::ty()
                    },
                    dojo::database::introspect::Member {
                        name: 'prize',
                        attrs: array![].span(),
                        ty: dojo::database::introspect::Introspect::<felt252>::ty()
                    },
                    dojo::database::introspect::Member {
                        name: 'top1_player_id',
                        attrs: array![].span(),
                        ty: dojo::database::introspect::Introspect::<felt252>::ty()
                    },
                    dojo::database::introspect::Member {
                        name: 'top2_player_id',
                        attrs: array![].span(),
                        ty: dojo::database::introspect::Introspect::<felt252>::ty()
                    },
                    dojo::database::introspect::Member {
                        name: 'top3_player_id',
                        attrs: array![].span(),
                        ty: dojo::database::introspect::Introspect::<felt252>::ty()
                    },
                    dojo::database::introspect::Member {
                        name: 'top1_score',
                        attrs: array![].span(),
                        ty: dojo::database::introspect::Introspect::<u32>::ty()
                    },
                    dojo::database::introspect::Member {
                        name: 'top2_score',
                        attrs: array![].span(),
                        ty: dojo::database::introspect::Introspect::<u32>::ty()
                    },
                    dojo::database::introspect::Member {
                        name: 'top3_score',
                        attrs: array![].span(),
                        ty: dojo::database::introspect::Introspect::<u32>::ty()
                    },
                    dojo::database::introspect::Member {
                        name: 'top1_claimed',
                        attrs: array![].span(),
                        ty: dojo::database::introspect::Introspect::<bool>::ty()
                    },
                    dojo::database::introspect::Member {
                        name: 'top2_claimed',
                        attrs: array![].span(),
                        ty: dojo::database::introspect::Introspect::<bool>::ty()
                    },
                    dojo::database::introspect::Member {
                        name: 'top3_claimed',
                        attrs: array![].span(),
                        ty: dojo::database::introspect::Introspect::<bool>::ty()
                    }
                ]
                    .span()
            }
        )
    }
}

impl TournamentModel of dojo::model::Model<Tournament> {
    fn entity(
        world: dojo::world::IWorldDispatcher,
        keys: Span<felt252>,
        layout: dojo::database::introspect::Layout
    ) -> Tournament {
        let values = dojo::world::IWorldDispatcherTrait::entity(
            world,
            1193617431456358995244187434368198769551579611043563263343844581707953290982,
            keys,
            layout
        );

        // TODO: Generate method to deserialize from keys / values directly to avoid
        // serializing to intermediate array.
        let mut serialized = core::array::ArrayTrait::new();
        core::array::serialize_array_helper(keys, ref serialized);
        core::array::serialize_array_helper(values, ref serialized);
        let mut serialized = core::array::ArrayTrait::span(@serialized);

        let entity = core::serde::Serde::<Tournament>::deserialize(ref serialized);

        if core::option::OptionTrait::<Tournament>::is_none(@entity) {
            panic!(
                "Model `Tournament`: deserialization failed. Ensure the length of the keys tuple is matching the number of #[key] fields in the model struct."
            );
        }

        core::option::OptionTrait::<Tournament>::unwrap(entity)
    }

    #[inline(always)]
    fn name() -> ByteArray {
        "Tournament"
    }

    #[inline(always)]
    fn version() -> u8 {
        1
    }

    #[inline(always)]
    fn selector() -> felt252 {
        1193617431456358995244187434368198769551579611043563263343844581707953290982
    }

    #[inline(always)]
    fn instance_selector(self: @Tournament) -> felt252 {
        Self::selector()
    }

    #[inline(always)]
    fn keys(self: @Tournament) -> Span<felt252> {
        let mut serialized = core::array::ArrayTrait::new();
        core::serde::Serde::serialize(self.id, ref serialized);
        core::array::ArrayTrait::span(@serialized)
    }

    #[inline(always)]
    fn values(self: @Tournament) -> Span<felt252> {
        let mut serialized = core::array::ArrayTrait::new();
        core::array::ArrayTrait::append(ref serialized, *self.prize);
        core::array::ArrayTrait::append(ref serialized, *self.top1_player_id);
        core::array::ArrayTrait::append(ref serialized, *self.top2_player_id);
        core::array::ArrayTrait::append(ref serialized, *self.top3_player_id);
        core::serde::Serde::serialize(self.top1_score, ref serialized);
        core::serde::Serde::serialize(self.top2_score, ref serialized);
        core::serde::Serde::serialize(self.top3_score, ref serialized);
        core::serde::Serde::serialize(self.top1_claimed, ref serialized);
        core::serde::Serde::serialize(self.top2_claimed, ref serialized);
        core::serde::Serde::serialize(self.top3_claimed, ref serialized);
        core::array::ArrayTrait::span(@serialized)
    }

    #[inline(always)]
    fn layout() -> dojo::database::introspect::Layout {
        dojo::database::introspect::Introspect::<Tournament>::layout()
    }

    #[inline(always)]
    fn instance_layout(self: @Tournament) -> dojo::database::introspect::Layout {
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
trait Itournament<T> {
    fn ensure_abi(self: @T, model: Tournament);
}

#[starknet::contract]
mod tournament {
    use super::Tournament;
    use super::Itournament;

    #[storage]
    struct Storage {}

    #[abi(embed_v0)]
    impl DojoModelImpl of dojo::model::IModel<ContractState> {
        fn selector(self: @ContractState) -> felt252 {
            dojo::model::Model::<Tournament>::selector()
        }

        fn name(self: @ContractState) -> ByteArray {
            dojo::model::Model::<Tournament>::name()
        }

        fn version(self: @ContractState) -> u8 {
            dojo::model::Model::<Tournament>::version()
        }

        fn unpacked_size(self: @ContractState) -> Option<usize> {
            dojo::database::introspect::Introspect::<Tournament>::size()
        }

        fn packed_size(self: @ContractState) -> Option<usize> {
            dojo::model::Model::<Tournament>::packed_size()
        }

        fn layout(self: @ContractState) -> dojo::database::introspect::Layout {
            dojo::model::Model::<Tournament>::layout()
        }

        fn schema(self: @ContractState) -> dojo::database::introspect::Ty {
            dojo::database::introspect::Introspect::<Tournament>::ty()
        }
    }

    #[abi(embed_v0)]
    impl tournamentImpl of Itournament<ContractState> {
        fn ensure_abi(self: @ContractState, model: Tournament) {}
    }
}
