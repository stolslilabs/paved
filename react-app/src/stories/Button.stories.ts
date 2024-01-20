import { Button } from "@/components/ui/button";
import type { Meta, StoryObj } from "@storybook/react";

// More on how to set up stories at: https://storybook.js.org/docs/writing-stories#default-export
const meta = {
  title: "Example/Button",
  component: Button,
  parameters: {
    // Optional parameter to center the component in the Canvas. More info: https://storybook.js.org/docs/configure/story-layout
    layout: "centered",
  },
  // This component will have an automatically generated Autodocs entry: https://storybook.js.org/docs/writing-docs/autodocs
  tags: ["autodocs"],
  // More on argTypes: https://storybook.js.org/docs/api/argtypes
  argTypes: {
    variant: { control: "default" },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

const text = "Brew";

// More on writing stories with args: https://storybook.js.org/docs/writing-stories/args
export const Primary: Story = {
  args: {
    variant: "default",
    size: "lg",
    children: text,
  },
};

export const Secondary: Story = {
  args: {
    variant: "secondary",
    size: "lg",
    children: text,
  },
};

export const Outline: Story = {
  args: {
    variant: "outline",
    size: "lg",
    children: text,
  },
};

export const Destructive: Story = {
  args: {
    variant: "destructive",
    size: "lg",
    children: text,
  },
};

export const Ghost: Story = {
  args: {
    variant: "ghost",
    size: "lg",
    children: text,
  },
};
