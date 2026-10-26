import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { WIDE_1440 } from "../scenes/viewports";
import { BalancesProvider } from "./balances-context";
import PagePanel from "./page-panel";
import { TabPage } from "./tab-page";
import { TopBar } from "./top-bar";
import { scrolledToEnd } from "../../stories/scrolled-to-end";

const CARDS = Array.from({ length: 10 }, (_, i) => (
  <div key={i} data-slot="card" className="flex h-24 shrink-0 items-center rounded-xl border border-border bg-card px-4 text-sm tablet:h-32 desktop:h-40">
    Card {i + 1}: the phone's height in the panel (the `tablet` and `desktop` variants skip it)
  </div>
));

const READY = { status: "ready", usdc: 100_000_000n, paved: 129_110_000_000_000_000_000n, cobbles: 640 } as const;

/**
 * The side panel of the overlay's pages from `desktop` (DESK-PANELS, #762): 28 rem on the right, over the dimmed village, the page
 * laid out as on a phone (the cards keep their phone height at 1440 px). No close button (#782): a click on the village or
 * Escape closes it. The body scrolls when the page is taller than the panel. The Cobbles show in the header where the page's rule shows them. The scenes in it: `Scenes/Home/Panels`.
 */
const meta = {
  title: "Containers/PagePanel",
  component: PagePanel,
  parameters: { layout: "fullscreen" },
  args: { open: true, title: "Missions", top: true, onClose: fn(), children: null },
  ...WIDE_1440,
} satisfies Meta<typeof PagePanel>;
export default meta;
type Story = StoryObj<typeof meta>;

/** A tab page of the overlay (`TabPage`): no Back, the Cobbles in its header (no close, #782), the content scrolling under it. */
export const TabPageInPanel: Story = {
  render: (args) => (
    <BalancesProvider value={{ state: READY, onAction: fn(), show: { phone: true, desktop: "all" } }}>
      <PagePanel {...args}>
        <TabPage tab="quests" title="Missions">
          {CARDS}
        </TabPage>
      </PagePanel>
    </BalancesProvider>
  ),
};

/** A page reached from another (the themes, from Settings): Back to it. */
export const WithBack: Story = {
  args: { title: "Themes", top: false },
  render: (args) => (
    <BalancesProvider value={{ state: READY, onAction: fn(), show: { phone: true, desktop: "all" } }}>
      <PagePanel {...args}>
        <TabPage tab="settings" title="Themes" onBack={fn()}>
          {CARDS}
        </TabPage>
      </PagePanel>
    </BalancesProvider>
  ),
};

/** A flow's top bar as the panel's header (the Chests, the Shop, Play): its title centred, no balance where the rule shows none. */
export const TopBarInPanel: Story = {
  args: { title: "Vault" },
  render: (args) => (
    <BalancesProvider value={{ state: READY, onAction: fn(), show: { phone: false, desktop: "all" } }}>
      <PagePanel {...args}>
        <TopBar title="Vault" onBack={fn()} />
        <main className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 pb-6">{CARDS}</main>
      </PagePanel>
    </BalancesProvider>
  ),
};

/** PAGES-SCROLL (#782): the panel's body scrolled to the page's last card, its header sticky at the top, the fade under it. */
export const ScrolledToEnd: Story = { ...TabPageInPanel, play: scrolledToEnd };
