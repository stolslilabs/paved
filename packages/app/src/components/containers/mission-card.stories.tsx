import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { MissionCard, type Mission } from "./mission-card";

const PUBLIC_WORKS: Mission = {
  key: "quest:6",
  kind: "daily",
  title: "Public Works",
  description: "Score roads and cities in a day: the middle target of the three that rotate.",
  icon: "castle",
  state: "progress",
  progress: [{ unit: "roads and cities scored", count: 4, total: 8 }],
  completedAt: null,
  reward: { cobbles: 10, claimed: false },
};
const DAILY_RUN: Mission = {
  ...PUBLIC_WORKS,
  key: "quest:1",
  title: "Daily Run",
  description: "Finish today's Challenge.",
  icon: "flag-checkered",
  state: "claimable",
  progress: [{ unit: "Challenge games finished", count: 1, total: 1 }],
  completedAt: 1_792_000_000,
  reward: { cobbles: 5, claimed: false },
};

/** The selected mission at the top of the Missions page (#832): Daily, Weekly or Lifetime, its progress, Cobbles and action. */
const meta = { title: "Containers/MissionCard", component: MissionCard, args: { mission: PUBLIC_WORKS, onClaim: fn() } } satisfies Meta<typeof MissionCard>;
export default meta;
type Story = StoryObj<typeof meta>;

/** In progress: the bar, "4 / 8", and a short line where the Claim will be. */
export const InProgress: Story = {};
/** Done, its Cobbles to claim. */
export const Claim: Story = { args: { mission: DAILY_RUN } };
/** The claim on its way. */
export const Claiming: Story = { args: { mission: { ...DAILY_RUN, reward: { cobbles: 5, claimed: false, claiming: true } } } };
/** Claimed. */
export const Claimed: Story = { args: { mission: { ...DAILY_RUN, state: "done", reward: { cobbles: 5, claimed: true } } } };
/** No wallet to sign yet: "Connect to claim". */
export const ReadOnly: Story = { args: { mission: DAILY_RUN, canClaim: false } };
/** A lifetime mission locked. */
export const Locked: Story = {
  args: { mission: { ...PUBLIC_WORKS, key: "achievement:7", kind: "lifetime", title: "Pilgrimage", description: "Score a wonder.", icon: "landmark-dome", state: "locked", progress: [{ unit: "wonders scored", count: 0, total: 1 }], reward: { cobbles: 30, claimed: false } } },
};
/** The weekly bonus: every weekly done, its Cobbles to claim. */
export const WeeklyBonus: Story = {
  args: { mission: { ...DAILY_RUN, key: "bonus:weekly", kind: "weekly", bonus: true, title: "Weekly bonus", description: "Finish every weekly mission of the week for bonus Cobbles.", icon: "gift", progress: [{ unit: "weekly missions done", count: 3, total: 3 }], completedAt: null, reward: { cobbles: 60, claimed: false } } },
};
