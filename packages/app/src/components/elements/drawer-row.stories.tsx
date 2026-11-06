import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { DrawerRow } from "./drawer-row";

/**
 * A row of a menu in the HUD's drawer (GUILD-PAGE): a raised tile with its painted icon, its words, and the chevron of what opens a
 * view in the drawer. Drawn on the drawer's face.
 */
const meta = {
  title: "Elements/DrawerRow",
  component: DrawerRow,
  args: { art: "settings", label: "Guild settings", next: true, onClick: fn() },
  decorators: [(Story) => <div className="flex max-w-md flex-col gap-2 bg-secondary p-4"><Story /></div>],
} satisfies Meta<typeof DrawerRow>;
export default meta;
type Story = StoryObj<typeof meta>;

/** What opens a view in the drawer: the chevron at its end. */
export const Next: Story = {};

/** An action done in place (it asks to confirm first): no chevron. */
export const Action: Story = { args: { art: "crown", label: "Make leader", next: false } };

/** Leave, Disband, Kick: the destructive colour. */
export const Danger: Story = { args: { art: "kicked", label: "Kick", tone: "danger", next: false } };

/** Not offered now (a leader with members cannot leave): dimmed. */
export const Disabled: Story = { args: { art: "kicked", label: "Leave the guild", tone: "danger", next: false, disabled: true } };

/** A long label wraps between its words. */
export const Long: Story = { args: { label: "A menu entry whose words run past one line on a phone" } };
