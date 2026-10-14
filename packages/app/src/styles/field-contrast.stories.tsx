import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactNode } from "react";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Switch } from "../components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "../components/ui/toggle-group";
import { contrast, level } from "./color-math";
import { semantic } from "./tokens";

const meta = { title: "Foundations/Field contrast", parameters: { layout: "padded" } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

const TOKENS = semantic();
const oklch = (name: string) => TOKENS.find((t) => t.name === name)!.oklch;

/** A field's edge must reach 3:1 on the surface it sits on (WCAG 1.4.11): the ratio is computed from theme.css. */
function Ratio({ edge, surface }: { edge: "input" | "input-surface"; surface: "background" | "card" | "popover" }) {
  const ratio = contrast(oklch(edge), oklch(surface));
  return (
    <p className="text-xs text-muted-foreground">
      <code>--{edge}</code> on <code>--{surface}</code>: <strong className="text-foreground">{ratio.toFixed(2)}:1</strong> ({level(ratio)}
      {ratio >= 3 ? ", passes 3:1" : ", under 3:1"})
    </p>
  );
}

/** The same controls: an outline toggle group, an outline button and a switch (off), whatever the surface. */
const Field = () => (
  <div className="flex flex-wrap items-center gap-4">
    <ToggleGroup type="single" variant="outline" defaultValue="medium" aria-label="Difficulty">
      <ToggleGroupItem value="easy">Easy</ToggleGroupItem>
      <ToggleGroupItem value="medium">Medium</ToggleGroupItem>
      <ToggleGroupItem value="hard">Hard</ToggleGroupItem>
    </ToggleGroup>
    <Button variant="outline">Outline</Button>
    <Switch aria-label="Sound" />
  </div>
);

const Panel = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="flex flex-col gap-3">
    <h3 className="text-sm font-semibold">{title}</h3>
    {children}
  </section>
);

/**
 * `--input` is ink-600 on the page. On a card or a popover it is re-pointed to `--input-surface` (ink-500) by a rule
 * on the surfaces' `data-slot` in theme.css, so the primitives carry no second class.
 */
export const FieldOnSurfaces: Story = {
  name: "Field on page, card and popover",
  render: () => (
    <div className="flex max-w-xl flex-col gap-8">
      <Panel title="On the page (--background)">
        <Field />
        <Ratio edge="input" surface="background" />
      </Panel>
      <Panel title="On a card (--card)">
        <Card>
          <CardHeader>
            <CardTitle>Settings</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Field />
            <Ratio edge="input-surface" surface="card" />
          </CardContent>
        </Card>
      </Panel>
      <Panel title="In a popover, dialog or sheet (--popover)">
        <div data-input-surface className="flex flex-col gap-3 rounded-xl border border-border bg-popover p-5 text-popover-foreground shadow-lg">
          <Field />
          <Ratio edge="input-surface" surface="popover" />
        </div>
      </Panel>
      <Panel title="For comparison: the page's --input left on a card">
        <p className="text-xs text-muted-foreground">
          <code>--input</code> on <code>--card</code>: <strong className="text-foreground">{contrast(oklch("input"), oklch("card")).toFixed(2)}:1</strong> (under 3:1, why the rule exists)
        </p>
      </Panel>
    </div>
  ),
};
