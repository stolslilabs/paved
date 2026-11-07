import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { Button } from "../ui/button";
import { GOLD_ACTION, GoldShine } from "./gold-action";

/** A drawer's main action on its footer's band (PLAY-PAGE's Confirm, VAULT-PAGE's Deposit): the gold pill and its passing light. */
function GoldAction({ label, disabled = false, loading = false, onClick }: { label: string; disabled?: boolean; loading?: boolean; onClick?: () => void }) {
  return (
    <div className="flex w-72 max-w-full justify-end bg-card p-2">
      <Button variant="ghost" style={GOLD_ACTION} className="relative h-12 min-w-36 px-1 text-lg font-black text-foreground" disabled={disabled} loading={loading} onClick={onClick}>
        {!disabled && !loading && <GoldShine />}
        {label}
      </Button>
    </div>
  );
}

const meta = {
  title: "Elements/GoldAction",
  component: GoldAction,
  parameters: { layout: "centered" },
  args: { label: "Deposit", onClick: fn() },
} satisfies Meta<typeof GoldAction>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Ready: the light crosses it now and then. */
export const Ready: Story = {};
/** Nothing to send: held, no light. */
export const Disabled: Story = { args: { disabled: true } };
/** Its write waits in the wallet: its word kept, a spinner in it (the footer never moves). */
export const Busy: Story = { args: { loading: true } };
