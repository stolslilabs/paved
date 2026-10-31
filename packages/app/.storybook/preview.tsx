import type { Decorator, Preview } from "@storybook/react-vite";
import { QueryClient, QueryClientProvider, type QueryKey } from "@tanstack/react-query";
import { LazyMotion, MotionConfig, domMax } from "motion/react";
import { useState } from "react";
import { MemoryRouter } from "react-router";
import "../src/styles/fonts.css";
import { preloadFonts } from "../src/styles/fonts";
import "../src/styles/theme.css";
import { VIEWPORT_OPTIONS } from "../src/components/scenes/viewports";
import { board } from "../src/styles/tokens";
import { provideManifest } from "@paved/renderer";
import { APP_ASSETS, APP_MANIFEST } from "../src/mocks/assets";
import { ProfileProvider, type ProfileValue } from "../src/components/containers/profile-context";
import { AudioProvider } from "../src/components/containers/audio-provider";

// Dark only: the `dark:` variant of shadcn's components needs this on <html> (F1's correction to section 2.2).
document.documentElement.dataset.theme = "dark";

preloadFonts();

// The renderer's manifest for the app's assets: Storybook serves `renderer-assets/` without one, so the stories at
// `APP_ASSETS` get the app's (`APP_MANIFEST`) before any scene asks, and load the app's compressed models (LOAD-FAST).
provideManifest(APP_ASSETS, Promise.resolve(APP_MANIFEST));

/** Query data a story seeds: `parameters.queryFixtures = [[queryKey, data], ...]`. */
type QueryFixtures = ReadonlyArray<readonly [QueryKey, unknown]>;

declare module "storybook/internal/csf" {
  interface Parameters {
    queryFixtures?: QueryFixtures;
    /** The route a story starts at (a MemoryRouter entry). */
    route?: string;
    /**
     * The story mounts its own data router (`createMemoryRouter`, for a page that reads its route's `handle`): the preview's
     * MemoryRouter is left out, as a router cannot be rendered inside another.
     */
    ownRouter?: boolean;
    /** `MotionConfig reducedMotion` for the story: "never" (off), "always" (on), or the OS setting ("user", the default). */
    reducedMotion?: "user" | "never" | "always";
    /** Who the menu screens' avatar shows (`ProfileProvider`, #624); none drawn when omitted. */
    profile?: ProfileValue;
    /**
     * The sound effects' volume, 0 to 1 (`AudioProvider`, no music): the story plays its sounds after a first tap in the canvas
     * (the browser's autoplay rule), as the app does. Silent when omitted.
     */
    sfx?: number;
  }
}

/** A fresh client per story, seeded and never refetching: a story shows its fixtures, not a network. */
function Providers({
  fixtures,
  route,
  ownRouter,
  reducedMotion,
  profile,
  sfx,
  children,
}: {
  fixtures: QueryFixtures;
  route: string;
  ownRouter?: boolean;
  reducedMotion: "user" | "never" | "always";
  profile?: ProfileValue;
  sfx?: number;
  children: React.ReactNode;
}) {
  const [client] = useState(() => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, refetchOnWindowFocus: false } } });
    for (const [key, data] of fixtures) qc.setQueryData(key, data);
    return qc;
  });
  const story = (
    // Sync `domMax` (layout animation included): stories use `m` and `motion` alike.
    <LazyMotion features={domMax}>
      <MotionConfig reducedMotion={reducedMotion}>
        <WithSfx volume={sfx}>{profile ? <ProfileProvider value={profile}>{children}</ProfileProvider> : children}</WithSfx>
      </MotionConfig>
    </LazyMotion>
  );
  return <QueryClientProvider client={client}>{ownRouter ? story : <MemoryRouter initialEntries={[route]}>{story}</MemoryRouter>}</QueryClientProvider>;
}

/** The sound effects for a story that asks for them (`parameters.sfx`), the music off and no playlist. */
const NO_TRACKS: readonly string[] = [];
function WithSfx({ volume, children }: { volume?: number; children: React.ReactNode }) {
  return volume === undefined ? children : (
    <AudioProvider musicVolume={0} sfxVolume={volume} tracks={NO_TRACKS}>
      {children}
    </AudioProvider>
  );
}

const withProviders: Decorator = (Story, { parameters }) => (
  <Providers fixtures={parameters.queryFixtures ?? []} route={parameters.route ?? "/"} ownRouter={parameters.ownRouter} reducedMotion={parameters.reducedMotion ?? "user"} profile={parameters.profile} sfx={parameters.sfx}>
    <Story />
  </Providers>
);

/** The Controls panel edits an object arg as JSON, and `JSON.stringify` throws on a BigInt: the whole panel then fails. The mocks carry token amounts as BigInt, so their rows are read-only. */
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
  decorators: [withProviders],
  argTypesEnhancers: [noControlForBigInt],
  initialGlobals: { backgrounds: { value: "board" } },
  parameters: {
    layout: "fullscreen",
    // The board's colour is the only background (spec A).
    backgrounds: { options: { board: { name: "Board", value: board().hex } } },
    // Storybook's own toolbar is the only width control: no default, so a story takes the full width; the theme's four breakpoints
    // are the options (`Foundations/Breakpoints` pins them).
    viewport: { options: VIEWPORT_OPTIONS },
    controls: { matchers: { color: /(background|color)$/i } },
    // The tiers top down first, then the other sections; the rest keeps the order the stories load in (`main.ts`), sections
    // and stories alike. A plain object: Storybook reads it without running the preview.
    options: { storySort: { order: ["Scenes", "Containers", "Elements", "UI"] } },
  },
};

export default preview;
