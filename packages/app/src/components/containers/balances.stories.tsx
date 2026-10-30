import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useState } from "react";
import { fn } from "storybook/test";
import { cn } from "../../lib/utils";
import { BIG_AMOUNT_18, BIG_AMOUNT_6 } from "../../mocks/stress";
import { PHONE_320, PHONE_375, WIDE_1440 } from "../scenes/viewports";
import { HEADER_BALANCES, hereOf } from "../../routes/header-balances";
import { HOME_BALANCES } from "../scenes/home-village-scene";
import { Balances, type BalancesProps, type BalancesState, type ShownBalance } from "./balances";
import { BalancesProvider, BalancesSlot } from "./balances-context";
import { TabPage } from "./tab-page";
import { TopBar } from "./top-bar";

const meta = {
  title: "Containers/Balances",
  component: Balances,
  args: { layout: "pill", kinds: ["cobbles"], onAction: fn(), onConnect: fn(), onRetry: fn(), faucet: true, state: { status: "ready", usdc: 48_500_000n, paved: 142_350_000_000_000_000_000n, cobbles: 240 } },
} satisfies Meta<typeof Balances>;
export default meta;
type Story = StoryObj<typeof meta>;

const MOBILE = { viewport: { value: "mobile", isRotated: false } } as const;
const WIDE = { viewport: { value: "wide", isRotated: false } } as const;

type InProps = Pick<BalancesProps, "state" | "onAction" | "onConnect" | "onRetry" | "faucet">;

/**
 * In a tab page, as the shell lays it out (BALANCES-BY-PAGE, #855): the Vault's balances, PAVED and vPAVED, at the header's top
 * right, the phone's plates below `desktop`, the larger ones from it.
 */
function InPage({ state, onAction, onConnect, onRetry, faucet }: InProps) {
  return (
    <BalancesProvider value={{ state, kinds: HEADER_BALANCES.vault, here: VAULT_HERE, onAction, onConnect, onRetry, faucet }}>
      <TabPage tab="vault" title="Vault">
        <div data-slot="card" className="h-40 rounded-xl border border-border bg-card" />
      </TabPage>
    </BalancesProvider>
  );
}
const page = (state: BalancesState): Story => ({ render: (args) => <InPage {...args} state={state} /> });
/** The balances whose page is open, as the shell says (`here`): vPAVED on the Vault (PAVED leads to the Challenge, #871), the Cobbles on the packs. */
const VAULT_HERE = hereOf("/vault");

/** In a full-screen flow (#620): the same header, the flow's balances (#855): the Cobbles' packs', the Cobbles and USDC. */
function InFlow({ state, onAction, onConnect, onRetry, faucet, route }: InProps & { route: keyof typeof HEADER_BALANCES }) {
  return (
    <BalancesProvider value={{ state, kinds: HEADER_BALANCES[route], here: hereOf(`/${route}`), onAction, onConnect, onRetry, faucet }}>
      <div className="flex min-h-dvh flex-col bg-background text-foreground">
        <TopBar title={TITLES[route] ?? route} onBack={fn()} />
        <div className="mx-auto h-40 w-full max-w-md rounded-xl border border-border bg-card" data-slot="card" />
      </div>
    </BalancesProvider>
  );
}
const TITLES: Partial<Record<keyof typeof HEADER_BALANCES, string>> = { cobbles: "Cobbles", "play/challenge": "Purchase", vault: "Vault", "village/shop": "Tile shop", settings: "Settings" };
const flow = (state: BalancesState): Story => ({ render: (args) => <InFlow {...args} state={state} route="cobbles" /> });
/** One page's header (#855), by route: its own balances, nothing else. */
const pageOf = (route: keyof typeof HEADER_BALANCES, state: BalancesState = CONNECTED_STATE): Story => ({
  render: (args) => <InFlow {...args} state={state} route={route} />,
});

type Ready = Extract<BalancesState, { status: "ready" }>;
const CONNECTED_STATE: BalancesState = { status: "ready", usdc: 48_500_000n, paved: 142_350_000_000_000_000_000n, vpaved: 0n, cobbles: 240 };
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
 * The home's top right (#828), as the home lays it out: its own balances (#855: the Cobbles, PAVED, vPAVED while held; no USDC)
 * one under the other, right-aligned, at every width: the phone's plates below `desktop`, the larger ones from it.
 */
