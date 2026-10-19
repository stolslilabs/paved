import clsx from "clsx";
import { NAV_TABS } from "../components/containers/app-nav";
import { Brand, Icon, NOTCH, OVERLAY } from "./kit";
import type { NavProps } from "./shells";

/*
 * The navigation of D, E and F (#537, PR 1b): the mockups' bottom bar, an icon over its label, kept in all three and drawn
 * three ways. None has a sliding indicator or a left rail. Every item takes the same white overlay (`OVERLAY`): hover 10%,
 * current 15%, pressed 20%; the current item is also gold, so it does not rest on the overlay alone.
 */

function items({ active, force }: NavProps) {
  return NAV_TABS.map((tab) => ({
    tab,
    on: tab.id === active,
    props: {
      type: "button" as const,
      "aria-label": tab.label,
      "aria-current": tab.id === active ? ("page" as const) : undefined,
      "data-on": tab.id === active ? "true" : undefined,
      "data-force": force?.tab === tab.id ? force.state : undefined,
    },
  }));
}

/** D: the mockups' bar. Icon over label at the bottom; from `desktop`, icon beside label in a header with the wordmark. */
export function NavD(props: NavProps) {
  return (
    <nav
      aria-label="Main"
      className="sticky bottom-0 z-20 order-last flex items-center border-t border-(color:--d-line) bg-(--d-bg) px-2 pt-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))] desktop:static desktop:order-first desktop:justify-between desktop:border-t-0 desktop:border-b desktop:px-8 desktop:py-3"
    >
      <Brand className="hidden desktop:block" />
      <div className="flex flex-1 justify-between gap-1 desktop:flex-none desktop:gap-2">
        {items(props).map(({ tab, on, props: p }) => (
          <button
            key={tab.id}
            {...p}
            className={clsx(
              "flex min-w-0 flex-1 cursor-pointer flex-col items-center gap-1 rounded-lg px-1 py-1.5 text-xs font-medium",
              "desktop:flex-none desktop:flex-row desktop:gap-2 desktop:px-4 desktop:py-2.5 desktop:text-sm",
              on ? "text-(color:--d-primary)" : "text-(color:--d-text)",
              OVERLAY,
            )}
          >
            <Icon name={tab.icon} size="md" />
            <span className="hidden mobile:inline">{tab.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}

/** E: the same bar, and the current item stands on a base of earth, like a tile set on the table. */
export function NavE(props: NavProps) {
  return (
    <nav
      aria-label="Main"
      className="sticky bottom-0 z-20 order-last flex items-end bg-linear-to-t from-(--d-bg) from-70% to-transparent px-2 pt-4 pb-[max(0.5rem,env(safe-area-inset-bottom))] desktop:static desktop:order-first desktop:items-center desktop:justify-between desktop:bg-none desktop:px-8 desktop:pt-4 desktop:pb-5"
    >
      <Brand className="hidden desktop:block" />
      <div className="flex flex-1 items-end justify-between gap-1.5 desktop:flex-none desktop:gap-3">
        {items(props).map(({ tab, on, props: p }) => (
          <button
            key={tab.id}
            {...p}
            className={clsx(
              "flex min-w-0 flex-1 cursor-pointer flex-col items-center gap-1 rounded-xl px-1 py-2 text-xs font-semibold transition-transform",
              "desktop:flex-none desktop:flex-row desktop:gap-2 desktop:px-4 desktop:py-2.5 desktop:text-sm",
              on ? "-translate-y-1.5 bg-(--d-raised) text-(color:--d-primary) shadow-[0_6px_0_var(--d-shadow)]" : "text-(color:--d-muted)",
              OVERLAY,
            )}
          >
            <Icon name={tab.icon} size="md" />
            <span className="hidden mobile:inline">{tab.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}

/** F: a hotbar of five square slots floating over the board, bottom centre at every width. */
export function NavF(props: NavProps) {
  return (
    <nav aria-label="Main" className="sticky bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-20 order-last mx-auto flex w-full max-w-md justify-center px-3 desktop:bottom-6">
      <div className={clsx(NOTCH, "flex w-full justify-between gap-1 bg-(--d-surface) p-1.5 shadow-[inset_0_2px_0_rgb(255_255_255/0.08),inset_0_-3px_0_rgb(0_0_0/0.45)]")}>
        {items(props).map(({ tab, on, props: p }) => (
          <button
            key={tab.id}
            {...p}
            className={clsx(
              NOTCH,
              "flex aspect-square min-w-0 flex-1 cursor-pointer flex-col items-center justify-center gap-1 text-xs font-bold",
              "focus-visible:ring-inset focus-visible:ring-offset-0",
              on ? "bg-(--d-raised) text-(color:--d-primary) shadow-[inset_0_0_0_2px_var(--d-primary)]" : "bg-(--d-bg) text-(color:--d-text)",
              OVERLAY,
            )}
          >
            <Icon name={tab.icon} size="md" />
            <span className="hidden max-w-full truncate px-0.5 mobile:inline" title={tab.label}>
              {tab.label}
            </span>
          </button>
        ))}
      </div>
    </nav>
  );
}
