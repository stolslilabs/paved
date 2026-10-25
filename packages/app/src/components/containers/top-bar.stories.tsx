import type { Decorator, Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { Score } from "../elements/score";
import { BalancesProvider, type HeaderBalances } from "./balances-context";
import { MockMarkProvider } from "./mock-mark";
import { TopBar } from "./top-bar";
import { LONG_LABEL, LONG_WORD } from "../../mocks/stress";
import { PHONE_320, PHONE_375, WIDE_1440 } from "../scenes/viewports";

const meta = { title: "Containers/TopBar", component: TopBar, args: { title: "Choose a mode", onBack: fn() } } satisfies Meta<typeof TopBar>;
export default meta;
type Story = StoryObj<typeof meta>;

export const WithBack: Story = {};
export const NoBack: Story = { args: { onBack: undefined, title: "Something broke" } };
export const WithAction: Story = {
  args: {
    end: (
      <Button variant="ghost" size="icon" aria-label="Settings">
        <Icon name="gear" />
      </Button>
    ),
  },
};
/** WRAP360: a long title keeps one line, cut with an ellipsis (the whole title in `title`, #760); the bar keeps its height (HEADER-HEIGHT). */
export const Stress: Story = { args: { title: `${LONG_LABEL} ${LONG_WORD}` } };
/** MOCK-MARK (#622): "Mock" on the title's line, the title and the mark centred together. */
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

/**
 * A bar in a card (`max-w-2xl`) with the balances' rail and a figure on its right, at desktop: two sides that wide leave the
 * centred title no room, so each side takes its own width and the title the rest (`sideWidth`), off centre but on one line,
 * never a letter a line.
 */
export const NarrowWithBalances: Story = {
  args: { title: "Cobbles", end: <Score value={7_558} size="sm" tone="gold" className="pr-2" />, className: "mb-0 pt-0" },
  globals: { viewport: { value: "desktop", isRotated: false } },
  decorators: [
    (Story) => (
      <BalancesProvider value={{ state: { status: "ready", usdc: 100_000_000n, paved: 129_110_000_000_000_000_000n, cobbles: 10 }, faucet: true }}>
        <div className="flex justify-center p-4">
          <div data-slot="card" className="w-full max-w-2xl rounded-xl border border-border bg-card/95">
            <Story />
          </div>
        </div>
      </BalancesProvider>
    ),
  ],
};

const READY = { status: "ready", usdc: 48_500_000n, paved: 142_350_000_000_000_000_000n, cobbles: 240 } as const;
const withBalances = (show: HeaderBalances): Decorator[] => [
  (Story) => (
    <BalancesProvider value={{ state: READY, onAction: fn(), show }}>
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
 * PAGE-HEADER (#760), at 375 px: a flow where Cobbles move (the packs, the avatar). The bar stays one row, 56 px; the Cobbles
 * sit in the page, under it at the top right, and scroll with it.
 */
export const PhoneCobbles: Story = {
  ...PHONE_375,
  args: { title: "Avatar" },
  parameters: { ...PHONE_375.parameters, layout: "fullscreen" },
  decorators: [inColumn, ...withBalances({ phone: true, desktop: "all" })],
};
/** At 375 px, a flow where none move (Play, the purchase, Story): nothing under the bar; its balances show from `desktop`. */
export const PhoneNoBalances: Story = { ...PHONE_375, args: { title: "Choose a mode" }, decorators: withBalances({ phone: false, desktop: "all" }) };
/** At 320 px, the Cobbles and a long title with an action: one row, the title cut with an ellipsis. */
export const Phone320Cobbles: Story = {
  ...PHONE_320,
  args: { title: LONG_LABEL, end: WithAction.args!.end },
  parameters: { ...PHONE_320.parameters, layout: "fullscreen" },
  decorators: [inColumn, ...withBalances({ phone: true, desktop: "all" })],
};
/** At 1440 px: every balance on the bar's row, before `end`, nothing under it. */
export const WideBalances: Story = {
  ...WIDE_1440,
  args: { title: "Avatar" },
  parameters: { layout: "fullscreen" },
  decorators: [inColumn, ...withBalances({ phone: true, desktop: "all" })],
};
/** At 375 px, scrolled to the bottom: the bar is sticky, so Back stays in view, the fade under it shows the page has more above. */
export const PhoneScrolled: Story = {
  ...PhoneCobbles,
  play: async () => {
    window.scrollTo(0, document.documentElement.scrollHeight);
  },
};
