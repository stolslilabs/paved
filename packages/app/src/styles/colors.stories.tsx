import type { Meta, StoryObj } from "@storybook/react-vite";
import { contrast, level } from "./color-math";
import { STEPS, board, scales, semantic, type Semantic } from "./tokens";

const meta = { title: "Foundations/Colors", parameters: { layout: "padded" } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

const SCALES = scales();
const SEMANTIC = semantic();
const BOARD = board();

/** Every scale, 50 to 950: the swatch, the step, the hex declared in theme.css and the OKLCH it comes from. */
export const Scales: Story = {
  render: () => (
    <div className="flex flex-col gap-8 p-4 text-foreground">
      {Object.entries(SCALES).map(([name, swatches]) => (
        <section key={name} aria-label={name}>
          <h2 className="mb-2 text-lg font-semibold">{name}</h2>
          <ul className="grid grid-cols-2 gap-2 mobile:grid-cols-3 tablet:grid-cols-6 desktop:grid-cols-11">
            {STEPS.map((step) => {
              const s = swatches.find((x) => x.step === step);
              if (!s) return null;
              return (
                <li key={step} className="flex flex-col overflow-hidden rounded-md border border-border bg-card">
                  <div className="h-14" style={{ background: s.oklch }} />
                  <div className="flex flex-col gap-0.5 p-2 text-xs">
                    <span className="font-semibold tabular-nums">
                      {name}-{step}
                    </span>
                    <span className="tabular-nums">{s.hex}</span>
                    <span className="break-words tabular-nums text-muted-foreground">{s.oklch.replace("oklch", "")}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      <section aria-label="board">
        <h2 className="mb-2 text-lg font-semibold">board</h2>
        <div className="flex items-center gap-3 rounded-md border border-border bg-card p-2 text-xs">
          <div className="h-14 w-24 rounded-sm border border-border" style={{ background: BOARD.oklch }} />
          <div className="flex flex-col gap-0.5">
            <span className="font-semibold">board</span>
            <span className="tabular-nums">{BOARD.hex}</span>
            <span className="tabular-nums text-muted-foreground">{BOARD.oklch.replace("oklch", "")}</span>
            <span className="text-muted-foreground">The 3D scene's clear colour and Storybook&apos;s only background.</span>
          </div>
        </div>
      </section>
    </div>
  ),
};

/** The pairs a text colour sits in, and what each is for: text needs 4.5, a UI part (border, ring) 3. */
interface Pair {
  /** The foreground token. */
  fg: string;
  /** The background token, or "board" for the scene's colour. */
  bg: string;
  /** Text (4.5 needed) or a UI part (3 needed). */
  kind: "text" | "ui";
}

const PAIRS: Pair[] = [
  { fg: "foreground", bg: "background", kind: "text" },
  { fg: "foreground", bg: "board", kind: "text" },
  { fg: "card-foreground", bg: "card", kind: "text" },
  { fg: "popover-foreground", bg: "popover", kind: "text" },
  { fg: "primary-foreground", bg: "primary", kind: "text" },
  { fg: "secondary-foreground", bg: "secondary", kind: "text" },
  { fg: "muted-foreground", bg: "muted", kind: "text" },
  { fg: "muted-foreground", bg: "background", kind: "text" },
  { fg: "muted-foreground", bg: "card", kind: "text" },
  { fg: "accent-foreground", bg: "accent", kind: "text" },
  { fg: "destructive-foreground", bg: "destructive", kind: "text" },
  { fg: "primary", bg: "background", kind: "text" },
  { fg: "primary", bg: "board", kind: "text" },
  { fg: "success", bg: "background", kind: "text" },
  { fg: "success", bg: "card", kind: "text" },
  { fg: "info", bg: "background", kind: "text" },
  { fg: "info", bg: "card", kind: "text" },
  { fg: "warning", bg: "background", kind: "text" },
  { fg: "warning", bg: "card", kind: "text" },
  { fg: "border", bg: "background", kind: "ui" },
  { fg: "input", bg: "background", kind: "ui" },
  { fg: "ring", bg: "background", kind: "ui" },
  { fg: "ring", bg: "board", kind: "ui" },
];

const token = (name: string): Semantic => {
  const found = SEMANTIC.find((t) => t.name === name);
  if (!found) throw new Error(`no semantic token ${name}`);
  return found;
};

const needed = (kind: Pair["kind"]) => (kind === "text" ? 4.5 : 3);

/** The semantic tokens, the dark values, each on the background it is used on, with the computed contrast ratio. */
export const SemanticTokens: Story = {
  name: "Semantic",
  render: () => (
    <div className="flex flex-col gap-8 p-4 text-foreground">
      <section aria-label="tokens">
        <h2 className="mb-2 text-lg font-semibold">Tokens</h2>
        <ul className="grid grid-cols-1 gap-2 mobile:grid-cols-2 desktop:grid-cols-4">
          {SEMANTIC.map((t) => (
            <li key={t.name} className="flex items-center gap-3 rounded-md border border-border bg-card p-2 text-xs">
              <div className="h-10 w-10 shrink-0 rounded-sm border border-border" style={{ background: `var(--${t.name})` }} />
              <div className="flex flex-col">
                <span className="font-semibold">--{t.name}</span>
                <span className="tabular-nums text-muted-foreground">
                  {t.via.replace("--color-", "")} · {t.hex}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </section>
      <section aria-label="contrast">
        <h2 className="mb-2 text-lg font-semibold">On their real backgrounds</h2>
        <p className="mb-3 max-w-prose text-sm text-muted-foreground">
          Ratio = WCAG 2 contrast, computed here from the OKLCH values. Text needs 4.5 (AA), a border or ring 3.
        </p>
        <ul className="grid grid-cols-1 gap-2 tablet:grid-cols-2 desktop:grid-cols-3">
          {PAIRS.map((p) => {
            const fg = token(p.fg);
            const bg = p.bg === "board" ? { ...BOARD, name: "board", via: "--color-board" } : token(p.bg);
            const ratio = contrast(fg.oklch, bg.oklch);
            const ok = ratio >= needed(p.kind);
            // The ratio is written in the pair's own text colour; a border or ring pair uses the page's.
            const ink = p.kind === "text" ? `var(--${p.fg})` : "var(--foreground)";
            return (
              <li
                key={`${p.fg}/${p.bg}`}
                className="flex items-center justify-between gap-3 rounded-md border border-border p-3"
                style={{ background: p.bg === "board" ? "var(--board)" : `var(--${p.bg})` }}
              >
                <div className="flex flex-col text-sm">
                  {p.kind === "text" ? (
                    <span style={{ color: `var(--${p.fg})` }} className="font-semibold">
                      {p.fg}
                    </span>
                  ) : (
                    <span
                      className="inline-block h-5 w-24 rounded-sm"
                      style={{ border: `2px solid var(--${p.fg})` }}
                      aria-label={p.fg}
                    />
                  )}
                  <span className="text-xs opacity-75" style={{ color: ink }}>
                    {p.kind === "ui" ? `${p.fg} · ` : ""}on {p.bg}
                  </span>
                </div>
                <div className="flex flex-col items-end text-xs">
                  <span className="text-sm font-semibold tabular-nums" style={{ color: ink }}>
                    {ratio.toFixed(2)}:1
                  </span>
                  <span style={{ color: ink }} data-testid="verdict">
                    {ok ? "✓" : "✕"} {ok ? level(ratio) : `below ${needed(p.kind)}:1`}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  ),
};
