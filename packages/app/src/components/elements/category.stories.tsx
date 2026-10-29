import type { Meta, StoryObj } from "@storybook/react-vite";
import { CLOSING_CATEGORIES, CategoryIcon, categoryInfo } from "./category";
import { bothThemes } from "../../stories/both-themes";

const meta = { title: "Elements/Category", component: CategoryIcon, parameters: { layout: "padded" }, args: { category: 3 } } satisfies Meta<typeof CategoryIcon>;
export default meta;
type Story = StoryObj<typeof meta>;

export const City: Story = {};

/** The categories a game closes, each with its game icon (#870). */
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

/** The game icons at the sizes their lists use: 12 px (the village's kinds, the highlights), 16 px (the closings), 20 and 32 px. */
export const Sizes: Story = {
  render: () => (
    <div className="flex flex-col gap-2 rounded-xl bg-background p-3">
      {(["xs", "sm", "md", "xl"] as const).map((size) => (
        <div key={size} className="flex items-center gap-3">
          <span className="w-6 text-xs text-muted-foreground">{size}</span>
          {CLOSING_CATEGORIES.map((c) => (
            <CategoryIcon key={c} category={c} size={size} />
          ))}
        </div>
      ))}
    </div>
  ),
};

/** The four categories in both themes (issue 870): the app's dark theme and the light scope. */
export const AllBothThemes: Story = { ...All, decorators: [bothThemes] };
