import type { Meta, StoryObj } from "@storybook/react-vite";
import { Notice } from "./notice";
import { LONG_ADDRESS, LONG_LABEL, LONG_SENTENCE, LONG_WORD } from "../../mocks/stress";
import { Button } from "../ui/button";

const meta = {
  title: "Elements/Notice",
  component: Notice,
  parameters: { layout: "padded" },
  args: { tone: "info", children: "Training is saved on this device." },
  decorators: [(Story) => <div className="max-w-md"><Story /></div>],
} satisfies Meta<typeof Notice>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Info: Story = {};
export const Warning: Story = { args: { tone: "warning", title: "Storage is off", children: "This game is not saved and ends if the page closes." } };
/** WRAP360: a long title and body, an unbroken address and compound; the icon stays on the first line, the action keeps its size. */
export const Stress: Story = {
  args: {
    tone: "warning",
    title: LONG_LABEL,
    children: `${LONG_SENTENCE} ${LONG_ADDRESS} ${LONG_WORD}`,
    action: <Button size="sm">Retry</Button>,
  },
};
