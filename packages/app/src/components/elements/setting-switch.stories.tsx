import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { SettingSwitch } from "./setting-switch";
import { LONG_LABEL, LONG_SENTENCE, LONG_WORD } from "../../mocks/stress";

const meta = {
  title: "Elements/SettingSwitch",
  component: SettingSwitch,
  parameters: { layout: "padded" },
  args: { label: "Sound", icon: "volume-high", checked: true, onCheckedChange: fn() },
  decorators: [(Story) => <div className="max-w-sm rounded-xl bg-card px-4"><Story /></div>],
} satisfies Meta<typeof SettingSwitch>;
export default meta;
type Story = StoryObj<typeof meta>;

export const On: Story = {};
export const Off: Story = { args: { checked: false } };
export const WithHint: Story = { args: { label: "Tile preview", icon: "eye", hint: "Show the tile on the slot before you place it" } };
export const Disabled: Story = { args: { label: "Music", icon: "music", checked: false, disabled: true, hint: "No music yet" } };
/** WRAP360: a long label and hint wrap; the icon and the switch stay on the first line. */
export const Stress: Story = {
  render: (args) => (
    <>
      <SettingSwitch {...args} label={LONG_LABEL} hint={LONG_SENTENCE} />
      <SettingSwitch {...args} label={LONG_WORD} hint={LONG_WORD} />
    </>
  ),
};
