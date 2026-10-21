import { render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LazyMotion, MotionConfig, domMax } from "motion/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { InlineError, errorReport } from "../src/components/elements/inline-error";
import { TileStack } from "../src/components/containers/tile-stack";
import { VaultForm } from "../src/components/containers/vault-form";
import { PAVED_BALANCE } from "../src/mocks/economy";
import { EXIT_FEE_BPS, PREVIEW_DEPOSIT_100, VAULT_HELD } from "../src/mocks/vault";
import { AchievementsScene } from "../src/components/scenes/achievements-scene";
import { ACHIEVEMENTS } from "../src/mocks/scenes";
import { errorDetail, useErrorDetail } from "../src/routes/error-detail";
import { version } from "../package.json";

const wrap = (node: ReactNode) => <LazyMotion features={domMax}>{node}</LazyMotion>;

const DETAIL = { code: "SettleTooEarlyError", txHash: "0xabc", gameId: 42, version: "0.1.0", at: Date.UTC(2026, 9, 16, 9, 30) };

describe("InlineError (P-67)", () => {
  it("shows the icon, the title and the message as an alert, the whole text in its tooltip", () => {
    render(wrap(<InlineError title="Settle refused" message="Game 42 is not over yet" />));
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Settle refused: Game 42 is not over yet");
    expect(alert.querySelector("[title]")).toHaveAttribute("title", "Settle refused: Game 42 is not over yet");
    expect(alert.querySelector(".line-clamp-2")).not.toBeNull();
    expect(alert.querySelector('[data-icon="triangle-exclamation"]')).not.toBeNull();
  });

  it("shows nothing when there is no error", () => {
    render(wrap(<InlineError message={null} title="Settle refused" />));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText("Settle refused")).not.toBeInTheDocument();
  });

  it("copies the message and its detail as plain text, then says Copied", async () => {
    const onCopy = vi.fn();
    render(wrap(<InlineError title="Settle refused" message="Too early." detail={DETAIL} onCopy={onCopy} />));
    await userEvent.click(screen.getByRole("button", { name: "Copy the error" }));
    expect(onCopy).toHaveBeenCalledWith(
      ["Settle refused: Too early.", "Error: SettleTooEarlyError", "Transaction: 0xabc", "Game: 42", "Version: 0.1.0", "First shown (UTC): 2026-10-16T09:30:00.000Z"].join("\n"),
    );
    expect(await screen.findByRole("button", { name: "Copied" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("The error is copied");
  });

  it("says the copy failed and shows the whole text, selected, when the clipboard refuses", async () => {
    const onCopy = vi.fn(() => Promise.reject(new Error("NotAllowedError")));
    render(wrap(<InlineError title="Settle refused" message="Too early." detail={DETAIL} onCopy={onCopy} />));
    await userEvent.click(screen.getByRole("button", { name: "Copy the error" }));
    expect(await screen.findByText("Copy failed: select the text")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Copied" })).not.toBeInTheDocument();
    const field = screen.getByRole("textbox", { name: "The error, to copy" }) as HTMLTextAreaElement;
    expect(field.value).toBe(errorReport({ title: "Settle refused", message: "Too early.", detail: DETAIL }));
    expect([field.selectionStart, field.selectionEnd]).toEqual([0, field.value.length]);
  });

  it("says the copy failed when a copy throws", async () => {
    const onCopy = vi.fn(() => {
      throw new Error("boom");
    });
    render(wrap(<InlineError message="Too early." onCopy={onCopy} />));
    await userEvent.click(screen.getByRole("button", { name: "Copy the error" }));
    expect(await screen.findByText("Copy failed: select the text")).toBeInTheDocument();
  });

  it("a new error starts clean: a failed copy is not carried to the next error, closed or not in between", async () => {
    const onCopy = vi.fn(() => Promise.reject(new Error("NotAllowedError")));
    const view = (message: string | null) => wrap(<InlineError title="Settle refused" message={message} detail={DETAIL} onCopy={onCopy} />);
    const { rerender } = render(view("Too early."));
    await userEvent.click(screen.getByRole("button", { name: "Copy the error" }));
    expect(await screen.findByText("Copy failed: select the text")).toBeInTheDocument();
    rerender(view(null));
    rerender(view("Game 42 is already settled."));
    expect(screen.getByRole("alert")).toHaveTextContent("Game 42 is already settled.");
    expect(screen.queryByText("Copy failed: select the text")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "The error, to copy" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy the error" })).toBeInTheDocument();
    // Changed in place, with no close between.
    await userEvent.click(screen.getByRole("button", { name: "Copy the error" }));
    expect(await screen.findByText("Copy failed: select the text")).toBeInTheDocument();
    rerender(view("Another refusal."));
    expect(screen.queryByText("Copy failed: select the text")).not.toBeInTheDocument();
  });

  it("a Copied is not carried to the next error either", async () => {
    const view = (message: string) => wrap(<InlineError message={message} onCopy={() => undefined} />);
    const { rerender } = render(view("Too early."));
    await userEvent.click(screen.getByRole("button", { name: "Copy the error" }));
    expect(await screen.findByRole("button", { name: "Copied" })).toBeInTheDocument();
    rerender(view("Too late."));
    expect(screen.getByRole("button", { name: "Copy the error" })).toBeInTheDocument();
  });

  it("without the Clipboard API, the default copy fails and shows the text to select", async () => {
    const clipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
    try {
      render(wrap(<InlineError message="Too early." />));
      await userEvent.click(screen.getByRole("button", { name: "Copy the error" }));
      expect(await screen.findByText("Copy failed: select the text")).toBeInTheDocument();
      expect(screen.getByRole("textbox", { name: "The error, to copy" })).toHaveValue("Too early.");
    } finally {
      if (clipboard) Object.defineProperty(navigator, "clipboard", clipboard);
      else delete (navigator as { clipboard?: unknown }).clipboard;
    }
  });

  it("with the Clipboard API, the default copy writes the text and says Copied", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    const clipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    try {
      render(wrap(<InlineError message="Too early." />));
      await userEvent.click(screen.getByRole("button", { name: "Copy the error" }));
      expect(await screen.findByRole("button", { name: "Copied" })).toBeInTheDocument();
      expect(writeText).toHaveBeenCalledWith("Too early.");
    } finally {
      if (clipboard) Object.defineProperty(navigator, "clipboard", clipboard);
      else delete (navigator as { clipboard?: unknown }).clipboard;
    }
  });

  it("takes no space without an error: nothing is rendered, so a parent's gap is not added", async () => {
    // Each host with no error renders no slot: the same children, so the same height, as before P-67.
    const { unmount } = render(wrap(<TileStack tile={{ plan: 1, orientation: 1 }} state="placing" remaining={10} />));
    expect(document.querySelector('[data-slot="inline-error"]')).toBeNull();
    unmount();
    render(
      wrap(<VaultForm mode="deposit" amount="100" balance={PAVED_BALANCE} shares={VAULT_HELD.shares} maxWithdraw={VAULT_HELD.maxWithdraw} exitFeeBps={EXIT_FEE_BPS} preview={PREVIEW_DEPOSIT_100} />),
    );
    expect(document.querySelector('[data-slot="inline-error"]')).toBeNull();
  });

  it("is removed once its fold ends, and at once under reduced motion", async () => {
    const view = (message: string | null) => wrap(<InlineError message={message} />);
    const { rerender, unmount } = render(view("Too early."));
    expect(document.querySelector('[data-slot="inline-error"]')).not.toBeNull();
    rerender(view(null));
    await waitFor(() => expect(document.querySelector('[data-slot="inline-error"]')).toBeNull());
    unmount();
    const reduced = (message: string | null) => <MotionConfig reducedMotion="always">{view(message)}</MotionConfig>;
    const second = render(reduced("Too early."));
    second.rerender(reduced(null));
    expect(document.querySelector('[data-slot="inline-error"]')).toBeNull();
  });

  it("in a toast, starts at its height (no grow-in for Sonner to measure)", () => {
    render(wrap(<InlineError message="Too early." animateIn={false} />));
    expect((document.querySelector('[data-slot="inline-error"]') as HTMLElement).style.height).not.toBe("0px");
  });

  it("copies the message alone when there is no detail", () => {
    expect(errorReport({ message: "Could not connect." })).toBe("Could not connect.");
  });

  it("is the hand's one error rendering, refused and expired alike", () => {
    const { rerender } = render(wrap(<TileStack tile={{ plan: 1, orientation: 1 }} state="refused" remaining={10} error="The edges do not match." />));
    expect(screen.getByRole("alert")).toHaveTextContent("Move refused: The edges do not match.");
    rerender(wrap(<TileStack tile={{ plan: 1, orientation: 1 }} state="expired" remaining={10} />));
    expect(screen.getByRole("alert")).toHaveTextContent("Game expired: 24 h passed since its purchase.");
    rerender(wrap(<TileStack tile={{ plan: 1, orientation: 1 }} state="placing" remaining={10} />));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("a scene's failed read shows it with Retry and Copy", () => {
    render(wrap(<AchievementsScene {...ACHIEVEMENTS.failed} />));
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Could not load the lifetime missions: The indexer did not answer (HTTP 503).");
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy the error" })).toBeInTheDocument();
  });
});

describe("errorDetail", () => {
  it("takes a typed error's name and hash, the version, and keeps the time it was first seen", () => {
    const error = Object.assign(new Error("Refused"), { name: "SpawnPausedError", transactionHash: "0x1" });
    const first = errorDetail(error, { gameId: 7 });
    expect(first).toMatchObject({ code: "SpawnPausedError", txHash: "0x1", gameId: 7, version });
    expect(errorDetail(error).at).toBe(first.at);
  });

  it("a string error keeps the time it was first shown across re-renders, and a new one after it clears", async () => {
    const { result, rerender } = renderHook(({ error }: { error: string | null }) => useErrorDetail(error), { initialProps: { error: "Connect refused" as string | null } });
    const first = result.current!.at;
    await new Promise((r) => setTimeout(r, 5));
    rerender({ error: "Connect refused" });
    expect(result.current!.at).toBe(first);
    rerender({ error: null });
    expect(result.current).toBeUndefined();
    rerender({ error: "Connect refused" });
    expect(result.current!.at).toBeGreaterThan(first!);
  });

  it("leaves out a plain Error's name", () => {
    expect(errorDetail(new Error("x")).code).toBeUndefined();
  });
});
