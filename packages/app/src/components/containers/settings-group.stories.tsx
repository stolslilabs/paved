import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { SettingSwitch } from "../elements/setting-switch";
import { SettingsGroup, SettingsLink } from "./settings-group";
import { LONG_LABEL, LONG_SENTENCE, LONG_WORD } from "../../mocks/stress";

const meta = {
  title: "Containers/SettingsGroup",
  component: SettingsGroup,
  parameters: { layout: "fullscreen" },
  args: {
    title: "Gameplay",
    children: (
      <>
        <SettingSwitch label="Tile preview" art="tile-preview" checked onCheckedChange={fn()} />
        <SettingSwitch label="Placement highlight" art="highlight" checked={false} onCheckedChange={fn()} />
      </>
    ),
  },
  // On the drawer's charcoal (SETTINGS-PAGE).
  decorators: [(Story) => <div className="max-w-md bg-secondary p-4"><Story /></div>],
} satisfies Meta<typeof SettingsGroup>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Switches: Story = {};
/** Rows that open a view (the book's More): raised, each a press. */
export const Links: Story = {
  args: {
    title: "More",
    surface: "links",
    children: (
      <>
        <SettingsLink label="Themes" art="theme-forest" onClick={fn()} />
        <SettingsLink label="Credits" art="missions" onClick={fn()} />
      </>
    ),
  },
};
/** WRAP360: long labels wrap; the icons and the controls stay beside them (a group's title is the app's own word). */
export const Stress: Story = {
  args: {
    children: (
      <>
        <SettingSwitch label={LONG_WORD} hint={LONG_SENTENCE} art="tile-preview" checked onCheckedChange={fn()} />
        <SettingSwitch label={LONG_LABEL} art="grid" checked={false} onCheckedChange={fn()} />
      </>
    ),
  },
};
/** WRAP360: a long link label wraps beside its chevron. */
export const StressLinks: Story = {
  args: {
    title: "More",
    surface: "links",
    children: (
      <>
        <SettingsLink label={LONG_WORD} art="missions" onClick={fn()} />
        <SettingsLink label={LONG_LABEL} art="theme-forest" onClick={fn()} />
      </>
    ),
  },
};
