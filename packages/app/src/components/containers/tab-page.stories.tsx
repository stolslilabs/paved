import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { TabPage } from "./tab-page";

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
