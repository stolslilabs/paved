import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { PVP_SEARCH } from "../../mocks/pvp";
import { PvpSearchScene } from "./pvp-search-scene";

/** The PvP search (#647): the clouds while the matchmaker draws a village, parting once one is found. On fakes. */
const meta = {
  title: "Scenes/PvP/Search",
  component: PvpSearchScene,
  parameters: { layout: "fullscreen" },
  args: { ...PVP_SEARCH.searching, onCancel: fn(), onRetry: fn() },
} satisfies Meta<typeof PvpSearchScene>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Searching: Story = { args: PVP_SEARCH.searching };
/** A village drawn: the clouds part, the defender's name shows; the page moves on to the scout. */
export const Found: Story = { args: PVP_SEARCH.found };
/** Every village in range is shielded or was attacked lately. */
export const None: Story = { args: PVP_SEARCH.none };
export const Failed: Story = { args: PVP_SEARCH.error };
/** Reduced motion: the clouds stand still. */
export const ReducedMotion: Story = { args: PVP_SEARCH.searching, parameters: { reducedMotion: "always" } };
