import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { SOCIAL } from "../../mocks/social";
import { SocialScene } from "./social-scene";

/**
 * The Social page (`/social`, #952): the player search and three tabs, Guild, Friends and Chat, each with its badge. Each tab
 * shows its empty state until its issue fills it (#953, #954, #955). One story per state; the viewport is the toolbar's (VP).
 */
const meta = {
  title: "Scenes/Social",
  component: SocialScene,
  args: { ...SOCIAL.guild, onTabChange: fn(), onBack: fn(), onNavigate: fn() },
} satisfies Meta<typeof SocialScene>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The Guild tab, empty until the guilds (#953). */
export const Guild: Story = {};
/** The Friends tab, empty until the follows and friends (#954). */
export const Friends: Story = { args: SOCIAL.friends };
/** The Chat tab, empty until the messages (#955). */
export const Chat: Story = { args: SOCIAL.chat };
/** What waits in each tab, on its badge. */
export const Badges: Story = { args: SOCIAL.badges };
/** The search's results above the tabs: a tap opens the player's profile. */
export const Searching: Story = { args: SOCIAL.searching };
/** No social source on this network. */
export const Unavailable: Story = { args: SOCIAL.unavailable };
/** With reduced motion: the tabs change without the highlight's slide. */
export const ReducedMotion: Story = { args: SOCIAL.badges, parameters: { reducedMotion: "always" } };
/** WRAP360: three-digit badges on every tab, the longest name. */
export const Stress: Story = { args: SOCIAL.stress };
