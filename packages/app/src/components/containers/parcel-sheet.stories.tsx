import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { parcelFor } from "../../mocks/village";
import { ParcelSheet } from "./parcel-sheet";

/** Buying a parcel (#646): its price and the level gate. */
const meta = {
  title: "Containers/ParcelSheet",
  component: ParcelSheet,
  parameters: { layout: "fullscreen" },
  args: { cell: { x: 2, y: 0 }, offer: parcelFor(21), level: 4, cobbles: 640, cells: 21, onBuy: fn(), onClose: fn(), onGetCobbles: fn() },
} satisfies Meta<typeof ParcelSheet>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Ready: Story = {};
/** Under the level: "Level 5 needed", whatever the Cobbles. */
export const LevelNeeded: Story = { args: { offer: { price: 260, level: 5 } } };
/** Short of Cobbles. */
export const ShortOfCobbles: Story = { args: { cobbles: 90 } };
/** The purchase on its way. */
export const Buying: Story = { args: { buying: true } };
/** 38 cells: none left. */
export const Full: Story = { args: { offer: null, cells: 38 } };
