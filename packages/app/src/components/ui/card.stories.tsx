import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "./button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "./card";

const meta = { title: "UI/Card", component: Card, parameters: { layout: "padded" } } satisfies Meta<typeof Card>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Card className="max-w-sm">
      <CardHeader>
        <CardTitle>Daily mission</CardTitle>
        <CardDescription>Place 20 tiles today.</CardDescription>
      </CardHeader>
      <CardContent>12 of 20 placed.</CardContent>
      <CardFooter>
        <Button size="sm">Play</Button>
      </CardFooter>
    </Card>
  ),
};

/** A card on the page: its edge is `border` (1.21:1 on the card), decorative; a card is a surface, not a control. */
export const Plain: Story = {
  render: () => (
    <Card className="max-w-sm px-5">
      <CardContent className="px-0">Content only.</CardContent>
    </Card>
  ),
};

export const Stacked: Story = {
  render: () => (
    <div className="flex max-w-sm flex-col gap-3">
      {["Casual", "Ranked", "Training"].map((name) => (
        <Card key={name}>
          <CardHeader>
            <CardTitle>{name}</CardTitle>
          </CardHeader>
        </Card>
      ))}
    </div>
  ),
};
