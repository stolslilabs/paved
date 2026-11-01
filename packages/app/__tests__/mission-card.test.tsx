import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MissionCard, type Mission } from "../src/components/containers/mission-card";

// The Missions card at a fixed height (#975): the title on one line, two lines of description with an ellipsis and "more"
// beyond, "less" to fold it back, and another mission folds it again. jsdom lays nothing out: a text's scroll height is
// stubbed to say whether the two lines cut it.

const MISSION: Mission = {
  key: "quest:6",
  kind: "daily",
  title: "Public Works",
  description: "Score roads and cities in a day: the middle of three rotating targets.",
  icon: "castle",
  state: "progress",
  progress: [{ unit: "roads and cities scored", count: 4, total: 8 }],
  completedAt: null,
  reward: { cobbles: 10, claimed: false },
};
const OTHER: Mission = { ...MISSION, key: "quest:9", title: "Deep Woods", description: "Score forests in a day: the middle of three rotating targets." };

/** The paragraph's box is two 16 px lines; `lines` is how many its text takes. */
function layout(lines: (text: string) => number) {
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(function (this: HTMLElement) {
    return this.tagName === "P" ? 32 : 0;
  });
  vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(function (this: HTMLElement) {
    return this.tagName === "P" ? Math.max(2, lines(this.textContent ?? "")) * 16 : 0;
  });
}
const description = () => screen.getByText(MISSION.description, { selector: "p" });

afterEach(() => vi.restoreAllMocks());

describe("MissionCard (#975)", () => {
  it("keeps the title on one line and two lines of description, the whole text kept for assistive technology", () => {
    layout(() => 2);
    render(<MissionCard mission={MISSION} />);
    expect(screen.getByRole("heading", { name: "Public Works" })).toHaveClass("truncate");
    expect(screen.getByRole("heading", { name: "Public Works" })).toHaveAttribute("title", "Public Works");
    expect(description()).toHaveClass("line-clamp-2", "min-h-[2lh]");
    expect(description()).toHaveAttribute("title", MISSION.description);
    expect(screen.queryByRole("button", { name: "more" })).not.toBeInTheDocument();
  });

  it("keeps the two lines' room with no description, hidden from assistive technology", () => {
    layout(() => 0);
    const { container } = render(<MissionCard mission={{ ...MISSION, description: "" }} />);
    const p = container.querySelector("p")!;
    expect(p).toHaveClass("min-h-[2lh]");
    expect(p).toHaveAttribute("aria-hidden", "true");
    expect(screen.queryByRole("button", { name: "more" })).not.toBeInTheDocument();
  });

  it("shows more only on a cut description: it unfolds it, and less folds it back", async () => {
    layout(() => 3);
    render(<MissionCard mission={MISSION} />);
    const more = screen.getByRole("button", { name: "more" });
    expect(more).toHaveAttribute("aria-expanded", "false");
    expect(more).toHaveAttribute("aria-controls", description().id);
    await userEvent.click(more);
    expect(description()).not.toHaveClass("line-clamp-2");
    const less = screen.getByRole("button", { name: "less" });
    expect(less).toHaveAttribute("aria-expanded", "true");
    await userEvent.click(less);
    expect(description()).toHaveClass("line-clamp-2");
    expect(screen.getByRole("button", { name: "more" })).toHaveAttribute("aria-expanded", "false");
  });

  it("folds the description again when another mission is selected", async () => {
    layout(() => 3);
    const { rerender } = render(<MissionCard mission={MISSION} />);
    await userEvent.click(screen.getByRole("button", { name: "more" }));
    rerender(<MissionCard mission={OTHER} />);
    expect(screen.getByText(OTHER.description, { selector: "p" })).toHaveClass("line-clamp-2");
    expect(screen.getByRole("button", { name: "more" })).toHaveAttribute("aria-expanded", "false");
    // Back on the first mission: still folded.
    rerender(<MissionCard mission={MISSION} />);
    expect(description()).toHaveClass("line-clamp-2");
  });
});
