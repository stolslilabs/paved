import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { SETTINGS } from "../../mocks/scenes";
import { SettingsScene } from "./settings-scene";
import { at } from "./viewports";

/** Settings (`/settings`): graphics, sound, music, tile preview, placement highlight, the account, theme and referral. Each state at the four viewports. */
const meta = { title: "Scenes/Settings", component: SettingsScene, args: { onChange: fn(), onConnect: fn(), onDisconnect: fn(), onOpenTheme: fn(), onOpenReferral: fn(), onNavigate: fn() } } satisfies Meta<typeof SettingsScene>;
export default meta;
type Story = StoryObj<typeof meta>;

/** A connected controller account. */
const connected: Story = { args: SETTINGS.connected };
export const ConnectedMobile: Story = at("mobile", connected);
export const ConnectedTablet: Story = at("tablet", connected);
export const ConnectedDesktop: Story = at("desktop", connected);
export const ConnectedWide: Story = at("wide", connected);

/** No wallet: Connect. */
const guest: Story = { args: SETTINGS.guest };
export const GuestMobile: Story = at("mobile", guest);
export const GuestTablet: Story = at("tablet", guest);
export const GuestDesktop: Story = at("desktop", guest);
export const GuestWide: Story = at("wide", guest);
