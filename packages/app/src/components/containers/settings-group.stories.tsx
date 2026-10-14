import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { SettingSwitch } from "../elements/setting-switch";
import { SettingsGroup, SettingsLink } from "./settings-group";

const meta = {
  title: "Containers/SettingsGroup",
  component: SettingsGroup,
  parameters: { layout: "padded" },
  args: {
    title: "Gameplay",
    children: (
      <>
        <SettingSwitch label="Tile preview" icon="eye" checked onCheckedChange={fn()} />
        <SettingSwitch label="Placement highlight" icon="highlighter" checked={false} onCheckedChange={fn()} />
      </>
    ),
  },
  decorators: [(Story) => <div className="max-w-md"><Story /></div>],
} satisfies Meta<typeof SettingsGroup>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Switches: Story = {};
/** Rows that open another page. */
export const Links: Story = {
  args: {
    title: "More",
    children: (
      <>
        <SettingsLink label="Theme" icon="palette" value="Default" onClick={fn()} />
        <SettingsLink label="Referral" hint="Your link and what it earned" icon="user-group" onClick={fn()} />
      </>
    ),
  },
};
