import type { Meta, StoryObj } from "@storybook/react-vite";
import { GUILD_EMBLEM_COLOUR_NAMES, GUILD_EMBLEM_ICON_NAMES, GuildEmblem } from "./guild-emblem";

/** A guild's emblem (#953, open point 7's default): a shield in two of eight colours, bearing one of twelve icons. */
const meta = {
  title: "Elements/GuildEmblem",
  component: GuildEmblem,
  args: { emblem: { icon: 0, primary: 0, secondary: 7 }, size: "md" },
} satisfies Meta<typeof GuildEmblem>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Sizes: Story = {
  render: (args) => (
    <div className="flex items-end gap-3">
      <GuildEmblem {...args} size="sm" />
      <GuildEmblem {...args} size="md" />
      <GuildEmblem {...args} size="lg" />
    </div>
  ),
};
/** Every icon, and every colour as the shield over each band. */
export const Sets: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {GUILD_EMBLEM_ICON_NAMES.map((name, i) => (
          <GuildEmblem key={name} emblem={{ icon: i, primary: i % 8, secondary: (i + 3) % 8 }} label={name} />
        ))}
      </div>
      {GUILD_EMBLEM_COLOUR_NAMES.map((name, p) => (
        <div key={name} className="flex flex-wrap gap-2">
          {GUILD_EMBLEM_COLOUR_NAMES.map((band, s) => (
            <GuildEmblem key={band} size="sm" emblem={{ icon: p, primary: p, secondary: s }} label={`${name} over ${band}`} />
          ))}
        </div>
      ))}
    </div>
  ),
};
