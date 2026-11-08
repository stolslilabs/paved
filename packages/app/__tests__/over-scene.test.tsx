import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LazyMotion, domMax } from "motion/react";
import { describe, expect, it, vi } from "vitest";
import { CategoryType, formatInteger } from "@paved/game-core";
import { CLOSING_CATEGORIES, categoryInfo } from "../src/components/elements/category";
import { BalancesProvider } from "../src/components/containers/balances-context";
import { END_STARS } from "../src/components/containers/game-end";
import { OverScene, type SettleProps } from "../src/components/scenes/over-scene";
import { DAY, MOCK_NOW } from "../src/mocks/clock";
import { OVER } from "../src/mocks/scenes";

/** Points as the end writes them. */
const pts = (n: number) => formatInteger(n);
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

  // No "Connect to settle" (NO-GUEST: every player has an account, none is asked to connect).
  it.each([
    ["ready", "Settle and claim"],
    ["refused", "Settle and claim"],
  ] as const)("%s has the button %s, which acts", async (state, name) => {
    const onSettle = vi.fn();
    const settle: SettleProps = { state, message: "no", onSettle };
    show(<OverScene {...OVER.awaiting} settle={settle} />);
    await userEvent.click(within(settleArea()).getByRole("button", { name }));
    expect(onSettle).toHaveBeenCalledTimes(1);
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
    show(<OverScene {...OVER.noClosing} mode="challenge" reward={{ state: "awaiting", stake: 3 }} />);
    expect(screen.getByTestId("highlight-city")).toHaveTextContent("None closed");
    expect(screen.queryByTestId("highlight-best")).toBeNull();
    expect(screen.getByRole("region", { name: "Game metrics" })).toHaveTextContent("Left open1Largest: a road of 3 tiles");
  });

  it("a Challenge's board is the scores' background from the start: covered, inert, then free under Board, and covered again (#720)", async () => {
    const onViewChange = vi.fn();
    const onHome = vi.fn();
    show(<OverScene {...OVER.awaiting} onViewChange={onViewChange} onHome={onHome} />);
    // Loaded as the screen opens, under the scores: no input reaches it there.
    const board = await screen.findByTestId("final-board");
    expect(await within(board).findByRole("img", { name: /Board of \d+ tiles/, hidden: true })).toBeInTheDocument();
    expect(board).toHaveAttribute("aria-hidden", "true");
    expect(board).toHaveAttribute("inert");
    expect(screen.getByTestId("scores-overlay").closest('[aria-hidden="true"]')).toBeNull();
    const toggle = screen.getByRole("radiogroup", { name: "Show" });
    await userEvent.click(within(toggle).getByRole("radio", { name: "Board" }));
    expect(onViewChange).toHaveBeenLastCalledWith("board");
    expect(board).not.toHaveAttribute("aria-hidden", "true");
    expect(board).not.toHaveAttribute("inert");
    // One bar for both views, titled with the game; its Back returns to the scores from the board.
    const title = `Challenge #${OVER.awaiting.game.id}`;
    expect(screen.getByRole("heading", { level: 1, name: title })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(onViewChange).toHaveBeenLastCalledWith("scores");
    expect(board).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByRole("heading", { level: 1, name: title })).toBeInTheDocument();
    // From the scores, Back leaves the screen.
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(onHome).toHaveBeenCalledOnce();
  });

  it("a Challenge's end has one bar, the board's HUD: the game and the score, no balances, no hairline, whatever the view (#720)", async () => {
    show(
      <BalancesProvider value={{ state: { status: "ready", usdc: 100_000_000n, paved: 129_110_000_000_000_000_000n, cobbles: 10 } }}>
        <OverScene {...OVER.awaiting} />
      </BalancesProvider>,
    );
    const toggle = screen.getByRole("radiogroup", { name: "Show" });
    for (const view of ["Board", "Scores", "Board"]) {
      await userEvent.click(within(toggle).getByRole("radio", { name: view }));
      expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
      const bar = screen.getByRole("heading", { level: 1, name: `Challenge #${OVER.awaiting.game.id}` }).closest("header")!;
      expect(bar).not.toHaveAttribute("data-slot", "page-header");
      expect(bar.className).not.toMatch(/(^|\s)border-b(\s|$)/);
      expect(within(bar).queryByRole("region", { name: "Balances" })).toBeNull();
      expect(bar).toHaveTextContent(/^Challenge #\d+Score[\d,]+$/);
    }
    expect(screen.queryByRole("region", { name: "Balances" })).toBeNull();
  });

  it("a Challenge's end is titled with its game", () => {
    show(<OverScene {...OVER.rewarded} />);
    expect(screen.getByRole("heading", { level: 1, name: `Challenge #${OVER.rewarded.game.id}` })).toBeInTheDocument();
  });

  it("has no toggle without a board", () => {
    show(<OverScene {...OVER.noBoard} />);
    expect(screen.queryByRole("radiogroup", { name: "Show" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Highlights" })).toBeNull();
  });
});

/** The contracts' category names, by index. */
const CATEGORY_TYPES = Object.values(CategoryType);

describe("OverScene: Training's end (TRAINING-END, the Ranked end's family)", () => {
  const stats = OVER.training.stats;
  const score = OVER.training.game.score;

  it("a new best: the crown reached and lit, the headline, the best before and the score", () => {
    show(<OverScene {...OVER.training} previousBest={1_180} />);
    const mark = screen.getByRole("img", { name: "Crown: a new best" });
    expect(mark).toHaveAttribute("data-reached", "true");
    expect(mark.querySelector("[data-lit]")).not.toBeNull();
    expect(screen.getByRole("heading", { level: 2, name: "New best!" })).toBeInTheDocument();
    const best = screen.getByRole("region", { name: "Best" });
    expect(best).toHaveAttribute("data-record", "true");
    expect(best).toHaveTextContent(`${pts(score)}1,180 → ${pts(score)}`);
    expect(within(screen.getByTestId("final-score")).getByTestId("score-value")).toHaveTextContent(pts(score));
  });

  it("short of the best: Game over, the crown's gold stopping at the score's share, nothing lit", () => {
    show(<OverScene {...OVER.training} />);
    const share = Math.round((score / 1_420) * 100);
    const mark = screen.getByRole("img", { name: `Crown: ${share}% of your best` });
    expect(mark).not.toHaveAttribute("data-reached");
    expect(mark.querySelector("[data-lit]")).toBeNull();
    expect(mark.querySelector(`[data-fill="${share}"]`)).not.toBeNull();
    expect(screen.getByRole("heading", { level: 2, name: "Game over" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Best" })).toHaveTextContent("1,420Your best");
  });

  it("the device's first game: no best to beat, the crown grey, the score the best", () => {
    show(<OverScene {...OVER.training} previousBest={null} />);
    const mark = screen.getByRole("img", { name: "Crown: no best to beat yet" });
    expect(mark.querySelector('[data-fill="0"]')).not.toBeNull();
    expect(screen.getByRole("heading", { level: 2, name: "Game over" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Best" })).toHaveTextContent(`${pts(score)}Your best`);
  });

  it("the tiles, the closed categories in boxes and every closing; no reward, no Challenge figures; Home and Play again", async () => {
    const onHome = vi.fn();
    const onPlayAgain = vi.fn();
    show(<OverScene {...OVER.training} onHome={onHome} onPlayAgain={onPlayAgain} />);
    expect(screen.getByRole("region", { name: "Tiles" })).toHaveTextContent(`${stats.placed} placed ${stats.discarded} discarded −${stats.discardPenalty}`);
    const boxes = within(screen.getByRole("list", { name: "Closed" })).getAllByRole("listitem");
    // The city, the road, the forest, the wonder, each with its count and its points.
    expect(boxes.map((b) => b.getAttribute("aria-label"))).toEqual(
      CLOSING_CATEGORIES.map((category) => {
        const of = stats.categories.find((c) => c.category === CATEGORY_TYPES[category])!;
        return `${categoryInfo(category).plural}: ${of.closed} closed, ${pts(of.points)} points`;
      }),
    );
    expect(within(screen.getByRole("region", { name: "Closings" })).getAllByRole("listitem")).toHaveLength(OVER.training.closings.length);
    expect(screen.queryByRole("region", { name: "Reward" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Highlights" })).toBeNull();
    expect(screen.queryByRole("radiogroup", { name: "Show" })).toBeNull();
    expect(screen.getByRole("heading", { level: 1, name: "Training over" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Play again" }));
    expect(onPlayAgain).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole("button", { name: "Home" }));
    expect(onHome).toHaveBeenCalledOnce();
  });

  it("nothing closed: every category at 0, the list says so", () => {
    show(<OverScene {...OVER.noClosing} />);
    for (const box of within(screen.getByRole("list", { name: "Closed" })).getAllByRole("listitem")) expect(box.getAttribute("aria-label")).toMatch(/: 0 closed, 0 points$/);
    expect(within(screen.getByRole("region", { name: "Closings" })).getByText("No structure closed in this game.")).toBeInTheDocument();
  });

  it("without figures, the closings count the categories and the game its tiles", () => {
    show(<OverScene {...OVER.training} stats={undefined} />);
    const city = CLOSING_CATEGORIES[0]!;
    const cities = OVER.training.closings.filter((c) => c.category === city);
    expect(cities.length).toBeGreaterThan(0);
    expect(within(screen.getByRole("list", { name: "Closed" })).getAllByRole("listitem")[0]).toHaveAttribute(
      "aria-label",
      `${categoryInfo(city).plural}: ${cities.length} closed, ${pts(cities.reduce((s, c) => s + c.points, 0))} points`,
    );
    expect(screen.getByRole("region", { name: "Tiles" })).toHaveTextContent(`${OVER.training.game.placedCount} placed ${OVER.training.game.discardedCount} discarded`);
  });

  it("the cross shows the final board, free; the gold Scores pill brings the window back at once", async () => {
    const onViewChange = vi.fn();
    show(<OverScene {...OVER.training} onViewChange={onViewChange} />);
    expect(screen.getByTestId("scores-overlay")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Close the scores" }));
    expect(onViewChange).toHaveBeenLastCalledWith("board");
    const board = await screen.findByTestId("final-board");
    expect(board).not.toHaveAttribute("aria-hidden", "true");
    expect(board).not.toHaveAttribute("inert");
    expect(screen.queryByTestId("scores-overlay")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Show the scores" }));
    expect(onViewChange).toHaveBeenLastCalledWith("scores");
    expect(board).toHaveAttribute("aria-hidden", "true");
    expect(board).toHaveAttribute("inert");
    // Shown again, the crown is there at once: no beat, no light coming in.
    expect(screen.getByTestId("scores-overlay")).toBeInTheDocument();
  });

  it("loads the board under the window once its crown is in, not with it", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      show(<OverScene {...OVER.training} />);
      expect(screen.queryByTestId("final-board")).toBeNull();
      await act(() => vi.advanceTimersByTimeAsync((END_STARS.lead + 0.9) * 1000));
      const board = await screen.findByTestId("final-board");
      expect(board).toHaveAttribute("aria-hidden", "true");
      expect(board).toHaveAttribute("inert");
    } finally {
      vi.useRealTimers();
    }
  });

  it("no board to show: no cross", () => {
    show(<OverScene {...OVER.training} board={undefined} />);
    expect(screen.queryByRole("button", { name: "Close the scores" })).toBeNull();
  });
});
