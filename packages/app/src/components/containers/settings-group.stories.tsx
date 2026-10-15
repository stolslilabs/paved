import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { SettingSwitch } from "../elements/setting-switch";
import { SettingsGroup, SettingsLink } from "./settings-group";
import { LONG_LABEL, LONG_SENTENCE, LONG_WORD } from "../../mocks/stress";

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
/** WRAP360: a long group title, link labels, hints and value wrap; the icons stay on the first line. */
export const Stress: Story = {
  args: {
    title: LONG_LABEL,
    children: (
      <>
        <SettingsLink label={LONG_LABEL} hint={LONG_SENTENCE} icon="palette" value={LONG_WORD} onClick={fn()} />
        <SettingSwitch label={LONG_WORD} hint={LONG_SENTENCE} icon="eye" checked onCheckedChange={fn()} />
      </>
    ),
  },
};
