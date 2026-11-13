import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { EXPEDITION_HAND } from "../../mocks/expedition";
import { ExpeditionHand } from "./expedition-hand";

/** The Expedition board's strip (the weekly individual event): the map's landmarks and the whole hand, a tile picked. */
const meta = {
  title: "Containers/ExpeditionHand",
  component: ExpeditionHand,
  args: { onSelect: fn() },
} satisfies Meta<typeof ExpeditionHand>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Five tiles in hand, the second picked; the villages linked, the ruin 3 of 8. */
export const Five: Story = { args: EXPEDITION_HAND.five };
/** A full hand of twelve: the row scrolls sideways on a phone. */
export const Full: Story = { args: EXPEDITION_HAND.full };
/** Every tile laid today: the next come tomorrow. */
export const Empty: Story = { args: EXPEDITION_HAND.empty };
/** The week's bag drawn and laid, every landmark done. */
export const BagDrawn: Story = { args: EXPEDITION_HAND.bagDrawn };
/** The week over: the hand is shown, no tile is picked. */
export const ReadOnly: Story = { args: EXPEDITION_HAND.readOnly };
