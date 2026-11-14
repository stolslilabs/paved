import type { PlaySceneProps } from "../components/scenes/play-scene";
import { COLOSSUS_CARD } from "./colossus";
import { EXPEDITION_CARD } from "./expedition";
import { MASTERPIECE_CARD } from "./masterpiece";
import { PUZZLE_CARD } from "./puzzle";
import { PLAY } from "./scenes";
import { TOURNAMENT_CARD } from "./tournament";

type Data<P> = { [K in keyof P as K extends `on${string}` ? never : K]: P[K] };

/**
 * EVENT-ICONS-FIX (#1173): Play with the four events at once, Expedition over Masterpiece and Tournament over Colossus, so each event
 * icon that breaks out of its card's top edge sits under the previous card's countdown tab (the story `EventsTogether` and the e2e
 * `event-icons`). The week's clock is the Expedition's.
 */
export const PLAY_EVENTS = {
  ...PLAY.connected,
  ...PUZZLE_CARD.notPlayed,
  ...TOURNAMENT_CARD.duel,
  ...COLOSSUS_CARD.week,
  ...MASTERPIECE_CARD.waiting,
  ...EXPEDITION_CARD.playing,
} satisfies Data<PlaySceneProps>;
