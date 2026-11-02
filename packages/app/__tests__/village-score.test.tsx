import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LazyMotion, domMax } from "motion/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { formatInteger } from "@paved/game-core";
import { VillageScore } from "../src/components/containers/village-score";
import { HomeVillageScene } from "../src/components/scenes/home-village-scene";
import { HOME_VILLAGE } from "../src/mocks/village-v2";

// The village's capsule (#755, HOME-UI-2): the village's icon capping the capsule's left end, the total in it; a tap opens edit mode,
// which shows the kinds' points (#758). No accordion on the home any more (#831's is the editor's).

const wrap = (ui: ReactNode) => <LazyMotion features={domMax}>{ui}</LazyMotion>;

describe("the village's capsule (HOME-UI-2)", () => {
  it("names the total; a tap opens edit mode", async () => {
    const onEdit = vi.fn();
    render(wrap(<VillageScore score={1_234} onEdit={onEdit} />));
    const capsule = screen.getByRole("button", { name: "Edit village, score 1,234" });
    expect(capsule).toHaveAttribute("data-slot", "village-score");
    expect(capsule.querySelector("[data-slot=ui-icon][data-icon=village]")).not.toBeNull();
    expect(capsule).toHaveTextContent(/^1,234$/);
    await userEvent.click(capsule);
    expect(onEdit).toHaveBeenCalledOnce();
  });

  it("without a way into edit mode, the total alone, not a button", () => {
    render(wrap(<VillageScore score={838} />));
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByRole("group", { name: "Village score 838" })).toHaveTextContent(/^838$/);
  });

  it("on the home: under the crowns, the way into edit mode; no accordion, no kinds' list", async () => {
    const onEditingChange = vi.fn();
    render(wrap(<HomeVillageScene {...HOME_VILLAGE.view} onEditingChange={onEditingChange} />));
    const capsule = screen.getByRole("button", { name: `Edit village, score ${formatInteger(HOME_VILLAGE.view.village!.score)}` });
    expect(capsule).not.toHaveAttribute("aria-expanded");
    await userEvent.click(capsule);
    expect(onEditingChange).toHaveBeenCalledWith(true);
    expect(screen.queryByRole("list", { name: "Score by kind" })).toBeNull();
  });
});
