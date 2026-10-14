import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { THEME } from "../../mocks/scenes";
import { ThemeScene } from "./theme-scene";
import { at } from "./viewports";

/** The theme (`/settings/theme`): Default and Forest to choose, Snow, Desert and Volcano coming soon, each a preview card. Each state at the four viewports. */
const meta = { title: "Scenes/Theme", component: ThemeScene, args: { onSelect: fn(), onBack: fn(), onNavigate: fn() } } satisfies Meta<typeof ThemeScene>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Default (meadows) in use. */
const defaultSelected: Story = { args: THEME.defaultSelected };
export const DefaultSelectedMobile: Story = at("mobile", defaultSelected);
export const DefaultSelectedTablet: Story = at("tablet", defaultSelected);
export const DefaultSelectedDesktop: Story = at("desktop", defaultSelected);
export const DefaultSelectedWide: Story = at("wide", defaultSelected);

/** Forest in use. */
const forestSelected: Story = { args: THEME.forestSelected };
export const ForestSelectedMobile: Story = at("mobile", forestSelected);
export const ForestSelectedTablet: Story = at("tablet", forestSelected);
export const ForestSelectedDesktop: Story = at("desktop", forestSelected);
export const ForestSelectedWide: Story = at("wide", forestSelected);
