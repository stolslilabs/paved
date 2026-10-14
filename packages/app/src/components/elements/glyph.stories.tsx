import type { Meta, StoryObj } from "@storybook/react-vite";
import { GLYPHS, Glyph } from "./glyph";

const meta = { title: "Elements/Glyph", component: Glyph, parameters: { layout: "padded" }, args: { name: "trophy" } } satisfies Meta<typeof Glyph>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** Every glyph of the slot: the placeholders F4's Font Awesome `Icon` replaces. */
export const All: Story = {
  render: () => (
    <div className="grid grid-cols-3 gap-4 tablet:grid-cols-6">
      {GLYPHS.map((name) => (
        <div key={name} className="flex flex-col items-center gap-2 rounded-lg bg-card p-3 text-xs text-muted-foreground">
          <Glyph name={name} className="size-6 text-foreground" />
          {name}
        </div>
      ))}
    </div>
  ),
};
