import type { Meta, StoryObj } from "@storybook/react-vite";
import { radiusBase } from "./tokens";

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

/** `--radius` as theme.css declares it, in px (0.75rem is 12px). */
const BASE = parseFloat(radiusBase() ?? "0") * 16;

const RADII = [
  ["rounded-sm", "calc(--radius - 4px)", BASE - 4],
  ["rounded-md", "calc(--radius - 2px)", BASE - 2],
  ["rounded-lg", "--radius", BASE],
  ["rounded-xl", "calc(--radius + 4px)", BASE + 4],
] as const;

/** `--radius` is 0.75rem (12px) and the four steps derive from it, so one value restyles them all. */
export const Radius: Story = {
  render: () => (
    <ul className="grid grid-cols-2 gap-4 p-4 text-foreground tablet:grid-cols-5">
      <li className="flex flex-col gap-2 text-xs">
        <div className="h-20 rounded-sm border border-primary bg-card" />
        <code>rounded-sm</code>
        <span className="text-muted-foreground">{RADII[0][1]} · {RADII[0][2]}px</span>
      </li>
      <li className="flex flex-col gap-2 text-xs">
        <div className="h-20 rounded-md border border-primary bg-card" />
        <code>rounded-md</code>
        <span className="text-muted-foreground">{RADII[1][1]} · {RADII[1][2]}px</span>
      </li>
      <li className="flex flex-col gap-2 text-xs">
        <div className="h-20 rounded-lg border border-primary bg-card" />
        <code>rounded-lg</code>
        <span className="text-muted-foreground">{RADII[2][1]} · {RADII[2][2]}px</span>
      </li>
      <li className="flex flex-col gap-2 text-xs">
        <div className="h-20 rounded-xl border border-primary bg-card" />
        <code>rounded-xl</code>
        <span className="text-muted-foreground">{RADII[3][1]} · {RADII[3][2]}px</span>
      </li>
      <li className="flex flex-col gap-2 text-xs">
        <div className="h-20 rounded-full border border-primary bg-card" />
        <code>rounded-full</code>
        <span className="text-muted-foreground">9999px · pill</span>
      </li>
    </ul>
  ),
};
