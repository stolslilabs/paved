import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { SettingSwitch } from "./setting-switch";
import { LONG_LABEL, LONG_SENTENCE, LONG_WORD } from "../../mocks/stress";

const meta = {
  title: "Elements/SettingSwitch",
  component: SettingSwitch,
  parameters: { layout: "fullscreen" },
  args: { label: "Ambient effects", art: "ambient", checked: true, onCheckedChange: fn() },
  // On the drawer's charcoal, its carved surface (SETTINGS-PAGE).
  decorators: [(Story) => <div className="max-w-sm bg-secondary p-4"><div className="drawer-carved rounded-xl"><Story /></div></div>],
} satisfies Meta<typeof SettingSwitch>;
export default meta;
type Story = StoryObj<typeof meta>;

export const On: Story = {};
export const Off: Story = { args: { checked: false } };
/** The hint is read out with the switch, not shown (the book's rows show their name alone). */
export const WithHint: Story = { args: { label: "Tile preview", art: "tile-preview", hint: "Show the tile on the slot before you place it" } };
export const Disabled: Story = { args: { label: "Square grid", art: "grid", checked: false, disabled: true } };
/** WRAP360: a long label wraps; the icon and the switch stay beside it. */
export const Stress: Story = {
  render: (args) => (
    <>
      <SettingSwitch {...args} label={LONG_LABEL} hint={LONG_SENTENCE} />
      <SettingSwitch {...args} label={LONG_WORD} hint={LONG_WORD} />
    </>
  ),
};
