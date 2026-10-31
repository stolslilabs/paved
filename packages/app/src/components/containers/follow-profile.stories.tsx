import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { FOLLOW_ACTIONS, FOLLOW_STATUS } from "../../mocks/follows";
import { FollowMark } from "../elements/follow-mark";
import { FollowProfileActions } from "./follow-profile";
import { FollowResultButton } from "./follow-result-button";

/**
 * The follow actions on another player's profile (#954): Follow (Follow back when they follow the viewer), or Following, which
 * unfollows after a confirmation; Block, confirmed; Unblock for a player the viewer blocks. The marks and the search's button.
 */
const meta = {
  title: "Containers/FollowProfile",
  component: FollowProfileActions,
  parameters: { layout: "padded" },
  args: { ...FOLLOW_ACTIONS.follow, onAction: fn(async () => {}) },
  decorators: [(Story) => <div className="mx-auto flex max-w-sm flex-col gap-3">{Story()}</div>],
} satisfies Meta<typeof FollowProfileActions>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Follow: Story = {};
/** They follow the viewer: Follow back. */
export const FollowBack: Story = { args: FOLLOW_ACTIONS.followBack };
/** Followed: Following unfollows after a confirmation. */
export const Following: Story = { args: FOLLOW_ACTIONS.following };
export const Friend: Story = { args: FOLLOW_ACTIONS.friend };
/** A player the viewer blocks: Unblock only. */
export const Blocking: Story = { args: FOLLOW_ACTIONS.blocking };
/** A refused follow: a hidden block says only that it is not available. */
export const Refused: Story = { args: { onAction: fn(async () => Promise.reject(new Error("This is not available."))) } };
/** WRAP360: the longest name in the confirmations. */
export const Stress: Story = { args: FOLLOW_ACTIONS.stress };
/** The marks: Follows you, and Friend. */
export const Marks: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <FollowMark status={FOLLOW_STATUS.followsYou} />
      <FollowMark status={FOLLOW_STATUS.friend} />
    </div>
  ),
};
/** The player search's button, in each state. */
export const SearchButton: Story = {
  render: () => (
    <div className="flex flex-wrap items-start gap-3">
      <FollowResultButton state="follow" name="ChillyNewt46" onFollow={fn()} />
      <FollowResultButton state="follow-back" name="ChillyNewt46" onFollow={fn()} />
      <FollowResultButton state="following" name="ChillyNewt46" />
      <FollowResultButton state="blocking" name="ChillyNewt46" />
    </div>
  ),
};
