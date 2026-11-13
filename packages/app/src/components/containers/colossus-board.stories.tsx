import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { originalTileArt, SOURCE_ASSETS } from "../../mocks/assets";
import { COLOSSUS_BOARD } from "../../mocks/colossus";
import { ColossusBoard } from "./colossus-board";

/** One board of the Colossus (the weekly collective event): a district's tiles and holes, the hand, the marked holes of a picked tile. */
const meta = {
  title: "Containers/ColossusBoard",
  component: ColossusBoard,
  args: { onSelect: fn(), onPlace: fn(), tileArt: originalTileArt(SOURCE_ASSETS), className: "max-w-sm" },
} satisfies Meta<typeof ColossusBoard>;
export default meta;
type Story = StoryObj<typeof meta>;

/** No tile picked: the board and the hand. */
export const Idle: Story = { args: COLOSSUS_BOARD.idle };
/** A tile picked: the holes it may take, each with the stones it would set; a tap shows it there, Place lays it. */
export const Picked: Story = { args: COLOSSUS_BOARD.picked };
/** The picked tile's holes still read. */
export const Reading: Story = { args: COLOSSUS_BOARD.reading };
/** A tile on its way: nothing is tapped. */
export const Busy: Story = { args: COLOSSUS_BOARD.busy };
/** The heart: four quarters, one shown. */
export const Heart: Story = { args: COLOSSUS_BOARD.heart };
export const EmptyHand: Story = { args: COLOSSUS_BOARD.emptyHand };
