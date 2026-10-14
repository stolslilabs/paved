import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { QUESTS } from "../../mocks/scenes";
import { QuestsScene } from "./quests-scene";

/** The quests (`/quests/:day?`): the day's four dailies with the player's progress, and the day picker. One story per state; the viewport is the toolbar's (VP). */
const meta = { title: "Scenes/Quests", component: QuestsScene, args: { onDayChange: fn(), onTab: fn(), onConnect: fn(), onRetry: fn(), onNavigate: fn() } } satisfies Meta<typeof QuestsScene>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Today: one complete, two under way, one to do. */
export const Today: Story = { args: QUESTS.today };

/** Yesterday: all four complete. */
export const AllComplete: Story = { args: QUESTS.allDone };

/** A past day the player did not play. */
export const NotPlayed: Story = { args: QUESTS.idle };

/** A day before the dailies were defined. */
export const NoQuest: Story = { args: QUESTS.none };

/** No wallet: Connect. */
export const Guest: Story = { args: QUESTS.guest };

/** The day's quests on their way. */
export const Loading: Story = { args: QUESTS.loading };
