import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { HOME } from "../../mocks/scenes";
import { HomeScene } from "./home-scene";
import { at } from "./viewports";

/** Home (`/`): the player's status, the game to resume, the modes, today's Challenge top 3, the five tabs. Each state at the four viewports. */
const meta = { title: "Scenes/Home", component: HomeScene, args: { onPlay: fn(), onChallenge: fn(), onTraining: fn(), onTutorial: fn(), onResume: fn(), onConnect: fn(), onNavigate: fn() } } satisfies Meta<typeof HomeScene>;
export default meta;
type Story = StoryObj<typeof meta>;

/** A connected player with a Challenge game running and a Training save. */
const connected: Story = { args: HOME.connected };
export const ConnectedMobile: Story = at("mobile", connected);
export const ConnectedTablet: Story = at("tablet", connected);
export const ConnectedDesktop: Story = at("desktop", connected);
export const ConnectedWide: Story = at("wide", connected);

/** No wallet: the connect call, Training and the Tutorial open. */
const guest: Story = { args: HOME.guest };
export const GuestMobile: Story = at("mobile", guest);
export const GuestTablet: Story = at("tablet", guest);
export const GuestDesktop: Story = at("desktop", guest);
export const GuestWide: Story = at("wide", guest);

/** Nobody has finished a game today: an empty podium, no rank yet. */
const firstOfDay: Story = { args: HOME.firstOfDay };
export const FirstOfDayMobile: Story = at("mobile", firstOfDay);
export const FirstOfDayTablet: Story = at("tablet", firstOfDay);
export const FirstOfDayDesktop: Story = at("desktop", firstOfDay);
export const FirstOfDayWide: Story = at("wide", firstOfDay);

/** `spawn_paused`: the Challenge card is disabled, the running game still resumes. */
const paused: Story = { args: HOME.paused };
export const PurchasesPausedMobile: Story = at("mobile", paused);
export const PurchasesPausedTablet: Story = at("tablet", paused);
export const PurchasesPausedDesktop: Story = at("desktop", paused);
export const PurchasesPausedWide: Story = at("wide", paused);
