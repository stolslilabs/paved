import type { Meta, StoryObj } from "@storybook/react-vite";
import { LevelStar } from "./level-star";

/** A player's level in the HUD's blue star (FRIENDS-PAGE: the friends' lists, in place of "Lv 12"). One story per state. */
const meta = {
  title: "Elements/LevelStar",
  component: LevelStar,
  parameters: { layout: "centered" },
  args: { level: 7 },
} satisfies Meta<typeof LevelStar>;
export default meta;
type Story = StoryObj<typeof meta>;

/** One figure. */
export const OneFigure: Story = {};
/** Two figures: the level cap (20) and below. */
export const TwoFigures: Story = { args: { level: 18 } };
/** Past two figures: "99+". */
export const Capped: Story = { args: { level: 1_234 } };
