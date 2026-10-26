import type { Decorator, Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { LONG_LABEL } from "../../mocks/stress";
import { inPanel } from "../../stories/in-panel";
import { PHONE_320, PHONE_375, TABLET_768, WIDE_1440 } from "../scenes/viewports";
import type { BalancesState } from "./balances";
import { BalancesProvider } from "./balances-context";
import { MockMarkProvider } from "./mock-mark";
import { PageHeader } from "./page-header";

const READY: BalancesState = { status: "ready", usdc: 48_500_000n, paved: 142_350_000_000_000_000_000n, vpaved: 1_250_400_000_000_000_000n, cobbles: 240 };

/** The shell's balances (`BalancesHost`) in a given state, and a page's content under the header, starting right under it. */
const shell =
  (state: BalancesState = READY): Decorator =>
  (Story) => (
    <BalancesProvider value={{ state, onAction: fn(), onConnect: fn(), faucet: true }}>
      <div className="flex min-h-dvh flex-col bg-background text-foreground">
        <Story />
        <main className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 pt-4 pb-6 tablet:max-w-2xl">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} data-slot="card" className="h-24 rounded-xl border border-border bg-card" />
          ))}
        </main>
      </div>
    </BalancesProvider>
  );

/**
 * ONE-HEADER (#781, the owner's decisions of 2026-10-26): the one header of every page but the game scenes. Back and the title
 * at the top left (no subtitle), the home's balances at the top right in the home's format (the Cobbles' pill below `desktop`,
 * the rail from it), one row, nothing under it. Each page's own: `Pages/Headers`.
 */
const meta = {
  title: "Containers/PageHeader",
  component: PageHeader,
  args: { title: "Missions", onBack: fn() },
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof PageHeader>;
export default meta;
type Story = StoryObj<typeof meta>;

/** A connected player's balances. */
const READY_SHELL = [shell()];

/** At 375 px: Back, the title, the Cobbles' pill at the top right. */
export const Phone375: Story = { ...PHONE_375, parameters: { ...PHONE_375.parameters, layout: "fullscreen" }, decorators: READY_SHELL };
/** At 320 px with a long title: the title gives way first (an ellipsis, its whole text in the tooltip), never Back nor the Cobbles. */
export const Phone320LongTitle: Story = { ...PHONE_320, args: { title: "Themes and tiles of the season" }, parameters: { ...PHONE_320.parameters, layout: "fullscreen" }, decorators: READY_SHELL };
/** At 768 px: still the pill, below `desktop`. */
export const Tablet768: Story = { ...TABLET_768, args: { title: "Vault" }, parameters: { ...TABLET_768.parameters, layout: "fullscreen" }, decorators: READY_SHELL };
/** At 1440 px: every balance's rail at the top right, as on the home. */
export const Wide1440: Story = { ...WIDE_1440, args: { title: "Avatar" }, decorators: READY_SHELL };
/** WRAP360: the stress title, cut on one line. */
export const Stress: Story = { args: { title: LONG_LABEL }, decorators: READY_SHELL };
/** No Back: a page with none (an error's). */
export const NoBack: Story = { args: { title: "Not found", onBack: undefined }, decorators: READY_SHELL };
/** No balances: the end of an attack, an error's page. */
export const NoBalances: Story = { args: { title: "Attack over", balances: false }, decorators: READY_SHELL };
/** MOCK-MARK (#622): "Mock" after the title. */
export const WithMark: Story = { args: { title: "Vault" }, decorators: [(Story) => <MockMarkProvider value><Story /></MockMarkProvider>, ...READY_SHELL] };
/** The balances still being read: the space is held, nothing moves when they arrive. */
export const BalancesLoading: Story = { ...PHONE_375, parameters: { ...PHONE_375.parameters, layout: "fullscreen" }, decorators: [shell({ status: "loading" })] };
/** A guest: Connect in the balances' place. */
export const Guest: Story = { ...PHONE_375, parameters: { ...PHONE_375.parameters, layout: "fullscreen" }, decorators: [shell({ status: "disconnected" })] };
/** The balances could not be read: their mark, its message in its name. */
export const BalancesError: Story = { ...WIDE_1440, decorators: [shell({ status: "error", message: "The balances could not be read." })] };
/** Reduced motion: the balances' count-ups are a colour flash, nothing moves. */
export const ReducedMotion: Story = { ...WIDE_1440, parameters: { layout: "fullscreen", reducedMotion: "always" }, decorators: READY_SHELL };
/** From `desktop`, the header of the home's side panel (#762): laid out as on a phone, no Back, the Cobbles and the close. */
export const InPanel: Story = { ...WIDE_1440, decorators: [inPanel("Missions"), ...READY_SHELL] };
/** In the panel, a page reached from another (a theme from Settings): Back to it, the Cobbles and the close. */
export const InPanelWithBack: Story = { ...WIDE_1440, args: { title: "Themes" }, decorators: [inPanel("Themes", false), ...READY_SHELL] };
