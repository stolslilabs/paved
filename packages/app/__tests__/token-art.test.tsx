import { render, screen } from "@testing-library/react";
import { LazyMotion, MotionConfig, domMax } from "motion/react";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { expected, masters, problems } from "../scripts/compress-token-art.ts";
import { ResourcePlate } from "../src/components/elements/resource-plate";
import { ShieldPlate } from "../src/components/elements/shield-plate";
import { TOKEN_ART, tokenIconSources } from "../src/components/elements/token-art";
import { TokenIcon } from "../src/components/elements/token-icon";

const read = (path: string) => readFileSync(resolve(import.meta.dirname, "..", path), "utf8");
const wrap = (node: React.ReactNode) => (
  <LazyMotion features={domMax}>
    <MotionConfig reducedMotion="never">{node}</MotionConfig>
  </LazyMotion>
);

describe("the balances' images (the owner's direction A of 2026-11-01)", () => {
  it("ship each icon as WebP copies of its sizes, from masters on one frame (scripts/compress-token-art.ts)", () => {
    expect(masters()).toEqual(["cobbles.webp", "paved.webp", "usdc.webp", "vpaved.webp"]);
    expect(expected()).toHaveLength(4 * 4);
    expect(problems()).toEqual([]);
    // The four icons share one frame, so they stand alike in a row.
    expect(new Set(Object.values(TOKEN_ART)).size).toBe(1);
  });

  it("are the app's own files: the old SVG icons and their script are gone", () => {
    expect(existsSync(resolve(import.meta.dirname, "../src/assets/tokens"))).toBe(false);
    expect(existsSync(resolve(import.meta.dirname, "../scripts/coins.ts"))).toBe(false);
    expect(read("package.json")).toContain("node scripts/compress-token-art.ts --check");
    expect(read("package.json")).not.toContain("scripts/coins.ts");
  });

  it("name USDC's mark in the notices, Circle's and nums', and no Font Awesome coin", () => {
    const notices = read("public/THIRD_PARTY_NOTICES.txt");
    const entry = notices.slice(notices.indexOf("Token icons (token-sources/"), notices.indexOf("Game icons (src/"));
    expect(entry).toContain("trademarks of Circle");
    expect(entry).toContain("cartridge-gg/nums");
    expect(entry).not.toContain("coin-front");
    expect(notices).toContain("Used in: token-sources/usdc.webp");
  });
});

describe("TokenIcon", () => {
  it("loads the smallest copy sharp at its size, from the app's own files, decorative without a label", () => {
    expect(tokenIconSources("paved", 24)).toEqual({
      src: "/token-art/paved/192.webp",
      srcSet: "/token-art/paved/32.webp 32w, /token-art/paved/64.webp 64w, /token-art/paved/128.webp 128w, /token-art/paved/192.webp 192w",
      sizes: "24px",
    });
    const { container } = render(
      <>
        <TokenIcon kind="usdc" size="xl" label="USDC" />
        <TokenIcon kind="cobbles" px={52} className="size-13" />
      </>,
    );
    const usdc = screen.getByRole("img", { name: "USDC" });
    expect(usdc).toHaveAttribute("sizes", "48px");
    expect(usdc.getAttribute("srcset")).not.toMatch(/(https?:)?\/\//);
    expect(usdc).toHaveAttribute("draggable", "false");
    const stone = container.querySelectorAll("img")[1]!;
    expect(stone).toHaveAttribute("sizes", "52px");
    expect(stone).toHaveAttribute("alt", "");
    expect(stone).toHaveAttribute("aria-hidden", "true");
  });
});

describe("the balance plate on the HUD's frame (HOME-UI-CAPSULES)", () => {
  it("draws the HUD's face and frame under the figure, the icon over the right end, 10 px past it", () => {
    const { container } = render(wrap(<ResourcePlate kind="paved" amount={10n ** 18n} decimals={18} fraction={2} fixed />));
    const plate = container.querySelector<HTMLElement>("[data-slot=resource-plate]")!;
    expect(plate.dataset.frame).toBe("hud");
    // The frame is CSS (HUD-FRAME-CSS, `hud-frame` and `hud-face` in theme.css), sized by its corner: a capsule's 10 px.
    const frame = plate.querySelector<HTMLElement>("[data-slot=hud-frame]")!;
    expect(frame).toHaveClass("hud-frame");
    expect(frame.style.getPropertyValue("--hud-px")).toBe("10");
    expect(plate.querySelector("[data-slot=hud-face]")).toHaveClass("hud-face");
    const box = frame.parentElement!;
    expect(box).toHaveClass("isolate", "pr-7.5", "justify-end");
    expect(box).not.toHaveClass("bg-resource-plate");
    expect(plate.querySelector("[data-slot=token-icon]")).toHaveClass("size-10");
    // 30 of its 40 px over the box: the frame's rounded end is under it.
    expect(plate.querySelector("[data-slot=token-icon]")!.closest(".-ml-7\\.5")).not.toBeNull();
    expect(container.querySelector(".numeric")).toHaveClass("text-outline");
  });

  it("is mirrored on the left of the screen, as the shield's capsule is", () => {
    const { container } = render(wrap(<ResourcePlate kind="cobbles" amount={240n} decimals={0} fraction={0} side="left" size="md" />));
    const plate = container.querySelector<HTMLElement>("[data-slot=resource-plate]")!;
    expect(plate.className).toContain("flex-row-reverse");
    expect(plate.querySelector("[data-slot=hud-frame]")!.parentElement).toHaveClass("pl-8.5");
    const shield = render(wrap(<ShieldPlate endsAt={2_000_000_000} now={1_900_000_000} />));
    expect(shield.container.querySelector("[data-slot=shield-plate] [data-slot=hud-frame]")).not.toBeNull();
    expect(shield.container.querySelector("[data-slot=shield-plate] [data-slot=ui-icon][data-icon=shield]")).not.toBeNull();
  });
});
