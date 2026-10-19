import type { ReactNode } from "react";
import clsx from "clsx";
import type { Tab } from "../routes/pages";
import { DButton, Icon, NOTCH, useDir } from "./kit";
import { RENDERS } from "./renders";
import { DNav } from "./shells";

/*
 * The page shells of D, E and F (#537, PR 1b). D is the mockups' page: charcoal, the nav at the bottom, a back bar on the flows.
 * E is the same page under a warm lamp (a glow where the hero stands). F has no page: the board fills the screen behind a veil,
 * and the interface floats over it.
 */

/** A render with its phone and wide crops: the tall one below `desktop`, the wide one from it. Decorative. */
export function Picture({ tall, wide, className, imgClassName }: { tall: string; wide: string; className?: string; imgClassName?: string }) {
  return (
    <picture className={className}>
      <source media="(min-width: 64rem)" srcSet={wide} />
      <img src={tall} alt="" draggable={false} className={imgClassName} />
    </picture>
  );
}

/** F's realm: the board behind the whole page, under a veil that darkens toward the bottom where the slabs and the hotbar sit. */
export function Realm({ tall = RENDERS.heroTall, wide = RENDERS.heroWide, veil = "strong" }: { tall?: string; wide?: string; veil?: "strong" | "light" }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <Picture tall={tall} wide={wide} className="absolute inset-0" imgClassName="size-full object-cover object-top" />
      <div className={clsx("absolute inset-0 bg-linear-to-b", veil === "strong" ? "from-(--d-bg)/45 via-(--d-bg)/75 to-(--d-bg)/95" : "from-(--d-bg)/20 via-transparent to-(--d-bg)/70")} />
    </div>
  );
}

/** E's lamp: a warm glow behind the hero, the board's key light (#ffd8a0) seen from the table. */
function Lamp() {
  return <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[36rem] bg-[radial-gradient(ellipse_at_50%_20%,rgb(255_216_160/0.13),transparent_65%)]" />;
}

/**
 * A tabbed page of D, E or F: the direction's nav, an optional full-bleed hero above the column (Home), and the column. F lays
 * the realm behind everything.
 */
export function TabShell2({ active, hero, children }: { active: Tab; hero?: ReactNode; children: ReactNode }) {
  const d = useDir();
  return (
    <div className="relative flex min-h-dvh flex-col">
      {d === "f" && <Realm />}
      {d === "e" && <Lamp />}
      <DNav active={active} />
      {hero}
      <main className="relative mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-4 pt-5 pb-6 tablet:max-w-2xl desktop:max-w-5xl desktop:px-8 desktop:pt-8 desktop:pb-10">{children}</main>
    </div>
  );
}

/** A page title: in the display font on D and E; on a notched plate over the realm on F, so it never sits on the bare board. */
export function PageTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  const d = useDir();
  return (
    <div className="flex items-center justify-between gap-3">
      <h1 className={clsx("font-display tracking-wide", d === "f" ? clsx(NOTCH, "bg-(--d-surface) px-4 py-1.5 text-3xl") : "text-3xl")}>{children}</h1>
      {aside}
    </div>
  );
}

/** A full-screen flow (Play, the score, a tile): a back key, the title centred as the mockups set it, an optional key on the right. */
export function FlowShell2({ title, right, realm, children }: { title: string; right?: ReactNode; realm?: { tall: string; wide: string }; children: ReactNode }) {
  const d = useDir();
  return (
    <div className="relative flex min-h-dvh flex-col">
      {d === "f" && <Realm {...realm} />}
      {d === "e" && <Lamp />}
      <header
        className={clsx(
          "relative mx-auto grid w-full max-w-md grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center gap-2 px-2 pt-3 tablet:max-w-2xl desktop:max-w-5xl desktop:px-8 desktop:pt-6",
          d === "d" && "border-b border-(color:--d-line) pb-3",
        )}
      >
        <DButton variant={d === "f" ? "secondary" : "ghost"} size="square" aria-label="Back">
          <Icon name="chevron-left" size="md" />
        </DButton>
        <h1 className={clsx("truncate text-center", d === "d" ? "text-lg font-semibold" : "font-display text-2xl tracking-wide", d === "f" && clsx(NOTCH, "justify-self-center bg-(--d-surface) px-4 py-1"))} title={title}>
          {title}
        </h1>
        {right ?? <span />}
      </header>
      <main className="relative mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-4 pt-4 pb-6 tablet:max-w-2xl desktop:max-w-5xl desktop:px-8 desktop:pb-10">{children}</main>
    </div>
  );
}
