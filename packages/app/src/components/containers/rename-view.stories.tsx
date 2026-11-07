import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { RENAME } from "../../mocks/rename";
import { BalancesProvider, BalancesSlot } from "./balances-context";
import { HudDrawer } from "./hud-drawer";
import { RenameView, type RenameViewProps } from "./rename-view";

/**
 * The profile's name view (PLAYER-RENAME): what the pencil beside the player's own name opens, in the Profile drawer, its header
 * "Name" with Back to the profile and the Cobbles at its end, as the app draws it (`ProfileSheet`). One story per state.
 */
const meta = {
  title: "Containers/RenameView",
  component: RenameView,
  args: { ...RENAME.free, onBack: fn(), onRename: fn(), onType: fn() },
  render: (args) => <InProfile {...args} />,
} satisfies Meta<typeof RenameView>;
export default meta;
type Story = StoryObj<typeof meta>;

/** In the Profile drawer, the player's Cobbles at the header's end (the app's `ProfileSheet`). */
function InProfile(props: RenameViewProps) {
  const state = props.balance === undefined ? ({ status: "loading" } as const) : ({ status: "ready", usdc: 0n, paved: 0n, cobbles: props.balance } as const);
  return (
    <BalancesProvider value={{ state, kinds: ["cobbles"], onAction: fn(), onRetry: fn() }}>
      <HudDrawer open onOpenChange={fn()} title="Profile" slot="profile" end={<BalancesSlot layout="pill" kinds={["cobbles"]} />}>
        <RenameView {...props} />
      </HudDrawer>
    </BalancesProvider>
  );
}

/** The first change: free, whatever the Cobbles. */
export const FirstFree: Story = {};
/** A later change: the Cobble and 50. */
export const Paid: Story = { args: RENAME.paid };
/** Fewer Cobbles than the price: the field and Rename held, the cost says how many are missing (no error box). */
export const NotEnoughCobbles: Story = { args: RENAME.short };
/** The chain refused a name another player holds: said on its rule's line, crossed (no error box). */
export const NameTaken: Story = { args: RENAME.taken };
/** A space and a sign: the rules crossed, Rename held. */
export const Invalid: Story = { args: RENAME.invalid };
/** The rename on its way: the field and Rename held, the spinner. */
export const Pending: Story = { args: RENAME.pending };
/** Another refusal (the price changed under the player): the app's error, the server's answer, nothing spent. */
export const Refused: Story = { args: RENAME.refused };
/** Done: the new name shown now, said under the field; the next change at 50. */
export const Done: Story = { args: RENAME.done };
/** The cost and the Cobbles on their way: an ellipsis, Rename held. */
export const Loading: Story = { args: RENAME.loading };
/** The reads failed: "Names cannot be read" and Retry, Rename held. */
export const ReadFailed: Story = { args: { ...RENAME.readFailed, onRetry: fn() } };
/** No name and no Cartridge username: the short address stands for it. */
export const NoName: Story = { args: RENAME.noName };
/** WRAP360: the longest name shown now, the most characters typed, a seven-figure balance. */
export const Stress: Story = { args: RENAME.stress };
/** Typing a valid name marks its rules; Rename sends it. */
export const Typing: Story = {
  args: { defaultName: "" },
  play: async ({ canvasElement, args }) => {
    const page = within(canvasElement.ownerDocument.body);
    const field = await page.findByRole("textbox", { name: "New name" });
    await userEvent.type(field, "Paver27");
    await expect(page.getByRole("button", { name: "Rename" })).toBeEnabled();
    await userEvent.click(page.getByRole("button", { name: "Rename" }));
    await expect(args.onRename).toHaveBeenCalledWith("Paver27");
  },
};