function HomeCorner({ state, onAction, onConnect, onRetry, faucet }: InProps) {
  return (
    <BalancesProvider value={{ state, onAction, onConnect, onRetry, faucet }}>
      <div className="flex min-h-dvh justify-end bg-background p-2 text-foreground tablet:p-4">
        <BalancesSlot layout="pill" kinds={HOME_BALANCES} direction="column" className="desktop:hidden" />
        <BalancesSlot layout="rail" kinds={HOME_BALANCES} direction="column" className="hidden desktop:flex" />
      </div>
    </BalancesProvider>
  );
}
const corner = (state: BalancesState): Story => ({ render: (args) => <HomeCorner {...args} state={state} />, parameters: { layout: "fullscreen" } });

/** The balances change every 2 s: a pack bought (Cobbles up, USDC down), then Cobbles spent and PAVED earned. */
function Live({ layout, direction, onAction }: Pick<BalancesProps, "layout" | "direction" | "onAction">) {
  const kinds: readonly ShownBalance[] = ["usdc", "paved", "vpaved-held", "cobbles"];
  const [step, setStep] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setStep((s) => (s + 1) % STEPS.length), 2000);
    return () => clearInterval(timer);
  }, []);
  return (
    <div className="flex justify-end p-6">
      {/* The rail is the header's from `desktop`; drawn alone at a phone's width, its plates wrap. */}
      <Balances layout={layout} kinds={kinds} direction={direction} state={STEPS[step]!} onAction={onAction} faucet className={direction === "column" ? undefined : "flex-wrap justify-end"} />
    </div>
  );
}

/** Mobile (360): the Vault's PAVED and vPAVED (#855) at the header's top right, vPAVED at zero (the page's own). */
export const Connected: Story = { ...page(CONNECTED), globals: MOBILE };
export const Loading: Story = { ...page({ status: "loading" }), globals: MOBILE };
/** The balances could not be read: a mark on a phone, its message in its name. */
export const ErrorState: Story = { args: { state: { status: "error", message: "The balances could not be read." } }, globals: MOBILE };
/** A guest: Connect instead of the figures. */
export const Disconnected: Story = { ...page({ status: "disconnected" }), globals: MOBILE };
/** WRAP360: the widest amounts. */
export const Stress: Story = { args: { state: { status: "ready", usdc: BIG_AMOUNT_6, paved: BIG_AMOUNT_18, cobbles: 999_999 } }, globals: MOBILE };

/** Desktop (1440): the Vault's balances at the header's top right. */
export const RailConnected: Story = { ...page(CONNECTED), globals: WIDE };
/** A Vault holder. */
export const RailHolder: Story = { ...page(HOLDER), globals: WIDE };
export const RailLoading: Story = { ...page({ status: "loading" }), globals: WIDE };
export const RailError: Story = { ...page({ status: "error", message: "The balances could not be read." }), globals: WIDE };
/** A guest from `desktop`: Connect, naming the page's balances. */
export const RailDisconnected: Story = { ...page({ status: "disconnected" }), globals: WIDE };

/** BALANCES-BY-PAGE (#855): the Cobbles' packs, the Cobbles and USDC (USDC buys the packs), at 320, 375 and 1440 px. */
export const Packs320: Story = { ...pageOf("cobbles"), ...PHONE_320 };
export const Packs375: Story = { ...pageOf("cobbles"), ...PHONE_375 };
export const Packs1440: Story = { ...pageOf("cobbles"), ...WIDE_1440 };
/** The Challenge's purchase: USDC alone. */
export const Purchase320: Story = { ...pageOf("play/challenge"), ...PHONE_320 };
export const Purchase375: Story = { ...pageOf("play/challenge"), ...PHONE_375 };
export const Purchase1440: Story = { ...pageOf("play/challenge"), ...WIDE_1440 };
/**
 * The Vault: PAVED and vPAVED, never the Cobbles; PAVED's "+" leads to the Challenge (#871), vPAVED on its own page carries none.
 * Two plates in a phone's row: PAVED's "+" from 360 px (375, 1440), not at 320, where both plates keep their whole figure.
 */
export const Vault320: Story = { ...pageOf("vault", HOLDER), ...PHONE_320 };
export const Vault375: Story = { ...pageOf("vault", HOLDER), ...PHONE_375 };
export const Vault1440: Story = { ...pageOf("vault", HOLDER), ...WIDE_1440 };
/** A page that spends Cobbles (the tile shop): the Cobbles alone. */
export const Shop375: Story = { ...pageOf("village/shop"), ...PHONE_375 };
export const Shop1440: Story = { ...pageOf("village/shop"), ...WIDE_1440 };
/** A page that uses none (Settings): no balances at all. */
export const Settings375: Story = { ...pageOf("settings"), ...PHONE_375 };
export const Settings1440: Story = { ...pageOf("settings"), ...WIDE_1440 };
/** A flow on a phone (the packs'): its balances in the top bar's row, nothing under it (#781, #855). */
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

