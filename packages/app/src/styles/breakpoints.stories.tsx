import type { Meta, StoryObj } from "@storybook/react-vite";
import { useSyncExternalStore } from "react";
import { breakpoints } from "./tokens";

const meta = { title: "Foundations/Breakpoints", parameters: { layout: "padded" } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

/** Tailwind's defaults, which shadcn's components use, at the 16px root. */
const DEFAULTS = [
  { name: "sm", rem: 40 },
  { name: "md", rem: 48 },
  { name: "lg", rem: 64 },
  { name: "xl", rem: 80 },
  { name: "2xl", rem: 96 },
];

const NAMED = breakpoints();

/** The iframe's width, which is the Storybook viewport the story is shown at. */
function useWidth() {
  return useSyncExternalStore(
    (notify) => {
      window.addEventListener("resize", notify);
      return () => window.removeEventListener("resize", notify);
    },
    () => window.innerWidth,
    () => 0,
  );
}

/** Mobile first: a breakpoint applies from its width up. The base is the small mobile (below `mobile`). */
function Table({ title, rows, width }: { title: string; rows: { name: string; rem: number }[]; width: number }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold">{title}</h2>
      <ul className="flex flex-col gap-1 text-sm">
        {rows.map((r) => {
          const px = r.rem * 16;
          const on = width >= px;
          return (
            <li key={r.name} className="flex items-center gap-3">
              <span className={`inline-block h-3 w-3 rounded-full ${on ? "bg-primary" : "border border-border"}`} aria-hidden />
              <code className="w-20">{r.name}</code>
              <span className="tabular-nums text-muted-foreground">
                {r.rem}rem · {px}px
              </span>
              <span className="text-xs">{on ? "applies" : ""}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Readout() {
  const width = useWidth();
  return (
    <div className="flex flex-col gap-6 p-4 text-foreground">
      <p className="text-sm">
        This frame is <strong className="tabular-nums">{width}px</strong> wide. Change the viewport in the toolbar, or
        open the four stories of this page.
      </p>
      <Table title="Named (theme.css)" rows={NAMED} width={width} />
      <Table title="Tailwind defaults" rows={DEFAULTS} width={width} />
      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">The classes themselves</h2>
        <p className="rounded-md border border-border bg-card p-3 text-sm">
          <span className="mobile:hidden">below mobile</span>
          <span className="hidden mobile:inline tablet:hidden">mobile</span>
          <span className="hidden tablet:inline desktop:hidden">tablet</span>
          <span className="hidden desktop:inline wide:hidden">desktop</span>
          <span className="hidden wide:inline">wide</span>
        </p>
      </section>
    </div>
  );
}

export const Default: Story = { render: () => <Readout /> };
export const Mobile: Story = { render: () => <Readout />, globals: { viewport: { value: "mobile", isRotated: false } } };
export const Tablet: Story = { render: () => <Readout />, globals: { viewport: { value: "tablet", isRotated: false } } };
export const Desktop: Story = { render: () => <Readout />, globals: { viewport: { value: "desktop", isRotated: false } } };
export const Wide: Story = { render: () => <Readout />, globals: { viewport: { value: "wide", isRotated: false } } };
