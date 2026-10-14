import { NavLink, Outlet } from "react-router";
import * as m from "motion/react-m";
import { TABS } from "./pages";

/** Full-screen flows (welcome, play, purchase, board, over): no tabs. Their top bar comes with P1. */
export function FullScreenLayout() {
  return (
    <main className="min-h-dvh bg-background text-foreground">
      <Outlet />
    </main>
  );
}

/**
 * The shell with the five-tab bottom navigation (section 6.2). A placeholder: the sliding indicator, the
 * icons and the desktop rail are P1. The bar fades in with Motion, which proves the lazy feature set loads.
 */
export function ShellLayout() {
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <main className="flex-1 pb-16">
        <Outlet />
      </main>
      <m.nav
        aria-label="Main"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="fixed inset-x-0 bottom-0 flex border-t border-border bg-card pb-[env(safe-area-inset-bottom)]"
      >
        {TABS.map((tab) => (
          <NavLink
            key={tab.id}
            to={tab.to}
            end={tab.to === "/"}
            className={({ isActive }) =>
              `flex-1 py-3 text-center text-xs mobile:text-sm ${isActive ? "text-primary" : "text-muted-foreground"}`
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </m.nav>
    </div>
  );
}
