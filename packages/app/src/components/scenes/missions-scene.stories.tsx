import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { MISSIONS } from "../../mocks/scenes";
import { MissionsScene } from "./missions-scene";

/**
 * Missions (`/missions`, #832): one page, today only. The selected mission's card at the top, then the Limited icons (a Daily and
 * a Weekly row, each with its reset's countdown and its period's milestones graph above its icons: an edge per quest done and a
 * gift node per reward, the day's #869, the week's #976, larger), then the Lifetime icons. A tap on an icon updates the card.
 * Cobbles are the only reward. One story per state; the viewport is the toolbar's (VP).
 */
const meta = {
  title: "Scenes/Missions",
  component: MissionsScene,
  args: { onClaimTutorial: fn(), onGo: fn(), onClaimQuest: fn(), onClaimMilestone: fn(), onClaimWeeklyMilestone: fn(), onClaimAchievement: fn(), onConnect: fn(), onRetry: fn(), onBack: fn(), onNavigate: fn() },
} satisfies Meta<typeof MissionsScene>;
export default meta;
type Story = StoryObj<typeof meta>;

/** On arrival: the first mission not done (Public Works) is selected; the dailies show no Cobbles (#869), Settler II's glow in its tile. */
export const Daily: Story = { args: MISSIONS.daily };

/** A lifetime mission selected: Settler III, 21 of 50. */
export const Lifetime: Story = { args: MISSIONS.lifetime };

/** Settler II selected: done, its 20 Cobbles to claim from the card. */
export const Claim: Story = { args: MISSIONS.claim };

/** Settler II's claim on its way. */
export const Claiming: Story = { args: MISSIONS.claiming };

/** Everything done and claimed, the day's milestones and the week's (#869, #976): the first mission is selected. */
export const AllDone: Story = { args: MISSIONS.allDone };

/** The day's graph (#869): no daily done, both reward nodes ahead (3 done: +10 Cobbles, 5 done: +15). */
export const MilestonesNone: Story = { args: MISSIONS.milestonesNone };

/** No reward: two dailies done, two edges lit, the first reward node one daily away. */
export const MilestonesTwo: Story = { args: MISSIONS.milestonesTwo };

/** A reward: three dailies done, the first gift lit and shaking, its 10 Cobbles to claim with a tap on it. */
export const MilestoneThree: Story = { args: MISSIONS.milestoneThree };

/** The first milestone's claim on its way. */
export const MilestoneClaiming: Story = { args: MISSIONS.milestoneClaiming };

/** The first milestone's claim landed: its gift opening, its 10 Cobbles shown above it (held). */
export const MilestoneOpening: Story = { args: MISSIONS.milestoneOpening };

/** Claimed: three done, the first gift open with its check; the second ahead. */
export const MilestoneThreeClaimed: Story = { args: MISSIONS.milestoneThreeClaimed };

/** The five dailies done, the first milestone claimed: the second's 15 Cobbles to claim. */
export const MilestoneFive: Story = { args: MISSIONS.milestoneFive };

/** All done: the five done, both reward nodes claimed, 25 Cobbles today. */
export const MilestonesAllClaimed: Story = { args: MISSIONS.milestonesAllClaimed };

/**
 * The five weeklies (#976): none done, the two PvP ones beside the three Challenge ones, none with Cobbles of its own; the week's
 * bar above them, both gifts ahead (3 done: +50 Cobbles, 5 done: +100). Weekly Forester's card says the week pays at its milestones.
 */
export const WeekNone: Story = { args: MISSIONS.weekNone };

/** Three of the five weeklies done (#976): the week's first gift lit and shaking, its 50 Cobbles to claim with a tap on it. */
export const WeekThree: Story = { args: MISSIONS.weekThree };

/** The week's first gift's claim on its way: it shakes fast. */
export const WeekClaiming: Story = { args: MISSIONS.weekClaiming };

/** The week's first gift's claim landed: it opens, its 50 Cobbles shown above it (held). */
export const WeekOpening: Story = { args: MISSIONS.weekOpening };

/** A gift claimed (#976): three weeklies done, the week's first gift open with its check, the second ahead. */
export const WeekClaimed: Story = { args: MISSIONS.weekClaimed };

/** The five weeklies done (#976): both gifts of the week to claim, 50 and 100 Cobbles. */
export const WeekFive: Story = { args: MISSIONS.weekFive };

/** The five weeklies done, both gifts claimed: 150 Cobbles this week. */
export const WeekAllClaimed: Story = { args: MISSIONS.weekAllClaimed };

/** Weekly Raider selected (#976): 4 of 10 attacks settled this week. */
export const WeeklyRaider: Story = { args: MISSIONS.weeklyRaider };

/** Weekly Stars selected (#976): 7 of 15 stars this week. */
export const WeeklyStars: Story = { args: MISSIONS.weeklyStars };

/** Weekly Stars done (#976): 15 of 15 stars, nothing to claim from its card. */
export const WeeklyStarsDone: Story = { args: MISSIONS.weeklyStarsDone };

/** The Tutorial (#977), a new player: step 1 (Builder) open and selected, with Go; steps 2 to 8 locked, their icons dimmed, a lock and their number. */
export const TutorialNewPlayer: Story = { args: MISSIONS.tutorialNew };

/** Three steps done and claimed: "Tutorial 3/8", Victor open and selected, its Go to the PvP. */
export const TutorialThreeDone: Story = { args: MISSIONS.tutorialThree };

/** A step done and not claimed: Challenger's 10 Cobbles to claim from its card, its tile lit; Raider open. */
export const TutorialStepToClaim: Story = { args: MISSIONS.tutorialToClaim };

/** Challenger's claim on its way. */
export const TutorialClaiming: Story = { args: MISSIONS.tutorialClaiming };

/** A locked step selected: Treasure, "Unlocks after Victor"; the chest opened early counts already. */
export const TutorialLocked: Story = { args: MISSIONS.tutorialLocked };

/** Regular open: its Go brings the Daily row out below the card, on this page. */
export const TutorialRegular: Story = { args: MISSIONS.tutorialRegular };

/** Rising open at level 2 of 3: no Go, the card says how XP comes. */
export const TutorialRising: Story = { args: MISSIONS.tutorialRising };

/** Every step done, Rising's 50 Cobbles still to claim: the section stays until then. */
export const TutorialLastToClaim: Story = { args: MISSIONS.tutorialLastToClaim };

/** Every step claimed: the Tutorial's section is gone (#977 open point 5). */
export const TutorialAllClaimed: Story = { args: MISSIONS.tutorialAllClaimed };

/** Nothing counted yet: the limited missions to do, the lifetime ones locked. */
export const NewPlayer: Story = { args: MISSIONS.newPlayer };

/** Four minutes before 00:00 UTC: the Daily countdown is amber. */
export const EndingSoon: Story = { args: MISSIONS.endingSoon };

/** No limited mission live today. */
export const NoQuest: Story = { args: MISSIONS.noQuest };

/** The Cobbles ledger unreadable: the missions without rewards. */
export const NoRewards: Story = { args: MISSIONS.noRewards };

/** P9: no wallet to sign yet (P6): the rewards show, the claim asks to connect. */
export const ReadOnly: Story = { args: MISSIONS.readOnly };

/** No wallet: Connect. */
export const Guest: Story = { args: MISSIONS.guest };

/** The missions on their way. */
export const Loading: Story = { args: MISSIONS.loading };

/** The read failed: the one error component, with Retry and Copy (P-67). */
export const Failed: Story = { args: MISSIONS.failed };
