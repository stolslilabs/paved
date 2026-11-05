import type { Meta, StoryObj } from "@storybook/react-vite";
import { LevelStar } from "./level-star";

/** A player's level in the HUD's blue star (CHAT-PAGE): the level bar's star, still, beside a name in the chat. */
const meta = {
  title: "Elements/Level star",
  component: LevelStar,
  parameters: { layout: "padded" },
  args: { level: 7 },
} satisfies Meta<typeof LevelStar>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
/** Two figures, the most the star holds. */
export const TwoFigures: Story = { args: { level: 42 } };
/** Past 99: "99+". */
export const Capped: Story = { args: { level: 1_000 } };
