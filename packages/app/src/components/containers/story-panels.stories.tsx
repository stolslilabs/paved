import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { Button } from "../ui/button";
import { StoryCoach, StoryEnd, StoryIntro } from "./story-panels";

/** The panels of a Story level (#546), drawn under the board's header: the intro, a coach mark's tip, the end. */
const meta = { title: "Containers/Story panels", component: StoryIntro, parameters: { layout: "padded" } } satisfies Meta<typeof StoryIntro>;
export default meta;
type Story = StoryObj<typeof meta>;

const TUTORIAL_1 = {
  campaign: "Tutorial",
  levelIndex: 1,
  title: "First stone",
  intro:
    "Tap a cell next to the board to place the tile in your hand. Roads must meet roads. A road scores once both of its ends are closed, and a crossroads closes every road that reaches it.",
  tiles: 3,
  target: 321,
  twoStars: 225,
  bestKnown: false,
  onStart: fn(),
};

/** A Tutorial level's intro: an exact target. */
export const Intro: Story = { args: TUTORIAL_1 };

/** A long level's intro: its target is the best known, said so; the player's best so far. */
export const IntroBestKnown: Story = {
  args: {
    ...TUTORIAL_1,
    campaign: "Open Country",
    levelIndex: 11,
    title: "A full road",
    intro: "This is a full game: 38 tiles, like a Challenge, but you know the deck. Use the deck sheet, and go for the best score there is.",
    tiles: 38,
    target: 14374,
    twoStars: 10062,
    bestKnown: true,
    best: { score: 10200, stars: 2 },
  },
};

/** A coach mark's tip; the board rings the control it names. */
export const Coach: Story = {
  args: TUTORIAL_1,
  render: () => <StoryCoach tip="Tap a lit cell next to the starter, then Place tile. Roads must meet roads." onDismiss={fn()} />,
};

const END = { title: "First stone", target: 321, twoStars: 225, bestKnown: false, onReplay: fn(), onNext: fn(), onLevels: fn() };

/** Three stars, with First Stone's claim under the result (Tutorial level 1). */
export const EndThreeStars: Story = {
  args: TUTORIAL_1,
  render: () => (
    <StoryEnd {...END} score={321} stars={3}>
      <div className="flex flex-wrap items-center gap-2 rounded-lg bg-secondary/50 p-2">
        <span className="text-muted-foreground">Connect a wallet to claim the mission First Stone.</span>
        <Button size="sm" variant="secondary">
          Connect
        </Button>
      </div>
    </StoryEnd>
  ),
};

/** Two stars, a new personal best. */
export const EndTwoStars: Story = { args: TUTORIAL_1, render: () => <StoryEnd {...END} score={225} stars={2} previousBest={209} /> };

/** One star: finished. No Next while the next level is locked (it is not: finishing opens it; here the last level). */
export const EndOneStarLast: Story = { args: TUTORIAL_1, render: () => <StoryEnd {...END} score={0} stars={1} onNext={undefined} /> };

/** A score above a best-known target: the player is told the target was a search's, and theirs is better. */
export const EndBeatsBestKnown: Story = {
  args: TUTORIAL_1,
  render: () => <StoryEnd {...END} title="A full road" target={14374} twoStars={10062} bestKnown score={14250} stars={3} beatsTarget previousBest={12900} />,
};
