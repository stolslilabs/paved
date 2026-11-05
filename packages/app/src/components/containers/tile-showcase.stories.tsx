import type { Meta, StoryObj } from "@storybook/react-vite";
import { APP_ASSETS, appRenders } from "../../mocks/assets";
import { TileShowcase } from "./tile-showcase";

/**
 * One tile through the real renderer, over the page (COLLECTION-PAGE): the Tiles page's stage, turned and tilted with a drag (or the
 * arrow keys, focused), never from under it, no zoom. Without a base path, the tile's angled render.
 */
const meta = {
  title: "Containers/TileShowcase",
  component: TileShowcase,
  parameters: { layout: "centered" },
  args: { plan: 7, theme: 0, basePath: APP_ASSETS, renders: appRenders },
  decorators: [(Story) => <div className="relative aspect-[4/3] w-72 max-w-full"><Story /></div>],
} satisfies Meta<typeof TileShowcase>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Rest: Story = {};
export const Forest: Story = { args: { theme: 1 } };
/** No WebGL or no base path: the angled render. */
export const Image: Story = { args: { basePath: undefined } };
