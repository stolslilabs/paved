import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { ACHIEVEMENTS } from "../../mocks/scenes";
import { AchievementsScene } from "./achievements-scene";

/** The achievements (`/achievements`, a tab beside Quests): earned, in progress and locked. One story per state; the viewport is the toolbar's (VP). */
const meta = { title: "Scenes/Achievements", component: AchievementsScene, args: { onTab: fn(), onConnect: fn(), onRetry: fn(), onNavigate: fn() } } satisfies Meta<typeof AchievementsScene>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Four earned, six in progress, six locked (the sixteen: the accepted list and v2a's higher tiers). */
export const Mixed: Story = { args: ACHIEVEMENTS.mixed };

/** Nothing counted yet: all locked. */
export const NewPlayer: Story = { args: ACHIEVEMENTS.newPlayer };

/** Every one earned. */
export const AllEarned: Story = { args: ACHIEVEMENTS.all };

/** No wallet: Connect. */
export const Guest: Story = { args: ACHIEVEMENTS.guest };

/** The achievements on their way. */
export const Loading: Story = { args: ACHIEVEMENTS.loading };
