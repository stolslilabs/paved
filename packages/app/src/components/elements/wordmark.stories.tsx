import type { Meta, StoryObj } from "@storybook/react-vite";
import { Wordmark } from "./wordmark";

/** The game's name over its tagline, as the loading screen shows it (its one place). */
const meta = { title: "Elements/Wordmark", component: Wordmark, parameters: { layout: "centered" }, args: { tagline: "Build · Connect · Score" } } satisfies Meta<typeof Wordmark>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Large: Story = {};
