import type { Meta, StoryObj } from "@storybook/react-vite";
import { LOADING } from "../../mocks/scenes";
import { LoadingScene } from "./loading-scene";

/** The boot screen, every route's fallback, and the board's asset loading. One story per state; the Viewport control reframes it. */
const meta = { title: "Scenes/Loading", component: LoadingScene } satisfies Meta<typeof LoadingScene>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The length unknown: an indeterminate bar (still under reduced motion). */
export const Booting: Story = { args: LOADING.booting };

/** The board's models loading, with a tip. */
export const Assets: Story = { args: LOADING.assets };
/** WRAP360: long names and sentences, full addresses, large figures. */
export const Stress: Story = { args: LOADING.stress };
