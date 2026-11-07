import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { CAMPAIGNS, PlanType } from "@paved/game-core";
import { angledTileArt, appRenders } from "../../mocks/assets";
import { EndStars, endXp } from "./game-end";
import { DeckPresentation, FirstStonePanel, StoryCoach, StoryEnd } from "./story-panels";

/**
 * The panels of a Story level (#546, #593, #721): the opening that presents its deck (STORY-INTRO: the HUD's window over the board,
 * its tiles in the campaign's theme and draw order, its tip under the painted bulb, the best and the gold Start), a coach mark, the end
 * (the stars filling one by one, then the score with the points short of the next star). No star threshold is shown anywhere.
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
  return { campaign: c.name, campaignId: c.id, levelIndex: l.id, title: l.title, intro: l.intro, tip: l.tip, deck: deckOf(campaign, level), theme: c.theme, renders: appRenders, onStart: fn() };
};

const TUTORIAL_1 = levelArgs(0, 0);

/**
 * Tutorial level 1 opens on its deck (#593, #721), the first time: the level, its title and intro on the Tutorial's picture, its two
 * tiles dealt in turn, its tip under the bulb, "No best yet" and the gold Start; a tap anywhere, or Escape, starts too.
 */
export const Presentation: Story = { args: TUTORIAL_1 };

/** The same level presented again (the deck page's "Present the level again"): the device's best and its painted stars by Start. */
export const PresentationBest: Story = { args: { ...TUTORIAL_1, best: { score: 260, stars: 2 } } };

/** A level without a tip: no box between the tiles and the foot. */
export const PresentationNoTip: Story = { args: { ...TUTORIAL_1, tip: undefined } };

/** A Dark Forest level (#721): its tiles in the campaign's theme (Forest), whatever skins the player set, on the campaign's picture. */
export const PresentationForest: Story = { args: levelArgs(2, 0) };

/** The longest deck of a campaign (Open Country 12): 15 tiles after the starter, four a row in draw order, the tip, the best. */
export const PresentationLong: Story = { args: { ...levelArgs(1, 11), best: { score: 10200, stars: 2 } } };

/** The same under reduced motion: the window and every tile there at once. */
export const PresentationReduced: Story = { args: PresentationLong.args, parameters: { reducedMotion: "always" } };

/** A coach mark's tip (STORY-INTRO: the tip's bulb, on the HUD's frame); the board rings the control it names. */
export const Coach: Story = {
  args: TUTORIAL_1,
  render: () => <StoryCoach tip="Tap a lit cell next to the starter, then hold the check on the tile to place it. Roads must meet roads." onDismiss={fn()} />,
};

const END = { title: "First stone", onReplay: fn(), onNext: fn(), onLevels: fn() };
/** Tutorial 1's star shares (`storyStarFills` of the level page: 225 points for 2 stars, 321 for 3): never written on the screen. */
const fillsOf = (score: number) => [1, Math.min(1, score / 225), Math.min(1, Math.max(0, (score - 225) / 96))];
/** The XP a run's report gave: 10, the player at level 5 after it. */
const XP = endXp(1_480, 10);

/** The stars alone, the Story end's own (`EndStars`), filling one by one: 0 to 3, each with its sound and a buzz where the device has one. */
export const StarFills: Story = {
  args: TUTORIAL_1,
  render: () => (
    <div className="flex flex-col gap-6">
      {([0, 1, 2, 3] as const).map((n) => (
        // The label over the stars, their light clipped to the row as the end's window clips it: they fit at 320 px.
        <div key={n} className="flex flex-col items-center gap-2 overflow-hidden pt-6 pb-2">
          <span className="numeric text-sm text-muted-foreground">{n} {n === 1 ? "star" : "stars"}</span>
          <EndStars stars={n} />
        </div>
      ))}
    </div>
  ),
};

/** The same under reduced motion: the stars are there at once. */
export const StarFillsReduced: Story = { ...StarFills, parameters: { reducedMotion: "always" } };

/** Three stars the first time: the best, the XP the report gave, the level's chest to open here (END-CHEST); Retry, Levels and Next. */
export const EndThreeStars: Story = { args: TUTORIAL_1, render: () => <StoryEnd {...END} score={321} stars={3} fills={fillsOf(321)} xp={XP} chest={{ state: "won", rank: "basic" }} onOpenChest={fn()} /> };

/** Tutorial level 1 at 3 stars: First Stone's claim under the result (D-21). */
export const EndFirstStone: Story = {
  args: TUTORIAL_1,
  render: () => (
    <StoryEnd {...END} score={321} stars={3} fills={fillsOf(321)} xp={XP} chest={{ state: "won", rank: "basic" }} onOpenChest={fn()}>
      <FirstStonePanel line="Yours to claim." onClaim={fn()} />
    </StoryEnd>
  ),
};

