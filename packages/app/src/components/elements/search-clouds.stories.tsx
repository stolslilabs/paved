import type { Meta, StoryObj } from "@storybook/react-vite";
import { SearchClouds } from "./search-clouds";

const meta = {
  title: "Elements/Search clouds",
  component: SearchClouds,
  parameters: { layout: "fullscreen" },
  render: (args) => (
    <div className="relative h-dvh bg-linear-to-b from-sky-search-top to-sky-search-bottom">
      <SearchClouds {...args} />
    </div>
  ),
} satisfies Meta<typeof SearchClouds>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Searching: the clouds drift side to side. */
export const Drifting: Story = {};
/** An opponent found: the clouds part to the sides. */
export const Parted: Story = { args: { parted: true } };
/** Reduced motion: the clouds stand still. */
export const ReducedMotion: Story = { parameters: { reducedMotion: "always" } };
