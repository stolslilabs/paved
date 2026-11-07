import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { WIDE_1440 } from "../scenes/viewports";
import { BalancesProvider } from "./balances-context";
import PagePanel from "./page-panel";
import { TabPage } from "./tab-page";
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
 * Escape closes it. The body scrolls when the page is taller than the panel. The home's Cobbles show in every page's header
 * (#781). The scenes in it: `Scenes/Home/Panels`.
 */
const meta = {
  title: "Containers/PagePanel",
  component: PagePanel,
  parameters: { layout: "fullscreen" },
  args: { open: true, title: "Missions", onClose: fn(), children: null },
  ...WIDE_1440,
} satisfies Meta<typeof PagePanel>;
export default meta;
type Story = StoryObj<typeof meta>;

/** A tab page of the overlay (`TabPage`): no Back, the Cobbles in its header (no close, #782), the content scrolling under it. */
export const TabPageInPanel: Story = {
  render: (args) => (
    <BalancesProvider value={{ state: READY, onAction: fn() }}>
      <PagePanel {...args}>
        <TabPage title="Missions">
          {CARDS}
        </TabPage>
      </PagePanel>
    </BalancesProvider>
  ),
};

/** PAGES-SCROLL (#782): the panel's body scrolled to the page's last card, its header sticky at the top, the fade under it. */
export const ScrolledToEnd: Story = { ...TabPageInPanel, play: scrolledToEnd };
