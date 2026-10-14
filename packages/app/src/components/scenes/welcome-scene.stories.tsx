import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { WELCOME } from "../../mocks/scenes";
import { WelcomeScene } from "./welcome-scene";
import { at } from "./viewports";

/** First visit (`/welcome`): connect, or play Training without a wallet. Each state at the four viewports. */
const meta = { title: "Scenes/Welcome", component: WelcomeScene, args: { onConnect: fn(), onTraining: fn() } } satisfies Meta<typeof WelcomeScene>;
export default meta;
type Story = StoryObj<typeof meta>;

const firstVisit: Story = { args: WELCOME.firstVisit };
export const FirstVisitMobile: Story = at("mobile", firstVisit);
export const FirstVisitTablet: Story = at("tablet", firstVisit);
export const FirstVisitDesktop: Story = at("desktop", firstVisit);
export const FirstVisitWide: Story = at("wide", firstVisit);

/** The controller's window is open. */
const connecting: Story = { args: WELCOME.connecting };
export const ConnectingMobile: Story = at("mobile", connecting);
export const ConnectingTablet: Story = at("tablet", connecting);
export const ConnectingDesktop: Story = at("desktop", connecting);
export const ConnectingWide: Story = at("wide", connecting);

const failed: Story = { args: WELCOME.failed };
export const ConnectFailedMobile: Story = at("mobile", failed);
export const ConnectFailedTablet: Story = at("tablet", failed);
export const ConnectFailedDesktop: Story = at("desktop", failed);
export const ConnectFailedWide: Story = at("wide", failed);
