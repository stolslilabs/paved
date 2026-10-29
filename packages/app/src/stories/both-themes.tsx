import type { Decorator } from "@storybook/react-vite";
import type { CSSProperties, ReactNode } from "react";

/**
 * A light theme's semantic tokens, for Storybook only (issue 870's "both themes"). The app ships one theme, dark (theme.css,
 * section 3: no light block yet), and the preview sets `data-theme="dark"` on the page. This scope redefines the shadcn tokens
 * a light block would (palette steps, the dark one's mirrored): the surfaces light, the text dark. Every colour taken from them
 * follows, so a story shows how a part renders under a light theme. The game icons keep their own light and ink (`--game-light`,
 * `--game-ink`, theme.css 3f): their light stays on top and their outline dark on either surface.
 */
const LIGHT: CSSProperties = {
  colorScheme: "light",
  ...({
    "--background": "var(--color-charcoal-50)",
    "--foreground": "var(--color-charcoal-950)",
    "--card": "var(--color-charcoal-100)",
    "--card-foreground": "var(--color-charcoal-950)",
    "--popover": "var(--color-charcoal-100)",
    "--popover-foreground": "var(--color-charcoal-950)",
    "--secondary": "var(--color-charcoal-200)",
    "--secondary-foreground": "var(--color-charcoal-950)",
    "--muted": "var(--color-charcoal-200)",
    "--muted-foreground": "var(--color-charcoal-600)",
    "--accent": "var(--color-charcoal-200)",
    "--accent-foreground": "var(--color-charcoal-950)",
    "--border": "var(--color-charcoal-300)",
    "--input": "var(--color-charcoal-400)",
  } as CSSProperties),
};

export type StoryTheme = "dark" | "light";

/** A part on a theme's surface: the app's dark tokens, or the light scope above. */
export function ThemeScope({ theme, children }: { theme: StoryTheme; children: ReactNode }) {
  return (
    <section
      aria-label={theme === "dark" ? "Dark theme" : "Light theme"}
      data-theme={theme}
      style={theme === "light" ? LIGHT : undefined}
      className="flex min-w-0 flex-col gap-2 rounded-xl bg-background p-3 text-foreground"
    >
      <h3 className="text-sm font-semibold">{theme === "dark" ? "Dark theme" : "Light theme (Storybook scope)"}</h3>
      {children}
    </section>
  );
}

/** The part twice, in the dark theme then in the light scope: stacked on a phone, side by side from `tablet`. */
export function BothThemes({ children }: { children: ReactNode }) {
  return (
    <div className="grid gap-3 tablet:grid-cols-2">
      <ThemeScope theme="dark">{children}</ThemeScope>
      <ThemeScope theme="light">{children}</ThemeScope>
    </div>
  );
}

/** A story drawn in both themes (`BothThemes`). */
export const bothThemes: Decorator = (Story) => (
  <BothThemes>
    <Story />
  </BothThemes>
);
