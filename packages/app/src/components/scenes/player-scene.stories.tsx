import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { PLAYER_PAGE } from "../../mocks/scenes";
import { PlayerScene } from "./player-scene";

/** A player's page (`/player/:id`, under Ranks): who, today's rank, their record, their last games. One story per state; the viewport is the toolbar's (VP). */
const meta = { title: "Scenes/Player", component: PlayerScene, args: { onBack: fn(), onNavigate: fn() } } satisfies Meta<typeof PlayerScene>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Another player, opened from a row: today's leader. */
export const Other: Story = { args: PLAYER_PAGE.other };

/** The viewer's own page, with a game running. */
export const Self: Story = { args: PLAYER_PAGE.self };

/** An address the indexer has never seen. */
export const Unknown: Story = { args: PLAYER_PAGE.unknown };

/** The profile and the games on their way. */
export const Loading: Story = { args: PLAYER_PAGE.loading };
