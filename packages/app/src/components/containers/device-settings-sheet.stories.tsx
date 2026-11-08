import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn, screen, userEvent } from "storybook/test";
import { DeviceSettingsSheet } from "./device-settings-sheet";

/**
 * The board's settings (#541) in the HUD's drawer (GAME-OVERLAY): a full page with Back on a phone, a side panel at the right from
 * `tablet` (the Viewport toolbar picks the width).
 */
const meta = {
  title: "Containers/DeviceSettingsSheet",
  component: DeviceSettingsSheet,
  parameters: { layout: "fullscreen" },
  args: {
    open: true,
    onOpenChange: fn(),
    preferences: { quality: "auto", dayNight: true, ambient: true, musicVolume: 0.4, musicBefore: 0.4, sfxVolume: 0.7, sfxBefore: 0.7, tilePreview: true, placementHighlight: true, squareGrid: true },
    autoQuality: "medium",
    onChange: fn(),
    onVolumeChange: fn(),
  },
} satisfies Meta<typeof DeviceSettingsSheet>;
export default meta;
type Story = StoryObj<typeof meta>;

/** On the board in a Challenge (#606): "This game" first, Surrender with the painted white flag. */
export const BoardChallenge: Story = { args: { game: { kind: "surrender", label: "Surrender", hint: "End this game now with its score.", onSelect: fn() } } };
/** On the board in Training: Restart, with the painted red arrow. */
export const BoardTraining: Story = { args: { game: { kind: "restart", label: "Restart", hint: "Play this game again from its first tile, same deck.", onSelect: fn() } } };
/** On the board in Story mode and in an attack: no game row (Story's Restart is on the board). */
export const BoardStory: Story = {};
/** The quality's choice, a view in the drawer's place, with Back to the settings. */
export const Quality: Story = {
  play: async () => {
    await userEvent.click(await screen.findByRole("button", { name: /Graphics quality|Quality/ }));
  },
};
