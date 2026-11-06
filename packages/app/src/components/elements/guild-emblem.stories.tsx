import type { Meta, StoryObj } from "@storybook/react-vite";
import { GUILD_EMBLEM_CHARGES, GUILD_EMBLEM_COLOUR_NAMES, GuildEmblem } from "./guild-emblem";

/**
 * A guild's emblem (#953, open point 7's default): a shield in two of nine colours, bearing one of twenty charges in a third (GUILD-PAGE:
 * Codex's flat silhouettes in place of Font Awesome's icons, Silver unless the emblem names a colour).
 */
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
/** Every charge, in a colour of its own then in Silver, and every colour as the shield over each band. */
export const Sets: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {GUILD_EMBLEM_CHARGES.map((name, i) => (
          <GuildEmblem key={name} size="lg" emblem={{ icon: i, primary: i % 9, secondary: (i + 3) % 9, charge: (i + 6) % 9 }} label={name} />
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {GUILD_EMBLEM_CHARGES.map((name, i) => (
          <GuildEmblem key={name} emblem={{ icon: i, primary: (i + 5) % 9, secondary: (i + 1) % 9 }} label={name} />
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
