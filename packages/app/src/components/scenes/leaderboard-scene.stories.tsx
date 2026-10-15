import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { LEADERBOARD } from "../../mocks/scenes";
import { LeaderboardScene } from "./leaderboard-scene";

/** The leaderboard (`/leaderboard/:day?`, Ranks): a UTC day's ranking, the day picker, the viewer's row outlined. One story per state; the viewport is the toolbar's (VP). */
const meta = { title: "Scenes/Leaderboard", component: LeaderboardScene, args: { onDayChange: fn(), onSelectPlayer: fn(), onRetry: fn(), onNavigate: fn() } } satisfies Meta<typeof LeaderboardScene>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Today, open: the viewer 7th on the first page, the close counting down. */
export const Today: Story = { args: LEADERBOARD.today };

/** Yesterday: closed, its ranking final; the viewer 4th. */
export const ClosedDay: Story = { args: LEADERBOARD.closed };

/** A day nobody finished a game. */
export const EmptyDay: Story = { args: LEADERBOARD.empty };

/** The viewer 34th: their row, read apart, follows the page. */
export const OffTheTop: Story = { args: LEADERBOARD.offTop };

/** No wallet: nobody outlined. */
export const Guest: Story = { args: LEADERBOARD.guest };

/** The first page on its way. */
export const Loading: Story = { args: LEADERBOARD.loading };

/** The indexer did not answer: Retry. */
export const Error: Story = { args: LEADERBOARD.error };
/** WRAP360: long names and sentences, full addresses, large figures. */
export const Stress: Story = { args: LEADERBOARD.stress };
