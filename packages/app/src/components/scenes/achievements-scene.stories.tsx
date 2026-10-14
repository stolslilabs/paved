import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { ACHIEVEMENTS } from "../../mocks/scenes";
import { AchievementsScene } from "./achievements-scene";
import { at } from "./viewports";

/** The achievements (`/achievements`, a tab beside Quests): earned, in progress and locked. Each state at the four viewports. */
const meta = { title: "Scenes/Achievements", component: AchievementsScene, args: { onTab: fn(), onConnect: fn(), onRetry: fn(), onNavigate: fn() } } satisfies Meta<typeof AchievementsScene>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Four earned, three in progress, two locked. */
const mixed: Story = { args: ACHIEVEMENTS.mixed };
export const MixedMobile: Story = at("mobile", mixed);
export const MixedTablet: Story = at("tablet", mixed);
export const MixedDesktop: Story = at("desktop", mixed);
export const MixedWide: Story = at("wide", mixed);

/** Nothing counted yet: all locked. */
const newPlayer: Story = { args: ACHIEVEMENTS.newPlayer };
export const NewPlayerMobile: Story = at("mobile", newPlayer);
export const NewPlayerTablet: Story = at("tablet", newPlayer);
export const NewPlayerDesktop: Story = at("desktop", newPlayer);
export const NewPlayerWide: Story = at("wide", newPlayer);

/** Every one earned. */
const all: Story = { args: ACHIEVEMENTS.all };
export const AllEarnedMobile: Story = at("mobile", all);
export const AllEarnedTablet: Story = at("tablet", all);
export const AllEarnedDesktop: Story = at("desktop", all);
export const AllEarnedWide: Story = at("wide", all);

/** No wallet: Connect. */
const guest: Story = { args: ACHIEVEMENTS.guest };
export const GuestMobile: Story = at("mobile", guest);
export const GuestTablet: Story = at("tablet", guest);
export const GuestDesktop: Story = at("desktop", guest);
export const GuestWide: Story = at("wide", guest);

/** The achievements on their way. */
const loading: Story = { args: ACHIEVEMENTS.loading };
export const LoadingMobile: Story = at("mobile", loading);
export const LoadingTablet: Story = at("tablet", loading);
export const LoadingDesktop: Story = at("desktop", loading);
export const LoadingWide: Story = at("wide", loading);
