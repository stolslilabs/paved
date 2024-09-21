// Dojo imports

use dojo::world::IWorldDispatcher;
use dojo::world::IWorldDispatcherTrait;

// Internal imports

use paved::events::{Built, Discarded, GameOver, ScoredCity, ScoredRoad, ScoredForest, ScoredWonder};

// Interface

#[starknet::interface]
trait EmitterTrait<TContractState> {
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
mod EmitterComponent {
    // Dojo imports

    use dojo::world;
    use dojo::world::IWorldDispatcher;
    use dojo::world::IWorldDispatcherTrait;
    use dojo::world::IWorldProvider;

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
    enum Event {
        Built: Built,
        Discarded: Discarded,
        GameOver: GameOver,
        ScoredCity: ScoredCity,
        ScoredRoad: ScoredRoad,
        ScoredForest: ScoredForest,
        ScoredWonder: ScoredWonder,
    }

    #[embeddable_as(EmitterImpl)]
    impl Emitter<
        TContractState, +HasComponent<TContractState>
    > of EmitterTrait<ComponentState<TContractState>> {
        #[inline]
        fn emit_built(
            self: @ComponentState<TContractState>, world: IWorldDispatcher, event: Built
        ) {
            emit!(world, (Event::Built(event)));
        }

        #[inline]
        fn emit_discarded(
            self: @ComponentState<TContractState>, world: IWorldDispatcher, event: Discarded
        ) {
            emit!(world, (Event::Discarded(event)));
        }

        #[inline]
        fn emit_game_over(
            self: @ComponentState<TContractState>, world: IWorldDispatcher, event: GameOver
        ) {
            emit!(world, (Event::GameOver(event)));
        }

        #[inline]
        fn emit_scored_city(
            self: @ComponentState<TContractState>, world: IWorldDispatcher, event: ScoredCity
        ) {
            emit!(world, (Event::ScoredCity(event)));
        }

        #[inline]
        fn emit_scored_road(
            self: @ComponentState<TContractState>, world: IWorldDispatcher, event: ScoredRoad
        ) {
            emit!(world, (Event::ScoredRoad(event)));
        }

        #[inline]
        fn emit_scored_forest(
            self: @ComponentState<TContractState>, world: IWorldDispatcher, event: ScoredForest
        ) {
            emit!(world, (Event::ScoredForest(event)));
        }

        #[inline]
        fn emit_scored_wonder(
            self: @ComponentState<TContractState>, world: IWorldDispatcher, event: ScoredWonder
        ) {
            emit!(world, (Event::ScoredWonder(event)));
        }
    }
}
