import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { compile } from "tailwindcss";
import { describe, expect, it } from "vitest";
import { contrast } from "../src/styles/color-math";

const read = (rel: string) => readFileSync(resolve(import.meta.dirname, rel), "utf8");
const theme = read("../src/styles/theme.css");

/** Compile the token file with Tailwind itself, as the Vite plugin does, resolving its two imports. */
function compileTheme() {
  return compile(theme, {
    base: resolve(import.meta.dirname, ".."),
    async loadStylesheet(id, base) {
      const path = resolve(import.meta.dirname, "../node_modules", id === "tailwindcss" ? "tailwindcss/index.css" : "tw-animate-css/dist/tw-animate.css");
      return { path, base, content: readFileSync(path, "utf8") };
    },
  });
}

/** Compile for the given class names. */
async function build(classes: string[]) {
  return (await compileTheme()).build(classes);
}

/** The value of a custom property in the compiled CSS, followed through `var(--x)` down to a colour. */
function resolveVar(css: string, value: string): string {
  let out = value.trim();
  for (let i = 0; i < 8 && out.startsWith("var("); i++) {
    const name = out.slice(4, -1).trim();
    const found = [...css.matchAll(new RegExp(`${name}:\\s*([^;]+);`, "g"))].pop();
    if (!found) throw new Error(`${name} is not defined`);
    out = found[1]!.trim();
  }
  return out;
}

/** The declaration `prop` of the rule whose selector is `selector`. */
function declaration(css: string, selector: string, prop: string): string {
  const rule = css.match(new RegExp(`${selector.replace(/[.\\:()[\]"=*,]/g, "\\$&")}\\s*\\{([^}]*)\\}`));
  const decl = rule?.[1]?.match(new RegExp(`${prop}:\\s*([^;]+);`));
  if (!decl) throw new Error(`${selector} has no ${prop}`);
  return decl[1]!.trim();
}

describe("theme.css", () => {
  it("compiles a semantic-token class to a colour that resolves", async () => {
    const css = await build(["bg-primary", "text-muted-foreground"]);
    // primary -> --accent-scale-300 -> gold-300; muted-foreground -> charcoal-300
    expect(resolveVar(css, declaration(css, ".bg-primary", "background-color"))).toBe("oklch(0.829 0.130 83.0)");
    expect(resolveVar(css, declaration(css, ".text-muted-foreground", "color"))).toBe("oklch(0.854 0.007 268.5)");
  });

  it("applies a dark: class under <html data-theme=dark>, and not otherwise", async () => {
    const css = await build(["dark:bg-ember-600"]);
    const selector = css.match(/(\.dark\\:bg-ember-600:where\([^)]*\)[^{]*)\{/)![1]!.trim();
    const el = document.createElement("div");
    el.className = "dark:bg-ember-600";
    document.body.append(el);
    document.documentElement.removeAttribute("data-theme");
    expect(el.matches(selector)).toBe(false);
    document.documentElement.setAttribute("data-theme", "dark");
    expect(el.matches(selector)).toBe(true);
    expect(resolveVar(css, declaration(css, selector, "background-color"))).toBe("oklch(0.604 0.183 29.1)");
    el.remove();
    document.documentElement.removeAttribute("data-theme");
  });

  it("keeps Tailwind's default breakpoints beside the named ones", async () => {
    const css = await build(["sm:p-1", "md:p-1", "lg:p-1", "mobile:p-1", "tablet:p-1", "desktop:p-1", "wide:p-1"]);
    // Equal widths share one @media block (sm and tablet): take the last one before the class.
    const media = (name: string) => {
      const at = css.indexOf(`.${name}\\:p-1`);
      return [...css.slice(0, at).matchAll(/@media \(width >= ([\d.]+rem)\)/g)].pop()?.[1];
    };
    expect({
      sm: media("sm"), md: media("md"), lg: media("lg"),
      mobile: media("mobile"), tablet: media("tablet"), desktop: media("desktop"), wide: media("wide"),
    }).toEqual({ sm: "40rem", md: "48rem", lg: "64rem", mobile: "22.5rem", tablet: "40rem", desktop: "64rem", wide: "90rem" });
  });

  it("sets the dark theme on the page", () => {
    expect(read("../index.html")).toContain('<html lang="en" data-theme="dark">');
  });

  it("keeps --input at 3:1 or more on --background (WCAG 1.4.11), and --border below it (decorative)", async () => {
    const css = await build(["border-input", "bg-background", "border-border"]);
    const background = resolveVar(css, "var(--background)");
    expect(contrast(resolveVar(css, "var(--input)"), background)).toBeGreaterThanOrEqual(3);
    expect(contrast(resolveVar(css, "var(--border)"), background)).toBeLessThan(3);
  });

  it("keeps --input-surface at 3:1 or more on --card and --popover, and scopes --input to those surfaces", async () => {
    const css = await build(["border-input", "bg-card", "bg-popover"]);
    for (const surface of ["card", "popover"]) {
      expect(contrast(resolveVar(css, "var(--input-surface)"), resolveVar(css, `var(--${surface})`)), surface).toBeGreaterThanOrEqual(3);
    }
    for (const slot of ["card", "dialog-content", "sheet-content", "dropdown-menu-content"]) {
      expect(theme, slot).toMatch(new RegExp(`\\[data-slot="${slot}"\\][^{]*\\{[^}]*--input:\\s*var\\(--input-surface\\)`));
    }
  });

  it("keeps raw colours and palette steps out of the ui primitives and the elements (not their stories)", () => {
    for (const tier of ["ui", "elements"]) {
      const dir = resolve(import.meta.dirname, "../src/components", tier);
      for (const f of readdirSync(dir).filter((n) => n.endsWith(".tsx") && !n.endsWith(".stories.tsx"))) {
        expect(readFileSync(resolve(dir, f), "utf8"), `${tier}/${f}`).not.toMatch(
          /#[0-9a-fA-F]{3,8}\b|oklch\(|rgba?\(|\b(?:bg|text|border|ring|fill|stroke)-(?:white|black|\[#)|\b(?:ink|charcoal|gold|ember|meadow|river|amber)-\d/,
        );
      }
    }
  });

  it("paints the interaction states white with transparency (#537): hover 10%, selected 15%, pressed 20%", async () => {
    const css = await build(["state-layer", "bg-state-selected"]);
    expect(resolveVar(css, "var(--state-hover)")).toBe("rgb(255 255 255 / 0.1)");
    expect(resolveVar(css, "var(--state-selected)")).toBe("rgb(255 255 255 / 0.15)");
    expect(resolveVar(css, "var(--state-pressed)")).toBe("rgb(255 255 255 / 0.2)");
    const rule = css.slice(css.indexOf(".state-layer"));
    expect(rule).toContain("background-image: linear-gradient(var(--layer), var(--layer))");
    // Hover, then selected or current, then pressed: in that order, so a press wins and a selected part keeps its 15% under the pointer.
    const at = (state: string) => rule.indexOf(`--layer: var(--state-${state})`);
    expect(at("hover")).toBeGreaterThan(0);
    expect(at("selected")).toBeGreaterThan(at("hover"));
    expect(at("pressed")).toBeGreaterThan(at("selected"));
    expect(rule).toMatch(/aria-current="page"/);
  });

  it("keeps raw colours in theme.css only", () => {
    const files = ["../src/App.tsx", "../src/routes/Shell.tsx", "../src/routes/Placeholder.tsx", "../src/styles/fonts.css"];
    for (const f of files) expect(read(f), f).not.toMatch(/#[0-9a-fA-F]{3,8}\b|oklch\(|rgb\(/);
  });
});
