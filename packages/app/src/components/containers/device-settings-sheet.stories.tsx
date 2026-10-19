import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { DeviceSettingsSheet } from "./device-settings-sheet";

const meta = {
  title: "Containers/DeviceSettingsSheet",
  component: DeviceSettingsSheet,
  parameters: { layout: "fullscreen" },
  args: {
    open: true,
    onOpenChange: fn(),
    preferences: { quality: "auto", dayNight: true, ambient: true, musicVolume: 0.4, musicBefore: 0.4, sfxVolume: 0.7, sfxBefore: 0.7, tilePreview: true, placementHighlight: true },
    autoQuality: "medium",
    onChange: fn(),
    onVolumeChange: fn(),
  },
} satisfies Meta<typeof DeviceSettingsSheet>;
export default meta;
type Story = StoryObj<typeof meta>;

/** On a phone (375 px): a bottom sheet. */
export const Bottom: Story = { args: { side: "bottom" }, parameters: { viewport: { defaultViewport: "mobile1" } } };
/** From the tablet width up (1440 px): a side panel. */
export const Side: Story = { args: { side: "right" } };
