import type { Meta, StoryObj } from "@storybook/react-vite";
import { BoardHero } from "./board-hero";

/** Direction D's hero (#537): the render of a real board, the phone crop below `desktop` and the wide one from it. */
const meta = {
  title: "Elements/BoardHero",
  component: BoardHero,
  parameters: { layout: "fullscreen" },
  decorators: [(Story) => <div className="relative h-[24rem] w-full bg-background"><Story /></div>],
} satisfies Meta<typeof BoardHero>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Home: the board melts into the page at its bottom. */
export const Fade: Story = {};
/** Welcome: a shade over all of it, for the card on top. */
export const Veil: Story = { args: { shade: "veil" } };
