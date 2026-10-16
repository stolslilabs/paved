import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "../ui/button";
import { Toaster } from "../ui/sonner";
import { toastError, type ErrorToastProps } from "./error-toast";

const CLAIM: ErrorToastProps = {
  title: "The claim did not go through",
  message: "Not completed yet: play the quest's games first.",
  detail: { code: "WriteError", txHash: "0x05f16e7f2a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5", version: "0.1.0", at: Date.UTC(2026, 9, 16, 9, 30) },
};

function ErrorToastDemo(props: ErrorToastProps) {
  return (
    <>
      <Toaster position="top-center" />
      <Button onClick={() => toastError(props)}>Show</Button>
    </>
  );
}

const meta = {
  title: "Containers/ErrorToast",
  component: ErrorToastDemo,
  parameters: { layout: "padded" },
  args: CLAIM,
} satisfies Meta<typeof ErrorToastDemo>;
export default meta;
type Story = StoryObj<typeof meta>;

/** An error with no place on its page (a claim, a free game, the wallet): the toast holds `InlineError` (P-67). */
export const Shown: Story = {
  play: async ({ args }) => {
    toastError(args);
  },
};
/** The wallet's connect failed (`useConnectError`). */
export const Wallet: Story = {
  args: { title: "Wallet", message: "The controller window was closed before the account connected.", detail: { version: "0.1.0", at: Date.UTC(2026, 9, 16, 9, 30) } },
  play: async ({ args }) => {
    toastError(args);
  },
};
