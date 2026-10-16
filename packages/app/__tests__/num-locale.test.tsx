import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Amount } from "../src/components/elements/amount";
import { Cobbles } from "../src/components/elements/cobbles";
import { DayPicker } from "../src/components/elements/day-picker";
import { Deadline } from "../src/components/elements/deadline";
import { Score } from "../src/components/elements/score";
import { MOCK_NOW } from "../src/mocks/clock";
import { SplitBar } from "../src/components/containers/split-bar";

/**
 * P-66: every number is en-US whatever the user's locale. The vitest config runs this package under fr_FR and
 * Europe/Paris (`process-locale.test.ts` proves it), where the runtime's own formatting reads "1 234,5".
 */
describe("numbers in en-US under a French process locale (P-66)", () => {
  it("an amount: commas in the whole part, a point before the decimals", () => {
    render(<Amount value={1_234_567_890_000n} token="usdc" />);
    expect(screen.getByText("1,234,567.89")).toBeInTheDocument();
  });

  it("Cobbles: commas", () => {
    render(<Cobbles value={12_345} />);
    expect(screen.getByRole("img")).toHaveAttribute("aria-label", "12,345 Cobbles");
  });

  it("a score: no-break spaces, as the mockups write it, not the French narrow space", () => {
    render(<Score value={1_234_567} />);
    expect(screen.getByTestId("score-value").textContent).toBe("1 234 567");
  });

  it("a percentage: a point", () => {
    render(<SplitBar split={{ burn: 7368, vault: 2632, referral: 500 }} />);
    expect(screen.getByRole("img")).toHaveAccessibleName(/73\.68%/);
  });

  it("a day and a deadline: en-US order, in UTC", () => {
    render(<DayPicker day={20_740} today={20_740} first={20_000} />);
    expect(screen.getByRole("group", { name: "Day" })).toHaveTextContent("Wed, Oct 14 UTC");
    const { container } = render(<Deadline expiresAt={MOCK_NOW + 23 * 3600 + 12 * 60} now={MOCK_NOW} timeZone="Europe/Paris" />);
    expect(container.querySelector("time")).toHaveTextContent("in 23 h 12 min · Thu, Oct 15, 14:12 UTC");
  });
});
