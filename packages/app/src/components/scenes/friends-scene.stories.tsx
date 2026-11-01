import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { FRIENDS_TAB } from "../../mocks/follows";
import { FRIENDS_SEARCH } from "../../mocks/social";
import { FriendsPanel } from "../containers/friends-panel";
import { FriendsScene } from "./friends-scene";

/**
 * The friends page (`/friends`, #973, the Social page's Friends tab of #954 before): the player search at the top, then the three
 * tabs, Friends, Following and Followers, each with its count, the suggestions and the blocked players. One story per state; the
 * viewport is the toolbar's (VP).
 */
const meta = {
  title: "Scenes/Friends",
  component: FriendsScene,
  args: { ...FRIENDS_SEARCH.idle, onBack: fn(), onNavigate: fn() },
} satisfies Meta<typeof FriendsScene>;
export default meta;
type Story = StoryObj<typeof meta>;

const panel = (data: (typeof FRIENDS_TAB)[keyof typeof FRIENDS_TAB]) => <FriendsPanel {...data} onAction={fn()} onOpenPlayer={fn()} onMessage={fn()} onListChange={fn()} />;

/** A guest: the search, and the empty state. */
export const Guest: Story = {};
/** The Friends tab: friends online and offline, Message on each; two new followers on the Followers tab's badge. */
export const Friends: Story = { args: { children: panel(FRIENDS_TAB.friends) } };
/** The Following tab. */
export const Following: Story = { args: { children: panel(FRIENDS_TAB.following) } };
/** The Followers tab: the two new followers first, marked. */
export const Followers: Story = { args: { children: panel(FRIENDS_TAB.newFollowers) } };
/** A new player: no follows, players to follow. */
export const NoFollows: Story = { args: { children: panel(FRIENDS_TAB.noFollows) } };
/** The search's results above the tabs, each with Follow; a tap opens the player's profile. */
export const Searching: Story = { args: { ...FRIENDS_SEARCH.searching, children: panel(FRIENDS_TAB.friends) } };
/** No social source on this network: the search disabled. */
export const Unavailable: Story = { args: FRIENDS_SEARCH.unavailable };
/** With reduced motion: the tabs change without the highlight's slide. */
export const ReducedMotion: Story = { args: { children: panel(FRIENDS_TAB.friends) }, parameters: { reducedMotion: "always" } };
/** WRAP360: the longest name in the results and the lists, four-digit counts. */
export const Stress: Story = { args: { ...FRIENDS_SEARCH.stress, children: panel(FRIENDS_TAB.stress) } };
