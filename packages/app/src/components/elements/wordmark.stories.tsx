import type { Meta, StoryObj } from "@storybook/react-vite";
import { Wordmark } from "./wordmark";
import { LONG_SENTENCE } from "../../mocks/stress";

const meta = { title: "Elements/Wordmark", component: Wordmark, parameters: { layout: "centered" } } satisfies Meta<typeof Wordmark>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Large: Story = { args: { tagline: "Build · Connect · Score" } };
export const Medium: Story = { args: { size: "md" } };
/** The navigation header's, from `desktop`. */
export const Small: Story = { args: { size: "sm" } };
/** WRAP360: a long tagline. */
export const Stress: Story = { args: { tagline: LONG_SENTENCE } };
