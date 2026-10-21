import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { HOME } from "../../mocks/scenes";
import { ProfileProvider } from "../containers/profile-context";
import { HomeScene } from "./home-scene";

/**
 * Home (`/`): the avatar at the top left (#624), a guest's notice, the game to resume, the modes, the Challenge, the five tabs.
 * One story per state; the Viewport control reframes it. The avatar is the shell's (`ProfileProvider`): here it follows the
 * story's `player`.
 */
const meta = {
  title: "Scenes/Home",
  component: HomeScene,
  args: { onPlay: fn(), onChallenge: fn(), onTraining: fn(), onStory: fn(), onResume: fn(), onConnect: fn(), onNavigate: fn(), onPlayFree: fn() },
  decorators: [
    (Story, { args }) => (
      <ProfileProvider value={{ state: args.player ? { status: "connected", data: args.player } : { status: "guest", connecting: args.connecting }, onConnect: fn(), onDisconnect: fn(), onCopy: fn(async () => {}) }}>
        <Story />
      </ProfileProvider>
    ),
  ],
} satisfies Meta<typeof HomeScene>;
export default meta;
type Story = StoryObj<typeof meta>;

/** A connected player with a Challenge game running and a Training save. */
export const Connected: Story = { args: HOME.connected };

/** No wallet: the connect call, Training and Story mode open. */
export const Guest: Story = { args: HOME.guest };

/** `spawn_paused`: the Challenge card is disabled, the running game still resumes. */
export const PurchasesPaused: Story = { args: HOME.paused };
/** WRAP360: long names and sentences, full addresses, large figures. */
export const Stress: Story = { args: HOME.stress };
/** P-61: the Cobble balance in the header. */
export const Cobbles: Story = { args: HOME.cobbles };
/** P-61: two free games from the quests: Free game spends one. */
export const FreeGame: Story = { args: HOME.freeGame };
