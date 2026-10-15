import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { BOARD_OFF_TOP, BOARD_TODAY, VIEWER_OFF_TOP } from "../../mocks/leaderboard";
import { PLAYER_ID } from "../../mocks/players";
import { RankingList, RankingSkeleton } from "./ranking-list";
import { STRESS_ENTRIES } from "../../mocks/stress";

const meta = {
  title: "Containers/RankingList",
  component: RankingList,
  parameters: { layout: "padded" },
  args: { entries: BOARD_TODAY.entries, total: BOARD_TODAY.total, viewerId: PLAYER_ID, onSelectPlayer: fn() },
  decorators: [(Story) => <div className="max-w-md"><Story /></div>],
} satisfies Meta<typeof RankingList>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The viewer 7th, outlined in place. */
export const ViewerOnPage: Story = {};
/** The viewer 34th: their row follows the page. */
export const ViewerOffPage: Story = { args: { entries: BOARD_OFF_TOP.entries, viewer: VIEWER_OFF_TOP } };
/** A guest: no row outlined. */
export const Guest: Story = { args: { viewerId: null } };
/** Under reduced motion the rows fade in, with no scale or slide. */
export const ReducedMotion: Story = { parameters: { reducedMotion: "always" } };
export const Loading: Story = { render: () => <RankingSkeleton /> };
/** WRAP360: the longest usernames, a full address, the widest ranks and scores; "(you)" always shows. */
export const Stress: Story = { args: { entries: STRESS_ENTRIES.slice(0, 3), viewer: STRESS_ENTRIES[3], viewerId: STRESS_ENTRIES[3].playerId, total: 99_999 } };
