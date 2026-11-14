import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { originalTileArt, SOURCE_ASSETS } from "../../mocks/assets";
import { CONQUEST, CONQUEST_CARD } from "../../mocks/conquest";
import { PUZZLE_CARD } from "../../mocks/puzzle";
import { PLAY } from "../../mocks/scenes";
import { ConquestScene } from "./conquest-scene";
import { PlayScene } from "./play-scene";

/**
 * The Conquest (`/play/conquest`, Play's Limited mode, the season's finale): its card in Play, then its views in Play's drawer,
 * "Conquest" and the Cobbles on the header: its page through the phases, the map, the knowledge tree, the ranking, the members. One
 * story per state; the Viewport control reframes it.
 */
const meta = {
  title: "Scenes/Conquest",
  component: PlayScene,
  args: { onBack: fn(), onChallenge: fn(), onResume: fn(), onTraining: fn(), onStory: fn(), onAttack: fn(), onPuzzle: fn(), onConquest: fn(), onConquestBack: fn() },
} satisfies Meta<typeof PlayScene>;
export default meta;
type Story = StoryObj<typeof meta>;

const tileArt = originalTileArt(SOURCE_ASSETS);

/** The Conquest's card (Limited, the first): the phase and its day, the allegiance's rank, the day's orders, the phase's time left. */
export const Card: Story = { args: { ...PLAY.connected, ...PUZZLE_CARD.notPlayed, ...CONQUEST_CARD.playing } };
export const CardRegistration: Story = { args: { ...PLAY.connected, ...PUZZLE_CARD.notPlayed, ...CONQUEST_CARD.registration } };
export const CardResults: Story = { args: { ...PLAY.connected, ...PUZZLE_CARD.notPlayed, ...CONQUEST_CARD.results } };
export const CardNoAllegiance: Story = { args: { ...PLAY.connected, ...PUZZLE_CARD.notPlayed, ...CONQUEST_CARD.noAllegiance } };

const view = (state: keyof typeof CONQUEST, conquestTitle?: string): Story => ({
  args: {
    ...PLAY.connected,
    conquestTitle,
    conquest: <ConquestScene {...CONQUEST[state]} tileArt={tileArt} onRetry={fn()} onRegister={fn()} onOffer={fn()} onExplore={fn()} onRequest={fn()} onGive={fn()} onResearch={fn()} onClaim={fn()} onZone={fn()} onCell={fn()} onView={fn()} onResult={fn()} onAllegiance={fn()} onOpenPlayer={fn()} />,
  },
});

/** The registration: the allegiance, Register for an Officer, the allegiances registered so far. */
export const Registration = view("registration");
/** Awakening, day 9, as an Officer: the allegiance's rank, the daily ritual, the open requests, the last closings, Foundation's result. */
export const Hub = view("hub");
/** The Offerings just made: what they brought, said at the top. */
export const Offered = view("offered");
/** A rest day: nobody builds or explores, the phase's result is in. */
export const Rest = view("rest");
/** The results: the final rank, the crest, the Cobbles. */
export const Results = view("results");
/** A player with no allegiance: the way to one. */
export const NoAllegiance = view("noAllegiance");
export const Loading = view("loading");
export const Failed = view("failed");
/** The map: the world's checkerboard and the allegiance's province. */
export const Map = view("map", "Map");
/** A cell beside the allegiance's tiles picked by an Officer: the plans that fit, by the members who hold one. */
export const Asking = view("asking", "Map");
export const Tree = view("tree", "Knowledge tree");
/** The allegiances by points: a tab of the foot per phase, and the final one. */
export const Ranking = view("ranking", "Ranking");
/** The allegiance's members: a tab of the foot per figure they are ranked by. */
export const Members = view("members", "Our members");
/** The open requests: what each asks, who holds one, then Give. */
export const Requests = view("requests", "Requests");
export const Rules = view("rules", "Goals and rules");
/** A phase is over: the emblem under its medal, the podium, the viewer's part, the Cobbles before Claim. */
export const PhaseOver = view("phaseOver", "Result");
/** The Conquest is over: the crest, each phase's points and place, the Cobbles before Claim. */
export const ConquestOver = view("conquestOver", "Result");
