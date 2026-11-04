import type { Decorator } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { BalancesProvider } from "../components/containers/balances-context";

/**
 * The shell's balances for a page that shows the Cobbles in its header (MISSIONS-PAGE: the drawer's top right, the claims' bursts'
 * target): 640, the Paved UX Book's.
 */
export const withCobbles: Decorator = (Story) => (
  <BalancesProvider value={{ state: { status: "ready", usdc: 0n, paved: 0n, cobbles: 640 }, kinds: ["cobbles"], onAction: fn() }}>
    <Story />
  </BalancesProvider>
);
