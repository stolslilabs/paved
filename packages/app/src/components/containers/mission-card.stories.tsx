import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { LONG_LABEL, LONG_SENTENCE, LONG_WORD } from "../../mocks/stress";
import { PHONE_320, PHONE_375 } from "../scenes/viewports";
import { MissionCard, type Mission } from "./mission-card";

const PUBLIC_WORKS: Mission = {
  key: "quest:6",
  kind: "daily",
  title: "Public Works",
  description: "Score roads and cities in a day: the middle of three rotating targets.",
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

// The card's fixed height (#975): the title on one line, two lines of description kept whatever its length, an ellipsis and
// "more" beyond them. Each state at 320 and 375 px.

const SHORT: Mission = { ...DAILY_RUN, state: "progress", progress: [{ unit: "Challenge games finished", count: 0, total: 1 }], completedAt: null };
const CUT: Mission = { ...PUBLIC_WORKS, key: "quest:cut", description: LONG_SENTENCE };
const NONE: Mission = { ...PUBLIC_WORKS, key: "quest:99", title: "Mission #99", description: "", icon: "scroll" };

const unfold: Story["play"] = async ({ canvasElement }) => {
  const more = within(canvasElement).getByRole("button", { name: "more" });
  await userEvent.click(more);
  await expect(within(canvasElement).getByRole("button", { name: "less" })).toHaveAttribute("aria-expanded", "true");
};

/** A one-line description: the second line's room is kept, the card keeps its height. */
export const ShortDescription320: Story = { ...PHONE_320, args: { mission: SHORT } };
export const ShortDescription375: Story = { ...PHONE_375, args: { mission: SHORT } };
/** A description over two lines: an ellipsis on the second, and "more" after it. */
export const CutDescription320: Story = { ...PHONE_320, args: { mission: CUT } };
export const CutDescription375: Story = { ...PHONE_375, args: { mission: CUT } };
/** The same, unfolded by "more": the card grows, "less" folds it back. */
export const Unfolded320: Story = { ...PHONE_320, args: { mission: CUT }, play: unfold };
export const Unfolded375: Story = { ...PHONE_375, args: { mission: CUT }, play: unfold };
/** A mission the text list does not know: no description, its two lines' room kept. */
export const NoDescription320: Story = { ...PHONE_320, args: { mission: NONE } };
export const NoDescription375: Story = { ...PHONE_375, args: { mission: NONE } };
/** WRAP360's stress text: a long title ends in an ellipsis, a long word breaks within the two lines. */
export const Stress: Story = { args: { mission: { ...CUT, title: LONG_LABEL, description: `${LONG_WORD} ${LONG_SENTENCE}`, reward: { cobbles: 9_999, claimed: false } } } };