/** The home's stack (#828) at 320 px: the Cobbles and PAVED one under the other at the top right (#855: vPAVED while held). */
export const Stack320: Story = { ...corner(CONNECTED), ...PHONE_320, parameters: { ...PHONE_320.parameters, layout: "fullscreen" } };
/** At 375 px, the same. */
export const Stack375: Story = { ...corner(CONNECTED), ...PHONE_375, parameters: { ...PHONE_375.parameters, layout: "fullscreen" } };
/** At 1440 px: the home's balances one under the other, right-aligned, each icon over its plate's right end; no USDC. */
export const Stack1440: Story = { ...corner(CONNECTED), ...WIDE_1440 };
/** A Vault holder at 1440 px: vPAVED joins the stack. */
export const StackHolder1440: Story = { ...corner(HOLDER), ...WIDE_1440 };
export const StackLoading1440: Story = { ...corner({ status: "loading" }), ...WIDE_1440 };
/** A Vault holder at 375 px: vPAVED joins the stack on a phone too. */
export const StackHolder375: Story = { ...corner(HOLDER), ...PHONE_375, parameters: { ...PHONE_375.parameters, layout: "fullscreen" } };
/** The widest amounts in the stack at 320 px. */
export const StackStress320: Story = { ...corner({ status: "ready", usdc: BIG_AMOUNT_6, paved: BIG_AMOUNT_18, vpaved: BIG_AMOUNT_18, cobbles: 999_999 }), ...PHONE_320, parameters: { ...PHONE_320.parameters, layout: "fullscreen" } };
/** The widest amounts in the stack. */
export const StackStress1440: Story = { ...corner({ status: "ready", usdc: BIG_AMOUNT_6, paved: BIG_AMOUNT_18, vpaved: BIG_AMOUNT_18, cobbles: 999_999 }), ...WIDE_1440 };
/** Every balance's column drawn at a phone's width with the larger plates: it fits at 320 px. */
export const StackAllAtPhone: Story = { render: (args) => <Balances layout="rail" kinds={["usdc", "paved", "vpaved", "cobbles"]} direction="column" state={HOLDER} onAction={args.onAction} faucet />, globals: MOBILE };
/** The stack changing: each plate counts, pops up or dips down. */
export const StackLiveChanges: Story = { render: (args) => <Live layout="rail" direction="column" onAction={args.onAction} />, ...WIDE_1440 };

/** PLATE-WIDTH (#860): no balance, small ones, and the widest below the compact form from `desktop` ("9,999.99", "9,999"; compact on a phone, from 1,000). */
const ZERO: Ready = { status: "ready", usdc: 0n, paved: 0n, vpaved: 0n, cobbles: 0 };
const SMALL: Ready = { status: "ready", usdc: 1_500_000n, paved: 7_250_000_000_000_000_000n, vpaved: 500_000_000_000_000_000n, cobbles: 12 };
const WIDEST: Ready = { status: "ready", usdc: 9_999_999_999n, paved: 9_999_999_999_999_999_999_999n, vpaved: 9_999_999_999_999_999_999_999n, cobbles: 9_999 };
/** Past it, compact ("1.2M", "123.5M"), the full amount in each plate's name and tooltip. */
const HUGE: Ready = { status: "ready", usdc: 1_234_567_000_000n, paved: BIG_AMOUNT_18, vpaved: BIG_AMOUNT_18, cobbles: 1_234_567 };
const FOUR: readonly ShownBalance[] = ["usdc", "paved", "vpaved", "cobbles"];

