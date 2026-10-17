import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { InlineError } from "./inline-error";
import { LONG_ADDRESS, LONG_SENTENCE, LONG_WORD } from "../../mocks/stress";
import { Button } from "../ui/button";

const DETAIL = {
  code: "SettleTooEarlyError",
  txHash: "0x05f16e7f2a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5",
  gameId: 42,
  version: "0.1.0",
  at: Date.UTC(2026, 9, 16, 9, 30),
};

const meta = {
  title: "Elements/InlineError",
  component: InlineError,
  parameters: { layout: "padded" },
  args: { message: "Move refused. Choose another slot.", onCopy: fn() },
  decorators: [(Story) => <div className="max-w-md"><Story /></div>],
} satisfies Meta<typeof InlineError>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Short: Story = {};
export const WithTitle: Story = { args: { title: "Settle refused", message: "This day cannot be settled yet: try again after the next day ends.", detail: DETAIL } };
export const Long: Story = { args: { title: "Could not load the ranking", message: LONG_SENTENCE, action: <Button size="sm" variant="outline">Retry</Button> } };
/** WRAP360: past two lines the text ends in an ellipsis; the tooltip and screen readers keep all of it. */
export const VeryLongWithAddress: Story = {
  args: { title: "Purchase refused", message: `${LONG_SENTENCE} Sent from ${LONG_ADDRESS}. ${LONG_WORD}`, detail: DETAIL },
};
export const WithDetail: Story = { args: { message: "The price moved before your purchase went through: your USDC was not spent. Try again.", detail: DETAIL } };
export const WithoutDetail: Story = { args: { message: "Could not connect." } };
export const Copied: Story = { args: { title: "Settle refused", message: "Game 42 is not over yet", detail: DETAIL, defaultCopy: "copied" } };
/** The clipboard refused (or there is none): the whole text, selected, to copy by hand. */
export const CopyFailed: Story = { args: { title: "Settle refused", message: "Game 42 is not over yet", detail: DETAIL, defaultCopy: "failed" } };
/** No error: nothing shows and the space is folded. */
export const None: Story = { args: { message: null } };
