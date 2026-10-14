import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { TopBar } from "./top-bar";

const meta = { title: "Containers/TopBar", component: TopBar, args: { title: "Choose a mode", onBack: fn() } } satisfies Meta<typeof TopBar>;
export default meta;
type Story = StoryObj<typeof meta>;

export const WithBack: Story = {};
export const NoBack: Story = { args: { onBack: undefined, title: "Final score" } };
export const WithAction: Story = {
  args: {
    end: (
      <Button variant="ghost" size="icon" aria-label="Settings">
        <Icon name="gear" />
      </Button>
    ),
  },
};
