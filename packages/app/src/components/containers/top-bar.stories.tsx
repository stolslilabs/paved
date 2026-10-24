import type { Decorator, Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { Score } from "../elements/score";
import { BalancesProvider, type HeaderBalances } from "./balances-context";
import { MockMarkProvider } from "./mock-mark";
import { TopBar } from "./top-bar";
import { LONG_LABEL, LONG_WORD } from "../../mocks/stress";
import { PHONE_375 } from "../scenes/viewports";

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
/** WRAP360: a long title wraps, two lines at most, then an ellipsis (the whole title in `title`); the bar keeps its height (HEADER-HEIGHT). */
export const Stress: Story = { args: { title: `${LONG_LABEL} ${LONG_WORD}` } };
/** MOCK-MARK (#622): "Mock" on the title's line, the title and the mark centred together. */
export const WithMark: Story = {
  args: { title: "Challenge" },
  decorators: [(Story) => <MockMarkProvider value><Story /></MockMarkProvider>],
};
/** A long title wraps; the mark stays on its last line. */
export const WithMarkLongTitle: Story = {
  args: { title: "Challenge of the long winter day" },
  decorators: WithMark.decorators,
};
/** The stress title with the mark: a compound breaks and the mark follows its last piece. */
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

/** HEADER-BALANCES (#720), at 375 px: a flow where Cobbles move (the packs, the avatar): the Cobbles' strip under the title row, 96 px. */
export const PhoneCobbles: Story = { ...PHONE_375, args: { title: "Cobbles" }, decorators: withBalances({ phone: true, desktop: "all" }) };
/** At 375 px, a flow where none move (Play, the purchase, Story): no strip, one row, 56 px; its balances show from `desktop`. */
export const PhoneNoBalances: Story = { ...PHONE_375, args: { title: "Choose a mode" }, decorators: withBalances({ phone: false, desktop: "all" }) };
