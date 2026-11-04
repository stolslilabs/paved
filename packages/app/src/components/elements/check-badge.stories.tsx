import type { Meta, StoryObj } from "@storybook/react-vite";
import { CheckBadge } from "./check-badge";

/**
 * The done badge (MISSIONS-PAGE): the Paved UX Book's painted green check, at the sizes the page draws it: 32 px on the card's
 * medallion, 23 on a list's, 16 on a claimed milestone's gift.
 */
const meta = {
  title: "Elements/CheckBadge",
  component: CheckBadge,
  args: { px: 32, className: "size-8" },
  decorators: [(Story) => <div className="grid place-items-center p-10"><Story /></div>],
} satisfies Meta<typeof CheckBadge>;
export default meta;
type Story = StoryObj<typeof meta>;

/** On the card's medallion (88 px, the badge 36% of it). */
export const Card: Story = {};
/** On a claimed milestone's gift. */
export const Small: Story = { args: { px: 16, className: "size-4" } };
