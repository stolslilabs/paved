import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { MISSIONS } from "../../mocks/scenes";
import { MissionsScene } from "./missions-scene";

/**
 * Missions (`/missions`, #832): one page, today only. The selected mission's card at the top, then the Limited icons (a Daily and
 * a Weekly row, each with its reset's countdown and its bonus as a small last tile), then the Lifetime icons. A tap on an icon
 * updates the card. Cobbles are the only reward. One story per state; the viewport is the toolbar's (VP).
 */
const meta = {
  title: "Scenes/Missions",
  component: MissionsScene,
  args: { onClaimQuest: fn(), onClaimAchievement: fn(), onClaimBonus: fn(), onConnect: fn(), onRetry: fn(), onBack: fn(), onNavigate: fn() },
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

/** The three weeklies done: the week's bonus (60 Cobbles, no free game) to claim, selected. */
export const WeekBonus: Story = { args: MISSIONS.weekBonus };

/** Everything done and claimed, the week's bonus too (the day has none since #869): the first mission is selected. */
export const AllDone: Story = { args: MISSIONS.allDone };

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
