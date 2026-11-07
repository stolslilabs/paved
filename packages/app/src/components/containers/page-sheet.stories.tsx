import type { ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { COBBLES, PLAY } from "../../mocks/scenes";
import { CobblesScene } from "../scenes/cobbles-scene";
import { PlayScene } from "../scenes/play-scene";
import { PHONE_375, WIDE_1440 } from "../scenes/viewports";
import { BalancesProvider } from "./balances-context";
import { BalancesOf } from "./balances-of";
import PagePanel from "./page-panel";
import PageSheet from "./page-sheet";

const READY = { status: "ready", usdc: 100_000_000n, paved: 129_110_000_000_000_000_000n, cobbles: 640 } as const;

/**
 * BACK-RULE (#783, the owner's decisions of 2026-10-26): no page opens another page. The sheet the app opens today is the Cobble
 * packs', over the page that asks for them: from the bottom on a phone (a drag down closes it), from the right from `desktop`. Its
 * header has Back, the title and the balances: Back (or Escape, a tap outside, a drag down) closes it. Story's campaigns (a view of
 * Play's drawer since STORY-PAGE) and Settings' pages (views of its drawer since SETTINGS-PAGE) left it. On the mock.
 */
const meta = {
  title: "Containers/PageSheet",
  component: PageSheet,
  parameters: { layout: "fullscreen" },
  args: { open: true, title: "Cobbles", side: "bottom", onClose: fn(), children: null },
} satisfies Meta<typeof PageSheet>;
export default meta;
type Story = StoryObj<typeof meta>;

const PLAY_PAGE = <PlayScene {...PLAY.connected} onBack={fn()} onChallenge={fn()} onTraining={fn()} onStory={fn()} onAttack={fn()} />;

/** The page under the sheet (Play by default): a full page on a phone, the side panel from `desktop`. */
function OverPage({ panel, under = PLAY_PAGE, title = "Play", children }: { panel: boolean; under?: ReactNode; title?: string; children: ReactNode }) {
  return (
    <BalancesProvider value={{ state: READY, onAction: fn() }}>
      {panel ? (
        <PagePanel open title={title} onClose={fn()}>
          {under}
        </PagePanel>
      ) : (
        under
      )}
      {children}
    </BalancesProvider>
  );
}

const sheet = (title: string, page: ReactNode, wide = false, under?: { page: ReactNode; title: string }): Story => ({
  args: { title, side: wide ? "right" : "bottom" },
  render: (args) => (
    <OverPage panel={wide} under={under?.page} title={under?.title}>
      <PageSheet {...args}>{page}</PageSheet>
    </OverPage>
  ),
  ...(wide ? WIDE_1440 : PHONE_375),
});

// In the sheet the packs show their own balances, the Cobbles and USDC, not the page's under them (#855: the packs' page).
const packs = (
  <BalancesOf page="cobbles">
    <CobblesScene {...COBBLES.packs} onBack={fn()} onSelectPack={fn()} onBuyPack={fn()} />
  </BalancesOf>
);
/** The Cobble packs in place over the page that asked for them (here Play, from the header's Cobbles): no page is opened. */
export const CobblesPhone: Story = sheet("Cobbles", packs);
export const CobblesWide: Story = sheet("Cobbles", packs, true);
/** Reduced motion: the sheet appears without sliding. */
export const ReducedMotion: Story = { ...CobblesPhone, parameters: { ...CobblesPhone.parameters, reducedMotion: "always" } };
