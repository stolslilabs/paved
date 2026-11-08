import type { Meta, StoryObj } from "@storybook/react-vite";
import { BoardNotice, NOTICE_ACTION } from "./board-notice";

/** A line under the board's header (GAME-OVERLAY): on the HUD's frame, the painted sign, the title outlined, a short line. */
const meta = {
  title: "Containers/BoardNotice",
  component: BoardNotice,
  parameters: { layout: "padded" },
  decorators: [(Story) => <div className="w-full max-w-2xl">{Story()}</div>],
  args: { title: "Another player's game", children: "You are watching this game: only its player can move." },
} satisfies Meta<typeof BoardNotice>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Another player's game (P5): the painted blue "i". */
export const Info: Story = {};
/** Storage off: the painted amber sign. */
export const Warning: Story = { args: { tone: "warning", title: "Storage is off", children: "This browser refuses local storage: this game is not saved and ends if the page closes." } };
/** The board out of date, with its Retry (the drawers' raised pill). */
export const WithAction: Story = {
  args: {
    tone: "warning",
    title: "The board may be out of date",
    children: "The game could not be read again (timeout). Your next move reads it first.",
    action: (
      <button type="button" className={NOTICE_ACTION}>
        Retry
      </button>
    ),
  },
};
