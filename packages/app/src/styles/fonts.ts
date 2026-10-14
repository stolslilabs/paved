import almendraUrl from "@fontsource/almendra/files/almendra-latin-700-normal.woff2?url";
import rubikUrl from "@fontsource-variable/rubik/files/rubik-latin-wght-normal.woff2?url";

/**
 * The font preloads (section 2.3): the fonts of the first screen, at the same hashed URLs fonts.css loads from.
 * Space Mono (numbers) is not preloaded: the browser fetches it when a number first shows.
 */
export function preloadFonts(): void {
  for (const href of [almendraUrl, rubikUrl]) {
    const link = document.createElement("link");
    Object.assign(link, { rel: "preload", as: "font", type: "font/woff2", crossOrigin: "anonymous", href });
    document.head.append(link);
  }
}
