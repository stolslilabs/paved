import type { Meta, StoryObj } from "@storybook/react-vite";
import { Icon, type IconSize } from "./icon";

const meta = {
  title: "Foundations/Icons",
  component: Icon,
  parameters: { layout: "padded" },
  args: { name: "house", variant: "solid", size: "lg" },
} satisfies Meta<typeof Icon>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The icons in use so far: the old client's (app/), the five tabs' candidates (section 6.1) and the thin file's one. */
const SOLID = [
  "house",
  "ranking-star",
  "list-check",
  "vault",
  "gear",
  "hammer",
  "fire",
  "sack-dollar",
  "rocket",
  "lock",
  "trash",
  "book-bible",
] as const;
const SIZES: IconSize[] = ["xs", "sm", "md", "lg", "xl"];

/** `solid.min.js`: every solid icon is in the file; these are the ones the app uses so far. */
export const Solid: Story = {
  render: () => (
    <ul className="grid grid-cols-2 gap-4 p-4 text-foreground mobile:grid-cols-3 tablet:grid-cols-6">
      {SOLID.map((name) => (
        <li key={name} className="flex flex-col items-center gap-2 rounded-md border border-border p-4 text-xs">
          <Icon name={name} size="xl" className="text-primary" />
          <code className="text-muted-foreground">{name}</code>
        </li>
      ))}
    </ul>
  ),
};

/** `thin.min.js` is 4.5 KB: the owner's file registers one icon, spider-web. */
export const Thin: Story = {
  render: () => (
    <ul className="flex gap-4 p-4 text-foreground">
      <li className="flex flex-col items-center gap-2 rounded-md border border-border p-4 text-xs">
        <Icon name="spider-web" variant="thin" size="xl" className="text-primary" />
        <code className="text-muted-foreground">spider-web · thin</code>
      </li>
      <li className="flex flex-col items-center gap-2 rounded-md border border-border p-4 text-xs">
        <Icon name="spider-web" variant="solid" size="xl" className="text-primary" />
        <code className="text-muted-foreground">spider-web · solid</code>
      </li>
    </ul>
  ),
};

/** The five sizes (12, 16, 20, 24 and 32 px), in both styles. The icon is 1em high, so the size is the font size. */
export const Sizes: Story = {
  render: () => (
    <table className="m-4 text-foreground">
      <tbody>
        {(["solid", "thin"] as const).map((variant) => (
          <tr key={variant}>
            <th scope="row" className="pr-6 text-left text-xs font-normal text-muted-foreground">
              {variant}
            </th>
            {SIZES.map((size) => (
              <td key={size} className="px-3 py-2 text-center">
                <Icon name="spider-web" variant={variant} size={size} />
                <code className="mt-1 block text-xs text-muted-foreground">{size}</code>
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  ),
};

/** `label` gives the icon an accessible name (role img); without it the icon is decorative (aria-hidden). */
export const Accessibility: Story = {
  render: () => (
    <ul className="flex flex-col gap-3 p-4 text-sm text-foreground">
      <li className="flex items-center gap-2">
        <Icon name="trash" label="Delete" /> <span>with a label: announced as "Delete"</span>
      </li>
      <li className="flex items-center gap-2">
        <Icon name="trash" /> <span>Delete (decorative: the text names the action)</span>
      </li>
    </ul>
  ),
};

/** Controls: any name from the solid file. */
export const Playground: Story = {};
