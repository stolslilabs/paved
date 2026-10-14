import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { QUESTS } from "../../mocks/scenes";
import { QuestsScene } from "./quests-scene";
import { at } from "./viewports";

/** The quests (`/quests/:day?`): the day's four dailies with the player's progress, and the day picker. Each state at the four viewports. */
const meta = { title: "Scenes/Quests", component: QuestsScene, args: { onDayChange: fn(), onTab: fn(), onConnect: fn(), onRetry: fn(), onNavigate: fn() } } satisfies Meta<typeof QuestsScene>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Today: one complete, two under way, one to do. */
const today: Story = { args: QUESTS.today };
export const TodayMobile: Story = at("mobile", today);
export const TodayTablet: Story = at("tablet", today);
export const TodayDesktop: Story = at("desktop", today);
export const TodayWide: Story = at("wide", today);

/** Yesterday: all four complete. */
const allDone: Story = { args: QUESTS.allDone };
export const AllCompleteMobile: Story = at("mobile", allDone);
export const AllCompleteTablet: Story = at("tablet", allDone);
export const AllCompleteDesktop: Story = at("desktop", allDone);
export const AllCompleteWide: Story = at("wide", allDone);

/** A past day the player did not play. */
const idle: Story = { args: QUESTS.idle };
export const NotPlayedMobile: Story = at("mobile", idle);
export const NotPlayedTablet: Story = at("tablet", idle);
export const NotPlayedDesktop: Story = at("desktop", idle);
export const NotPlayedWide: Story = at("wide", idle);

/** A day before the dailies were defined. */
const none: Story = { args: QUESTS.none };
export const NoQuestMobile: Story = at("mobile", none);
export const NoQuestTablet: Story = at("tablet", none);
export const NoQuestDesktop: Story = at("desktop", none);
export const NoQuestWide: Story = at("wide", none);

/** No wallet: Connect. */
const guest: Story = { args: QUESTS.guest };
export const GuestMobile: Story = at("mobile", guest);
export const GuestTablet: Story = at("tablet", guest);
export const GuestDesktop: Story = at("desktop", guest);
export const GuestWide: Story = at("wide", guest);

/** The day's quests on their way. */
const loading: Story = { args: QUESTS.loading };
export const LoadingMobile: Story = at("mobile", loading);
export const LoadingTablet: Story = at("tablet", loading);
export const LoadingDesktop: Story = at("desktop", loading);
export const LoadingWide: Story = at("wide", loading);
