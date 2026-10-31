import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { FRIENDS_TAB } from "../../mocks/follows";
import { FriendsPanel } from "./friends-panel";

/**
 * The Social page's Friends tab (#954): Friends (the mutual follows), Following and Followers, each with its count, online
 * players first; the new followers marked; each row's actions (Unfollow, Follow back, Remove), the players to follow, and the
 * tab's menu of blocked players. On the mock community.
 */
const meta = {
  title: "Containers/FriendsPanel",
  component: FriendsPanel,
  parameters: { layout: "padded" },
  args: { ...FRIENDS_TAB.friends, onListChange: fn(), onOpenPlayer: fn(), onRetry: fn(), onAction: fn(async () => {}) },
  decorators: [(Story) => <div className="mx-auto max-w-xl">{Story()}</div>],
} satisfies Meta<typeof FriendsPanel>;
export default meta;
type Story = StoryObj<typeof meta>;

/** A new player: no follows yet, and players to follow. */
export const NoFollows: Story = { args: FRIENDS_TAB.noFollows };
/** Friends online and offline: online first, then the most recently seen; their guilds. */
export const Friends: Story = {};
/** Everyone the player follows: the friends, and those who do not follow back. */
export const Following: Story = { args: FRIENDS_TAB.following };
/** Two new followers, marked New, counted on the list's badge; Follow back and Remove. */
export const NewFollowers: Story = { args: FRIENDS_TAB.newFollowers };
/** The tab's menu: a blocked player, with Unblock. */
export const Blocked: Story = { args: FRIENDS_TAB.blocked };
/** The menu with no one blocked. */
export const NoneBlocked: Story = { args: FRIENDS_TAB.noneBlocked };
export const Loading: Story = { args: FRIENDS_TAB.loading };
export const Failed: Story = { args: FRIENDS_TAB.failed };
/** A refused write: the reason under the list (a hidden block says only that it is not available). */
export const Refused: Story = { args: { ...FRIENDS_TAB.newFollowers, onAction: fn(async () => Promise.reject(new Error("This is not available."))) } };
/** With reduced motion: the blocked players' sheet opens without its slide. */
export const ReducedMotion: Story = { args: FRIENDS_TAB.blocked, parameters: { reducedMotion: "always" } };
/** WRAP360: the longest name and address, four-digit counts, 120 new followers. */
export const Stress: Story = { args: FRIENDS_TAB.stress };
