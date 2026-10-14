import type { Meta, StoryObj } from "@storybook/react-vite";
import { Background } from "./background";

const meta = {
  title: "Elements/Background",
  component: Background,
  parameters: { layout: "fullscreen" },
  decorators: [(Story) => <div className="relative h-[28rem] bg-background"><Story /></div>],
} satisfies Meta<typeof Background>;
export default meta;
type Story = StoryObj<typeof meta>;

/** `placeholder.png` from the app's assets, as AVIF, WebP and JPEG in three widths, under a scrim. */
export const Placeholder: Story = {};
