import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { Button, buttonVariants } from "./button";

const meta = { title: "UI/Button", component: Button, parameters: { layout: "padded" }, args: { children: "Place tile" } } satisfies Meta<typeof Button>;
export default meta;
type Story = StoryObj<typeof meta>;

const VARIANTS = ["default", "secondary", "outline", "ghost", "destructive", "link"] as const;

export const Default: Story = {};

/** Every variant, then every size. The press scales the button down (Motion), and not at all under reduced motion. */
export const Variants: Story = {
  render: () => (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        {VARIANTS.map((v) => (
          <Button key={v} variant={v}>{v}</Button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm">Small</Button>
        <Button>Default</Button>
        <Button size="lg">Large</Button>
        <Button size="icon" aria-label="Add">+</Button>
      </div>
    </div>
  ),
};

/** Hover is played by the story (the pointer rests on the button). */
export const Hover: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.hover(within(canvasElement).getByRole("button"));
  },
};

/** Keyboard focus shows the gold ring (`--ring`). */
export const Focus: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.tab();
    await expect(within(canvasElement).getByRole("button")).toHaveFocus();
  },
};

export const Disabled: Story = {
  render: () => (
    <div className="flex flex-wrap gap-3">
      {VARIANTS.map((v) => (
        <Button key={v} variant={v} disabled>{v}</Button>
      ))}
    </div>
  ),
};

/** Busy: a spinner, `aria-busy`, and the button cannot be pressed again. */
export const Loading: Story = {
  render: () => (
    <div className="flex flex-wrap gap-3">
      <Button loading>Confirming</Button>
      <Button variant="secondary" loading>Confirming</Button>
      <Button variant="outline" loading>Confirming</Button>
    </div>
  ),
};

/** `asChild` gives a link the button's look. */
export const AsLink: Story = {
  render: () => (
    <Button asChild variant="outline">
      <a href="#ranks">Open ranks</a>
    </Button>
  ),
};

/** The class helper for elements that are not buttons. */
export const ClassHelper: Story = {
  render: () => <a href="#vault" className={buttonVariants({ variant: "secondary" })}>A link styled by buttonVariants</a>,
};
