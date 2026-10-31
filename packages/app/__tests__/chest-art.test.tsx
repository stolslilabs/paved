import { act, render, screen, waitFor } from "@testing-library/react";
import { LazyMotion, MotionConfig, domMax } from "motion/react";
import { readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { expected, masters, OUT, problems } from "../scripts/compress-chest-art.ts";
import { ChestArt, type ChestArtState } from "../src/components/elements/chest-art";
import { ChestBadge } from "../src/components/elements/chest-badge";
import { CHEST_RANKS } from "../src/components/elements/chest-designs";
import { ChestIcon } from "../src/components/elements/chest-icon";
import { CHEST_BASE, CHEST_LAYERS, CHEST_MEASURES, chestIconSources, chestImageUrl, pickSize } from "../src/components/elements/chest-images";
import { LazyChestArt } from "../src/components/elements/lazy-chest-art";

const read = (path: string) => readFileSync(resolve(import.meta.dirname, "..", path), "utf8");
const wrap = (node: React.ReactNode, reduced = false) => (
  <LazyMotion features={domMax}>
    <MotionConfig reducedMotion={reduced ? "always" : "never"}>{node}</MotionConfig>
  </LazyMotion>
);

describe("the chests' images (the owner's direction of 2026-10-31)", () => {
  it("ship each layer and effect as WebP copies of its sizes, from a master on its frame (scripts/compress-chest-art.ts)", () => {
    expect(masters()).toEqual([
      ...CHEST_RANKS.flatMap((r) => ["body", "closed", "icon", "lid"].map((l) => `${r}/${l}.webp`)).sort(),
      "fx/dust.webp",
      "fx/rays.webp",
      "fx/sparkle.webp",
    ].sort());
    expect(expected()).toHaveLength(3 * (3 * 4 + 3) + 3 * 2);
    expect(problems()).toEqual([]);
    // The closed chest, the lid and the body share one square frame, so the open chest's body stands where the closed chest stood.
    expect(new Set([CHEST_LAYERS.closed, CHEST_LAYERS.lid, CHEST_LAYERS.body]).size).toBe(1);
    // What the modal's largest epic chest loads on a 3x screen: its three layers' largest copies.
    const largest = (["closed", "lid", "body"] as const).map((l) => join(OUT, "epic", l, "768.webp"));
    expect(largest.reduce((sum, f) => sum + statSync(f).size, 0)).toBeLessThan(200 * 1024);
  });

  it("place the light in each chest's mouth, above its foot, and the hinges behind it", () => {
    for (const rank of CHEST_RANKS) {
      const { mouth, hinge, lid } = CHEST_MEASURES[rank];
      expect(mouth.x, rank).toBeGreaterThan(0.4);
      expect(mouth.x, rank).toBeLessThan(0.6);
      expect(mouth.y, rank).toBeLessThan(CHEST_BASE);
      // The hinges are at the mouth's back: above its middle, and the raised lid ends there.
      expect(hinge, rank).toBeLessThan(mouth.y);
      expect(lid[1] + lid[3], rank).toBeGreaterThanOrEqual(hinge);
    }
  });

  it("point each image at the smallest copy that stays sharp for the size shown", () => {
    expect(pickSize([160, 320, 480, 768], 192)).toBe(320);
    expect(pickSize([160, 320, 480, 768], 2000)).toBe(768);
    expect(chestIconSources("rare", 24)).toEqual({
      src: "/chest-art/rare/icon/192.webp",
      srcSet: "/chest-art/rare/icon/48.webp 60w, /chest-art/rare/icon/96.webp 120w, /chest-art/rare/icon/192.webp 240w",
      sizes: "30px",
    });
    expect(chestImageUrl("epic", "lid", 480)).toBe("/chest-art/epic/lid/480.webp");
  });
});

describe("the chests (ChestIcon, ChestArt)", () => {
  it("draw the icon as the rank's image, named by its rank, decorative with no label, lazily loaded", () => {
    const { container } = render(
      <>
        <ChestIcon rank="epic" />
        <ChestIcon rank="basic" size="xl" label={null} />
      </>,
    );
    const icon = screen.getByRole("img", { name: "Epic chest" });
    expect(icon.tagName).toBe("IMG");
    expect(icon).toHaveAttribute("data-rank", "epic");
    expect(icon.getAttribute("src")).toMatch(/^\/chest-art\/epic\/icon\/\d+\.webp$/);
    expect(icon.getAttribute("srcset")).not.toMatch(/(https?:)?\/\//);
    expect(icon).toHaveAttribute("loading", "lazy");
    const decorative = container.querySelectorAll("img")[1]!;
    expect(decorative).toHaveAttribute("alt", "");
    expect(decorative).toHaveAttribute("aria-hidden", "true");
    // 48 px high: the copy is picked for a box 60 px wide.
    expect(decorative).toHaveAttribute("sizes", "60px");
  });

  it("lay the art's images for the box (the closed chest; the lid behind the body once open), each decorative", async () => {
    const { container } = render(wrap(<ChestArt rank="rare" state="rest" size="lg" />));
    await act(async () => {});
    const art = screen.getByRole("img", { name: "Rare chest" });
    expect(art).toHaveAttribute("data-slot", "chest-art");
    const parts = [...container.querySelectorAll<HTMLImageElement>("[data-part=closed], [data-part=lid], [data-part=body]")];
    expect(parts.map((p) => p.dataset.part)).toEqual(["closed", "lid", "body"]);
    // A 12rem box (192 px) on jsdom's 1x screen: the 320 px copies, all of the rank.
    for (const p of parts) {
      expect(p.getAttribute("src")).toBe(`/chest-art/rare/${p.dataset.part}/320.webp`);
      expect(p).toHaveAttribute("alt", "");
      expect(p).toHaveAttribute("draggable", "false");
    }
  });

  it("open the art: the open layers and the light show only once open, the opened chest is grey", async () => {
    const at = async (state: ChestArtState, reduced = false) => {
      const { container, unmount } = render(wrap(<ChestArt rank="rare" state={state} />, reduced));
      await act(async () => {});
      const root = container.querySelector<HTMLElement>('[data-slot="chest-art"]')!;
      const opacity = (part: string) => Number(root.querySelector<HTMLElement>(`[data-part=${part}]`)!.style.opacity || 1);
      const out = {
        closed: opacity("closed"),
        lid: opacity("lid"),
        body: opacity("body"),
        burst: !!root.querySelector('[data-part="burst"]'),
        beam: !!root.querySelector('[data-part="beam"]'),
        sparks: root.querySelectorAll('[data-part="sparks"] img').length,
        shine: !!root.querySelector('[data-part="shine"]'),
        grey: root.style.filter === "grayscale(1)",
      };
      unmount();
      return out;
    };
    expect(await at("rest")).toEqual({ closed: 1, lid: 0, body: 0, burst: false, beam: false, sparks: 0, shine: true, grey: false });
    expect(await at("open")).toMatchObject({ closed: 0, lid: 1, body: 1, burst: true, beam: true, shine: false, grey: false });
    expect((await at("open")).sparks).toBeGreaterThan(0);
    expect(await at("spent")).toMatchObject({ closed: 0, lid: 1, body: 1, burst: false, beam: false, grey: true });
    // Reduced motion: no idle shine.
    expect((await at("rest", true)).shine).toBe(false);
  });

  it("open with a pop: the closed chest stays until the lid springs up from its hinges; under reduced motion it is open at once", async () => {
    const { container, unmount } = render(wrap(<ChestArt rank="epic" state="opening" />));
    const root = container.querySelector<HTMLElement>('[data-slot="chest-art"]')!;
    const lid = root.querySelector<HTMLElement>("[data-part=lid]")!;
    expect(root.querySelector<HTMLElement>("[data-part=closed]")!.style.opacity).toBe("1");
    expect(lid.style.opacity).toBe("0");
    expect(lid.style.transform).toContain("scaleY(0.3)");
    expect(lid.style.transformOrigin).toBe(`50% ${CHEST_MEASURES.epic.hinge * 100}%`);
    // The flash at the pop, the dust where it lands.
    expect(root.querySelector('[data-part="flash"]')).not.toBeNull();
    expect(root.querySelector('[data-part="dust"]')).not.toBeNull();
    unmount();

    const reduced = render(wrap(<ChestArt rank="epic" state="opening" />, true));
    await act(async () => {});
    const still = reduced.container.querySelector<HTMLElement>('[data-slot="chest-art"]')!;
    expect(still.querySelector<HTMLElement>("[data-part=lid]")!.style.opacity).toBe("1");
    expect(still.querySelector('[data-part="flash"], [data-part="dust"]')).toBeNull();
    // The light fades in: it does not show at once.
    const lights = [...still.querySelectorAll<HTMLElement>('[data-part="rays"], [data-part="burst"] [data-part="glow"], [data-part="beam"], [data-part="sparks"]')];
    expect(lights.length).toBe(4);
    for (const el of lights) expect(Number(el.style.opacity)).toBeLessThan(0.5);
    reduced.unmount();
  });

  it("drop in from above when asked, landing in dust; never under reduced motion", async () => {
    const dropped = render(wrap(<ChestArt rank="basic" state="ready" drop />));
    const drop = dropped.container.querySelector<HTMLElement>('[data-part="drop"]')!;
    expect(drop.style.transform).toContain("-0.8em");
    expect(dropped.container.querySelector('[data-part="dust"]')).not.toBeNull();
    dropped.unmount();
    const still = render(wrap(<ChestArt rank="basic" state="ready" drop />, true));
    await act(async () => {});
    expect(still.container.querySelector<HTMLElement>('[data-part="drop"]')!.style.transform).not.toContain("-0.8em");
    expect(still.container.querySelector('[data-part="dust"]')).toBeNull();
  });

  it("load the art in its own chunk, the icon standing in its box under its name until it comes", async () => {
    const { container } = render(wrap(<LazyChestArt rank="rare" state="spent" size="sm" />));
    const fallback = container.querySelector('[data-slot="chest-art-fallback"]');
    if (fallback) {
      expect(fallback).toHaveAttribute("aria-label", "Rare chest");
      expect(fallback.querySelector('[data-slot="chest-icon"]')).not.toBeNull();
    }
    await waitFor(() => expect(screen.getByRole("img", { name: "Rare chest" })).toHaveAttribute("data-slot", "chest-art"));
    expect(container.querySelector('[data-slot="chest-art"]')).toHaveAttribute("data-state", "spent");
  });

  it("draw the icon in ChestBadge, named by its rank", () => {
    render(<ChestBadge rank="epic" size="lg" />);
    const badge = screen.getByRole("img", { name: "Epic chest" });
    expect(badge.querySelector('[data-slot="chest-icon"]')).toHaveAttribute("aria-hidden", "true");
    expect(badge.querySelector(".fa-treasure-chest, [data-icon]")).toBeNull();
  });

  it("are no longer drawn from Font Awesome: no shapes file, no notice", () => {
    expect(read("public/THIRD_PARTY_NOTICES.txt")).not.toContain("chest-art-shapes.ts");
    expect(read("package.json")).toContain("node scripts/compress-chest-art.ts --check");
  });
});
