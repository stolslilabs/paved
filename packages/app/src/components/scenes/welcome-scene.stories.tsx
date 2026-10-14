import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { WELCOME } from "../../mocks/scenes";
import { WelcomeScene } from "./welcome-scene";

/** First visit (`/welcome`): connect, or play Training without a wallet. One story per state; the Viewport control reframes it. */
const meta = { title: "Scenes/Welcome", component: WelcomeScene, args: { onConnect: fn(), onTraining: fn() } } satisfies Meta<typeof WelcomeScene>;
export default meta;
type Story = StoryObj<typeof meta>;

export const FirstVisit: Story = { args: WELCOME.firstVisit };

/** The controller's window is open. */
export const Connecting: Story = { args: WELCOME.connecting };

export const ConnectFailed: Story = { args: WELCOME.failed };
