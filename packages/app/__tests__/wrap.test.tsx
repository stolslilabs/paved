import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PlayerName } from "../src/components/elements/player-name";
import { ShortAddress, shortAddress } from "../src/components/elements/short-address";
import { LONG_ADDRESS, LONG_NAME } from "../src/mocks/stress";

// WRAP360: addresses are cut in the middle and never broken over two lines; the full value stays reachable.
describe("ShortAddress", () => {
  it("cuts a full address in the middle and keeps it whole in its title, on one line", () => {
    render(<ShortAddress address={LONG_ADDRESS} />);
    const el = screen.getByText("0x07a1…7e8f");
    expect(el).toHaveAttribute("title", LONG_ADDRESS);
    expect(el).toHaveClass("whitespace-nowrap");
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
