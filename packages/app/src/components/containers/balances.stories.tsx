import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useState } from "react";
import { fn } from "storybook/test";
import { BIG_AMOUNT_18, BIG_AMOUNT_6 } from "../../mocks/stress";
import { Balances, type BalancesProps, type BalancesState } from "./balances";
import { BalancesProvider, type HeaderBalances } from "./balances-context";
import { TabPage } from "./tab-page";
import { TopBar } from "./top-bar";

const meta = {
  title: "Containers/Balances",
  component: Balances,
  args: { layout: "pill", onAction: fn(), onConnect: fn(), faucet: true, state: { status: "ready", usdc: 48_500_000n, paved: 142_350_000_000_000_000_000n, cobbles: 240 } },
} satisfies Meta<typeof Balances>;
export default meta;
type Story = StoryObj<typeof meta>;

const MOBILE = { viewport: { value: "mobile", isRotated: false } } as const;
const WIDE = { viewport: { value: "wide", isRotated: false } } as const;

type InProps = Pick<BalancesProps, "state" | "onAction" | "onConnect" | "faucet"> & { show?: HeaderBalances };
/** A page with no balance on a phone (#720: Vault, Play, Settings…): every balance from `desktop`. */
const DESKTOP_ONLY: HeaderBalances = { phone: false, desktop: "all" };

/**
 * In a tab page, as the shell lays it out: the Cobbles in the header below `desktop` where the page's rule shows them (#720),
 * every balance at the end of the navigation's header from it (direction D).
 */
function InPage({ state, onAction, onConnect, faucet, show }: InProps) {
  return (
    <BalancesProvider value={{ state, onAction, onConnect, faucet, show }}>
      <TabPage tab="vault" title="Vault">
        <div data-slot="card" className="h-40 rounded-xl border border-border bg-card" />
      </TabPage>
    </BalancesProvider>
  );
}
const page = (state: BalancesState, show?: HeaderBalances): Story => ({ render: (args) => <InPage {...args} state={state} show={show} /> });

/** In a full-screen flow (#620): the Cobbles in the page under the top bar below `desktop` where the rule shows them (#760), the bar's right side from it. */
function InFlow({ state, onAction, onConnect, faucet, show }: InProps) {
  return (
    <BalancesProvider value={{ state, onAction, onConnect, faucet, show }}>
      <div className="flex min-h-dvh flex-col bg-background text-foreground">
        <TopBar title="Choose a mode" onBack={fn()} />
        <div className="mx-auto h-40 w-full max-w-md rounded-xl border border-border bg-card" data-slot="card" />
      </div>
    </BalancesProvider>
  );
}
const flow = (state: BalancesState, show?: HeaderBalances): Story => ({ render: (args) => <InFlow {...args} state={state} show={show} /> });

type Ready = Extract<BalancesState, { status: "ready" }>;
// No Vault position: a known zero (the vault read's `shares`), so a first deposit animates its plate in.
const CONNECTED: Ready = { status: "ready", usdc: 48_500_000n, paved: 142_350_000_000_000_000_000n, vpaved: 0n, cobbles: 240 };
/** A Vault holder: vPAVED joins the balances. */
const HOLDER: Ready = { ...CONNECTED, vpaved: 1_250_400_000_000_000_000n };
const STEPS: readonly Ready[] = [
  CONNECTED,
  { ...CONNECTED, cobbles: 340, usdc: 42_500_000n },
  { ...CONNECTED, cobbles: 290, paved: 154_850_000_000_000_000_000n, vpaved: 500_000_000_000_000_000n },
];

/** The balances change every 2 s: a pack bought (Cobbles up, USDC down), then Cobbles spent and PAVED earned. */
function Live({ layout, onAction }: Pick<BalancesProps, "layout" | "onAction">) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setStep((s) => (s + 1) % STEPS.length), 2000);
    return () => clearInterval(timer);
  }, []);
  return (
    <div className="flex justify-end p-6">
      {/* The rail is the header's from `desktop`; drawn alone at a phone's width, its plates wrap. */}
      <Balances layout={layout} state={STEPS[step]!} onAction={onAction} faucet className="flex-wrap justify-end" />
    </div>
  );
}

/** Mobile (360), a page where Cobbles move (#720): the Cobbles' plate alone, under the header, leading to the packs. */
export const Connected: Story = { ...page(CONNECTED), globals: MOBILE };
/** Mobile, a page where no Cobbles move (#720): no balance, and the header is its title row alone. */
export const NoneOnPhone: Story = { ...page(CONNECTED, DESKTOP_ONLY), globals: MOBILE };
export const Loading: Story = { ...page({ status: "loading" }), globals: MOBILE };
/** The balances could not be read: a mark on a phone, its message in its name. */
export const ErrorState: Story = { args: { state: { status: "error", message: "The balances could not be read." } }, globals: MOBILE };
/** A guest: Connect instead of the figures. */
export const Disconnected: Story = { ...page({ status: "disconnected" }), globals: MOBILE };
/** WRAP360: the widest amounts. */
export const Stress: Story = { args: { state: { status: "ready", usdc: BIG_AMOUNT_6, paved: BIG_AMOUNT_18, cobbles: 999_999 } }, globals: MOBILE };
/** The rail without the Cobbles, where the page draws its own (the village, #720): the Cobbles never show twice. */
export const RailNoCobbles: Story = { args: { layout: "rail", noCobbles: true, state: HOLDER }, globals: WIDE };

/** Desktop (1440): every balance always visible at the end of the navigation's header. */
export const RailConnected: Story = { ...page(CONNECTED), globals: WIDE };
/** A Vault holder: vPAVED joins the rail. */
export const RailHolder: Story = { ...page(HOLDER), globals: WIDE };
export const RailLoading: Story = { ...page({ status: "loading" }), globals: WIDE };
export const RailError: Story = { ...page({ status: "error", message: "The balances could not be read." }), globals: WIDE };
export const RailDisconnected: Story = { ...page({ status: "disconnected" }), globals: WIDE };

/** A flow where Cobbles move (the packs, the avatar) on a phone: the Cobbles in the page, under the top bar (#760). */
export const FlowConnected: Story = { ...flow(CONNECTED), globals: MOBILE };
/** A flow where no Cobbles move (Play, the purchase, Story) on a phone: nothing under the bar (56 px). */
export const FlowNoneOnPhone: Story = { ...flow(CONNECTED, DESKTOP_ONLY), globals: MOBILE };
export const FlowDisconnected: Story = { ...flow({ status: "disconnected" }), globals: MOBILE };
/** A flow from `desktop`: the balances on the top bar's right. */
export const FlowRail: Story = { ...flow(HOLDER), globals: WIDE };

/** The balances changing, on a phone: each plate counts, pops up or dips down. */
export const LiveChanges: Story = { render: (args) => <Live layout="pill" onAction={args.onAction} />, globals: MOBILE };
/** The rail changing. */
export const RailLiveChanges: Story = { render: (args) => <Live layout="rail" onAction={args.onAction} />, globals: WIDE };
/** Reduced motion: a colour flash on each change, nothing moves. */
export const LiveChangesReducedMotion: Story = { ...RailLiveChanges, parameters: { reducedMotion: "always" } };
