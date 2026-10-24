import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { CAMPAIGNS, PlanType } from "@paved/game-core";
import { appRenders } from "../../mocks/assets";
import { PHONE_375, WIDE_1440 } from "../scenes/viewports";
import { Button } from "../ui/button";
import { CampaignCard, DeckPresentation, StarFill, StoryCoach, StoryEnd, type CampaignCardProps } from "./story-panels";

/**
 * The panels of a Story level (#546, #593, #721): the deck presentation that opens it (with the level's tip, its tiles in the
 * campaign's theme), a coach mark, the end (the stars filling one by one, then the score with the points short of the next
 * star). No star threshold is shown anywhere.
 */
const meta = { title: "Containers/Story panels", component: DeckPresentation, parameters: { layout: "padded" } } satisfies Meta<typeof DeckPresentation>;
export default meta;
type Story = StoryObj<typeof meta>;

const PLAN_IDS = Object.values(PlanType);
const deckOf = (campaign: number, level: number) => CAMPAIGNS[campaign]!.levels[level]!.deck.map((p) => PLAN_IDS.indexOf(p));

/** The presentation of level `level` (from 0) of campaign `campaign` (from 0), as the level page shows it. */
const levelArgs = (campaign: number, level: number) => {
  const c = CAMPAIGNS[campaign]!;
  const l = c.levels[level]!;
  return { campaign: c.name, levelIndex: l.id, title: l.title, intro: l.intro, tip: l.tip, deck: deckOf(campaign, level), theme: c.theme, renders: appRenders, onStart: fn() };
};

const TUTORIAL_1 = levelArgs(0, 0);

/** A Tutorial level opens on its deck (#593, #721): the title, the intro, its two tiles landing in turn, then its tip; a tap anywhere starts. */
export const Presentation: Story = { args: TUTORIAL_1 };

/** The intro with its tip at 375 x 812, the width the owner checks first. */
export const PresentationPhone: Story = { args: TUTORIAL_1, ...PHONE_375 };

/** The intro with its tip at 1440. */
export const PresentationWide: Story = { args: TUTORIAL_1, ...WIDE_1440 };

/** A Dark Forest level (#721): its tiles in the campaign's theme (Forest), whatever skins the player set; its tip under them. */
export const PresentationForestPhone: Story = { args: levelArgs(2, 0), ...PHONE_375 };

/** The same at 1440. */
export const PresentationForestWide: Story = { args: levelArgs(2, 0), ...WIDE_1440 };

/** The longest level of a campaign: 15 tiles after the starter, in draw order, the tip, and the player's best so far (no threshold). */
export const PresentationLong: Story = { args: { ...levelArgs(1, 11), best: { score: 10200, stars: 2 } } };

/** The same under reduced motion: every tile there at once. */
export const PresentationReduced: Story = { args: PresentationLong.args, parameters: { reducedMotion: "always" } };

/** A coach mark's tip; the board rings the control it names. */
export const Coach: Story = {
  args: TUTORIAL_1,
  render: () => <StoryCoach tip="Tap a lit cell next to the starter, then Place tile. Roads must meet roads." onDismiss={fn()} />,
};

const END = { title: "First stone", onReplay: fn(), onNext: fn(), onLevels: fn() };

/** The stars alone, filling one by one (#593): 0 to 3, each with its sound and a buzz where the device has one. */
export const StarFills: Story = {
  args: TUTORIAL_1,
  render: () => (
    <div className="flex flex-col gap-6">
      {([0, 1, 2, 3] as const).map((n) => (
        <div key={n} className="flex items-center gap-4">
          <span className="numeric w-16 text-sm text-muted-foreground">{n} {n === 1 ? "star" : "stars"}</span>
          <StarFill stars={n} />
        </div>
      ))}
    </div>
  ),
};

/** The same under reduced motion: the stars are there at once. */
export const StarFillsReduced: Story = { ...StarFills, parameters: { reducedMotion: "always" } };

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

/** Two stars, a new personal best, and how many points the third star was missing (its threshold is not shown). */
export const EndTwoStars: Story = { args: TUTORIAL_1, render: () => <StoryEnd {...END} score={225} stars={2} toNextStar={96} previousBest={209} /> };

/** One star and the points short of the second. No Next (the last level). */
export const EndOneStarLast: Story = { args: TUTORIAL_1, render: () => <StoryEnd {...END} score={209} stars={1} toNextStar={16} onNext={undefined} /> };

/** No star: the end screen of a run that earned none (a level always gives one when finished; the screen still holds it). */
export const EndNoStar: Story = { args: TUTORIAL_1, render: () => <StoryEnd {...END} score={0} stars={0} toNextStar={225} /> };

/** A score above a best-known target: the player is told the target was a search's, and theirs is better. */
export const EndBeatsBestKnown: Story = {
  args: TUTORIAL_1,
  render: () => <StoryEnd {...END} title="A full road" bestKnown score={14450} stars={3} beatsTarget previousBest={12900} />,
};

/** The end under reduced motion: the stars and the result at once. */
export const EndReduced: Story = { ...EndTwoStars, parameters: { reducedMotion: "always" } };

const plansOf = (index: number) => [...new Set(CAMPAIGNS[index]!.levels.flatMap((l) => l.deck))].map((p) => PLAN_IDS.indexOf(p));
const CARD: CampaignCardProps = {
  id: 2,
  name: "Open Country",
  summary: CAMPAIGNS[1]!.summary,
  levels: 12,
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

/** A campaign card (#592), open: its background (the build's picture of a whole board in its theme, #721), its levels and stars. */
export const CampaignOpen: Story = { args: TUTORIAL_1, render: card({ stars: 7, selected: true }) };

/** Locked: the background under a blur, a lock, and the stars still to earn. */
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

/** Dark Forest (#721, campaign 3, the Forest theme): its board in Forest, open. Its plan (name, summary) is #721 PR 1's. */
const DARK_FOREST: Partial<CampaignCardProps> = { id: 3, name: "Dark Forest", summary: "Twelve games in the deep woods, drawn in the Forest tiles: 10 to 16 tiles, chapels hidden among the trees.", levels: 12, theme: 1 };

/** The Tutorial's card: its puzzle picture (#721), a small board with one tile lifted off its slot. */
export const CampaignTutorial: Story = { args: TUTORIAL_1, render: card({ id: 1, name: "Tutorial", summary: CAMPAIGNS[0]!.summary, stars: 12, plans: plansOf(0), selected: true }) };

/** Dark Forest's card, open: a whole board in the Forest theme. */
export const CampaignDarkForest: Story = { args: TUTORIAL_1, render: card({ ...DARK_FOREST, stars: 4 }) };

/**
 * The three backgrounds side by side as `/story` lays them out from tablet up (one a row on a phone): the Tutorial open, Open
 * Country unlocking (the lock turns, the blur lifts), Dark Forest locked. The Viewport control reframes it (375 and 1440 px
 * for the captures).
 */
export const CampaignBackgrounds: Story = {
  args: TUTORIAL_1,
  parameters: { layout: "fullscreen" },
  render: () => (
    <div className="mx-auto grid w-full max-w-md grid-cols-1 gap-4 p-4 tablet:max-w-3xl tablet:grid-cols-2 desktop:max-w-5xl desktop:grid-cols-3">
      <CampaignCard {...CARD} id={1} name="Tutorial" summary={CAMPAIGNS[0]!.summary} stars={30} plans={plansOf(0)} selected />
      <CampaignCard {...CARD} status="unlocking" />
      <CampaignCard {...CARD} {...DARK_FOREST} status="locked" missing={14} />
    </div>
  ),
};

