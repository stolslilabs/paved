import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { appRenders } from "../../mocks/assets";
import { THEMES, ThemeCard } from "./theme-card";
import { LONG_SENTENCE, LONG_WORD } from "../../mocks/stress";

const meta = {
  title: "Containers/ThemeCard",
  component: ThemeCard,
  parameters: { layout: "padded" },
  args: { theme: THEMES[1]!, renders: appRenders, owned: 4, onUse: fn(), onOpen: fn() },
  decorators: [(Story) => <div className="max-w-xs"><Story /></div>],
} satisfies Meta<typeof ThemeCard>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Forest, four of 19 tiles owned: Use and its shop. */
export const Forest: Story = {};
/** Forest in use: every owned tile wears it. */
export const ForestInUse: Story = { args: { inUse: true } };
/** Nothing owned: Use is off, the shop says Buy tiles. */
export const NothingOwned: Story = { args: { owned: 0 } };
/** Use's write on its way. */
export const Applying: Story = { args: { applying: true } };
/** Default: the base tiles, all 19, no shop. */
export const Default: Story = { args: { theme: THEMES[0]!, owned: 19, onOpen: undefined, inUse: true } };
/** A guest or the reads on their way: no count, Use waits. */
export const Unknown: Story = { args: { owned: null, disabled: true } };
/** Snow, Desert, Volcano: a render under a strong blur, locked. */
export const SnowComingSoon: Story = { args: { theme: THEMES[2]!, owned: null } };
export const DesertComingSoon: Story = { args: { theme: THEMES[3]!, owned: null } };
export const VolcanoComingSoon: Story = { args: { theme: THEMES[4]!, owned: null } };
/** No render served: the board's backdrop. */
export const NoRenders: Story = { args: { renders: undefined } };
/** WRAP360: a long name and tagline wrap under the cover. */
export const Stress: Story = { args: { theme: { ...THEMES[1]!, name: LONG_WORD, tagline: LONG_SENTENCE }, inUse: true } };
