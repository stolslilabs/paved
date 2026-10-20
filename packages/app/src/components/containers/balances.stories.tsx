import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { BIG_AMOUNT_18, BIG_AMOUNT_6 } from "../../mocks/stress";
import { Balances, type BalancesProps, type BalancesState } from "./balances";
import { BalancesProvider } from "./balances-context";
import { TabPage } from "./tab-page";

const meta = {
  title: "Containers/Balances",
  component: Balances,
  args: { layout: "pill", onAction: fn(), onConnect: fn(), faucet: true, state: { status: "ready", usdc: 48_500_000n, paved: 142_350_000_000_000_000_000n, cobbles: 240 } },
} satisfies Meta<typeof Balances>;
export default meta;
type Story = StoryObj<typeof meta>;

const MOBILE = { viewport: { value: "mobile", isRotated: false } } as const;
const WIDE = { viewport: { value: "wide", isRotated: false } } as const;

/** In a tab page, as the shell lays it out: the pill in the header below `desktop`, the three balances at the end of the navigation's header from it (direction D). */
function InPage({ state, onAction, onConnect, faucet }: Pick<BalancesProps, "state" | "onAction" | "onConnect" | "faucet">) {
  return (
    <BalancesProvider value={{ state, onAction, onConnect, faucet }}>
      <TabPage tab="vault" title="Vault">
        <div data-slot="card" className="h-40 rounded-xl border border-border bg-card" />
      </TabPage>
    </BalancesProvider>
  );
}
const page = (state: BalancesState): Story => ({ render: (args) => <InPage {...args} state={state} /> });

const CONNECTED: BalancesState = { status: "ready", usdc: 48_500_000n, paved: 142_350_000_000_000_000_000n, cobbles: 240 };

/** Mobile (360): the pill in the header. */
export const Connected: Story = { ...page(CONNECTED), globals: MOBILE };
/** Mobile: the sheet a tap on the pill opens, each balance with its action. */
export const Sheet: Story = { args: { defaultOpen: true }, globals: MOBILE };
export const Loading: Story = { ...page({ status: "loading" }), globals: MOBILE };
export const ErrorState: Story = { args: { defaultOpen: true, state: { status: "error", message: "The balances could not be read." } }, globals: MOBILE };
/** A guest: Connect instead of the figures. */
export const Disconnected: Story = { ...page({ status: "disconnected" }), globals: MOBILE };
/** WRAP360: the widest amounts. */
export const Stress: Story = { args: { defaultOpen: true, state: { status: "ready", usdc: BIG_AMOUNT_6, paved: BIG_AMOUNT_18, cobbles: 999_999 } }, globals: MOBILE };

/** Desktop (1440): the three balances always visible at the end of the navigation's header. */
export const RailConnected: Story = { ...page(CONNECTED), globals: WIDE };
export const RailLoading: Story = { ...page({ status: "loading" }), globals: WIDE };
export const RailError: Story = { ...page({ status: "error", message: "The balances could not be read." }), globals: WIDE };
export const RailDisconnected: Story = { ...page({ status: "disconnected" }), globals: WIDE };
