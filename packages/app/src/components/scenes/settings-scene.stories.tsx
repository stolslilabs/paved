import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { SETTINGS } from "../../mocks/scenes";
import { SettingsScene } from "./settings-scene";

/** Settings (`/settings`): graphics, sound, music, tile preview, placement highlight, the account, theme and referral. One story per state; the viewport is the toolbar's (VP). */
const meta = { title: "Scenes/Settings", component: SettingsScene, args: { onChange: fn(), onConnect: fn(), onDisconnect: fn(), onOpenTheme: fn(), onOpenReferral: fn(), onOpenCredits: fn(), onNavigate: fn() } } satisfies Meta<typeof SettingsScene>;
export default meta;
type Story = StoryObj<typeof meta>;

/** A connected controller account. */
export const Connected: Story = { args: SETTINGS.connected };

/** No wallet: Connect. */
export const Guest: Story = { args: SETTINGS.guest };
/** WRAP360: long names and sentences, full addresses, large figures. */
export const Stress: Story = { args: SETTINGS.stress };

/** Music off: the volume slider is locked. */
export const MusicOff: Story = { args: { ...SETTINGS.connected, preferences: { ...SETTINGS.connected.preferences, music: false } } };
