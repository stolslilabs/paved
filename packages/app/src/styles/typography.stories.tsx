import type { Meta, StoryObj } from "@storybook/react-vite";

const meta = { title: "Foundations/Typography", parameters: { layout: "padded" } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

const SAMPLE = "Place the tile, close the road";

/** The three families of section 2.3: `font-display`, `font-sans`, and `numeric` (`font-numeric` with tabular figures). */
export const Families: Story = {
  render: () => (
    <div className="flex flex-col gap-6 p-4 text-foreground">
      <section className="flex flex-col gap-1">
        <code className="text-xs text-muted-foreground">font-display · Almendra · Bold (700) · logo, titles</code>
        <p className="font-display text-3xl">PAVED</p>
        <p className="font-display text-base">{SAMPLE}</p>
      </section>
      <section className="flex flex-col gap-1">
        <code className="text-xs text-muted-foreground">font-sans · Rubik Variable · 300 to 900 · UI and body text</code>
        <p className="font-sans text-3xl">Paved 1234567890</p>
        <p className="font-sans text-base">{SAMPLE}</p>
      </section>
      <section className="flex flex-col gap-1">
        <code className="text-xs text-muted-foreground">
          numeric · font-numeric (Space Mono) + tabular-nums · Regular (400) and Bold (700) · scores, counters,
          prices
        </code>
        <p className="numeric text-3xl">1,240 · 0123456789</p>
        <p className="numeric text-base font-semibold">1,240 · 0123456789</p>
      </section>
      <section className="flex flex-col gap-1">
        <code className="text-xs text-muted-foreground">font-mono · Space Mono · addresses, token ids</code>
        <p className="font-mono text-base">0x04a1…c9f2 · token 1234</p>
      </section>
    </div>
  ),
};

const WEIGHTS = [
  ["font-extralight", "200 (Rubik starts at 300)", "font-sans"],
  ["font-light", "300", "font-sans"],
  ["font-normal", "400", "font-sans"],
  ["font-medium", "500", "font-sans"],
  ["font-semibold", "600", "font-sans"],
  ["font-bold", "700", "font-sans"],
  ["font-extrabold", "800", "font-sans"],
  ["font-black", "900", "font-sans"],
  ["font-bold", "700", "font-display"],
  ["font-normal", "400", "numeric"],
  ["font-semibold", "600 (Space Mono has 700)", "numeric"],
  ["font-bold", "700", "numeric"],
] as const;

/** Rubik is a variable font (300 to 900 from one file); Almendra loads Bold only, Space Mono 400 and 700. */
export const Weights: Story = {
  render: () => (
    <ul className="flex flex-col gap-2 p-4 text-foreground">
      {WEIGHTS.map(([cls, weight, family]) => (
        <li key={`${family}-${cls}`} className="flex items-baseline gap-4">
          <code className="w-64 shrink-0 text-xs text-muted-foreground">
            {family} {cls} · {weight}
          </code>
          <span className={`${family} ${cls} text-xl`}>{family === "numeric" ? "1,240 · 0123456789" : SAMPLE}</span>
        </li>
      ))}
    </ul>
  ),
};

/** Tailwind's size steps, which the app keeps (theme.css sets none): the class, its rem and px, its line height. */
const SIZES = [
  ["text-xs", "0.75rem · 12px", "1.333"],
  ["text-sm", "0.875rem · 14px", "1.429"],
  ["text-base", "1rem · 16px", "1.5"],
  ["text-lg", "1.125rem · 18px", "1.556"],
  ["text-xl", "1.25rem · 20px", "1.4"],
  ["text-2xl", "1.5rem · 24px", "1.333"],
  ["text-3xl", "1.875rem · 30px", "1.2"],
  ["text-4xl", "2.25rem · 36px", "1.111"],
  ["text-5xl", "3rem · 48px", "1"],
  ["text-6xl", "3.75rem · 60px", "1"],
] as const;

export const Sizes: Story = {
  render: () => (
    <ul className="flex flex-col gap-3 p-4 text-foreground">
      {SIZES.map(([cls, size, lh]) => (
        <li key={cls} className="flex flex-col gap-1 border-b border-border pb-3 tablet:flex-row tablet:items-baseline tablet:gap-4">
          <code className="w-64 shrink-0 text-xs text-muted-foreground">
            {cls} · {size} · lh {lh}
          </code>
          <span className={`${cls} font-sans`}>Paved 72 tiles</span>
          <span className={`${cls} numeric`}>1,240</span>
        </li>
      ))}
    </ul>
  ),
};

const SCORES = ["1", "11", "111", "1,240", "8,888", "0.00", "12,345"];

/**
 * Scores line up when the digits share a width. Rubik has proportional digits by default; `tabular-nums` fixes
 * them. `numeric` is Space Mono with `tabular-nums` (a monospace face is tabular already; the property keeps the
 * class right if the face changes): the class scores, counters and prices use.
 */
export const TabularNumbers: Story = {
  render: () => (
    <div className="grid grid-cols-1 gap-6 p-4 text-foreground mobile:grid-cols-3">
      {(
        [
          ["font-sans proportional-nums", "font-sans proportional-nums"],
          ["font-sans tabular-nums", "font-sans tabular-nums"],
          ["numeric (Space Mono, tabular-nums)", "numeric"],
        ] as const
      ).map(([label, cls]) => (
        <section key={label} className="flex flex-col gap-2">
          <code className="text-xs text-muted-foreground">{label}</code>
          <ul className={`${cls} flex w-40 flex-col items-end rounded-md border border-border bg-card p-3 text-2xl font-semibold`}>
            {SCORES.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  ),
};
