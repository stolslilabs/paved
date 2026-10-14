import type { Decorator, Preview } from "@storybook/react-vite";
import { QueryClient, QueryClientProvider, type QueryKey } from "@tanstack/react-query";
import { LazyMotion, MotionConfig, domMax } from "motion/react";
import { useState } from "react";
import { MemoryRouter } from "react-router";
import "../src/styles/fonts.css";
import { preloadFonts } from "../src/styles/fonts";
import "../src/styles/theme.css";
import { board } from "../src/styles/tokens";

// Dark only: the `dark:` variant of shadcn's components needs this on <html> (F1's correction to section 2.2).
document.documentElement.dataset.theme = "dark";

preloadFonts();

/** Query data a story seeds: `parameters.queryFixtures = [[queryKey, data], ...]`. */
type QueryFixtures = ReadonlyArray<readonly [QueryKey, unknown]>;

declare module "storybook/internal/csf" {
  interface Parameters {
    queryFixtures?: QueryFixtures;
    /** The route a story starts at (a MemoryRouter entry). */
    route?: string;
  }
}

/** A fresh client per story, seeded and never refetching: a story shows its fixtures, not a network. */
function Providers({ fixtures, route, children }: { fixtures: QueryFixtures; route: string; children: React.ReactNode }) {
  const [client] = useState(() => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, refetchOnWindowFocus: false } } });
    for (const [key, data] of fixtures) qc.setQueryData(key, data);
    return qc;
  });
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[route]}>
        {/* Sync `domMax` (layout animation included): stories use `m` and `motion` alike. */}
        <LazyMotion features={domMax}>
          <MotionConfig reducedMotion="user">{children}</MotionConfig>
        </LazyMotion>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const withProviders: Decorator = (Story, { parameters }) => (
  <Providers fixtures={parameters.queryFixtures ?? []} route={parameters.route ?? "/"}>
    <Story />
  </Providers>
);

const preview: Preview = {
  decorators: [withProviders],
  initialGlobals: { backgrounds: { value: "board" } },
  parameters: {
    layout: "fullscreen",
    // The board's colour is the only background (spec A).
    backgrounds: { options: { board: { name: "Board", value: board().hex } } },
    // The named breakpoints of theme.css (section 3.4), as the Storybook viewports.
    viewport: {
      options: {
        mobile: { name: "mobile 360", styles: { width: "360px", height: "740px" }, type: "mobile" },
        tablet: { name: "tablet 640", styles: { width: "640px", height: "900px" }, type: "tablet" },
        desktop: { name: "desktop 1024", styles: { width: "1024px", height: "768px" }, type: "desktop" },
        wide: { name: "wide 1440", styles: { width: "1440px", height: "900px" }, type: "desktop" },
      },
    },
    controls: { matchers: { color: /(background|color)$/i } },
  },
};

export default preview;
