import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LazyMotion, domMax } from "motion/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { VaultAction } from "../src/components/containers/vault-action";
import type { VaultOp } from "../src/components/containers/vault-form";

/** `InlineError` is an `m` component: a LazyMotion with `domMax`, as the app's providers. */
const wrap = (ui: ReactNode) => <LazyMotion features={domMax}>{ui}</LazyMotion>;

const P = 10n ** 18n;
const WORD: Record<VaultOp, string> = { deposit: "Deposit", mint: "Mint", withdraw: "Withdraw", redeem: "Redeem" };
const OPS = Object.keys(WORD) as VaultOp[];

// VAULT-QUOTE-GATE (#1049): a valid amount never sends before its quote is shown, nor beside a failed one.
describe("VaultAction's quote gate", () => {
  it.each(OPS)("%s: held while the quote is read, sent once it is shown", async (op) => {
    const onSend = vi.fn();
    const view = render(wrap(<VaultAction op={op} amount="10" limit={100n * P} preview={null} onSend={onSend} />));
    const button = screen.getByRole("button", { name: WORD[op] });
    expect(button).toBeDisabled();
    expect(screen.getByRole("group", { name: /You get|You pay|Uses/ })).toHaveTextContent("…");
    await userEvent.click(button);
    expect(onSend).not.toHaveBeenCalled();
    view.rerender(wrap(<VaultAction op={op} amount="10" limit={100n * P} preview={9n * P} onSend={onSend} />));
    await userEvent.click(screen.getByRole("button", { name: WORD[op] }));
    expect(onSend).toHaveBeenCalledOnce();
  });

  it.each(OPS)("%s: a failed quote holds the action and shows the error with Retry, which reads it again", async (op) => {
    const onSend = vi.fn();
    const onRetryPreview = vi.fn();
    render(wrap(<VaultAction op={op} amount="10" limit={100n * P} preview={null} previewError="node down" onRetryPreview={onRetryPreview} onSend={onSend} />));
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("The quote cannot be read: node down");
    expect(screen.getByRole("group", { name: /You get|You pay|Uses/ })).not.toHaveTextContent("…");
    const button = screen.getByRole("button", { name: WORD[op] });
    expect(button).toBeDisabled();
    await userEvent.click(button);
    expect(onSend).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetryPreview).toHaveBeenCalledOnce();
  });

  it("a failed quote is no error while nothing is typed", () => {
    render(wrap(<VaultAction op="deposit" amount="" limit={100n * P} preview={null} previewError="node down" />));
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
