import type { Decorator, Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { BalancesProvider } from "../containers/balances-context";
import { TOWN_HALL_PAGE } from "../../mocks/town-hall";
import { TownHallScene } from "./town-hall-scene";

/** The shell's balance at the drawer's header end: the Cobbles held. */
const withCobbles: Decorator = (Story, { args }) => (
  <BalancesProvider value={{ state: { status: "ready", usdc: 0n, paved: 0n, vpaved: 0n, cobbles: (args as { hall?: { cobbles: number | null } | null }).hall?.cobbles ?? 0 }, kinds: ["cobbles"], onAction: fn() }}>
    <Story />
  </BalancesProvider>
);

/** The Town Hall (`/town-hall`, TOWN-HALL-PAGE): the HUD's drawer, the level, the next one and what it asks, every level, the upgrade in the footer. One story per state; the viewport is the toolbar's (VP). */
const meta = { title: "Scenes/TownHall", component: TownHallScene, args: { onUpgrade: fn(), onDismissRefusal: fn(), onRetry: fn(), onGetCobbles: fn(), onBack: fn() }, decorators: [withCobbles] } satisfies Meta<typeof TownHallScene>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Level 3, the upgrade to level 4 within reach. */
export const Ready: Story = { args: TOWN_HALL_PAGE.ready };

/** A new village: level 1, the first upgrade within reach. */
export const First: Story = { args: TOWN_HALL_PAGE.first };

/** The player's level short: the upgrade held, the level it opens at said. */
export const LevelShort: Story = { args: TOWN_HALL_PAGE.levelShort };

/** The Cobbles short: the upgrade held, the way to the packs. */
export const CobblesShort: Story = { args: TOWN_HALL_PAGE.cobblesShort };

/** The upgrade on its way. */
export const Upgrading: Story = { args: TOWN_HALL_PAGE.upgrading };

/** The upgrade refused: the app's error, with Dismiss. */
export const Refused: Story = { args: TOWN_HALL_PAGE.refused };

/** The last level: no footer. */
export const Last: Story = { args: TOWN_HALL_PAGE.last };

/** The village on its way. */
export const Loading: Story = { args: TOWN_HALL_PAGE.loading };

/** The village's read failed, with Retry. */
export const Failed: Story = { args: TOWN_HALL_PAGE.failed };

/** No Town Hall served on this network. */
export const NotServed: Story = { args: TOWN_HALL_PAGE.notServed };
