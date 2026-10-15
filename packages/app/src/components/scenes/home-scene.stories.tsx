import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { HOME } from "../../mocks/scenes";
import { HomeScene } from "./home-scene";

/** Home (`/`): the player's status, the game to resume, the modes, today's Challenge top 3, the five tabs. One story per state; the Viewport control reframes it. */
const meta = { title: "Scenes/Home", component: HomeScene, args: { onPlay: fn(), onChallenge: fn(), onTraining: fn(), onTutorial: fn(), onResume: fn(), onConnect: fn(), onNavigate: fn(), onPlayFree: fn() } } satisfies Meta<typeof HomeScene>;
export default meta;
type Story = StoryObj<typeof meta>;

/** A connected player with a Challenge game running and a Training save. */
export const Connected: Story = { args: HOME.connected };

/** No wallet: the connect call, Training and the Tutorial open. */
export const Guest: Story = { args: HOME.guest };

/** Nobody has finished a game today: an empty podium, no rank yet. */
export const FirstOfDay: Story = { args: HOME.firstOfDay };

/** `spawn_paused`: the Challenge card is disabled, the running game still resumes. */
export const PurchasesPaused: Story = { args: HOME.paused };
/** WRAP360: long names and sentences, full addresses, large figures. */
export const Stress: Story = { args: HOME.stress };
/** P-61: the gem balance in the header. */
export const Gems: Story = { args: HOME.gems };
/** P-61: two free games from the quests: Free game spends one. */
export const FreeGame: Story = { args: HOME.freeGame };
