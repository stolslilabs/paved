import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { appRenders } from "../../mocks/assets";
import { FAIR, FAIR_CARD } from "../../mocks/fair";
import { PUZZLE_CARD } from "../../mocks/puzzle";
import { PLAY } from "../../mocks/scenes";
import { FairScene } from "./fair-scene";
import { PlayScene } from "./play-scene";

/**
 * The Fair (the weekly individual event, the design proposal of 2026-11-09) in Play's drawer: its card in Limited, and its views in
 * the modes' place (the week, the open try's draft, the live ranking), "Fair" and the Cobbles on the header.
 */
const meta = {
  title: "Scenes/Fair",
  component: PlayScene,
  args: { onBack: fn(), onChallenge: fn(), onResume: fn(), onTraining: fn(), onStory: fn(), onAttack: fn(), onPuzzle: fn(), onFair: fn(), onFairBack: fn() },
} satisfies Meta<typeof PlayScene>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The Fair's card (Limited, over the Puzzle's): the day, the stall, the tries left today. */
export const Card: Story = { args: { ...PLAY.connected, ...PUZZLE_CARD.notPlayed, ...FAIR_CARD.week } };
export const CardLastTry: Story = { args: { ...PLAY.connected, ...PUZZLE_CARD.notPlayed, ...FAIR_CARD.lastTry } };
export const CardNoTryLeft: Story = { args: { ...PLAY.connected, ...PUZZLE_CARD.notPlayed, ...FAIR_CARD.noTryLeft } };
/** A draft open: its pick, a tap resumes it. */
export const CardDrafting: Story = { args: { ...PLAY.connected, ...PUZZLE_CARD.notPlayed, ...FAIR_CARD.drafting } };
/** A game in play: its score, a tap resumes it. */
export const CardPlaying: Story = { args: { ...PLAY.connected, ...PUZZLE_CARD.notPlayed, ...FAIR_CARD.playing } };
export const CardGuest: Story = { args: { ...PLAY.connected, ...PUZZLE_CARD.notPlayed, ...FAIR_CARD.guest } };

/** The Fair's view in the drawer: a view of its own in the modes' place. */
const fair = (state: keyof typeof FAIR, fairTitle?: string): Story => ({
  args: { ...PLAY.connected, fairTitle, fair: <FairScene renders={appRenders} onPlay={fn()} onPick={fn()} onAbandon={fn()} onClaim={fn()} onRanking={fn()} onOpenPlayer={fn()} onRetry={fn()} {...FAIR[state]} /> },
});
/** A first visit: the stall, three tries, the rules and the tiers. */
export const First: Story = fair("first");
/** Thursday: a best of 4,932, 172nd, two tries left today. */
export const Week: Story = fair("week");
export const Starting: Story = fair("starting");
/** A draft still open: Resume draft. */
export const Drafting: Story = fair("drafting");
/** A game still open: Resume game. */
export const Playing: Story = fair("playing");
export const NoTryLeft: Story = fair("noTryLeft");
/** A best under 1,000 points: it does not count yet. */
export const UnderFloor: Story = fair("underFloor");
export const Guest: Story = fair("guest");
/** Monday: last week's tier, Claim, the champion with their deck. */
export const Result: Story = fair("result");
export const Claiming: Story = fair("claiming");
/** Claimed; the champion's name the longest (WRAP360). */
export const Claimed: Story = fair("claimed");
export const NotCounted: Story = fair("notCounted");
/** The draft, pick 9: the offer, the next one, the deck so far. */
export const Draft: Story = fair("draft", "Draft");
/** The first offer: no deck yet. */
export const DraftFirst: Story = fair("draftFirst", "Draft");
/** A mythic on the table: two picks, the next offer at stake. */
export const DraftMythic: Story = fair("draftMythic", "Draft");
/** The last offer: no next one, no mythic. */
export const DraftLast: Story = fair("draftLast", "Draft");
export const DraftLoading: Story = fair("draftLoading", "Draft");
/** The week so far: the viewer's place, each tier's bar, the first places. */
export const Ranking: Story = fair("ranking", "Ranking");
export const RankingEmpty: Story = fair("rankingEmpty", "Ranking");
export const RankingLoading: Story = fair("rankingLoading", "Ranking");
export const Loading: Story = fair("loading");
export const Failed: Story = fair("failed");
