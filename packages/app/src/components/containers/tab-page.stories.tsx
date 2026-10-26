import type { Decorator, Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { TabPage } from "./tab-page";
import { BIG_AMOUNT_18, LONG_LABEL, LONG_SENTENCE } from "../../mocks/stress";
import { Amount } from "../elements/amount";
import { PHONE_320, PHONE_375, WIDE_1440 } from "../scenes/viewports";
import { BalancesProvider, type HeaderBalances } from "./balances-context";
import { inPanel } from "../../stories/in-panel";

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

/** A tab's own page (#760): Back at the top left, to the village (`onNavigate("home")`). */
export const Default: Story = {};
/** Reached from another page: Back before the title, to its parent. */
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

const CARDS = Array.from({ length: 12 }, (_, i) => (
  <div key={i} data-slot="card" className="flex h-24 shrink-0 items-center rounded-xl border border-border bg-card px-4 text-sm">
    Card {i + 1}
  </div>
));

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
    children: CARDS,
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

/**
 * PAGE-HEADER (#760), at 375 px: a page where Cobbles move (Missions). The header stays one row, 56 px; the Cobbles sit in the
 * page, under it at the content's top right, and scroll with it.
 */
export const PhoneCobbles: Story = { ...PHONE_375, args: { tab: "quests", title: "Missions" }, decorators: withBalances({ phone: true, desktop: "all" }) };
/** At 375 px, a page where none move (the Vault): no balance in the page, the same one-row header. */
export const PhoneNoBalances: Story = { ...PHONE_375, args: { tab: "vault", title: "Vault" }, decorators: withBalances({ phone: false, desktop: "all" }) };
/** At 320 px, the Cobbles and a long title: the title is cut with an ellipsis, the header keeps one row. */
export const Phone320Cobbles: Story = {
  ...PHONE_320,
  args: { tab: "settings", title: "Themes and tiles of the season", subtitle: LONG_SENTENCE, onBack: fn() },
  decorators: withBalances({ phone: true, desktop: "all" }),
};
/** At 1440 px, in the home's side panel (#762): the phone's layout, no Back, the Cobbles and the panel's close in the header. */
export const WideCobbles: Story = { ...WIDE_1440, args: { tab: "quests", title: "Missions" }, decorators: [inPanel("Missions"), ...withBalances({ phone: true, desktop: "all" })] };
/**
 * At 375 px, scrolled to the bottom: the header is sticky, so Back stays in view; the fade under it shows the page has more
 * above (none under reduced motion's toggle: the fade switches without a transition).
 */
export const PhoneScrolled: Story = {
  parameters: PHONE,
  globals: { viewport: { value: "phone", isRotated: false } },
  args: { tab: "quests", title: "Missions", children: CARDS },
  decorators: withBalances({ phone: true, desktop: "all" }),
  play: async ({ canvasElement }) => {
    const region = canvasElement.querySelector<HTMLElement>('[data-slot="page-scroll"]')!;
    region.scrollTop = region.scrollHeight;
  },
};
