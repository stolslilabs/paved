import themeCss from "./theme.css?raw";

/** The tokens of theme.css, read from the file itself: the stories can show nothing the stylesheet does not say. */

export const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;

export interface Swatch {
  step: number;
  /** `oklch(0.829 0.130 83.0)`, as declared. */
  oklch: string;
  /** The sRGB rendering declared beside it, `#F0BF5B`. */
  hex: string;
}

/** Every `--color-<scale>-<step>` of the base scales, in file order. */
export function scales(css: string = themeCss): Record<string, Swatch[]> {
  const out: Record<string, Swatch[]> = {};
  for (const m of css.matchAll(/--color-([a-z]+)-(\d+):\s*(oklch\([^)]*\));\s*\/\*\s*(#[0-9A-Fa-f]{6})/g)) {
    (out[m[1]!] ??= []).push({ step: Number(m[2]), oklch: m[3]!, hex: m[4]!.toUpperCase() });
  }
  return out;
}

/** The board colour, `--color-board`. */
export function board(css: string = themeCss): { oklch: string; hex: string } {
  const m = css.match(/--color-board:\s*(oklch\([^)]*\));\s*\/\*\s*(#[0-9A-Fa-f]{6})/);
  if (!m) throw new Error("--color-board is not declared");
  return { oklch: m[1]!, hex: m[2]!.toUpperCase() };
}

/** A value of the file that is a plain declaration (`--radius: 0.75rem;`). */
function declared(name: string, css: string): string | undefined {
  return css.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1]?.trim();
}

/** The semantic tokens of the dark block, each followed through `var(...)` to its scale step. */
export interface Semantic {
  name: string;
  /** What it points at, `--color-charcoal-950`. */
  via: string;
  oklch: string;
  hex: string;
}

export function semantic(css: string = themeCss): Semantic[] {
  const all = scales(css);
  const colour = (name: string): Swatch => {
    const m = name.match(/^--color-([a-z]+)-(\d+)$/);
    const found = m && all[m[1]!]?.find((s) => s.step === Number(m[2]));
    if (!found) throw new Error(`${name} is not a declared scale step`);
    return found;
  };
  const block = css.match(/:root,\s*\[data-theme="dark"\]\s*\{([^}]*)\}/)?.[1];
  if (!block) throw new Error("the dark semantic block is missing");
  const out: Semantic[] = [];
  for (const m of block.matchAll(/--([a-z-]+):\s*var\((--[a-z0-9-]+)\);/g)) {
    // `--primary: var(--accent-scale-300)` goes through the alias to gold-300.
    let via = m[2]!;
    for (let i = 0; i < 4 && !via.startsWith("--color-"); i++) {
      via = declared(via, css)?.match(/var\((--[a-z0-9-]+)\)/)?.[1] ?? via;
    }
    if (via === "--color-board") out.push({ name: m[1]!, via, ...board(css) });
    else out.push({ name: m[1]!, via, oklch: colour(via).oklch, hex: colour(via).hex });
  }
  return out;
}

/** The named breakpoints, `--breakpoint-<name>` in rem. */
export function breakpoints(css: string = themeCss): { name: string; rem: number }[] {
  return [...css.matchAll(/--breakpoint-([a-z]+):\s*([\d.]+)rem;/g)].map((m) => ({ name: m[1]!, rem: Number(m[2]) }));
}

export const radiusBase = () => declared("--radius", themeCss);
