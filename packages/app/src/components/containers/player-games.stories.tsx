import type { Meta, StoryObj } from "@storybook/react-vite";
import { PLAYER_GAMES } from "../../mocks/leaderboard";
import { PlayerGames } from "./player-games";

const meta = {
  title: "Containers/PlayerGames",
  component: PlayerGames,
  parameters: { layout: "padded" },
  args: { games: PLAYER_GAMES },
  decorators: [(Story) => <div className="max-w-md rounded-xl bg-card px-4"><Story /></div>],
} satisfies Meta<typeof PlayerGames>;
export default meta;
type Story = StoryObj<typeof meta>;

/** One running, one awaiting its day, three settled: a reward, below the threshold, a reward. */
export const Games: Story = {};
export const None: Story = { args: { games: [] } };
