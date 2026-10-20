import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, screen } from "storybook/test";
import { dragDown, pause } from "../../stories/sheet-drag";
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

/**
 * Scrolled (#581): the sheet's content scrolls at 85dvh, so a drag down in its scrolled content is the content's (it scrolls back up),
 * never a close. The same drag from the top of a sheet not scrolled closes it; the header and the grab bar always do.
 */
export const BottomScrolled: Story = {
  args: { side: "bottom" },
  parameters: { viewport: { defaultViewport: "mobile1" }, reducedMotion: "never" },
  play: async ({ args }) => {
    const panel = await screen.findByRole("dialog");
    await pause(800); // the slide in
    // The header stays; the settings scroll in the panel's own region (NO-SCROLLBARS, #609).
    const content = panel.querySelector<HTMLElement>("[data-slot=scroll-region]")!;
    content.scrollTop = 160;
    await dragDown(screen.getByText("Day/night cycle"), 200);
    await expect(args.onOpenChange).not.toHaveBeenCalled();
    await expect(panel.style.translate).toBe("");
    await expect(content.scrollTop).toBeGreaterThan(0);
  },
};
