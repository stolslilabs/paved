import type { Meta, StoryObj } from "@storybook/react-vite";
import { appRenders } from "../../mocks/assets";
import { ThemeCover, TileMosaic, TileRender } from "./tile-render";

/** A tile's build-time render (THEMES-RENDERS): one image, no WebGL context; the plan's chip without one. */
const meta = {
  title: "Elements/TileRender",
  component: TileRender,
  parameters: { layout: "padded" },
  args: { plan: 17, theme: 0, renders: appRenders },
  decorators: [(Story) => <div className="size-40"><Story /></div>],
} satisfies Meta<typeof TileRender>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The base model. */
export const Default: Story = {};
/** The same plan in Forest (its first variant). */
export const Forest: Story = { args: { theme: 1 } };
/** No render served: the plan's chip. */
export const NoRender: Story = { args: { renders: undefined } };
/** A theme's cover, and a coming-soon one under its blur. */
export const Covers: Story = {
  render: () => (
    <div className="flex w-72 flex-col gap-2">
      <ThemeCover theme={1} renders={appRenders} alt="Forest: a few of its tiles" />
      <ThemeCover theme={0} renders={appRenders} blurred alt="Snow" />
    </div>
  ),
};
/** A Story campaign's background (#592): the first tiles of its decks, two rows of four. */
export const Mosaic: Story = {
  render: () => (
    <div className="w-72">
      <TileMosaic plans={[17, 4, 13, 8, 1, 5, 18, 14]} renders={appRenders} />
    </div>
  ),
};
