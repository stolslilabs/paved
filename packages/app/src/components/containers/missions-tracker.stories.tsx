import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { MOCK_NOW } from "../../mocks/clock";
import { TRACKER } from "../../mocks/missions-tracker";
import { PHONE_375, WIDE_1440 } from "../scenes/viewports";
import { MissionsTracker } from "./missions-tracker";

/**
 * MISSIONS-TRACKER (#978): the home's preview of the three missions closest to done, the Tutorial's step first, in place of the
 * Missions button. A line per mission (its icon and title, a thin bar and its count, or Claim for a Tutorial step done and not
 * claimed), the Missions count on the corner; "All done" with the day's reset when nothing is left. One story per state, on the
 * Missions page's mocks (`mocks/missions-tracker.ts`); the home's `Overlays*Tracker*` stories show it in place.
 */
const meta = {
  title: "Containers/MissionsTracker",
  component: MissionsTracker,
  args: { state: TRACKER.midWay, badge: 3, now: MOCK_NOW, onOpen: fn() },
  decorators: [(Story) => <div className="p-4"><Story /></div>],
} satisfies Meta<typeof MissionsTracker>;
export default meta;
type Story = StoryObj<typeof meta>;

/** A new player: Builder (the Tutorial's step 1), then Daily Run and Public Works, nothing counted. */
export const NewPlayer: Story = { args: { state: TRACKER.newPlayer, badge: 0 } };
/** Mid-way: Raider to claim, Victor open, Weekly Builder 22 / 30. */
export const MidWay: Story = {};
/** The Tutorial claimed whole: the three quests the furthest along, Weekly Points in compact figures. */
export const QuestsOnly: Story = { args: { state: TRACKER.questsOnly, badge: 0 } };
/** Three steps done, none claimed: three Claims. */
export const ThreeToClaim: Story = { args: { state: TRACKER.threeToClaim } };
/** One mission left: one line. */
export const OneLeft: Story = { args: { state: TRACKER.oneLeft, badge: 0 } };
/** Nothing left: "All done", the countdown to the day's reset. */
export const AllDone: Story = { args: { state: TRACKER.allDone, badge: 0 } };
/** A guest, or the quests not read: one line to the Missions page. */
export const Guest: Story = { args: { state: TRACKER.none, badge: 0 } };
/** The lines not read yet: a skeleton of three lines, the panel's size. */
export const Loading: Story = { args: { state: null } };
/** A three-digit count on the corner. */
export const BigCount: Story = { args: { badge: 128 } };
/** Reduced motion: the bars are drawn at their fill, no transition. */
export const ReducedMotion: Story = { parameters: { reducedMotion: "always" } };
export const MidWayPhone375: Story = { ...PHONE_375 };
export const MidWayWide1440: Story = { ...WIDE_1440 };
export const AllDonePhone375: Story = { ...PHONE_375, args: { state: TRACKER.allDone, badge: 0 } };
