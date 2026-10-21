import type { Meta, StoryObj } from "@storybook/react-vite";
import { AVATAR_PARTS, AVATAR_PART_KEYS, type AvatarPart } from "@paved/renderer";
import { AvatarStill, PART_TITLES, SHEET_BASE } from "./avatar-kit";

/** Each variant of one part, at 128 px and at the menus' 40 px, with its id and name. */
function PartSheet({ part, look }: { part: AvatarPart; look: "voxel" | "grid" }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-display text-lg text-foreground">
        {PART_TITLES[part]} <span className="text-sm text-muted-foreground">({AVATAR_PARTS[part].length} variants)</span>
      </h2>
      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-[repeat(auto-fill,minmax(9rem,1fr))]">
        {AVATAR_PARTS[part].map((name, id) => {
          const avatar = { ...SHEET_BASE, [part]: id };
          return (
            <li key={name} className="flex flex-col items-center gap-2" data-part={part} data-variant={id}>
              <AvatarStill avatar={avatar} size={128} style={look} />
              <span className="flex items-center gap-2">
                <AvatarStill avatar={avatar} size={40} style={look} />
                <span className="text-xs text-muted-foreground">
                  <span className="numeric">{id}</span> · {name}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Sheets({ parts, look }: { parts: readonly AvatarPart[]; look: "voxel" | "grid" }) {
  return (
    <div className="flex flex-col gap-8 p-4">
      {parts.map((part) => (
        <PartSheet key={part} part={part} look={look} />
      ))}
    </div>
  );
}

/**
 * Every part of the avatar (#626 PR 1) and each of its variants, one sheet a part: the variant at 128 px and at the menus'
 * 40 px, on a base avatar where only that part changes. Variant 0 is each part's default, the free one. "look" switches the
 * voxel look (the proposal) and the 8 x 8 grid look.
 */
const meta = {
  title: "Avatar/Parts",
  component: Sheets,
  parameters: { layout: "fullscreen" },
  argTypes: { look: { control: "inline-radio", options: ["voxel", "grid"] }, parts: { control: false } },
  args: { parts: AVATAR_PART_KEYS, look: "voxel" },
} satisfies Meta<typeof Sheets>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Everything: Story = {};
export const SkinTone: Story = { args: { parts: ["skin"] } };
export const HairColour: Story = { args: { parts: ["hairColour"] } };
export const Eyes: Story = { args: { parts: ["eyes"] } };
export const Eyebrows: Story = { args: { parts: ["eyebrows"] } };
export const Mouth: Story = { args: { parts: ["mouth"] } };
export const Hair: Story = { args: { parts: ["hair"] } };
export const Beard: Story = { args: { parts: ["beard"] } };
export const Headwear: Story = { args: { parts: ["headwear"] } };
export const Accessory: Story = { args: { parts: ["accessory"] } };
export const Background: Story = { args: { parts: ["background"] } };
