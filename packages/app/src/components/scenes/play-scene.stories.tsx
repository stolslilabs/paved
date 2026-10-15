import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { PLAY } from "../../mocks/scenes";
import { PlayScene } from "./play-scene";

/** The mode choice (`/play`): Challenge, Training, Tutorial, Multiplayer coming soon. One story per state; the Viewport control reframes it. */
const meta = { title: "Scenes/Play", component: PlayScene, args: { onBack: fn(), onChallenge: fn(), onTraining: fn(), onTutorial: fn(), onConnect: fn(), onPlayFree: fn() } } satisfies Meta<typeof PlayScene>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Connected: Story = { args: PLAY.connected };

/** No wallet: the Challenge asks to connect. */
export const Guest: Story = { args: PLAY.guest };

export const PurchasesPaused: Story = { args: PLAY.paused };
/** P-61: two free games from the quests: Free Challenge spends one. */
export const FreeGame: Story = { args: PLAY.freeGame };
