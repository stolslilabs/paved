//! Manageable component

#[starknet::component]
pub mod ManageableComponent {
    // Starknet imports


    // Dojo imports

    use dojo::world::IWorldDispatcher;
    use paved::models::player::{Player, PlayerAssert, PlayerImpl};

    // Internal imports

    use paved::store::{Store, StoreImpl};
    use starknet::{ContractAddress, get_caller_address};

    // Storage

    #[storage]
    struct Storage {}

    // Events

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {}

    #[generate_trait]
    pub impl InternalImpl<
        TContractState, +HasComponent<TContractState>,
    > of InternalTrait<TContractState> {
        fn create(
            self: @ComponentState<TContractState>,
            world: IWorldDispatcher,
            name: felt252,
            master: ContractAddress,
        ) {
            // [Setup] Datastore
            let store: Store = StoreImpl::new(world);

            // [Check] Player not already exists
            let caller = get_caller_address();
            let player = store.player(caller.into());
            player.assert_not_exists();

            // [Effect] Create a new player
            let player = PlayerImpl::new(caller.into(), name, master.into());
            store.set_player(player);
        }
    }
}
