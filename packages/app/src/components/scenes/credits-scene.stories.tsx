import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { titleOf } from "../../lib/music/track-info";
import { TRACKS } from "../../lib/music/tracks";
import { CreditsScene } from "./credits-scene";

/** Credits (`/settings/credits`): the notices link, the fonts, the icons, the music and the sound effects. The viewport is the toolbar's (VP). */
const meta = { title: "Scenes/Credits", component: CreditsScene, args: { tracks: TRACKS.map(titleOf), onBack: fn(), onNavigate: fn() } } satisfies Meta<typeof CreditsScene>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
/** With the sound effects' section (#541). */
export const WithSounds: Story = { args: { sounds: ["Tile placed", "Road closed"] } };
