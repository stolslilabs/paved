import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { appRenders } from "../../mocks/assets";
import { TileSkinPicker } from "./tile-skin-picker";

const meta = {
  title: "Containers/TileSkinPicker",
  component: TileSkinPicker,
  parameters: { layout: "padded" },
  args: { plan: 10, options: [{ code: 0, name: "Default" }, { code: 1, name: "Forest" }], value: 1, saved: 1, renders: appRenders, onPick: fn() },
  decorators: [(Story) => <ul className="max-w-sm"><Story /></ul>],
} satisfies Meta<typeof TileSkinPicker>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Forest owned and worn. */
export const Forest: Story = {};
/** Default picked, not saved yet. */
export const Unsaved: Story = { args: { value: 0 } };
/** Owned in no theme: Default alone. */
export const DefaultOnly: Story = { args: { options: [{ code: 0, name: "Default" }], value: 0, saved: 0 } };
/** The save on its way: the choice waits. */
export const Saving: Story = { args: { disabled: true } };
