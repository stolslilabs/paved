import type { ReactNode } from "react";
import { checks, STATE_NAMES } from "./contrast";
import { DButton, DCard, DCardButton, DChip, DirectionRoot, DSwitch, DTitle, Icon, Muted, type Variant } from "./kit";
import { DNav } from "./shells";
import { DIRECTIONS, STATES, type DirectionId, type Palette } from "./palettes";

const SWATCHES: readonly (keyof Palette)[] = ["bg", "surface", "raised", "line", "text", "muted", "primary", "onPrimary", "accent", "danger", "shadow"];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="font-display text-xl">{title}</h3>
      {children}
    </section>
  );
}

/** The palette (tokens), the notes (assets, navigation, cards, why not Cartridge) and the contrast table of one direction. */
export function PalettePanel({ id }: { id: DirectionId }) {
  const dir = DIRECTIONS[id];
  const rows = checks(dir.palette, id === "c");
  const worst = (state: string) => Math.min(...rows.filter((r) => r.state === state).map((r) => r.ratio));
  return (
    <DirectionRoot id={id}>
      <div className="mx-auto flex max-w-5xl flex-col gap-8 p-4 desktop:p-8">
        <header className="flex flex-col gap-1">
          <h1 className="font-display text-4xl tracking-wide text-(color:--d-primary)">
            Direction {id.toUpperCase()}: {dir.name}
          </h1>
          <p className="text-(color:--d-muted)">{dir.tagline}</p>
        </header>

        <Section title="Palette">
          <ul className="grid grid-cols-3 gap-3 tablet:grid-cols-4 desktop:grid-cols-6">
            {SWATCHES.map((name) => (
              <li key={name} className="flex flex-col gap-1.5 text-xs">
                <span className="h-14 rounded-md border border-white/20" style={{ background: dir.palette[name] }} />
                <span className="font-semibold">{name}</span>
                <span className="font-mono text-(color:--d-muted)">{dir.palette[name]}</span>
              </li>
            ))}
          </ul>
        </Section>

        <div className="grid gap-4 desktop:grid-cols-2">
          <DCard className="flex flex-col gap-2 p-4">
            <DTitle>What it takes from Paved</DTitle>
            <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm">
              {dir.assets.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </DCard>
          <DCard className="flex flex-col gap-2 p-4">
            <DTitle>Why it does not read as Cartridge</DTitle>
            <p className="text-sm">{dir.notCartridge}</p>
          </DCard>
          <DCard className="flex flex-col gap-2 p-4">
            <DTitle>Navigation</DTitle>
            <p className="text-sm">
              <strong>Mobile.</strong> {dir.nav.mobile}
            </p>
            <p className="text-sm">
              <strong>Desktop.</strong> {dir.nav.desktop}
            </p>
          </DCard>
          <DCard className="flex flex-col gap-2 p-4">
            <DTitle>Cards</DTitle>
            <p className="text-sm">{dir.cards}</p>
          </DCard>
        </div>

        <Section title="Contrast of the states">
          <p className="text-sm text-(color:--d-muted)">
            White at {STATES.hover * 100}% (hover), {STATES.active * 100}% (current or selected) and {STATES.pressed * 100}% (pressed) over the part's own
            colour. Lowest text ratio over the page, a card and a raised part: {STATE_NAMES.map((s) => `${s} ${worst(s).toFixed(2)}`).join(", ")}. Steady states are held to
            4.5:1, pressed (a tap) to 3:1; <code>__tests__/directions-contrast.test.ts</code> fails under that.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] text-left text-xs">
              <thead>
                <tr className="text-(color:--d-muted)">
                  <th className="py-1.5 pr-3 font-medium">Pair</th>
                  {STATE_NAMES.map((s) => (
                    <th key={s} className="py-1.5 pr-3 font-medium">
                      {s}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...new Set(rows.map((r) => r.label))].map((label) => (
                  <tr key={label} className="border-t border-white/10">
                    <td className="py-1.5 pr-3">{label}</td>
                    {STATE_NAMES.map((s) => {
                      const r = rows.find((x) => x.label === label && x.state === s);
                      return (
                        <td key={s} className="py-1.5 pr-3 font-mono">
                          {r ? r.ratio.toFixed(2) : "-"}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      </div>
    </DirectionRoot>
  );
}

const VARIANTS: readonly Variant[] = ["solid", "secondary", "outline", "ghost", "danger"];
const CELLS = [
  { name: "rest", props: {} },
  { name: "hover 10%", props: { force: "hover" as const } },
  { name: "selected 15%", props: { on: true } },
  { name: "pressed 20%", props: { force: "pressed" as const } },
  { name: "disabled", props: { disabled: true } },
];

/** Every button variant, the cards that are buttons, the switch and the navigation, in each interaction state. */
export function StatesPanel({ id }: { id: DirectionId }) {
  return (
    <DirectionRoot id={id}>
      <div className="mx-auto flex max-w-5xl flex-col gap-8 p-4 desktop:p-8">
        <header className="flex flex-col gap-1">
          <h1 className="font-display text-3xl tracking-wide">Interaction states, direction {id.toUpperCase()}</h1>
          <p className="text-sm text-(color:--d-muted)">
            White with transparency instead of a brown fill: hover {STATES.hover * 100}%, selected {STATES.active * 100}%, pressed {STATES.pressed * 100}%, on every button variant,
            the cards that are buttons, the switch and the nav items. Hover the live ones to see it.
          </p>
        </header>

        <Section title="Buttons">
          <div className="overflow-x-auto">
            <div className="grid min-w-[40rem] grid-cols-[5.5rem_repeat(5,minmax(0,1fr))] items-center gap-x-3 gap-y-4">
              <span />
              {CELLS.map((c) => (
                <Muted key={c.name}>{c.name}</Muted>
              ))}
              {VARIANTS.map((v) => (
                <div key={v} className="contents">
                  <span className="text-sm font-semibold">{v}</span>
                  {CELLS.map((c) => (
                    <DButton key={c.name} variant={v} {...c.props}>
                      {v === "danger" ? "Give up" : "Button"}
                    </DButton>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </Section>

        <Section title="Cards that are buttons, chips, switch">
          <div className="grid gap-3 tablet:grid-cols-2 desktop:grid-cols-4">
            {CELLS.slice(0, 4).map((c) => (
              <DCardButton key={c.name} {...c.props} className="flex items-center gap-3 p-4">
                <Icon name="trophy" className="text-(--d-primary)" />
                <span className="flex flex-col">
                  <span className="font-semibold">Challenge</span>
                  <Muted>{c.name}</Muted>
                </span>
              </DCardButton>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <DSwitch checked={false} label="Off" />
            <DSwitch checked label="On" />
            <DSwitch checked label="On, hover" force="hover" />
            <DChip>plain</DChip>
            <DChip tone="primary">primary</DChip>
            <DChip tone="accent">accent</DChip>
          </div>
        </Section>

        <Section title="Navigation">
          <p className="text-sm text-(color:--d-muted)">The current item (Home) is selected at 15%. Ranks is pinned to hover, then to pressed.</p>
          <div className={id === "c" ? "grid gap-4 desktop:grid-cols-3" : "grid gap-4"}>
            {[
              ["Rest: Home is current", undefined],
              ["Hover 10% on Ranks", { tab: "ranks" as const, state: "hover" as const }],
              ["Pressed 20% on Ranks", { tab: "ranks" as const, state: "pressed" as const }],
            ].map(([title, force]) => (
              <div key={title as string} className="flex flex-col gap-2">
                <Muted>{title as string}</Muted>
                {/* `transform` makes this the containing block of the fixed dock (C), so the dock stays in its frame. */}
                <div className={`relative flex flex-col justify-end overflow-hidden rounded-md border border-white/15 bg-(--d-bg) [transform:translateZ(0)] ${id === "c" ? "h-[22rem] desktop:justify-start" : "h-28 desktop:h-24 desktop:justify-start"}`}>
                  <DNav active="home" force={force as never} />
                </div>
              </div>
            ))}
          </div>
        </Section>
      </div>
    </DirectionRoot>
  );
}
