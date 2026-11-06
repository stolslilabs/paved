import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { NEW_PLAYER } from "../../mocks/new-player";
import { SETTINGS, THEME } from "../../mocks/scenes";
import { SettingsScene } from "./settings-scene";
import { ThemeScene } from "./theme-scene";

/**
 * Settings (`/settings`, SETTINGS-PAGE): the HUD's drawer, a full page on a phone, docked at the right from `tablet`; Visuals, Sound,
 * Gameplay, the account and More, and its views (the quality's choice, Credits, Themes). One story per state; the viewport is the
 * toolbar's (VP).
 */
const meta = {
  title: "Scenes/Settings",
  component: SettingsScene,
  args: { onChange: fn(), onVolumeChange: fn(), onConnect: fn(), onDisconnect: fn(), onReset: fn(), onView: fn(), onViewBack: fn(), onBack: fn() },
} satisfies Meta<typeof SettingsScene>;
export default meta;
type Story = StoryObj<typeof meta>;

/** A connected account in its league's rim, with Reset (#918). */
export const Connected: Story = { args: SETTINGS.connected };

/** A new player on the mock (#926): the drawn name and look of free items, never the address alone; no league yet, a plain ring. */
export const NewPlayer: Story = { args: { ...SETTINGS.connected, account: { ...SETTINGS.connected.account, name: NEW_PLAYER.name, look: NEW_PLAYER.look, league: undefined } } };

/** No wallet: Connect. */
export const Guest: Story = { args: SETTINGS.guest };
/** WRAP360: long names and sentences, full addresses, large figures. */
export const Stress: Story = { args: SETTINGS.stress };

/** Music muted: the slider at 0, its note dimmed under the red cross. */
export const MusicMuted: Story = { args: { ...SETTINGS.connected, preferences: { ...SETTINGS.connected.preferences, musicVolume: 0 } } };

/** The Visuals' pill's view: the four qualities, High in use and its cost said. */
export const Quality: Story = { args: SETTINGS.quality };
/** More › Credits, in the drawer. */
export const Credits: Story = { args: SETTINGS.credits };
/** More › Themes, in the drawer: the route's body (`ThemeScene`), the Cobbles at the header's end. */
export const Themes: Story = { args: { ...SETTINGS.connected, view: "themes", themes: <ThemeScene {...THEME.mixed} onUse={fn()} onOpen={fn()} onMyTiles={fn()} /> } };
