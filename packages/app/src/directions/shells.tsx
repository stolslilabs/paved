import type { ReactNode } from "react";
import clsx from "clsx";
import type { Tab } from "../routes/pages";
import { NAV_TABS } from "../components/containers/app-nav";
import { Brand, DButton, Icon, OVERLAY, TileArt, useDir, type Force } from "./kit";

/*
 * The navigation of each direction (#537): own pattern, own states. None of them is the bottom bar with a sliding indicator
 * and the left rail of the app today. Every item takes the same white overlay (`OVERLAY`): hover 10%, current 15%, pressed 20%.
 */

interface NavProps {
  active: Tab;
  /** Pin a state on one item, for the States story and the captures. */
  force?: { tab: Tab; state: Force };
}

const label = (tab: (typeof NAV_TABS)[number]) => tab.label;

/** A: five square keys. Bottom row on mobile; keys in a header bar from `desktop`. The current key is pressed in. */
function NavA({ active, force }: NavProps) {
  return (
    <nav
      aria-label="Main"
      className="sticky bottom-0 z-20 order-last flex items-center gap-2 border-t-2 border-(color:--d-raised) bg-(--d-bg) p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] desktop:static desktop:order-first desktop:justify-between desktop:border-t-0 desktop:border-b-2 desktop:px-8 desktop:py-3"
    >
      <Brand className="hidden desktop:flex" />
      <div className="flex flex-1 gap-2 desktop:flex-none">
        {NAV_TABS.map((tab) => {
          const on = tab.id === active;
          return (
            <button
              key={tab.id}
              type="button"
              aria-label={tab.label}
              aria-current={on ? "page" : undefined}
              data-on={on ? "true" : undefined}
              data-force={force?.tab === tab.id ? force.state : undefined}
              className={clsx(
                "flex flex-1 cursor-pointer flex-col items-center gap-1 rounded-[3px] bg-(--d-raised) py-2 text-[0.6875rem] font-bold tracking-wider text-(color:--d-text) uppercase shadow-[0_3px_0_var(--d-shadow)]",
                "active:translate-y-[3px] active:shadow-none data-[on=true]:translate-y-[3px] data-[on=true]:shadow-none",
                "desktop:flex-none desktop:flex-row desktop:gap-2 desktop:px-4 desktop:py-2.5 desktop:text-xs",
                OVERLAY,
              )}
            >
              <Icon name={tab.icon} size="md" className={on ? "text-(--d-primary)" : undefined} />
              <span className="hidden mobile:inline">{label(tab)}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

/** B: a road with five stops. Along the bottom on mobile, across the top from `desktop`. The current stop is a bigger node with a sand ring. */
function NavB({ active, force }: NavProps) {
  return (
    <nav
      aria-label="Main"
      className="sticky bottom-0 z-20 order-last border-t-2 border-(color:--d-line) bg-(--d-bg) px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] desktop:static desktop:order-first desktop:flex desktop:items-center desktop:justify-between desktop:border-t-0 desktop:border-b-2 desktop:px-8 desktop:py-3"
    >
      <Brand className="hidden desktop:flex" />
      <div className="relative">
        {/* The road: a dashed centre line behind the nodes. */}
        <span aria-hidden className="absolute inset-x-6 top-[1.625rem] border-t-2 border-dashed border-(color:--d-line) desktop:top-1/2 desktop:-translate-y-px" />
        <div className="relative flex justify-between gap-1 desktop:gap-3">
          {NAV_TABS.map((tab) => {
            const on = tab.id === active;
            return (
              <button
                key={tab.id}
                type="button"
                aria-label={tab.label}
                aria-current={on ? "page" : undefined}
                data-on={on ? "true" : undefined}
                data-force={force?.tab === tab.id ? force.state : undefined}
                className={clsx(
                  "flex w-14 cursor-pointer flex-col items-center gap-1 rounded-2xl py-1 text-[0.6875rem] font-semibold desktop:w-auto desktop:flex-row desktop:gap-2 desktop:rounded-full desktop:py-1.5 desktop:pr-4 desktop:pl-1.5 desktop:text-xs",
                  on ? "text-(color:--d-primary)" : "text-(color:--d-text)",
                  OVERLAY,
                )}
              >
                <span
                  className={clsx(
                    "grid place-items-center rounded-full border-2 bg-(--d-surface)",
                    on ? "size-11 border-(color:--d-primary)" : "size-9 border-(color:--d-line)",
                  )}
                >
                  <Icon name={tab.icon} size="sm" />
                </span>
                <span className="hidden mobile:inline">{label(tab)}</span>
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}

/** C: a floating glass dock. A pill detached from the edges, at the bottom on mobile and standing at the left from `desktop`; the current item opens into a white pill with its name. */
function NavC({ active, force }: NavProps) {
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-30 mx-auto flex max-w-md items-center justify-between rounded-full border border-white/15 bg-white/10 p-1.5 shadow-[0_12px_40px_rgb(0_0_0/0.45)] backdrop-blur-2xl desktop:inset-x-auto desktop:top-1/2 desktop:bottom-auto desktop:left-6 desktop:mx-0 desktop:-translate-y-1/2 desktop:flex-col desktop:gap-1"
    >
      {NAV_TABS.map((tab) => {
        const on = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            aria-label={tab.label}
            title={tab.label}
            aria-current={on ? "page" : undefined}
            data-on={on ? "true" : undefined}
            data-force={force?.tab === tab.id ? force.state : undefined}
            className={clsx("flex h-12 min-w-12 cursor-pointer items-center justify-center gap-2 rounded-full px-3 text-sm font-medium text-(color:--d-text)", OVERLAY)}
          >
            <Icon name={tab.icon} size="md" className={on ? "text-(--d-primary)" : undefined} />
            {on && <span className="desktop:hidden">{label(tab)}</span>}
          </button>
        );
      })}
    </nav>
  );
}

export type { NavProps };
const NAVS = { a: NavA, b: NavB, c: NavC };

/** The direction's navigation, for the States story and the shells. */
export function DNav(props: NavProps) {
  const Nav = NAVS[useDir()];
  return <Nav {...props} />;
}

/** The blurred tile mosaic behind C: the board's own art, out of focus. */
function Mosaic() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="grid -translate-y-8 scale-125 grid-cols-4 opacity-80 blur-xl desktop:grid-cols-8">
        {Array.from({ length: 32 }, (_, i) => (
          <TileArt key={i} index={i * 5} />
        ))}
      </div>
      <div className="absolute inset-0 bg-linear-to-b from-(--d-bg)/70 via-(--d-bg)/80 to-(--d-bg)" />
    </div>
  );
}

/** A tabbed page: the navigation of the direction and a column of content. */
export function TabShell({ active, children }: { active: Tab; children: ReactNode }) {
  const d = useDir();
  return (
    <div className="relative flex min-h-dvh flex-col">
      {d === "c" && <Mosaic />}
      <DNav active={active} />
      <main
        className={clsx(
          "relative mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-4 pt-5 tablet:max-w-2xl desktop:max-w-5xl desktop:px-8 desktop:pt-8",
          d === "c" ? "pb-28 desktop:pb-10 desktop:pl-28" : "pb-6 desktop:pb-10",
        )}
      >
        {children}
      </main>
    </div>
  );
}

/** A full-screen flow (Play, the score): a top bar with Back and a title, no tabs. */
export function FlowShell({ title, children }: { title: string; children: ReactNode }) {
  const d = useDir();
  return (
    <div className="relative flex min-h-dvh flex-col">
      {d === "c" && <Mosaic />}
      <header className="relative mx-auto flex w-full max-w-md items-center gap-2 px-2 pt-3 tablet:max-w-2xl desktop:max-w-5xl desktop:px-8 desktop:pt-6">
        <DButton variant="ghost" size="icon" aria-label="Back">
          <Icon name="chevron-left" size="md" />
        </DButton>
        <h1 className="font-display text-2xl tracking-wide">{title}</h1>
      </header>
      <main className="relative mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-4 pt-4 pb-6 tablet:max-w-2xl desktop:max-w-5xl desktop:px-8 desktop:pb-10">{children}</main>
    </div>
  );
}
