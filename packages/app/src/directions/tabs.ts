/**
 * The five tabs of the navigation as #537 drew them, Home · Ranks · Missions · Vault · Settings: the directions are a record
 * of that study, so they keep their own copy. The app's navigation (`containers/app-nav.tsx`) has moved on (#623: Play in
 * the centre, the ranks out).
 */
export type Tab = "home" | "ranks" | "quests" | "vault" | "settings";

export const NAV_TABS: readonly { id: Tab; label: string; icon: string }[] = [
  { id: "home", label: "Home", icon: "house" },
  { id: "ranks", label: "Ranks", icon: "ranking-star" },
  { id: "quests", label: "Missions", icon: "scroll" },
  { id: "vault", label: "Vault", icon: "piggy-bank" },
  { id: "settings", label: "Settings", icon: "gear" },
];
