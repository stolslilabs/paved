import type { Meta, StoryObj } from "@storybook/react-vite";
import { MOCK_NOW } from "../../mocks/clock";
import { HeroCountdown } from "./hero-countdown";

/** The countdown as a page's hero (the Chests page's reset, #759): the label over a large figure. */
const meta = {
  title: "Elements/HeroCountdown",
  component: HeroCountdown,
  parameters: { layout: "padded" },
  args: { now: MOCK_NOW, label: "Slots reset in", expiresAt: MOCK_NOW + 7 * 3600 + 12 * 60 + 5 },
} satisfies Meta<typeof HeroCountdown>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Running: Story = {};
/** Under an hour left: amber. */
export const Warning: Story = { args: { label: "More chests in", expiresAt: MOCK_NOW + 42 } };
