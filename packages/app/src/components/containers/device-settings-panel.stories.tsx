import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, fn, screen, userEvent, within } from "storybook/test";
import { withVolume } from "../../data/settings";
import { ShowSkinsSwitch } from "../elements/setting-switch";
import { DeviceSettingsPanel, QualityChoice, type DevicePreferences } from "./device-settings-panel";

const PREFS: DevicePreferences = { quality: "auto", seasons: "cycle", dayTime: "cycle", ambient: true, musicVolume: 0.4, musicBefore: 0.4, sfxVolume: 0.7, sfxBefore: 0.7, tilePreview: true, placementHighlight: true, squareGrid: true };

const meta = {
  title: "Containers/DeviceSettingsPanel",
  component: DeviceSettingsPanel,
  parameters: { layout: "fullscreen" },
  args: { preferences: PREFS, autoQuality: "medium", onChange: fn(), onVolumeChange: fn(), onOpenQuality: fn() },
  // On the drawer's charcoal (SETTINGS-PAGE).
  decorators: [(Story) => <div className="w-full max-w-[375px] bg-secondary p-4"><Story /></div>],
} satisfies Meta<typeof DeviceSettingsPanel>;
export default meta;
type Story = StoryObj<typeof meta>;

/** At 375 px: Visuals, Sound (the two sliders), Gameplay. The Settings page adds the skins switch to Visuals. */
export const Default: Story = {};
export const Muted: Story = { args: { preferences: { ...PREFS, musicVolume: 0, sfxVolume: 0, musicBefore: 0.4, sfxBefore: 0.7 } } };
export const WithSkinsSwitch: Story = { args: { visualsExtra: <ShowSkinsSwitch checked onCheckedChange={fn()} /> } };
/** SEASONS-SETTINGS: a season and the night held (Winter, Night), the two pills saying so. */
export const HeldWinterNight: Story = { args: { preferences: { ...PREFS, seasons: "winter", dayTime: "night" } } };
/** The Seasons pill tapped: Cycle, then each season in the cycle's order, the one in use checked. */
export const SeasonsOpen: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Seasons: Cycle" }));
    const menu = await screen.findByRole("menu");
    await expect(within(menu).getAllByRole("menuitemradio").map((i) => i.textContent)).toEqual(["Cycle", "Summer", "Autumn", "Winter", "Spring"]);
  },
};
/** The Day and night pill tapped, the night held: Cycle, Day, Night. */
export const DayAndNightOpen: Story = {
  args: { preferences: { ...PREFS, seasons: "winter", dayTime: "night" } },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Day and night: Night" }));
    await screen.findByRole("menu");
  },
};
/** The quality's choice, the view the pill opens (in the Settings drawer and in the board's sheet): High in use, its cost said. */
export const Quality: Story = { render: (args) => <QualityChoice quality="high" autoQuality={args.autoQuality} onChange={fn()} /> };

function Live_() {
  const [p, setP] = useState(PREFS);
  return <DeviceSettingsPanel preferences={p} autoQuality="medium" onOpenQuality={fn()} onChange={(k, v) => setP((s) => ({ ...s, [k]: v }))} onVolumeChange={(c, v) => setP((s) => withVolume(s as never, c, v) as DevicePreferences)} />;
}
export const Interactive: Story = { render: () => <Live_ /> };
