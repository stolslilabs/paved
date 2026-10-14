import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { THEME } from "../../mocks/scenes";
import { ThemeScene } from "./theme-scene";

/** The theme (`/settings/theme`): Default and Forest to choose, Snow, Desert and Volcano coming soon, each a preview card. One story per state; the viewport is the toolbar's (VP). */
const meta = { title: "Scenes/Theme", component: ThemeScene, args: { onSelect: fn(), onBack: fn(), onNavigate: fn() } } satisfies Meta<typeof ThemeScene>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Default (meadows) in use. */
export const DefaultSelected: Story = { args: THEME.defaultSelected };

/** Forest in use. */
export const ForestSelected: Story = { args: THEME.forestSelected };
