import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Deadline } from "../src/components/elements/deadline";
import { MOCK_NOW } from "../src/mocks/clock";

// UTC-BOUND: under the Paris process zone (the vitest config), a game boundary is read in UTC with its label, the
// relative time first, and it moves on once a minute.
describe("Deadline", () => {
  beforeEach(() => vi.useFakeTimers({ now: MOCK_NOW * 1000 }));
  afterEach(() => vi.useRealTimers());

  it("reads relative first, then the UTC time with its label, not the Paris one", () => {
    render(<Deadline expiresAt={MOCK_NOW + 23 * 3600 + 12 * 60} now={MOCK_NOW} timeZone="Europe/Paris" />);
    const time = document.querySelector("time")!;
    expect(time).toHaveTextContent("in 23 h 12 min · Thu, Oct 15, 14:12 UTC");
    expect(time).not.toHaveTextContent("16:12");
    expect(time).toHaveAttribute("dateTime", "2026-10-15T14:12:00.000Z");
    expect(time).toHaveAttribute("aria-label", "in 23 h 12 min, Thu, Oct 15, 14:12 UTC");
    expect(time.closest("[title]")).toBeNull();
  });

  it("at the very moment it expires: expires in less than a minute, not a bare relative", () => {
    const { container } = render(<Deadline expiresAt={MOCK_NOW} now={MOCK_NOW} />);
    expect(container).toHaveTextContent("expires in less than a minute");
  });

  it("updates once a minute and stops on unmount", () => {
    const clear = vi.spyOn(globalThis, "clearInterval");
    const { unmount } = render(<Deadline expiresAt={MOCK_NOW + 12 * 60 + 30} now={MOCK_NOW} />);
    expect(screen.getByText(/in 12 min/)).toBeInTheDocument();
    act(() => void vi.advanceTimersByTime(30_000));
    expect(screen.getByText(/in 12 min/)).toBeInTheDocument();
    act(() => void vi.advanceTimersByTime(30_000));
    expect(screen.getByText(/in 11 min/)).toBeInTheDocument();
    act(() => void vi.advanceTimersByTime(11 * 60_000));
    expect(screen.getByText(/in less than a minute/)).toBeInTheDocument();
    act(() => void vi.advanceTimersByTime(60_000));
    expect(screen.getByText(/ended less than a minute ago/)).toBeInTheDocument();
    unmount();
    expect(clear).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
