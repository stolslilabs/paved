import type { Meta, StoryObj } from "@storybook/react-vite";
import { FRAME_ART, UI_FRAMES, UI_ICONS, uiFrameSources } from "./ui-art";
import { UiIcon, type UiIconSize } from "./ui-icon";

const meta = { title: "Elements/UiIcon", component: UiIcon, parameters: { layout: "padded" }, args: { name: "chests", size: "xl" } } satisfies Meta<typeof UiIcon>;
export default meta;
type Story = StoryObj<typeof meta>;

const SIZES: readonly UiIconSize[] = ["xs", "sm", "md", "lg", "xl", "2xl"];

export const Default: Story = {};

/** The 32 icons at 48 px, each named, on the app's dark surface. */
export const AllIcons: Story = {
  render: () => (
    <div className="grid gap-3 rounded-xl bg-background p-4 text-foreground" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(6rem, 1fr))" }}>
      {UI_ICONS.map((name) => (
        <figure key={name} className="m-0 flex flex-col items-center gap-1">
          <UiIcon name={name} size="xl" />
          <figcaption className="text-xs text-muted-foreground">{name}</figcaption>
        </figure>
      ))}
    </div>
  ),
};

/** One icon at every size: 20, 24, 32, 40, 48 and 64 px. */
export const Sizes: Story = {
  render: () => (
    <div className="flex items-end gap-4 rounded-xl bg-background p-4">
      {SIZES.map((size) => (
        <UiIcon key={size} name="missions" size={size} />
      ))}
    </div>
  ),
};

/** The frames the home draws with them: the dock's ribbon, the PLAY medallion, the season dial and the dock's divider. */
export const Frames: Story = {
  render: () => (
    <div className="flex flex-wrap items-end gap-4 rounded-xl bg-background p-4">
      {UI_FRAMES.map((name) => {
        const px = name === "dock-ribbon" ? 360 : name === "dock-divider" ? 8 : 96;
        const { width, height, ...sources } = uiFrameSources(name, px);
        return <img key={name} {...sources} alt="" draggable={false} style={{ width: px, height: (px * FRAME_ART[name].height) / FRAME_ART[name].width }} />;
      })}
    </div>
  ),
};
