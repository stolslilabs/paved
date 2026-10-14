import type { Meta, StoryObj } from "@storybook/react-vite";
import { Avatar, AvatarFallback, AvatarImage } from "./avatar";

const meta = { title: "UI/Avatar", component: Avatar, parameters: { layout: "padded" } } satisfies Meta<typeof Avatar>;
export default meta;
type Story = StoryObj<typeof meta>;

// An inline SVG as the image: Storybook needs no network and the story shows the image path.
const IMG = `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" fill="#F0BF5B"/><circle cx="20" cy="16" r="7" fill="#0A141C"/><rect x="8" y="26" width="24" height="14" rx="7" fill="#0A141C"/></svg>')}`;

export const WithImage: Story = {
  render: () => (
    <Avatar>
      <AvatarImage src={IMG} alt="Player" />
      <AvatarFallback>PL</AvatarFallback>
    </Avatar>
  ),
};

/** No image, or one that fails: the initials. */
export const Fallback: Story = {
  render: () => (
    <div className="flex gap-3">
      <Avatar>
        <AvatarFallback>BA</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarImage src="/missing.png" alt="" />
        <AvatarFallback>ZZ</AvatarFallback>
      </Avatar>
    </div>
  ),
};

export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-3">
      {["size-6 text-xs", "size-10", "size-16 text-lg"].map((c) => (
        <Avatar key={c} className={c}>
          <AvatarFallback>PV</AvatarFallback>
        </Avatar>
      ))}
    </div>
  ),
};
