import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { fn } from "storybook/test";
import { withVolume } from "../../data/settings";
import { ShowSkinsSwitch } from "../elements/setting-switch";
import { DeviceSettingsPanel, QualityChoice, type DevicePreferences } from "./device-settings-panel";

const PREFS: DevicePreferences = { quality: "auto", dayNight: true, ambient: true, musicVolume: 0.4, musicBefore: 0.4, sfxVolume: 0.7, sfxBefore: 0.7, tilePreview: true, placementHighlight: true, squareGrid: true };

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
/** The quality's choice, the view the pill opens (in the Settings drawer and in the board's sheet): High in use, its cost said. */
export const Quality: Story = { render: (args) => <QualityChoice quality="high" autoQuality={args.autoQuality} onChange={fn()} /> };

function Live_() {
  const [p, setP] = useState(PREFS);
  return <DeviceSettingsPanel preferences={p} autoQuality="medium" onOpenQuality={fn()} onChange={(k, v) => setP((s) => ({ ...s, [k]: v }))} onVolumeChange={(c, v) => setP((s) => withVolume(s as never, c, v) as DevicePreferences)} />;
}
export const Interactive: Story = { render: () => <Live_ /> };