/** The four currencies, stacked and in rows, at each figure: every plate of one width at its size (the phone's below `desktop`). */
function Widths({ onAction }: Pick<BalancesProps, "onAction">) {
  const states = [ZERO, SMALL, WIDEST, HUGE];
  return (
    <div className="flex flex-col gap-6 p-4 text-foreground">
      {(["pill", "rail"] as const).map((layout) => (
        <div key={layout} className={cn("flex flex-col gap-6", layout === "pill" ? "desktop:hidden" : "hidden desktop:flex")}>
          <div className="flex flex-wrap justify-end gap-3">
            {states.map((state, i) => (
              <Balances key={i} layout={layout} kinds={FOUR} direction="column" state={state} onAction={onAction} faucet />
            ))}
          </div>
          {states.map((state, i) => (
            <Balances key={i} layout={layout} kinds={FOUR} direction="row" state={state} onAction={onAction} faucet className="flex-wrap justify-end" />
          ))}
        </div>
      ))}
    </div>
  );
}
const widths: Story = { render: (args) => <Widths onAction={args.onAction} /> };
/** PLATE-WIDTH (#860) at 320 px: every phone plate 116 px, in a column or a row, with no "+"; 136 px from 360 px (375). */
export const Widths320: Story = { ...widths, ...PHONE_320 };
export const Widths375: Story = { ...widths, ...PHONE_375 };
export const Widths1440: Story = { ...widths, ...WIDE_1440 };

/** The balances jump between nothing and a huge amount every 3 s: each plate counts inside its own width, nothing around it moves. */
function Counting({ onAction }: Pick<BalancesProps, "onAction">) {
  const [huge, setHuge] = useState(false);
  useEffect(() => {
    const timer = setInterval(() => setHuge((h) => !h), 3000);
    return () => clearInterval(timer);
  }, []);
  const state = huge ? { ...WIDEST, cobbles: 1_234_567 } : SMALL;
  return (
    <div className="flex flex-col items-end gap-6 p-4 text-foreground">
      {(["pill", "rail"] as const).map((layout) => (
        <div key={layout} className={cn("flex flex-col items-end gap-6", layout === "pill" ? "desktop:hidden" : "hidden desktop:flex")}>
          <Balances layout={layout} kinds={FOUR} direction="column" state={state} onAction={onAction} faucet />
          <Balances layout={layout} kinds={FOUR} direction="row" state={state} onAction={onAction} faucet className="flex-wrap justify-end" />
        </div>
      ))}
    </div>
  );
}
const counting: Story = { render: (args) => <Counting onAction={args.onAction} /> };
export const Counting320: Story = { ...counting, ...PHONE_320 };
export const Counting375: Story = { ...counting, ...PHONE_375 };
export const Counting1440: Story = { ...counting, ...WIDE_1440 };
/** Reduced motion: the figure is written at once, a colour flash, the same width. */
export const CountingReducedMotion375: Story = { ...Counting375, parameters: { ...PHONE_375.parameters, reducedMotion: "always" } };

/**
 * WALLET-BALANCES (#918): a new account, its key made by the first Connect, nothing on chain yet. Its balances read zero, like any
 * other account's: the home's corner (the Cobbles and PAVED; no vPAVED, none held), the packs' header (the Cobbles and USDC).
 */
const NEW_ACCOUNT: Ready = { status: "ready", usdc: 0n, paved: 0n, vpaved: 0n, cobbles: 0 };
export const NewAccountHome320: Story = { ...corner(NEW_ACCOUNT), ...PHONE_320, parameters: { ...PHONE_320.parameters, layout: "fullscreen" } };
export const NewAccountHome1440: Story = { ...corner(NEW_ACCOUNT), ...WIDE_1440 };
export const NewAccountPacks320: Story = { ...pageOf("cobbles", NEW_ACCOUNT), ...PHONE_320 };
export const NewAccountVault: Story = { ...page(NEW_ACCOUNT), globals: MOBILE };

/**
 * The node cannot be reached (#918: Cartridge's Sepolia RPC answered 410 to every request, which the browser reads as "Failed
 * to fetch"): the browser's text in, "Can't reach the network." shown. On a phone the mark, which retries when pressed; from `desktop`, the
 * message and Retry. `Retrying`: the read is on its way again.
 */
const OFFLINE: BalancesState = { status: "error", message: "Failed to fetch" };
export const NetworkErrorHome320: Story = { ...corner(OFFLINE), ...PHONE_320, parameters: { ...PHONE_320.parameters, layout: "fullscreen" } };
export const NetworkErrorPacks320: Story = { ...pageOf("cobbles", OFFLINE), ...PHONE_320 };
export const NetworkErrorVault: Story = { ...page(OFFLINE), globals: MOBILE };
export const NetworkErrorRail: Story = { ...page(OFFLINE), globals: WIDE };
export const NetworkErrorHome1440: Story = { ...corner(OFFLINE), ...WIDE_1440 };
export const NetworkErrorRetrying1440: Story = { ...corner({ ...OFFLINE, retrying: true }), ...WIDE_1440 };
