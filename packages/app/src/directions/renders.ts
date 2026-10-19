/**
 * The images of Direction/D, E and F (#537, PR 1b): renders of the real board, tiles and wordmark, drawn once by
 * `scripts/direction-renders.ts` and committed beside this file. Only the direction stories import them, so Vite emits them in the
 * Storybook's build and never in the app's; nothing is fetched at run time.
 */
import wordmark from "./renders/wordmark.webp";
import heroTall from "./renders/hero-tall.webp";
import heroWide from "./renders/hero-wide.webp";
import hudTall from "./renders/hud-tall.webp";
import hudWide from "./renders/hud-wide.webp";
import scoreWide from "./renders/score-wide.webp";
import modeChallenge from "./renders/mode-challenge.webp";
import modeTraining from "./renders/mode-training.webp";
import modeTutorial from "./renders/mode-tutorial.webp";
import theme0 from "./renders/theme-0.webp";
import theme1 from "./renders/theme-1.webp";

export const RENDERS = {
  /** The voxel wordmark, 1400 x 400, transparent. */
  wordmark,
  /** Home's hero, the 72-tile game: 750 x 1000 (phones) and 1600 x 800 (wide). */
  heroTall,
  heroWide,
  /** The 38-tile game in play, its free slots and the tile in hand: 750 x 1624 and 1440 x 900. */
  hudTall,
  hudWide,
  /** The finished 38-tile game, 1200 x 560. */
  scoreWide,
  /** The mode cards, 640 x 400. */
  modeChallenge,
  modeTraining,
  modeTutorial,
  /** The tile themes, four tiles each, 480 x 360: the base models and Forest. */
  theme0,
  theme1,
} as const;

/** The single tiles (Forest, 320 x 320, transparent), by plan key. */
const TILE_FILES = import.meta.glob<string>("./renders/tile-*.webp", { eager: true, import: "default" });
export const TILE_RENDERS: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(TILE_FILES).map(([path, url]) => [/tile-([a-z]{9})\.webp$/.exec(path)![1]!, url]),
);

/** A tile's render by plan key. */
export const tileRender = (key: string): string => TILE_RENDERS[key] ?? TILE_RENDERS.cccccfrfc!;

/** The tiles the screens show, with what a player reads of them (the categories of `elements/category.tsx`). */
export const TILES = {
  city: { key: "ccccccccc", name: "City", hint: "A walled city on every side." },
  cityRoad: { key: "cccccfrfc", name: "City + Road", hint: "A city with a road out through its gate." },
  road: { key: "rfrfffffr", name: "Road", hint: "A road bending through the forest." },
  wonder: { key: "wffffffff", name: "Wonder", hint: "A wonder in a forest clearing." },
  stop: { key: "sfrfrfrfr", name: "Crossroads", hint: "A stop where roads meet." },
  straight: { key: "rfffrfffr", name: "Straight road", hint: "A road straight across." },
  forest: { key: "ffcfffcff", name: "Forest + City", hint: "Forest between two city walls." },
} as const;
