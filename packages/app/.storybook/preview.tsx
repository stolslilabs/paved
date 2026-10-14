import type { Decorator, Preview } from "@storybook/react-vite";
import { QueryClient, QueryClientProvider, type QueryKey } from "@tanstack/react-query";
import { LazyMotion, MotionConfig, domMax } from "motion/react";
import { useEffect, useState } from "react";
import { MemoryRouter } from "react-router";
import { useGlobals } from "storybook/preview-api";
import "../src/styles/fonts.css";
import { preloadFonts } from "../src/styles/fonts";
import "../src/styles/theme.css";
import { DEFAULT_VIEWPORT, TOOLBAR_KEY, TOOLBAR_VIEWPORTS, VIEWPORT_LABELS, VIEWPORT_NAMES, frameOf, isFramed, syncViewportGlobal, type ViewportGlobal, type ViewportName } from "../src/components/scenes/viewports";
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
    /** `MotionConfig reducedMotion` for the story: "never" (off), "always" (on), or the OS setting ("user", the default). */
    reducedMotion?: "user" | "never" | "always";
    /** Whether the story is framed at the `viewport` arg's width. Default: scenes and containers (by title) yes, the rest no. */
    viewportFrame?: boolean;
  }
}

/** A fresh client per story, seeded and never refetching: a story shows its fixtures, not a network. */
function Providers({ fixtures, route, reducedMotion, children }: { fixtures: QueryFixtures; route: string; reducedMotion: "user" | "never" | "always"; children: React.ReactNode }) {
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
          <MotionConfig reducedMotion={reducedMotion}>{children}</MotionConfig>
        </LazyMotion>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const withProviders: Decorator = (Story, { parameters }) => (
  <Providers fixtures={parameters.queryFixtures ?? []} route={parameters.route ?? "/"} reducedMotion={parameters.reducedMotion ?? "user"}>
    <Story />
  </Providers>
);

/**
 * Frames a scene or container (see `isFramed`) at the `viewport` arg's width and height, and strips the arg from every
 * story's args so that no component gets it as a prop.
 * Media queries read the iframe, not the frame: in the Storybook UI the Viewport addon resizes the iframe, so the decorator
 * keeps the toolbar's global in step with the arg (`syncViewportGlobal` has the rule: the radio wins, and the global is
 * given back on an unframed story). Opened alone, the window has to be that wide.
 */
let viewportGlobalOwned = false;
const withViewport: Decorator = (Story, { args, title, parameters, viewMode, initialGlobals }) => {
  const { viewport = DEFAULT_VIEWPORT, ...props } = args as typeof args & { viewport?: ViewportName };
  const [globals, updateGlobals] = useGlobals();
  const name = viewport in TOOLBAR_KEY ? viewport : DEFAULT_VIEWPORT;
  const frame = frameOf(name);
  const framed = isFramed(title, parameters.viewportFrame);
  const current = globals.viewport as ViewportGlobal;
  useEffect(() => {
    if (viewMode !== "story") return;
    const step = syncViewportGlobal({ framed, viewport: name, current, initial: initialGlobals?.viewport as ViewportGlobal, owned: viewportGlobalOwned });
    viewportGlobalOwned = step.owned;
    if (step.set) updateGlobals({ viewport: step.set });
  }, [framed, viewMode, name, current?.value, current?.isRotated]);
  if (!framed) return <Story args={props} />;
  return (
    // `transform`: a transformed box holds the `fixed` bars (the nav, the HUD) inside the frame.
    <div data-viewport-frame={name} className="mx-auto max-w-full overflow-auto" style={{ width: frame.width, height: frame.height, transform: "translateZ(0)" }}>
      <Story args={props} />
    </div>
  );
};

/** The Controls panel edits an object arg as JSON, and `JSON.stringify` throws on a BigInt: the whole panel, the Viewport radio with it, then fails. The mocks carry token amounts as BigInt, so their rows are read-only. */
const isJsonSafe = (value: unknown) => {
  try {
    JSON.stringify(value);
    return true;
  } catch {
    return false;
  }
};
const noControlForBigInt: NonNullable<Preview["argTypesEnhancers"]>[number] = ({ argTypes, initialArgs }) =>
  Object.fromEntries(Object.entries(argTypes).map(([name, type]) => [name, isJsonSafe(initialArgs?.[name]) ? type : { ...type, control: false }]));

const preview: Preview = {
  decorators: [withProviders, withViewport],
  argTypesEnhancers: [noControlForBigInt],
  args: { viewport: DEFAULT_VIEWPORT },
  argTypes: {
    viewport: {
      name: "Viewport",
      description: "The width the scene or container is told at (scenes and containers only).",
      control: { type: "radio", labels: VIEWPORT_LABELS },
      options: VIEWPORT_NAMES,
      table: { category: "Frame" },
    },
  },
  initialGlobals: { backgrounds: { value: "board" } },
  parameters: {
    layout: "fullscreen",
    // The board's colour is the only background (spec A).
    backgrounds: { options: { board: { name: "Board", value: board().hex } } },
    // The theme's four breakpoints, under their own names (`Foundations/Breakpoints` pins them); the `viewport` arg maps onto them.
    viewport: {
      options: Object.fromEntries(Object.entries(TOOLBAR_VIEWPORTS).map(([k, v]) => [k, { name: v.name, styles: { width: `${v.width}px`, height: `${v.height}px` }, type: v.type }])),
    },
    controls: { matchers: { color: /(background|color)$/i } },
  },
};

export default preview;
