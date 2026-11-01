import { render, screen } from "@testing-library/react";
import { LazyMotion, MotionConfig, domMax } from "motion/react";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { expected, masters, problems } from "../scripts/compress-token-art.ts";
import { Balances } from "../src/components/containers/balances";
import { platePointPx } from "../src/components/elements/plate";
import { ResourcePlate } from "../src/components/elements/resource-plate";
import { ShieldPlate } from "../src/components/elements/shield-plate";
import { PLATE_ART, PLATE_FACE, PLATE_POINT, TOKEN_ART, tokenIconSources } from "../src/components/elements/token-art";
import { TokenIcon } from "../src/components/elements/token-icon";

const read = (path: string) => readFileSync(resolve(import.meta.dirname, "..", path), "utf8");
const wrap = (node: React.ReactNode) => (
  <LazyMotion features={domMax}>
    <MotionConfig reducedMotion="never">{node}</MotionConfig>
  </LazyMotion>
);

describe("the balances' images (the owner's direction A of 2026-11-01)", () => {
  it("ship each icon and the plate's parts as WebP copies of their sizes, from masters on their frames (scripts/compress-token-art.ts)", () => {
    expect(masters()).toEqual(["cobbles.webp", "paved.webp", "plate/cap-left.webp", "plate/cap-right.webp", "plate/tile.webp", "usdc.webp", "vpaved.webp"]);
    expect(expected()).toHaveLength(4 * 4 + 3);
    expect(problems()).toEqual([]);
    // The four icons share one frame, so they stand alike in a row; the plate's parts share their height.
    expect(new Set(Object.values(TOKEN_ART)).size).toBe(1);
    expect(new Set(Object.values(PLATE_ART).map((f) => f.height)).size).toBe(1);
  });

  it("measure the plate's slate face inside its bricks, the gold point short of it", () => {
    expect(PLATE_FACE.top + PLATE_FACE.bottom).toBeLessThan(0.5);
    expect(PLATE_POINT).toBeLessThan(PLATE_FACE.left);
    // The point is inside the left cap.
    expect(PLATE_FACE.left).toBeLessThan(PLATE_ART["cap-left"].width / PLATE_ART["cap-left"].height);
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

describe("the balance plate on the stone frame", () => {
  it("draws the left cap, the tile and the right cap under the figure, the point standing out past the open end", () => {
    const { container } = render(wrap(<ResourcePlate kind="paved" amount={10n ** 18n} decimals={18} fraction={2} fixed />));
    const art = container.querySelector<HTMLElement>("[data-slot=plate-art]")!;
    const [left, tile, right] = [...art.children] as HTMLElement[];
    expect(left).toHaveAttribute("src", "/token-art/plate/cap-left/108.webp");
    expect(tile.style.backgroundImage).toContain("/token-art/plate/tile/108.webp");
    expect(tile.style.backgroundRepeat).toBe("round no-repeat");
    expect(right).toHaveAttribute("src", "/token-art/plate/cap-right/108.webp");
    // Under the content, the point past the box's left end; the figure from the slate face on, outlined like the badge's name.
    expect(art.style.zIndex).toBe("-1");
    expect(art.style.left).toBe(`-${platePointPx("sm")}px`);
    const box = art.parentElement!;
    expect(box.style.paddingLeft).toBe(`${Math.ceil((PLATE_FACE.left - PLATE_POINT) * 32) + 2}px`);
    expect(box).not.toHaveClass("bg-resource-plate");
    expect(container.querySelector(".numeric")).toHaveClass("text-outline");
  });

  it("is mirrored on the left of the screen, and the shield's plate keeps its flat box", () => {
    const { container } = render(wrap(<ResourcePlate kind="cobbles" amount={240n} decimals={0} fraction={0} side="left" size="md" />));
    const art = container.querySelector<HTMLElement>("[data-slot=plate-art]")!;
    expect(art.style.transform).toBe("scaleX(-1)");
    expect(art.style.right).toBe(`-${platePointPx("md")}px`);
    const shield = render(wrap(<ShieldPlate endsAt={2_000_000_000} now={1_900_000_000} />));
    expect(shield.container.querySelector("[data-slot=shield-plate]")).not.toBeNull();
    expect(shield.container.querySelector("[data-slot=plate-art]")).toBeNull();
    expect(shield.container.querySelector(".bg-resource-plate")).not.toBeNull();
  });

  it("keeps the point's room before the first plate of the balances, whichever way they stand", () => {
    const state = { status: "ready", usdc: 48_500_000n, paved: 10n ** 18n, cobbles: 240 } as const;
    const { unmount } = render(wrap(<Balances layout="pill" state={state} />));
    expect(screen.getByRole("region", { name: "Balances" }).style.paddingLeft).toBe(`${platePointPx("sm")}px`);
    unmount();
    render(wrap(<Balances layout="rail" direction="column" state={state} />));
    expect(screen.getByRole("region", { name: "Balances" }).style.paddingLeft).toBe(`${platePointPx("md")}px`);
  });
});
