import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { GAME_MISSIONS } from "../../mocks/quests";
import { GameMissions } from "./game-missions";

/** The missions one game completed (#595), as the game over lists them. */
const meta = {
  title: "Containers/GameMissions",
  component: GameMissions,
  parameters: { layout: "padded" },
  decorators: [(Story) => <div className="max-w-md"><Story /></div>],
  args: { missions: GAME_MISSIONS, onOpen: fn() },
} satisfies Meta<typeof GameMissions>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Two quests of the day and an achievement, with their Cobbles. */
export const Completed: Story = {};

/** One mission. */
export const One: Story = { args: { missions: GAME_MISSIONS.slice(0, 1) } };

/** None: nothing is drawn. */
export const None: Story = { args: { missions: [] } };
