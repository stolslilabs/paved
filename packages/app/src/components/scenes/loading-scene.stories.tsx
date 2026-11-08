import type { Meta, StoryObj } from "@storybook/react-vite";
import { LoadingScene } from "./loading-scene";

/** The boot screen and the route error's check: one state, the length unknown; the Viewport control reframes it. */
const meta = { title: "Scenes/Loading", component: LoadingScene } satisfies Meta<typeof LoadingScene>;
export default meta;
type Story = StoryObj<typeof meta>;

/** An indeterminate bar (still under reduced motion). */
export const Booting: Story = {};
