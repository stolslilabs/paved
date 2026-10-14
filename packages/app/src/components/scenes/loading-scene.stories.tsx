import type { Meta, StoryObj } from "@storybook/react-vite";
import { LOADING } from "../../mocks/scenes";
import { LoadingScene } from "./loading-scene";
import { at } from "./viewports";

/** The boot screen, every route's fallback, and the board's asset loading. Each state at the four viewports. */
const meta = { title: "Scenes/Loading", component: LoadingScene } satisfies Meta<typeof LoadingScene>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The length unknown: an indeterminate bar (still under reduced motion). */
const booting: Story = { args: LOADING.booting };
export const BootingMobile: Story = at("mobile", booting);
export const BootingTablet: Story = at("tablet", booting);
export const BootingDesktop: Story = at("desktop", booting);
export const BootingWide: Story = at("wide", booting);

/** The board's models loading, with a tip. */
const assets: Story = { args: LOADING.assets };
export const AssetsMobile: Story = at("mobile", assets);
export const AssetsTablet: Story = at("tablet", assets);
export const AssetsDesktop: Story = at("desktop", assets);
export const AssetsWide: Story = at("wide", assets);
