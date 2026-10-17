/**
 * The folders Storybook copies into `storybook-static/` (`staticDirs` in `.storybook/main.ts`), and the check that no two of
 * them write one folder: the copies run at once, and two of them creating the same directory raced on `mkdir` (`EEXIST`,
 * three CI failures). Node 24 runs it as is; `build-storybook` runs it first.
 *
 *   node scripts/storybook-static-dirs.ts
 */
import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** A static dir: a folder, or a folder with the path it is served at. Relative paths are read from `.storybook/`. */
export type StaticDir = string | { from: string; to: string };

const HERE = dirname(fileURLToPath(import.meta.url));
export const CONFIG_DIR = resolve(HERE, "../.storybook");

/**
 * The app's `public/` at the root of the Storybook (the Font Awesome scripts, `renderer-assets/`: hashed models and 256 px
 * tiles), and the app's `asset-sources/` at a path of its own (plain models, original tile images, the Draco decoder): see
 * `src/mocks/assets.ts`.
 */
export const STATIC_DIRS: StaticDir[] = ["../public", { from: "../asset-sources", to: "/asset-sources" }];

/** The directories one static dir creates under `storybook-static/`, as `/`-separated paths from its root (never the root). */
export function writtenDirs(dir: StaticDir, configDir = CONFIG_DIR): string[] {
  const from = resolve(configDir, typeof dir === "string" ? dir : dir.from);
  const to = (typeof dir === "string" ? "/" : dir.to).split("/").filter(Boolean);
  const out = new Set<string>();
  // Each directory of the destination path: `to: "/a/b"` creates `/a` and `/a/b`.
  for (let i = 1; i <= to.length; i++) out.add(`/${to.slice(0, i).join("/")}`);
  const walk = (folder: string, prefix: string[]) => {
    for (const name of readdirSync(folder)) {
      const full = join(folder, name);
      if (!statSync(full).isDirectory()) continue;
      const path = [...prefix, name];
      out.add(`/${path.join("/")}`);
      walk(full, path);
    }
  };
  if (existsSync(from)) walk(from, to);
  return [...out].sort();
}

/** Every directory that two or more static dirs create, with the entries (by index) that do. Empty when the copies are apart. */
export function sharedDirs(dirs: StaticDir[], configDir = CONFIG_DIR): string[] {
  const owners = new Map<string, number[]>();
  dirs.forEach((dir, i) => {
    for (const path of writtenDirs(dir, configDir)) owners.set(path, [...(owners.get(path) ?? []), i]);
  });
  return [...owners].filter(([, who]) => who.length > 1).map(([path, who]) => `${path} (static dirs ${who.join(" and ")})`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const shared = sharedDirs(STATIC_DIRS);
  if (shared.length > 0) {
    console.error(`Two static dirs write the same folder of storybook-static:\n${shared.map((p) => `  - ${p}`).join("\n")}`);
    process.exit(1);
  }
  console.log(`The ${STATIC_DIRS.length} static dirs write no folder in common.`);
}
