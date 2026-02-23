// Dojo imports

use dojo::world::IWorldDispatcher;

// Internal imports

use paved::events::{Built, Discarded, GameOver, ScoredCity, ScoredRoad, ScoredForest, ScoredWonder};

// Interface

#[starknet::interface]
pub trait EmitterTrait<TContractState> {
    fn emit_built(self: @TContractState, world: IWorldDispatcher, event: Built);
    fn emit_discarded(self: @TContractState, world: IWorldDispatcher, event: Discarded);
    fn emit_game_over(self: @TContractState, world: IWorldDispatcher, event: GameOver);
    fn emit_scored_city(self: @TContractState, world: IWorldDispatcher, event: ScoredCity);
    fn emit_scored_road(self: @TContractState, world: IWorldDispatcher, event: ScoredRoad);
    fn emit_scored_forest(self: @TContractState, world: IWorldDispatcher, event: ScoredForest);
    fn emit_scored_wonder(self: @TContractState, world: IWorldDispatcher, event: ScoredWonder);
}

// Component

#[starknet::component]
pub mod EmitterComponent {
    use dojo::world::IWorldDispatcher;

    // Internal imports

    use paved::events::{
        Built, Discarded, GameOver, ScoredCity, ScoredRoad, ScoredForest, ScoredWonder
    };

    // Local imports

    use super::EmitterTrait;

    // Storage

    #[storage]
    struct Storage {}

    // Events

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        Built: Built,
        Discarded: Discarded,
        GameOver: GameOver,
        ScoredCity: ScoredCity,
        ScoredRoad: ScoredRoad,
        ScoredForest: ScoredForest,
        ScoredWonder: ScoredWonder,
    }

    #[embeddable_as(EmitterImpl)]
    pub impl Emitter<
        TContractState, +HasComponent<TContractState>
    > of EmitterTrait<ComponentState<TContractState>> {
        #[inline]
        fn emit_built(
            self: @ComponentState<TContractState>, world: IWorldDispatcher, event: Built
        ) {
            let _ = self;
            let _ = world;
            let _ = event;
        }

        #[inline]
        fn emit_discarded(
            self: @ComponentState<TContractState>, world: IWorldDispatcher, event: Discarded
        ) {
            let _ = self;
            let _ = world;
            let _ = event;
        }

        #[inline]
        fn emit_game_over(
            self: @ComponentState<TContractState>, world: IWorldDispatcher, event: GameOver
        ) {
            let _ = self;
            let _ = world;
            let _ = event;
        }

        #[inline]
        fn emit_scored_city(
            self: @ComponentState<TContractState>, world: IWorldDispatcher, event: ScoredCity
        ) {
            let _ = self;
            let _ = world;
            let _ = event;
        }

        #[inline]
        fn emit_scored_road(
            self: @ComponentState<TContractState>, world: IWorldDispatcher, event: ScoredRoad
        ) {
            let _ = self;
            let _ = world;
            let _ = event;
        }

        #[inline]
        fn emit_scored_forest(
            self: @ComponentState<TContractState>, world: IWorldDispatcher, event: ScoredForest
        ) {
            let _ = self;
            let _ = world;
            let _ = event;
        }

        #[inline]
        fn emit_scored_wonder(
            self: @ComponentState<TContractState>, world: IWorldDispatcher, event: ScoredWonder
        ) {
            let _ = self;
            let _ = world;
            let _ = event;
        }
    }
}
