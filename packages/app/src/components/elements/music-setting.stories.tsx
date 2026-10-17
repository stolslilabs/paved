import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { MusicSetting } from "./music-setting";

const meta = {
  title: "Elements/MusicSetting",
  component: MusicSetting,
  parameters: { layout: "padded" },
  args: { enabled: true, volume: 0.4, onEnabledChange: fn(), onVolumeChange: fn() },
  decorators: [(Story) => <div className="max-w-sm rounded-xl bg-card px-4"><Story /></div>],
} satisfies Meta<typeof MusicSetting>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The default: on, at 40 %. */
export const On: Story = {};
/** Off: the slider is dimmed and locked. */
export const Off: Story = { args: { enabled: false } };
export const Silent: Story = { args: { volume: 0 } };
export const Full: Story = { args: { volume: 1 } };
