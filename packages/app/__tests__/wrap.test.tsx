import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PlayerName } from "../src/components/elements/player-name";
import { ShortAddress, shortAddress } from "../src/components/elements/short-address";
import { LONG_ADDRESS, LONG_NAME } from "../src/mocks/stress";

// WRAP360: addresses are cut in the middle and never broken over two lines; the full value stays reachable.
describe("ShortAddress", () => {
  it("cuts a full address in the middle, on one line, and keeps it whole for the pointer and a screen reader", () => {
    render(<ShortAddress address={LONG_ADDRESS} />);
    const el = screen.getByTitle(LONG_ADDRESS);
    expect(el).toHaveClass("whitespace-nowrap");
    expect(screen.getByText("0x07a1…7e8f")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByText(LONG_ADDRESS)).toHaveClass("sr-only");
  });

  it("shows a short id whole", () => {
    expect(shortAddress("0x0123aa")).toBe("0x0123aa");
  });
});

describe("PlayerName", () => {
  it("keeps the full username or address in its title", () => {
    render(
      <>
        <PlayerName name={LONG_NAME} address={LONG_ADDRESS} />
        <PlayerName name={null} address={LONG_ADDRESS} />
      </>,
    );
    expect(screen.getByText(LONG_NAME)).toHaveAttribute("title", LONG_NAME);
    expect(screen.getByText("0x07a1…7e8f")).toHaveAttribute("title", LONG_ADDRESS);
  });
});
