import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { MOCK_NOW } from "../../mocks/clock";
import { GameHud } from "./game-hud";

const meta = {
  title: "Containers/GameHud",
  component: GameHud,
  parameters: { layout: "padded" },
  args: { title: "Challenge #1042", score: 1270, remaining: 12, expiresAt: MOCK_NOW + 19 * 3600, now: MOCK_NOW, onBack: fn() },
  decorators: [(Story) => <div className="max-w-2xl"><Story /></div>],
} satisfies Meta<typeof GameHud>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Challenge: Story = {};
export const AfterAClosing: Story = { args: { score: 1640, delta: 370 } };
export const LastHour: Story = { args: { expiresAt: MOCK_NOW + 25 * 60 } };
export const Expired: Story = { args: { expiresAt: MOCK_NOW - 60 } };
/** Training: no deadline. */
export const Training: Story = { args: { title: "Training", expiresAt: null } };
