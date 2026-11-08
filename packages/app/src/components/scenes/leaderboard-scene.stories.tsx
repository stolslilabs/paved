import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, screen, waitFor } from "storybook/test";
import { LEADERBOARD } from "../../mocks/ranking";
import { LeaderboardScene } from "./leaderboard-scene";

/**
 * The Leaderboard (`/ranking`, the dock's Ranking; LEADERBOARD-PAGE, in the integrated pages' style, the Paved UX Book drawing none):
 * the HUD's drawer, a full page with Back on a phone, a side panel docked at the right from `tablet`; Players by crowns, Guilds by
 * score (the sum of their members' crowns), Alliances disabled, Friends (the viewer among their friends), the tabs at the drawer's foot. One story per state; the viewport is the
 * toolbar's (VP).
 */
const meta = {
  title: "Scenes/Leaderboard",
  component: LeaderboardScene,
  args: { ...LEADERBOARD.playersInView, onTabChange: fn(), onOpenPlayer: fn(), onOpenGuild: fn(), onBack: fn() },
} satisfies Meta<typeof LeaderboardScene>;
export default meta;
type Story = StoryObj<typeof meta>;

const retry = <T extends { players: object; guilds: object; friends: object }>(state: T) => ({ ...state, players: { ...state.players, onRetry: fn() }, guilds: { ...state.guilds, onRetry: fn() }, friends: { ...state.friends, onRetry: fn() } });

/** Players: the viewer fourth, their row in view on the gold wash; the first three under their medals. */
export const PlayersInView: Story = { args: LEADERBOARD.playersInView };
/** Players: the viewer thirtieth, out of view: their row pinned over the tabs; a tap brings it into view. */
export const PlayersOutOfView: Story = { args: LEADERBOARD.playersOutOfView };
/**
 * Players: the viewer thirtieth, the list scrolled to its end, past their row: it is pinned at the top of the body, under the header,
 * the list scrolling under it (the owner's decision of 2026-11-07: on the side it left).
 */
export const PlayersScrolledPast: Story = {
  args: LEADERBOARD.playersOutOfView,
  play: async () => {
    const drawer = await screen.findByRole("dialog");
    const body = drawer.querySelector<HTMLElement>("[data-hud-drawer-body]")!;
    await waitFor(() => expect(drawer.querySelector("[data-own]")).not.toBeNull());
    body.scrollTop = body.scrollHeight;
    await waitFor(() => expect(drawer.querySelector("[data-slot=ranking-pinned]")?.getAttribute("data-side")).toBe("top"));
  },
};
/** Players: a new player past the list's end, pinned with their place; a tap opens their profile. */
export const PlayersPastList: Story = { args: LEADERBOARD.playersPastList };
/** Guilds: by score, the sum of their members' crowns; the viewer's guild in gold. */
export const Guilds: Story = { args: LEADERBOARD.guilds };
/** Guilds: the viewer's guild ranked past the list's end, pinned with its place; a tap opens its page. */
export const GuildsPastList: Story = { args: LEADERBOARD.guildsPastList };
/** Friends, at the right end: the viewer among their friends by crowns, their row in gold. */
export const Friends: Story = { args: LEADERBOARD.friends };
/** Friends: none yet, nothing to rank against. */
export const NoFriends: Story = { args: LEADERBOARD.noFriends };
/** Players at levels 9, 10, 20 and 15 in turn (#1065), the viewer second: both figures inside the star. */
export const TwoFigureLevels: Story = { args: LEADERBOARD.twoFigures };
/** The rankings on their way. */
export const Loading: Story = { args: LEADERBOARD.loading };
/** Nothing ranked yet. */
export const Empty: Story = { args: LEADERBOARD.empty };
/** The read failed: why, and Retry. */
export const Error: Story = { args: retry(LEADERBOARD.error) };
/** No ranking on this network. */
export const Unavailable: Story = { args: LEADERBOARD.unavailable };
/** WRAP360: the longest name, a long address, the largest figures. */
export const Stress: Story = { args: LEADERBOARD.stress };
