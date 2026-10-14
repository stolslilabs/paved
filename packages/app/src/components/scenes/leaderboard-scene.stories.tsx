import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { LEADERBOARD } from "../../mocks/scenes";
import { LeaderboardScene } from "./leaderboard-scene";
import { at } from "./viewports";

/** The leaderboard (`/leaderboard/:day?`, Ranks): a UTC day's ranking, the day picker, the viewer's row outlined. Each state at the four viewports. */
const meta = { title: "Scenes/Leaderboard", component: LeaderboardScene, args: { onDayChange: fn(), onSelectPlayer: fn(), onRetry: fn(), onNavigate: fn() } } satisfies Meta<typeof LeaderboardScene>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Today, open: the viewer 7th on the first page, the close counting down. */
const today: Story = { args: LEADERBOARD.today };
export const TodayMobile: Story = at("mobile", today);
export const TodayTablet: Story = at("tablet", today);
export const TodayDesktop: Story = at("desktop", today);
export const TodayWide: Story = at("wide", today);

/** Yesterday: closed, its ranking final; the viewer 4th. */
const closed: Story = { args: LEADERBOARD.closed };
export const ClosedDayMobile: Story = at("mobile", closed);
export const ClosedDayTablet: Story = at("tablet", closed);
export const ClosedDayDesktop: Story = at("desktop", closed);
export const ClosedDayWide: Story = at("wide", closed);

/** A day nobody finished a game. */
const empty: Story = { args: LEADERBOARD.empty };
export const EmptyDayMobile: Story = at("mobile", empty);
export const EmptyDayTablet: Story = at("tablet", empty);
export const EmptyDayDesktop: Story = at("desktop", empty);
export const EmptyDayWide: Story = at("wide", empty);

/** The viewer 34th: their row, read apart, follows the page. */
const offTop: Story = { args: LEADERBOARD.offTop };
export const OffTheTopMobile: Story = at("mobile", offTop);
export const OffTheTopTablet: Story = at("tablet", offTop);
export const OffTheTopDesktop: Story = at("desktop", offTop);
export const OffTheTopWide: Story = at("wide", offTop);

/** No wallet: nobody outlined. */
const guest: Story = { args: LEADERBOARD.guest };
export const GuestMobile: Story = at("mobile", guest);
export const GuestTablet: Story = at("tablet", guest);
export const GuestDesktop: Story = at("desktop", guest);
export const GuestWide: Story = at("wide", guest);

/** The first page on its way. */
const loading: Story = { args: LEADERBOARD.loading };
export const LoadingMobile: Story = at("mobile", loading);
export const LoadingTablet: Story = at("tablet", loading);
export const LoadingDesktop: Story = at("desktop", loading);
export const LoadingWide: Story = at("wide", loading);

/** The indexer did not answer: Retry. */
const error: Story = { args: LEADERBOARD.error };
export const ErrorMobile: Story = at("mobile", error);
export const ErrorTablet: Story = at("tablet", error);
export const ErrorDesktop: Story = at("desktop", error);
export const ErrorWide: Story = at("wide", error);
