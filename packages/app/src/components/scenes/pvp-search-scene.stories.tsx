import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { DAY_PHASE_AT, type RendererSettingsInput } from "@paved/renderer";
import { sideSettings } from "../../data/board-side";
import { squareGridSettings } from "../../data/settings";
import { APP_ASSETS } from "../../mocks/assets";
import { PVP_SEARCH } from "../../mocks/pvp";
import { BoardViewport } from "../containers/board-viewport";
import { PvpSearchScene } from "./pvp-search-scene";

/** The page's backdrop (`SearchVoid`): an empty village in the rival's animated void, on summer's day, as the scout's board. */
const VOID: RendererSettingsInput = { ambient: { enabled: true }, dayNight: { enabled: true, season: "summer", freezeAt: DAY_PHASE_AT.day }, ...sideSettings("rival", squareGridSettings(true, "")) };

/**
 * The PvP search (#647; ATTACK-SCOUT): the radar's window over an empty village in its animated void while the matchmaker draws a
 * village, Cancel and the held gold "Searching…" at its foot; the rival on the radar once found; Search when none was drawn. On fakes.
 */
const meta = {
  title: "Scenes/PvP/Search",
  component: PvpSearchScene,
  parameters: { layout: "fullscreen" },
  args: { ...PVP_SEARCH.searching, onCancel: fn(), onRetry: fn() },
  render: (args) => <PvpSearchScene {...args} canvas={<BoardViewport tiles={[]} basePath={APP_ASSETS} settings={VOID} />} />,
} satisfies Meta<typeof PvpSearchScene>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Searching: Story = { args: PVP_SEARCH.searching };
/** A village drawn: the sweep stops, the rival shows on the radar, "Scouting…"; the page moves on to the scout. */
export const Found: Story = { args: PVP_SEARCH.found };
/** Every village in range is shielded or was attacked lately: the radar goes grey, the gold action is Search. */
export const None: Story = { args: PVP_SEARCH.none };
export const Failed: Story = { args: PVP_SEARCH.error };
/** Reduced motion: the sweep and the dots stand still. */
export const ReducedMotion: Story = { args: PVP_SEARCH.searching, parameters: { reducedMotion: "always" } };
/** No board behind (no WebGL, or a page that gives none): the board's ground. */
export const NoBoard: Story = { args: PVP_SEARCH.searching, render: (args) => <PvpSearchScene {...args} /> };
