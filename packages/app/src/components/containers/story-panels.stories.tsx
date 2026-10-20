import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { CAMPAIGNS, PlanType } from "@paved/game-core";
import { appRenders } from "../../mocks/assets";
import { Button } from "../ui/button";
import { CampaignCard, StoryCoach, StoryEnd, StoryIntro, type CampaignCardProps } from "./story-panels";

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

const PLAN_IDS = Object.values(PlanType);
const plansOf = (index: number) => [...new Set(CAMPAIGNS[index]!.levels.flatMap((l) => l.deck))].map((p) => PLAN_IDS.indexOf(p));
const CARD: CampaignCardProps = {
  id: 2,
  name: "Open Country",
  summary: CAMPAIGNS[1]!.summary,
  levels: 11,
  stars: 0,
  status: "open",
  plans: plansOf(1),
  renders: appRenders,
  onSelect: fn(),
};
const card = (props: Partial<CampaignCardProps>) => () => (
  <div className="w-full max-w-md">
    <CampaignCard {...CARD} {...props} />
  </div>
);

/** A campaign card (#592), open: its own tiles behind (build-time renders), its levels and stars. */
export const CampaignOpen: Story = { args: TUTORIAL_1, render: card({ stars: 7, selected: true }) };

/** Locked: the tiles under a blur, a lock, and the stars still to earn. */
export const CampaignLocked: Story = { args: TUTORIAL_1, render: card({ status: "locked", missing: 9 }) };

/** Just unlocked (the first visit since): the lock turns open and goes, the blur lifts, once. */
export const CampaignJustUnlocked: Story = { args: TUTORIAL_1, render: card({ status: "unlocking" }) };

/** The same under reduced motion: open at once, no animation. */
export const CampaignJustUnlockedReduced: Story = { args: TUTORIAL_1, parameters: { reducedMotion: "always" }, render: card({ status: "unlocking" }) };

/** Every level finished. */
export const CampaignComplete: Story = {
  args: TUTORIAL_1,
  render: card({ id: 1, name: "Tutorial", summary: CAMPAIGNS[0]!.summary, stars: 33, status: "complete", plans: plansOf(0) }),
};
