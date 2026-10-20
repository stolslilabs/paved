import type { Meta, StoryObj } from "@storybook/react-vite";
import { StarMeter } from "./star-meter";

/** Against a village of 5,831 points (the fakes' rival): the marks at 70, 85 and 110 % are 4,082, 4,957 and 6,415 points. */
const meta = { title: "Elements/Star meter", component: StarMeter, parameters: { layout: "padded" }, args: { score: 0, target: 5_831 } } satisfies Meta<typeof StarMeter>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The attack's first tile: no point yet. */
export const Start: Story = {};
/** Halfway to the first mark. */
export const NoStar: Story = { args: { score: 2_310 } };
/** Past 70 %: the first star lit. */
export const OneStar: Story = { args: { score: 4_120 } };
/** Past 85 %. */
export const TwoStars: Story = { args: { score: 5_240 } };
/** Past 110 %: the village beaten. */
export const ThreeStars: Story = { args: { score: 6_610 } };
/** Far past the bar's end (125 %): the bar stays full, the share says how far. */
export const Beyond: Story = { args: { score: 9_400 } };
