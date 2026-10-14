import type { Meta, StoryObj } from "@storybook/react-vite";

const meta = { title: "Foundations/Spacing and radius", parameters: { layout: "padded" } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

/** Tailwind's scale, a step is 0.25rem (4px): the steps the layouts use. Literal classes, so Tailwind sees them. */
const STEPS = [
  ["0.5", "w-0.5", 2],
  ["1", "w-1", 4],
  ["2", "w-2", 8],
  ["3", "w-3", 12],
  ["4", "w-4", 16],
  ["6", "w-6", 24],
  ["8", "w-8", 32],
  ["12", "w-12", 48],
  ["16", "w-16", 64],
  ["24", "w-24", 96],
] as const;

export const Spacing: Story = {
  render: () => (
    <ul className="flex flex-col gap-2 p-4 text-foreground">
      {STEPS.map(([step, cls, px]) => (
        <li key={step} className="flex items-center gap-4 text-xs">
          <code className="w-32 shrink-0 text-muted-foreground">
            {step} · {px / 16}rem · {px}px
          </code>
          <div className={`${cls} h-4 rounded-sm bg-primary`} />
        </li>
      ))}
      <li className="mt-4 flex items-center gap-4 text-xs">
        <code className="w-32 shrink-0 text-muted-foreground">touch target · 44px</code>
        <div className="h-11 w-11 rounded-md border border-primary" />
      </li>
    </ul>
  ),
};

const RADII = [
  ["rounded-sm", "calc(--radius - 4px)", "8px", "rounded-sm"],
  ["rounded-md", "calc(--radius - 2px)", "10px", "rounded-md"],
  ["rounded-lg", "--radius", "12px", "rounded-lg"],
  ["rounded-xl", "calc(--radius + 4px)", "16px", "rounded-xl"],
  ["rounded-full", "9999px", "pill", "rounded-full"],
] as const;

/** `--radius` is 0.75rem (12px) and the four steps derive from it, so one value restyles them all. */
export const Radius: Story = {
  render: () => (
    <ul className="grid grid-cols-2 gap-4 p-4 text-foreground tablet:grid-cols-5">
      {RADII.map(([cls, formula, px, shape]) => (
        <li key={cls} className="flex flex-col gap-2 text-xs">
          <div className={`${shape} h-20 border border-primary bg-card`} />
          <code>{cls}</code>
          <span className="text-muted-foreground">
            {formula} · {px}
          </span>
        </li>
      ))}
    </ul>
  ),
};
