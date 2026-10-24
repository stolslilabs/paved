import type { Decorator, Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { TabPage } from "./tab-page";
import { BIG_AMOUNT_18, LONG_LABEL, LONG_SENTENCE } from "../../mocks/stress";
import { Amount } from "../elements/amount";
import { PHONE_375 } from "../scenes/viewports";
import { BalancesProvider, type HeaderBalances } from "./balances-context";

const meta = {
  title: "Containers/TabPage",
  component: TabPage,
  args: {
    tab: "settings",
    title: "Settings",
    onNavigate: fn(),
    children: <div data-slot="card" className="h-40 rounded-xl border border-border bg-card" />,
  },
} satisfies Meta<typeof TabPage>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
/** Reached from another page: Back before the title. */
export const WithBack: Story = { args: { title: "Theme", onBack: fn(), subtitle: "How the board looks" } };
/** An action on the header's right. */
export const WithEnd: Story = { args: { tab: "vault", title: "Vault", end: <span className="text-xs text-muted-foreground">Wallet</span> } };
/** WRAP360: a long title and subtitle keep one line each, cut with an ellipsis (the whole text in `title`): the header keeps its height (HEADER-HEIGHT). */
export const Stress: Story = {
  args: {
    tab: "vault",
    title: LONG_LABEL,
    subtitle: LONG_SENTENCE,
    onBack: fn(),
    end: <Amount value={BIG_AMOUNT_18} token="paved" className="text-sm" />,
  },
};

/** An iPhone's viewport (375 x 812), for the stories of the frame (#611). */
const PHONE = PHONE_375.parameters;

/**
 * FOOTER-FIXED (#611): a page taller than the viewport, at 375 px. The page scrolls in its own region between the top and
 * the navigation, and the navigation stays fixed to the bottom: a pull past the top or the bottom bounces the region only.
 */
export const LongPage: Story = {
  parameters: PHONE,
  globals: { viewport: { value: "phone", isRotated: false } },
  args: {
    tab: "quests",
    title: "Missions",
    children: Array.from({ length: 12 }, (_, i) => (
      <div key={i} data-slot="card" className="flex h-24 shrink-0 items-center rounded-xl border border-border bg-card px-4 text-sm">
        Card {i + 1}
      </div>
    )),
  },
};

/** A page shorter than the viewport, at 375 px: the navigation still sits at the bottom, nothing scrolls. */
export const ShortPage: Story = { parameters: PHONE, globals: { viewport: { value: "phone", isRotated: false } } };

const READY = { status: "ready", usdc: 48_500_000n, paved: 142_350_000_000_000_000_000n, cobbles: 240 } as const;
const withBalances = (show: HeaderBalances): Decorator[] => [
  (Story) => (
    <BalancesProvider value={{ state: READY, onAction: fn(), show }}>
      <Story />
    </BalancesProvider>
  ),
];

/** HEADER-BALANCES (#720), at 375 px: a page where Cobbles move (Missions) keeps the Cobbles' strip under its title row, 96 px. */
export const PhoneCobbles: Story = { ...PHONE_375, args: { tab: "quests", title: "Missions" }, decorators: withBalances({ phone: true, desktop: "all" }) };
/** At 375 px, a page where none move (the Vault): no balance, the header is its title row alone, 56 px. */
export const PhoneNoBalances: Story = { ...PHONE_375, args: { tab: "vault", title: "Vault" }, decorators: withBalances({ phone: false, desktop: "all" }) };