/** First Stone claimed: its line says so, no Claim. */
export const EndFirstStoneClaimed: Story = {
  args: TUTORIAL_1,
  render: () => (
    <StoryEnd {...END} score={321} stars={3} fills={fillsOf(321)} chest={{ state: "already", rank: "basic" }}>
      <FirstStonePanel line="Claimed: First Stone is yours." />
    </StoryEnd>
  ),
};

/** Two stars, a new personal best (the one before it said), the points the third star was missing (never its threshold); no chest this time. */
export const EndTwoStars: Story = {
  args: TUTORIAL_1,
  render: () => <StoryEnd {...END} score={300} stars={2} fills={fillsOf(300)} toNextStar={21} previousBest={260} xp={XP} chest={{ state: "missed", rank: "basic" }} />,
};

/** A new best on a level played before: the trophy's figure in gold, "New best!" and the best before it. */
export const EndNewBest: Story = { args: TUTORIAL_1, render: () => <StoryEnd {...END} score={290} stars={2} fills={fillsOf(290)} toNextStar={31} previousBest={240} chest={{ state: "missed", rank: "basic" }} /> };

/** One star and the points short of the second; no XP gained (no new star). No Next (the last level): Retry, and Levels in gold. */
export const EndOneStarLast: Story = {
  args: TUTORIAL_1,
  render: () => <StoryEnd {...END} score={209} stars={1} fills={fillsOf(209)} toNextStar={16} previousBest={225} onNext={undefined} chest={{ state: "missed", rank: "epic" }} />,
};

/**
 * No star: "Level failed", Retry the gold answer, Next disabled in its place, the next level still locked (a finished level gives one
 * star today; the screen holds the case).
 */
export const EndNoStar: Story = {
  args: TUTORIAL_1,
  render: () => <StoryEnd {...END} score={0} stars={0} fills={[0, 0, 0]} toNextStar={225} onNext={undefined} nextLocked chest={{ state: "missed", rank: "basic" }} />,
};

/** A score above a best-known target: the player is told the target was a search's, and theirs is better. */
export const EndBeatsBestKnown: Story = {
  args: TUTORIAL_1,
  render: () => <StoryEnd {...END} title="A full road" bestKnown score={14450} stars={3} beatsTarget previousBest={12900} chest={{ state: "already", rank: "rare" }} />,
};

/** The end under reduced motion: the stars and the result at once. */
export const EndReduced: Story = { ...EndTwoStars, parameters: { reducedMotion: "always" } };

/** The chest won, its draw on its way: "Opening…". */
export const EndChestOpening: Story = { args: TUTORIAL_1, render: () => <StoryEnd {...END} score={321} stars={3} fills={fillsOf(321)} xp={XP} chest={{ state: "opening", rank: "basic" }} /> };
/** Its tile taken (Claim): the panel says it. */
export const EndChestKept: Story = { args: TUTORIAL_1, render: () => <StoryEnd {...END} score={321} stars={3} fills={fillsOf(321)} xp={XP} chest={{ state: "kept", rank: "basic", plan: 18 }} tileArt={angledTileArt} /> };
/** Three stars on a level whose chest was won before: no chest this run, the panel says it is already won. */
export const EndChestAlready: Story = { args: TUTORIAL_1, render: () => <StoryEnd {...END} score={321} stars={3} fills={fillsOf(321)} previousBest={321} chest={{ state: "already", rank: "basic" }} /> };
/** Under 3 stars: no chest this time, the panel says 3 stars win it. */
export const EndChestMissed: Story = { ...EndTwoStars };
/** The report or the chests' read on its way: the panel disabled over "Loading…". */
export const EndChestLoading: Story = { args: TUTORIAL_1, render: () => <StoryEnd {...END} score={321} stars={3} fills={fillsOf(321)} chest={{ state: "loading", rank: "basic" }} onOpenChest={fn()} /> };
/** The report failed: its message and Retry, which sends it again. */
export const EndChestError: Story = {
  args: TUTORIAL_1,
  render: () => <StoryEnd {...END} score={321} stars={3} fills={fillsOf(321)} chest={{ state: "error", rank: "basic", message: "The RPC did not answer.", onRetry: fn() }} onOpenChest={fn()} />,
};
/** The network serves no chests (no v2 writes): carved, nothing to open here. */
export const EndChestUnavailable: Story = { args: TUTORIAL_1, render: () => <StoryEnd {...END} score={321} stars={3} fills={fillsOf(321)} chest={{ state: "unavailable", rank: "basic" }} /> };
