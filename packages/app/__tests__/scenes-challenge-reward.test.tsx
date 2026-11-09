import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BoardScene } from "../src/components/scenes/board-scene";
import { OverScene } from "../src/components/scenes/over-scene";
import { GameHud } from "../src/components/containers/game-hud";
import { MOCK_MARK_TEXT, MockMarkProvider } from "../src/components/containers/mock-mark";
import { CURVE_PLAYING } from "../src/mocks/games";
import { BOARD, OVER } from "../src/mocks/scenes";
import { wrap, pts } from "./scenes-helpers";

// #705 during and after the game: the curve of the mocks' game (R = 4.2 PAVED, c 1.222, H 5, threshold 1,150), its score 1,270.
describe("Challenge reward on the HUD and the over page (#705)", () => {
  const hud = (props: Partial<React.ComponentProps<typeof GameHud>>) => render(wrap(<GameHud title="Challenge #1042" score={1270} now={0} reward={CURVE_PLAYING} {...props} />));

  it("shows the Mock mark beside the title while the shell says the game is the mock's (#927), and none otherwise", () => {
    const { unmount } = render(wrap(<MockMarkProvider value><GameHud title="Challenge #1042" score={0} now={0} /></MockMarkProvider>));
    expect(screen.getByRole("heading", { level: 1, name: "Challenge #1042" })).toBeInTheDocument();
    expect(screen.getByLabelText(`Mock. ${MOCK_MARK_TEXT}`)).toHaveTextContent("Mock");
    unmount();
    hud({});
    expect(screen.queryByText("Mock")).toBeNull();
  });

  it("shows on the HUD what the score earns past the threshold, the score to beat under it, and max from the cap", () => {
    const { unmount } = hud({});
    expect(screen.getByTestId("hud-reward")).toHaveTextContent(/^Estimated reward ≈ 5\.66 PAVED$/);
    unmount();
    const below = hud({ score: 640 });
    expect(screen.getByTestId("hud-reward")).toHaveTextContent(`Beat ${pts(1150)}`);
    below.unmount();
    const cap = hud({ score: 5_000 });
    expect(screen.getByTestId("hud-reward")).toHaveTextContent(/≈ 21\.00 PAVED\s*max$/);
    cap.unmount();
    // From 10,000 PAVED the figure is compact, so the header keeps its width (WRAP360).
    hud({ score: 999_999, reward: { ...CURVE_PLAYING, reference: 123_456_789n * 10n ** 18n } });
    expect(screen.getByTestId("hud-reward")).toHaveTextContent(/≈ 617\.3M PAVED\s*max$/);
  });

  it("shows no reward on the HUD without a curve, nor on a Training board", () => {
    const { unmount } = hud({ reward: null });
    expect(screen.queryByTestId("hud-reward")).toBeNull();
    unmount();
    render(wrap(<BoardScene {...BOARD.queueTraining} />));
    expect(screen.queryByTestId("hud-reward")).toBeNull();
  });

  it("shows it on the Challenge board's HUD", () => {
    render(wrap(<BoardScene {...BOARD.belowThreshold} />));
    expect(screen.getByTestId("hud-reward")).toHaveTextContent(`Beat ${pts(1150)}`);
  });

  it("estimates the reward of a game whose day is open, with the threshold it is measured against", () => {
    render(wrap(<OverScene {...OVER.awaitingEstimate} />));
    const panel = screen.getByRole("region", { name: "Reward" });
    expect(within(panel).getByTestId("reward-coming")).toHaveTextContent(/^≈About5\.66PAVED$/);
    expect(panel).toHaveTextContent(`At today's threshold ${pts(1150)} · beaten by ${pts(120)}`);
  });

  it("gives the exact reward once the day's mean is fixed, before the settle", () => {
    render(wrap(<OverScene {...OVER.settle} />));
    const panel = screen.getByRole("region", { name: "Reward" });
    expect(within(panel).getByTestId("reward-coming")).toHaveTextContent(/^5\.66PAVED$/);
    expect(panel).not.toHaveTextContent("At today's threshold");
    expect(panel).toHaveTextContent(`Threshold ${pts(1150)}`);
  });
});
