import { statSync } from "node:fs";
import { join } from "node:path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { UiIcon } from "../src/components/elements/ui-icon";
import { FRAME_ART, ICON_FRAME, UI_FRAMES, UI_ICONS, uiFrameSources, uiIconSources } from "../src/components/elements/ui-art";
import { expected, masters, OUT, problems } from "../scripts/compress-ui-art.ts";

describe("the HUD's images (the owner's mobile direction of 2026-11-01)", () => {
  it("ships each icon and frame as a WebP of its size, from a master on its frame (scripts/compress-ui-art.ts)", () => {
    expect(masters()).toHaveLength(UI_ICONS.length + UI_FRAMES.length);
    expect(problems()).toEqual([]);
    // Small: about 2 KiB an icon at 64 px, 5 KiB at 128 (measured 460 KiB for the 71 copies; a screen loads a few), two copies an
    // image since the unused ribbon, medallion, dial frame, divider and mode icons went (2026-11-02).
    expect(expected()).toHaveLength(2 * UI_ICONS.length + 2 * UI_FRAMES.length);
    const total = expected().reduce((sum, f) => sum + statSync(join(OUT, f)).size, 0);
    expect(total).toBeLessThan(400 * 1024);
  });

  it("puts every icon on one square frame, so any one swaps for another", () => {
    expect(ICON_FRAME).toMatchObject({ width: 256, height: 256 });
    expect(new Set(UI_ICONS).size).toBe(UI_ICONS.length);
    // The frames keep their own shapes: the card's frame and the XP bar's track and fill, all wide.
    for (const name of UI_FRAMES) expect(FRAME_ART[name].width, name).toBeGreaterThan(FRAME_ART[name].height * 3);
  });

  it("points an image at the smallest copy that stays sharp for the size shown", () => {
    const icon = uiIconSources("chests", 32);
    expect(icon.src).toBe("/ui-art/icons/128/chests.webp");
    expect(icon.srcSet).toBe("/ui-art/icons/64/chests.webp 64w, /ui-art/icons/128/chests.webp 128w");
    expect(icon.sizes).toBe("32px");
    expect(uiFrameSources("card-frame", 240).srcSet).toBe("/ui-art/frames/360/card-frame.webp 360w, /ui-art/frames/720/card-frame.webp 720w");
  });

  it("draws an icon decorative, or named when it is a control's only content", () => {
    const { container } = render(
      <>
        <UiIcon name="vault" />
        <UiIcon name="guild" size="xl" label="Guild" />
      </>,
    );
    const [plain, named] = container.querySelectorAll("img");
    expect(plain).toHaveAttribute("alt", "");
    expect(plain).toHaveAttribute("aria-hidden", "true");
    expect(plain).toHaveAttribute("draggable", "false");
    expect(plain).toHaveAttribute("data-icon", "vault");
    expect(screen.getByRole("img", { name: "Guild" })).toBe(named);
    expect(named!.className).toContain("size-12");
    expect(named!.getAttribute("sizes")).toBe("48px");
    expect(container.innerHTML).not.toMatch(/https?:/);
  });
});
