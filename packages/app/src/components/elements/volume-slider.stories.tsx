import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { VolumeSlider } from "./volume-slider";

const meta = {
  title: "Elements/VolumeSlider",
  component: VolumeSlider,
  parameters: { layout: "fullscreen" },
  args: { label: "Music", art: "music", value: 0.4, before: 0.4 },
  // On the drawer's charcoal, its carved surface (SETTINGS-PAGE).
  decorators: [(Story) => <div className="w-full max-w-[375px] bg-secondary p-4"><div className="drawer-carved rounded-xl"><Story /></div></div>],
} satisfies Meta<typeof VolumeSlider>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Low: Story = { args: { value: 0.3 } };
/** The speaker of the sound effects. */
export const High: Story = { args: { label: "Sound effects", art: "sound", value: 0.8 } };
/** Muted: the slider at 0, the icon dimmed under the red cross; the icon brings back the level before the mute. */
export const Muted: Story = { args: { value: 0, before: 0.6 } };
export const Full: Story = { args: { value: 1, before: 1 } };

function Live_() {
  const [value, setValue] = useState(0.4);
  const [before, setBefore] = useState(0.4);
  return (
    <VolumeSlider
      label="Sound effects"
      art="sound"
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
