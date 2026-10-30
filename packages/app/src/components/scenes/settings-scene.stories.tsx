import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { SETTINGS } from "../../mocks/scenes";
import { SettingsScene } from "./settings-scene";

/** Settings (`/settings`): graphics, sound, music, tile preview, placement highlight, the account, theme and referral. One story per state; the viewport is the toolbar's (VP). */
const meta = { title: "Scenes/Settings", component: SettingsScene, args: { onChange: fn(), onConnect: fn(), onDisconnect: fn(), onReset: fn(), onOpenTheme: fn(), onOpenReferral: fn(), onOpenCredits: fn(), onNavigate: fn() } } satisfies Meta<typeof SettingsScene>;
export default meta;
type Story = StoryObj<typeof meta>;

/** A connected account: the device's key's (#918), with Reset. */
export const Connected: Story = { args: SETTINGS.connected };

/** No wallet: Connect. */
export const Guest: Story = { args: SETTINGS.guest };
/** WRAP360: long names and sentences, full addresses, large figures. */
export const Stress: Story = { args: SETTINGS.stress };

/** Music muted: the slider is at 0 and the icon crossed. */
export const MusicMuted: Story = { args: { ...SETTINGS.connected, preferences: { ...SETTINGS.connected.preferences, musicVolume: 0 } } };
