import type { Meta, StoryObj } from "@storybook/react-vite";
import { DirectionRoot, Brand } from "./kit";
import { DIRECTIONS, DIRECTION_IDS } from "./palettes";

/** The three directions side by side, for the owner's pick (#537). Each has its own section, `Direction/A`, `Direction/B`, `Direction/C`. */
const meta = { title: "Direction/Overview", parameters: { layout: "fullscreen" } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const Overview: Story = {
  render: () => (
    <div className="grid min-h-dvh bg-black desktop:grid-cols-3">
      {DIRECTION_IDS.map((id) => {
        const d = DIRECTIONS[id];
        return (
          <DirectionRoot key={id} id={id} className="flex flex-col gap-4 p-6">
            <Brand />
            <h2 className="font-display text-3xl text-(color:--d-primary)">
              {id.toUpperCase()}: {d.name}
            </h2>
            <p className="text-sm text-(color:--d-muted)">{d.tagline}</p>
            <div className="flex h-12 overflow-hidden rounded-md border border-white/20">
              {(["bg", "surface", "raised", "primary", "accent"] as const).map((k) => (
                <span key={k} className="flex-1" style={{ background: d.palette[k] }} title={`${k} ${d.palette[k]}`} />
              ))}
            </div>
            <p className="text-sm">{d.notCartridge}</p>
          </DirectionRoot>
        );
      })}
    </div>
  ),
};
