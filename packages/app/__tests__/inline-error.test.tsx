import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LazyMotion, domMax } from "motion/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { InlineError, errorReport } from "../src/components/elements/inline-error";
import { HandPanel } from "../src/components/containers/hand-panel";
import { PlayerScene } from "../src/components/scenes/player-scene";
import { PLAYER_PAGE } from "../src/mocks/scenes";
import { errorDetail } from "../src/routes/error-detail";
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
      ["Settle refused: Too early.", "Error: SettleTooEarlyError", "Transaction: 0xabc", "Game: 42", "Version: 0.1.0", "Time (UTC): 2026-10-16T09:30:00.000Z"].join("\n"),
    );
    expect(await screen.findByRole("button", { name: "Copied" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("The error is copied");
  });

  it("copies the message alone when there is no detail", () => {
    expect(errorReport({ message: "Could not connect." })).toBe("Could not connect.");
  });

  it("is the hand's one error rendering, refused and expired alike", () => {
    const { rerender } = render(wrap(<HandPanel tile={{ plan: 1, orientation: 1 }} state="refused" error="The edges do not match." />));
    expect(screen.getByRole("alert")).toHaveTextContent("Move refused: The edges do not match.");
    rerender(wrap(<HandPanel tile={{ plan: 1, orientation: 1 }} state="expired" />));
    expect(screen.getByRole("alert")).toHaveTextContent("Game expired: 24 h passed since its purchase.");
    rerender(wrap(<HandPanel tile={{ plan: 1, orientation: 1 }} state="placing" />));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("a scene's failed read shows it with Retry and Copy", () => {
    render(wrap(<PlayerScene {...PLAYER_PAGE.failed} />));
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Could not load the player: The indexer did not answer (HTTP 503).");
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

  it("leaves out a plain Error's name", () => {
    expect(errorDetail(new Error("x")).code).toBeUndefined();
  });
});
