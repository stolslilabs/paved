import type { Meta, StoryObj } from "@storybook/react-vite";
import { CLOSING_CATEGORIES, CategoryIcon, categoryInfo } from "./category";

const meta = { title: "Elements/Category", component: CategoryIcon, parameters: { layout: "padded" }, args: { category: 3 } } satisfies Meta<typeof CategoryIcon>;
export default meta;
type Story = StoryObj<typeof meta>;

export const City: Story = {};

/** The categories a game closes, each with its icon and colour. */
export const All: Story = {
  render: () => (
    <ul className="flex flex-col gap-2">
      {CLOSING_CATEGORIES.map((c) => (
        <li key={c} className="flex items-center gap-3 text-sm">
          <CategoryIcon category={c} />
          {categoryInfo(c).label}
        </li>
      ))}
    </ul>
  ),
};
