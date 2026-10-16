import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LazyMotion, domMax } from "motion/react";
import { describe, expect, it, vi } from "vitest";
import { OverScene, type SettleProps } from "../src/components/scenes/over-scene";
import { DAY, MOCK_NOW } from "../src/mocks/clock";
import { OVER } from "../src/mocks/scenes";

const show = (ui: React.ReactNode) => render(<LazyMotion features={domMax}>{ui}</LazyMotion>);
const settleArea = () => screen.getByRole("region", { name: "Settle" });

describe("OverScene: a Challenge game's settlement (P7a)", () => {
  it("after: how long until it settles, then the UTC date (Paris process zone), and no button", () => {
    show(<OverScene {...OVER.awaiting} now={MOCK_NOW} settle={{ state: "after", at: MOCK_NOW + 14 * 3600 + 5 * 60 }} />);
    const area = settleArea();
    expect(area).toHaveTextContent("Settles in 14 h 05 min (Thu, Oct 15, 05:05 UTC)");
    expect(within(area).getByText(/Settles/).querySelector("time")).toHaveAttribute("aria-label", "in 14 h 05 min (Thu, Oct 15, 05:05 UTC)");
    expect(area.querySelector("[title]")).toBeNull();
    expect(within(area).queryByRole("button")).toBeNull();
  });

  it("after, once the time has come: settle is offered as now", () => {
    show(<OverScene {...OVER.awaiting} now={MOCK_NOW + DAY} settle={{ state: "after", at: MOCK_NOW + DAY }} />);
    expect(settleArea()).toHaveTextContent("This game can be settled now.");
    expect(settleArea()).not.toHaveTextContent("Settles in");
  });

  it.each([
    ["connect", "Connect to settle"],
    ["ready", "Settle and claim"],
    ["refused", "Settle and claim"],
  ] as const)("%s has the button %s, which acts", async (state, name) => {
    const onSettle = vi.fn();
    const onConnect = vi.fn();
    const settle: SettleProps = { state, message: "no", onSettle, onConnect };
    show(<OverScene {...OVER.awaiting} settle={settle} />);
    await userEvent.click(within(settleArea()).getByRole("button", { name }));
    expect(state === "connect" ? onConnect : onSettle).toHaveBeenCalledTimes(1);
  });

  it("refused says why, as an alert", () => {
    show(<OverScene {...OVER.awaiting} settle={{ state: "refused", message: "This day cannot be settled yet." }} />);
    expect(screen.getByRole("alert")).toHaveTextContent("This day cannot be settled yet.");
  });

  it("pending is a busy, disabled button", () => {
    show(<OverScene {...OVER.awaiting} settle={{ state: "pending" }} />);
    const button = within(settleArea()).getByRole("button", { name: "Settling…" });
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button).toBeDisabled();
  });

  it("viewing, settled and done have no button", () => {
    for (const [state, text] of [["viewing", "can be settled now"], ["settled", "Settled"], ["done", "Already settled."]] as const) {
      const { unmount } = show(<OverScene {...OVER.rewarded} settle={{ state }} />);
      expect(settleArea()).toHaveTextContent(text);
      expect(within(settleArea()).queryByRole("button")).toBeNull();
      unmount();
    }
  });

  it("a free game: the label and no reward panel, whatever else it is given", () => {
    show(<OverScene {...OVER.awaiting} freeGame reward={{ state: "free" }} settle={{ state: "ready" }} />);
    expect(screen.getAllByText("Free game")).toHaveLength(2);
    expect(screen.getByRole("region", { name: "Reward" })).toHaveAttribute("data-state", "free-game");
    expect(screen.queryByRole("region", { name: "Settle" })).toBeNull();
  });

  it("an expired game says when its 24 h ended", () => {
    show(<OverScene {...OVER.expired} now={MOCK_NOW + 2 * 3600} deadline={MOCK_NOW} />);
    expect(screen.getByText(/The 24 h/)).toHaveTextContent("The 24 h ended 2 h ago (Wed, Oct 14, 15:00 UTC).");
  });

  it("the closings note replaces the empty list's sentence", () => {
    show(<OverScene {...OVER.awaiting} closings={[]} closingsNote="The closings of this game could not be read." />);
    expect(screen.getByText("The closings of this game could not be read.")).toBeInTheDocument();
    expect(screen.queryByText("No structure closed in this game.")).toBeNull();
  });
});
