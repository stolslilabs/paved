import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { PLAY } from "../../mocks/scenes";
import { PlayScene } from "./play-scene";
import { at } from "./viewports";

/** The mode choice (`/play`): Challenge, Training, Tutorial, Multiplayer coming soon. Each state at the four viewports. */
const meta = { title: "Scenes/Play", component: PlayScene, args: { onBack: fn(), onChallenge: fn(), onTraining: fn(), onTutorial: fn(), onConnect: fn() } } satisfies Meta<typeof PlayScene>;
export default meta;
type Story = StoryObj<typeof meta>;

const connected: Story = { args: PLAY.connected };
export const ConnectedMobile: Story = at("mobile", connected);
export const ConnectedTablet: Story = at("tablet", connected);
export const ConnectedDesktop: Story = at("desktop", connected);
export const ConnectedWide: Story = at("wide", connected);

/** No wallet: the Challenge asks to connect. */
const guest: Story = { args: PLAY.guest };
export const GuestMobile: Story = at("mobile", guest);
export const GuestTablet: Story = at("tablet", guest);
export const GuestDesktop: Story = at("desktop", guest);
export const GuestWide: Story = at("wide", guest);

const paused: Story = { args: PLAY.paused };
export const PurchasesPausedMobile: Story = at("mobile", paused);
export const PurchasesPausedTablet: Story = at("tablet", paused);
export const PurchasesPausedDesktop: Story = at("desktop", paused);
export const PurchasesPausedWide: Story = at("wide", paused);
