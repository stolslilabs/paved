import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LazyMotion, domMax } from "motion/react";
import { describe, expect, it, vi } from "vitest";
import { BalancesProvider } from "../src/components/containers/balances-context";
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

  it("an expired game with a slow clock never reads in the future", () => {
    show(<OverScene {...OVER.expired} now={MOCK_NOW - 3 * 60} deadline={MOCK_NOW} />);
    expect(screen.getByText(/The 24 h/)).toHaveTextContent("The 24 h ended less than a minute ago (Wed, Oct 14, 15:00 UTC).");
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

describe("OverScene: the figures and the final board (#539)", () => {
  it("leads with the largest city, road and forest in tiles, the wonders and the best closing", () => {
    show(<OverScene {...OVER.rewarded} />);
    const highlights = screen.getByRole("region", { name: "Highlights" });
    expect(within(highlights).getByTestId("highlight-city")).toHaveTextContent("Largest city8 tiles320 pts");
    expect(within(highlights).getByTestId("highlight-road")).toHaveTextContent("Longest road7 tiles70 pts");
    expect(within(highlights).getByTestId("highlight-forest")).toHaveTextContent("Largest forest6 tiles60 pts");
    expect(within(highlights).getByTestId("highlight-wonders")).toHaveTextContent("Wonders1180 pts");
    expect(within(highlights).getByTestId("highlight-best")).toHaveTextContent("City of 8 tiles, tile 38320 pts");
    const metrics = screen.getByRole("region", { name: "Game metrics" });
    expect(metrics).toHaveTextContent("Tiles placed37");
    expect(metrics).toHaveTextContent("Tiles discarded2100 pts taken");
    expect(metrics).toHaveTextContent("Cities closed5");
    expect(metrics).toHaveTextContent("Left open4Largest: a forest of 7 tiles");
    // Its badge: the previous best beaten; no rank (#623).
    expect(screen.getByText("New best")).toBeInTheDocument();
    expect(screen.queryByText(/#\d+ today/)).toBeNull();
  });

  it("says None closed for a category the game did not close", () => {
    show(<OverScene {...OVER.noClosing} />);
    expect(screen.getByTestId("highlight-city")).toHaveTextContent("None closed");
    expect(screen.queryByTestId("highlight-best")).toBeNull();
    expect(screen.getByRole("region", { name: "Game metrics" })).toHaveTextContent("Left open1Largest: a road of 3 tiles");
  });

  it("switches to the board and back, keeping the board mounted under the scores", async () => {
    const onViewChange = vi.fn();
    show(<OverScene {...OVER.training} onViewChange={onViewChange} />);
    expect(screen.queryByTestId("final-board")).toBeNull();
    const toggle = screen.getByRole("radiogroup", { name: "Show" });
    await userEvent.click(within(toggle).getByRole("radio", { name: "Board" }));
    expect(onViewChange).toHaveBeenLastCalledWith("board");
    expect(await within(screen.getByTestId("final-board")).findByRole("img", { name: /Board of \d+ tiles/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Final board" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(onViewChange).toHaveBeenLastCalledWith("scores");
    expect(screen.getByTestId("final-board")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByRole("heading", { level: 1, name: "Final score" })).toBeInTheDocument();
  });

  it("the final board's top bar keeps the title and the score, no balances over the board, after any number of switches (#620)", async () => {
    show(
      <BalancesProvider value={{ state: { status: "ready", usdc: 100_000_000n, paved: 129_110_000_000_000_000_000n, cobbles: 10 } }}>
        <OverScene {...OVER.training} />
      </BalancesProvider>,
    );
    const toggle = screen.getByRole("radiogroup", { name: "Show" });
    // The scores' bar carries them (the strip and the rail).
    const scores = screen.getByRole("heading", { level: 1, name: "Final score" }).closest("header")!;
    expect(await within(scores).findAllByRole("region", { name: "Balances" })).toHaveLength(2);
    for (let i = 0; i < 2; i++) {
      await userEvent.click(within(toggle).getByRole("radio", { name: "Board" }));
      const bar = screen.getByRole("heading", { level: 1, name: "Final board" }).closest("header")!;
      expect(within(bar).queryByRole("region", { name: "Balances" })).toBeNull();
      expect(within(bar).queryByRole("button", { name: /Connect/ })).toBeNull();
      expect(bar).toHaveTextContent(/^Final board[\d,]+$/);
      await userEvent.click(within(bar).getByRole("button", { name: "Back" }));
    }
  });

  it("has no toggle without a board", () => {
    show(<OverScene {...OVER.noBoard} />);
    expect(screen.queryByRole("radiogroup", { name: "Show" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Highlights" })).toBeNull();
  });
});
