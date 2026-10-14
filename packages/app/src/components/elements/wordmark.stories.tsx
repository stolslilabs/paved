import type { Meta, StoryObj } from "@storybook/react-vite";
import { Wordmark } from "./wordmark";

const meta = { title: "Elements/Wordmark", component: Wordmark, parameters: { layout: "centered" } } satisfies Meta<typeof Wordmark>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Large: Story = { args: { tagline: "Build · Connect · Score" } };
export const Medium: Story = { args: { size: "md" } };
