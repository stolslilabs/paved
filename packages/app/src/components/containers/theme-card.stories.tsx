import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { RENDERER_ASSETS, originalTileArt } from "../../mocks/assets";
import { THEME_TILES } from "../../mocks/settings";
import { THEMES, ThemeCard } from "./theme-card";
import { LONG_SENTENCE, LONG_WORD } from "../../mocks/stress";

const meta = {
  title: "Containers/ThemeCard",
  component: ThemeCard,
  parameters: { layout: "padded" },
  args: { theme: THEMES[0], selected: true, tiles: THEME_TILES, tileArt: originalTileArt(RENDERER_ASSETS), onSelect: fn() },
  decorators: [(Story) => <div role="radiogroup" aria-label="Theme" className="max-w-xs"><Story /></div>],
} satisfies Meta<typeof ThemeCard>;
export default meta;
type Story = StoryObj<typeof meta>;

export const DefaultSelected: Story = {};
/** Forest, not selected: its preview tints the base art until Q4 brings the extended tiles. */
export const Forest: Story = { args: { theme: THEMES[1], selected: false } };
export const SnowComingSoon: Story = { args: { theme: THEMES[2], selected: false } };
export const DesertComingSoon: Story = { args: { theme: THEMES[3], selected: false } };
export const VolcanoComingSoon: Story = { args: { theme: THEMES[4], selected: false } };
/** Without the art: the plans' nine areas. */
export const NoArt: Story = { args: { tileArt: undefined } };
/** WRAP360: a long name and tagline wrap under the preview. */
export const Stress: Story = { args: { theme: { ...THEMES[1], name: LONG_WORD, tagline: LONG_SENTENCE }, selected: true } };
