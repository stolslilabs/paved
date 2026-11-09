import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const ENTRY = resolve(import.meta.dirname, "../src/styles/theme.css");

/**
 * theme.css as one text, as the tests read it: its own imports (`./theme/*.css`, one file per area) inlined in their order, where
 * the entry names them. The packages' imports (`tailwindcss`, `tw-animate-css`) stay as they are.
 */
export function readThemeCss(): string {
  return readFileSync(ENTRY, "utf8").replace(/^@import "(\.\/[^"]+)";$/gm, (_, path: string) => readFileSync(resolve(dirname(ENTRY), path), "utf8"));
}
