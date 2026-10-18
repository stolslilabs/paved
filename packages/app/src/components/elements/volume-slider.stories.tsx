import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { VolumeSlider } from "./volume-slider";

const meta = {
  title: "Elements/VolumeSlider",
  component: VolumeSlider,
  parameters: { layout: "padded" },
  args: { label: "Music", value: 0.4, before: 0.4 },
  decorators: [(Story) => <div className="w-full max-w-[343px] rounded-xl bg-card px-4 py-2"><Story /></div>],
} satisfies Meta<typeof VolumeSlider>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Below a half: one wave. */
export const Low: Story = { args: { value: 0.3 } };
/** From a half: two waves. */
export const High: Story = { args: { value: 0.8 } };
/** Muted: the slider at 0 and the icon crossed; the icon brings back the level before the mute. */
export const Muted: Story = { args: { value: 0, before: 0.6 } };
export const Full: Story = { args: { value: 1, before: 1 } };

function Live_() {
  const [value, setValue] = useState(0.4);
  const [before, setBefore] = useState(0.4);
  return (
    <VolumeSlider
      label="Sound effects"
      value={value}
      before={before}
      onChange={(v) => {
        setValue(v);
        if (v > 0) setBefore(v);
      }}
    />
  );
}

/** Click the icon: the slider runs to 0 and back to where it was. Dragging to 0 mutes; dragging up from 0 unmutes. */
export const Interactive: Story = { render: () => <Live_ /> };
