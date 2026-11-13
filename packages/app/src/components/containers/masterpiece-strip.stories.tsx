import type { Meta, StoryObj } from "@storybook/react-vite";
import { MASTERPIECE_STRIP } from "../../mocks/masterpiece";
import { MasterpieceStrip } from "./masterpiece-strip";

/** The Masterpiece board's strip (the weekly individual event): the masterpiece so far, what is growing, the tiles waiting. */
const meta = {
  title: "Containers/MasterpieceStrip",
  component: MasterpieceStrip,
  decorators: [
    (Story) => (
      <div className="bg-board p-2">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof MasterpieceStrip>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Monday: no city closed yet, a small one open. */
export const NothingClosed: Story = { args: MASTERPIECE_STRIP.nothingClosed };
/** A city of 14 closed, an open city of 22 behind it. */
export const Growing: Story = { args: MASTERPIECE_STRIP.growing };
/** Saturday's city of 31, nothing open. */
export const Closed: Story = { args: MASTERPIECE_STRIP.closed };
/** A summer week: a wonder crowned by a city. */
export const Wonder: Story = { args: MASTERPIECE_STRIP.wonder };
