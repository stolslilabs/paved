import type { Meta, StoryObj } from "@storybook/react-vite";
import { CLOSING_CATEGORIES, CategoryGlyph, categoryInfo } from "./category";

const meta = { title: "Elements/Category", component: CategoryGlyph, parameters: { layout: "padded" }, args: { category: 3 } } satisfies Meta<typeof CategoryGlyph>;
export default meta;
type Story = StoryObj<typeof meta>;

export const City: Story = {};

/** The categories a game closes, each with its glyph and colour. */
export const All: Story = {
  render: () => (
    <ul className="flex flex-col gap-2">
      {CLOSING_CATEGORIES.map((c) => (
        <li key={c} className="flex items-center gap-3 text-sm">
          <CategoryGlyph category={c} />
          {categoryInfo(c).label}
        </li>
      ))}
    </ul>
  ),
};
