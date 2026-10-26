import type { Decorator, Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { BalancesProvider } from "./balances-context";
import { MockMarkProvider } from "./mock-mark";
import { TopBar } from "./top-bar";
import { LONG_LABEL, LONG_WORD } from "../../mocks/stress";
import { PHONE_320, PHONE_375, WIDE_1440 } from "../scenes/viewports";

const meta = { title: "Containers/TopBar", component: TopBar, args: { title: "Choose a mode", onBack: fn() } } satisfies Meta<typeof TopBar>;
export default meta;
type Story = StoryObj<typeof meta>;

export const WithBack: Story = {};
export const NoBack: Story = { args: { onBack: undefined, title: "Something broke" } };
/** No balances: an error's page (`RouteError`), the end of an attack. */
export const NoBalances: Story = { args: { title: "Something broke", onBack: undefined, balances: false } };
/** WRAP360: a long title keeps one line, cut with an ellipsis (the whole title in `title`, #760); the bar keeps its height (HEADER-HEIGHT). */
export const Stress: Story = { args: { title: `${LONG_LABEL} ${LONG_WORD}` } };
/** MOCK-MARK (#622): "Mock" on the title's line, after the title. */
export const WithMark: Story = {
  args: { title: "Challenge" },
  decorators: [(Story) => <MockMarkProvider value><Story /></MockMarkProvider>],
};
/** A long title is cut on one line; the mark stays after it while it fits. */
export const WithMarkLongTitle: Story = {
  args: { title: "Challenge of the long winter day" },
  decorators: WithMark.decorators,
};
/** The stress title with the mark, cut on one line. */
export const WithMarkStress: Story = { args: Stress.args, decorators: WithMark.decorators };

const READY = { status: "ready", usdc: 48_500_000n, paved: 142_350_000_000_000_000_000n, cobbles: 240 } as const;
const withBalances: Decorator[] = [
  (Story) => (
    <BalancesProvider value={{ state: READY, onAction: fn() }}>
      <Story />
    </BalancesProvider>
  ),
];
/** A flow's column (`min-h-dvh`), its content taller than the viewport, as the avatar page and the packs lay themselves out. */
const inColumn: Decorator = (Story) => (
  <div className="flex min-h-dvh flex-col bg-background text-foreground">
    <Story />
    <main className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 pb-6">
      {Array.from({ length: 10 }, (_, i) => (
        <div key={i} data-slot="card" className="flex h-24 shrink-0 items-center rounded-xl border border-border bg-card px-4 text-sm">
          Card {i + 1}
        </div>
      ))}
    </main>
  </div>
);

/**
 * ONE-HEADER (#781), at 375 px: a flow (the avatar page) has the tab pages' header: Back and the title at the top left, the home's
 * Cobbles at the top right, one row, nothing under it.
 */
export const PhoneCobbles: Story = {
  ...PHONE_375,
  args: { title: "Avatar" },
  parameters: { ...PHONE_375.parameters, layout: "fullscreen" },
  decorators: [inColumn, ...withBalances],
};
/** At 320 px, a long title: the title gives way first (an ellipsis), never Back nor the Cobbles. */
export const Phone320Cobbles: Story = {
  ...PHONE_320,
  args: { title: LONG_LABEL },
  parameters: { ...PHONE_320.parameters, layout: "fullscreen" },
  decorators: [inColumn, ...withBalances],
};
/** At 1440 px: every balance (the home's rail) on the bar's row, nothing under it. */
export const WideBalances: Story = {
  ...WIDE_1440,
  args: { title: "Avatar" },
  parameters: { layout: "fullscreen" },
  decorators: [inColumn, ...withBalances],
};
/** At 375 px, scrolled to the bottom: the bar is sticky, so Back stays in view, the fade under it shows the page has more above. */
export const PhoneScrolled: Story = {
  ...PhoneCobbles,
  play: async () => {
    window.scrollTo(0, document.documentElement.scrollHeight);
  },
};
