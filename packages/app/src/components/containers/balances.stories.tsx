import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useState } from "react";
import { fn } from "storybook/test";
import { BIG_AMOUNT_18, BIG_AMOUNT_6 } from "../../mocks/stress";
import { PHONE_320, PHONE_375, WIDE_1440 } from "../scenes/viewports";
import { Balances, type BalancesProps, type BalancesState } from "./balances";
import { BalancesProvider, BalancesSlot } from "./balances-context";
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

type InProps = Pick<BalancesProps, "state" | "onAction" | "onConnect" | "faucet">;

/**
 * In a tab page, as the shell lays it out (ONE-HEADER, #781): the home's balances at the header's top right, the Cobbles' pill
 * below `desktop`, every balance's rail from it.
 */
function InPage({ state, onAction, onConnect, faucet }: InProps) {
  return (
    <BalancesProvider value={{ state, onAction, onConnect, faucet }}>
      <TabPage tab="vault" title="Vault">
        <div data-slot="card" className="h-40 rounded-xl border border-border bg-card" />
      </TabPage>
    </BalancesProvider>
  );
}
const page = (state: BalancesState): Story => ({ render: (args) => <InPage {...args} state={state} /> });

/** In a full-screen flow (#620): the same header, the same balances (#781). */
function InFlow({ state, onAction, onConnect, faucet }: InProps) {
  return (
    <BalancesProvider value={{ state, onAction, onConnect, faucet }}>
      <div className="flex min-h-dvh flex-col bg-background text-foreground">
        <TopBar title="Choose a mode" onBack={fn()} />
        <div className="mx-auto h-40 w-full max-w-md rounded-xl border border-border bg-card" data-slot="card" />
      </div>
    </BalancesProvider>
  );
}
const flow = (state: BalancesState): Story => ({ render: (args) => <InFlow {...args} state={state} /> });

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

/**
 * The home's top right (#828), as the home lays it out: the balances one under the other, right-aligned, in the same set as each
 * width's header (#781): the Cobbles alone below `desktop`, every balance from it.
 */
function HomeCorner({ state, onAction, onConnect, faucet }: InProps) {
  return (
    <BalancesProvider value={{ state, onAction, onConnect, faucet }}>
      <div className="flex min-h-dvh justify-end bg-background p-2 text-foreground tablet:p-4">
        <BalancesSlot layout="pill" className="desktop:hidden" />
        <BalancesSlot layout="rail" direction="column" className="hidden desktop:flex" />
      </div>
    </BalancesProvider>
  );
}
const corner = (state: BalancesState): Story => ({ render: (args) => <HomeCorner {...args} state={state} />, parameters: { layout: "fullscreen" } });

/** The balances change every 2 s: a pack bought (Cobbles up, USDC down), then Cobbles spent and PAVED earned. */
function Live({ layout, direction, onAction }: Pick<BalancesProps, "layout" | "direction" | "onAction">) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setStep((s) => (s + 1) % STEPS.length), 2000);
    return () => clearInterval(timer);
  }, []);
  return (
    <div className="flex justify-end p-6">
      {/* The rail is the header's from `desktop`; drawn alone at a phone's width, its plates wrap. */}
      <Balances layout={layout} direction={direction} state={STEPS[step]!} onAction={onAction} faucet className={direction === "column" ? undefined : "flex-wrap justify-end"} />
    </div>
  );
}

/** Mobile (360): the Cobbles' plate alone, at the header's top right, leading to the packs (#781: on every page). */
export const Connected: Story = { ...page(CONNECTED), globals: MOBILE };
export const Loading: Story = { ...page({ status: "loading" }), globals: MOBILE };
/** The balances could not be read: a mark on a phone, its message in its name. */
export const ErrorState: Story = { args: { state: { status: "error", message: "The balances could not be read." } }, globals: MOBILE };
/** A guest: Connect instead of the figures. */
export const Disconnected: Story = { ...page({ status: "disconnected" }), globals: MOBILE };
/** WRAP360: the widest amounts. */
export const Stress: Story = { args: { state: { status: "ready", usdc: BIG_AMOUNT_6, paved: BIG_AMOUNT_18, cobbles: 999_999 } }, globals: MOBILE };

/** Desktop (1440): every balance always visible at the header's top right. */
export const RailConnected: Story = { ...page(CONNECTED), globals: WIDE };
/** A Vault holder: vPAVED joins the rail. */
export const RailHolder: Story = { ...page(HOLDER), globals: WIDE };
export const RailLoading: Story = { ...page({ status: "loading" }), globals: WIDE };
export const RailError: Story = { ...page({ status: "error", message: "The balances could not be read." }), globals: WIDE };
export const RailDisconnected: Story = { ...page({ status: "disconnected" }), globals: WIDE };

/** A flow on a phone: the Cobbles in the top bar's row, nothing under it (#781). */
export const FlowConnected: Story = { ...flow(CONNECTED), globals: MOBILE };
export const FlowDisconnected: Story = { ...flow({ status: "disconnected" }), globals: MOBILE };
/** A flow from `desktop`: the balances on the top bar's right. */
export const FlowRail: Story = { ...flow(HOLDER), globals: WIDE };

/** The balances changing, on a phone: each plate counts, pops up or dips down. */
export const LiveChanges: Story = { render: (args) => <Live layout="pill" onAction={args.onAction} />, globals: MOBILE };
/** The rail changing. */
export const RailLiveChanges: Story = { render: (args) => <Live layout="rail" onAction={args.onAction} />, globals: WIDE };
/** Reduced motion: a colour flash on each change, nothing moves. */
export const LiveChangesReducedMotion: Story = { ...RailLiveChanges, parameters: { reducedMotion: "always" } };

/** The home's stack (#828) at 320 px: the Cobbles' plate alone at the top right, its "+" over the left end. */
export const Stack320: Story = { ...corner(CONNECTED), ...PHONE_320, parameters: { ...PHONE_320.parameters, layout: "fullscreen" } };
/** At 375 px, the same. */
export const Stack375: Story = { ...corner(CONNECTED), ...PHONE_375, parameters: { ...PHONE_375.parameters, layout: "fullscreen" } };
/** At 1440 px: every balance one under the other, right-aligned, each icon over its plate's right end. */
export const Stack1440: Story = { ...corner(CONNECTED), ...WIDE_1440 };
/** A Vault holder at 1440 px: vPAVED joins the stack. */
export const StackHolder1440: Story = { ...corner(HOLDER), ...WIDE_1440 };
export const StackLoading1440: Story = { ...corner({ status: "loading" }), ...WIDE_1440 };
/** The widest amounts in the stack. */
export const StackStress1440: Story = { ...corner({ status: "ready", usdc: BIG_AMOUNT_6, paved: BIG_AMOUNT_18, vpaved: BIG_AMOUNT_18, cobbles: 999_999 }), ...WIDE_1440 };
/** Every balance's column drawn at a phone's width (the home shows the Cobbles alone there): it fits at 320 px. */
export const StackAllAtPhone: Story = { render: (args) => <Balances layout="rail" direction="column" state={HOLDER} onAction={args.onAction} faucet />, globals: MOBILE };
/** The stack changing: each plate counts, pops up or dips down. */
export const StackLiveChanges: Story = { render: (args) => <Live layout="rail" direction="column" onAction={args.onAction} />, ...WIDE_1440 };
