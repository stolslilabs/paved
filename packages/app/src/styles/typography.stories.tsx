import type { Meta, StoryObj } from "@storybook/react-vite";

const meta = { title: "Foundations/Typography", parameters: { layout: "padded" } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

const SAMPLE = "Place the tile, close the road";

/** The three families of section 2.3: `font-display`, `font-sans`, `font-mono`. */
export const Families: Story = {
  render: () => (
    <div className="flex flex-col gap-6 p-4 text-foreground">
      <section className="flex flex-col gap-1">
        <code className="text-xs text-muted-foreground">font-display · Rubik Mono One · one weight (400)</code>
        <p className="font-display text-3xl">PAVED 1234567890</p>
        <p className="font-display text-base">{SAMPLE}</p>
      </section>
      <section className="flex flex-col gap-1">
        <code className="text-xs text-muted-foreground">font-sans · Inter Variable · 100 to 900</code>
        <p className="font-sans text-3xl">Paved 1234567890</p>
        <p className="font-sans text-base">{SAMPLE}</p>
      </section>
      <section className="flex flex-col gap-1">
        <code className="text-xs text-muted-foreground">
          font-mono · JetBrains Mono Variable · not installed yet (loaded only where used, so it falls back to the
          system monospace)
        </code>
        <p className="font-mono text-base">0x04a1…c9f2 · token 1234</p>
      </section>
    </div>
  ),
};

const WEIGHTS = [
  ["font-thin", "100", "font-thin"],
  ["font-extralight", "200", "font-extralight"],
  ["font-light", "300", "font-light"],
  ["font-normal", "400", "font-normal"],
  ["font-medium", "500", "font-medium"],
  ["font-semibold", "600", "font-semibold"],
  ["font-bold", "700", "font-bold"],
  ["font-extrabold", "800", "font-extrabold"],
  ["font-black", "900", "font-black"],
] as const;

/** Inter is a variable font: every weight from one file. */
export const Weights: Story = {
  render: () => (
    <ul className="flex flex-col gap-2 p-4 text-foreground">
      {WEIGHTS.map(([cls, weight]) => (
        <li key={cls} className="flex items-baseline gap-4">
          <code className="w-40 shrink-0 text-xs text-muted-foreground">
            {cls} · {weight}
          </code>
          <span className={`${cls} text-xl`}>{SAMPLE}</span>
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
          <span className={`${cls} font-display`}>1,240</span>
        </li>
      ))}
    </ul>
  ),
};

const SCORES = ["1", "11", "111", "1,240", "8,888", "0.00", "12,345"];

/** Scores line up when the digits share a width: `tabular-nums` against the default proportional digits. */
export const TabularNumbers: Story = {
  render: () => (
    <div className="grid grid-cols-1 gap-6 p-4 text-foreground mobile:grid-cols-2">
      {(
        [
          ["proportional-nums", "proportional-nums"],
          ["tabular-nums", "tabular-nums"],
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
