import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { Score } from "../elements/score";
import { BalancesProvider } from "./balances-context";
import { MockMarkProvider } from "./mock-mark";
import { TopBar } from "./top-bar";
import { LONG_LABEL, LONG_WORD } from "../../mocks/stress";

const meta = { title: "Containers/TopBar", component: TopBar, args: { title: "Choose a mode", onBack: fn() } } satisfies Meta<typeof TopBar>;
export default meta;
type Story = StoryObj<typeof meta>;

export const WithBack: Story = {};
export const NoBack: Story = { args: { onBack: undefined, title: "Final score" } };
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
 * A bar in a card (`max-w-2xl`, as over a board) with the balances' rail and a score on its right, at desktop: two sides that
 * wide leave the centred title no room, so each side takes its own width and the title the rest (`sideWidth`), off centre but on
 * one line, never a letter a line.
 */
export const NarrowWithBalances: Story = {
  args: { title: "Final board", end: <Score value={7_558} size="sm" tone="gold" className="pr-2" />, className: "mb-0 pt-0" },
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
