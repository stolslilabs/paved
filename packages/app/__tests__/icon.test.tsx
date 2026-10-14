import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Icon } from "../src/components/ui/icon";
import { FA_CONFIG, FA_FILES, loadFontAwesome, resetFontAwesomeForTests } from "../src/lib/font-awesome";

/** Vitest runs from the package folder. */
const DIR = join(process.cwd(), "public/fontawesome/js");

/** What the browser does with the injected tags: run each file in order, then fire `load` on it. */
function runInjectedScripts() {
  const scripts = [...document.head.querySelectorAll<HTMLScriptElement>("script[src*='fontawesome/js/']")];
  act(() => {
    for (const script of scripts) {
      const file = script.getAttribute("src")!.split("/").pop()!;
      (0, eval)(readFileSync(join(DIR, file), "utf8"));
      script.dispatchEvent(new Event("load"));
    }
  });
  return scripts;
}

beforeEach(() => {
  resetFontAwesomeForTests();
  delete window.FontAwesome;
  delete window.FontAwesomeConfig;
  document.head.querySelectorAll("script[src*='fontawesome']").forEach((s) => s.remove());
});
afterEach(() => document.head.querySelectorAll("style").forEach((s) => s.remove()));

describe("Font Awesome loader", () => {
  it("injects the three files in order, without blocking, and turns DOM rewriting off first", () => {
    loadFontAwesome("/");
    const scripts = [...document.head.querySelectorAll<HTMLScriptElement>("script[src*='fontawesome/js/']")];
    expect(scripts.map((s) => s.getAttribute("src"))).toEqual(FA_FILES.map((f) => `/fontawesome/js/${f}`));
    expect(scripts.every((s) => s.async === false && s.fetchPriority === "low")).toBe(true);
    expect(window.FontAwesomeConfig).toMatchObject({ autoReplaceSvg: false, observeMutations: false });
    expect(FA_CONFIG).toEqual({ autoReplaceSvg: false, observeMutations: false });
  });

  it("injects once", () => {
    loadFontAwesome("/");
    loadFontAwesome("/");
    expect(document.head.querySelectorAll("script[src*='fontawesome/js/']")).toHaveLength(3);
  });
});

describe("Icon", () => {
  it("is an empty box of its size before the scripts are ready, hidden when decorative", () => {
    const { container } = render(<Icon name="house" size="xl" />);
    const box = container.firstElementChild!;
    expect(box.tagName).toBe("SPAN");
    expect(box).toHaveAttribute("aria-hidden", "true");
    expect(box.className).toContain("text-[2rem]");
    expect((box as HTMLElement).style.width).toBe("1em");
  });

  it("keeps the width of its box with fixedWidth: 1.25em before and after the scripts", () => {
    const { container } = render(<Icon name="house" fixedWidth />);
    expect((container.firstElementChild as HTMLElement).style.width).toBe("1.25em");
    runInjectedScripts();
    const svg = container.querySelector("svg")!;
    expect(svg).toHaveClass("fa-fw");
    // Font Awesome's own rule for fa-fw: width: var(--fa-fw-width, 1.25em).
    expect(getComputedStyle(svg).width).toContain("1.25em");
  });

  it("renders solid and thin icons as React-managed SVG", () => {
    const { container } = render(
      <>
        <Icon name="house" />
        <Icon name="spider-web" variant="thin" />
      </>,
    );
    runInjectedScripts();
    const svgs = container.querySelectorAll("svg");
    expect(svgs).toHaveLength(2);
    expect(svgs[0]).toHaveAttribute("data-prefix", "fas");
    expect(svgs[1]).toHaveAttribute("data-prefix", "fat");
    for (const svg of svgs) {
      expect(svg.querySelector("path")?.getAttribute("d")).toMatch(/^M/);
      expect(svg).toHaveAttribute("aria-hidden", "true");
      expect(svg).toHaveAttribute("focusable", "false");
    }
    expect(svgs[0]).toHaveAttribute("viewBox", "0 0 576 512");
  });

  it("gives a labelled icon the img role and an accessible name, and nothing else", () => {
    render(<Icon name="trash" label="Delete" />);
    runInjectedScripts();
    const icon = screen.getByRole("img", { name: "Delete" });
    expect(icon.tagName.toLowerCase()).toBe("svg");
    expect(icon).not.toHaveAttribute("aria-hidden");
    expect(icon.querySelector("title")).toBeNull();
  });

  it("does not rewrite the DOM outside React, nor watch it", async () => {
    document.body.innerHTML = '<i class="fa-solid fa-house" id="outside"></i>';
    render(<Icon name="house" />);
    runInjectedScripts();
    document.body.insertAdjacentHTML("beforeend", '<i class="fa-solid fa-fire" id="later"></i>');
    await new Promise((r) => setTimeout(r, 50));
    expect(document.getElementById("outside")?.tagName).toBe("I");
    expect(document.getElementById("later")?.tagName).toBe("I");
    expect(document.querySelectorAll("body > svg")).toHaveLength(0);
  });

  it("stays an empty box for a name the files do not have", () => {
    const { container } = render(<Icon name="not-an-icon" />);
    runInjectedScripts();
    expect(container.firstElementChild?.tagName).toBe("SPAN");
  });

  it("has every icon the Icons story shows", () => {
    render(<Icon name="house" />);
    runInjectedScripts();
    const fa = window.FontAwesome!;
    for (const name of ["house", "ranking-star", "list-check", "vault", "gear", "hammer", "fire", "sack-dollar", "rocket", "lock", "trash", "book-bible"]) {
      expect(fa.icon({ prefix: "fas", iconName: name }), name).toBeTruthy();
    }
    expect(fa.icon({ prefix: "fat", iconName: "spider-web" })).toBeTruthy();
  });
});
