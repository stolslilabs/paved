import cinzelUrl from "@fontsource/cinzel/files/cinzel-latin-700-normal.woff2?url";
import nunitoUrl from "@fontsource-variable/nunito-sans/files/nunito-sans-latin-wght-normal.woff2?url";

/**
 * The font preloads (section 2.3): the fonts of the first screen, at the same hashed URLs fonts.css loads from.
 * IBM Plex Mono (numbers) is not preloaded: the browser fetches it when a number first shows.
 */
export function preloadFonts(): void {
  for (const href of [cinzelUrl, nunitoUrl]) {
    const link = document.createElement("link");
    Object.assign(link, { rel: "preload", as: "font", type: "font/woff2", crossOrigin: "anonymous", href });
    document.head.append(link);
  }
}
