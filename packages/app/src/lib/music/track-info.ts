// The tracks' titles and images (#569): the album's titles, and square WebP copies of its images in `public/music-art/`
// (`scripts/compress-music-art.ts`). Nothing here imports an image: URLs only (`music.test.ts` checks it). Not in the first
// load: the player's chunk and the settings read it. A plain module with no import: Node reads it as is, in the script.

/**
 * The tracks, in album order (`FILES` of `tracks.ts`, which a test holds to this list): the file name and the real title, as
 * the album's images name them (`packages/app/music-sources/`): "The River's Path", not the file name's "the-rivers-path".
 */
export const TRACK_LIST: readonly (readonly [file: string, title: string])[] = [
  ["00-endless-kingdom", "Endless Kingdom"],
  ["01-a-kingdom-awakens", "A Kingdom Awakens"],
  ["02-fields-of-morning-mist", "Fields of Morning Mist"],
  ["03-market-day", "Market Day"],
  ["04-the-rivers-path", "The River's Path"],
  ["05-the-wandering-minstrel", "The Wandering Minstrel"],
  ["06-beyond-the-hills", "Beyond the Hills"],
  ["07-the-old-stone-bridge", "The Old Stone Bridge"],
  ["08-harvest-dance", "Harvest Dance"],
  ["09-whispers-of-the-court", "Whispers of the Court"],
  ["10-secrets-of-the-old-kingdom", "Secrets of the Old Kingdom"],
  ["11-the-quiet-cloister", "The Quiet Cloister"],
  ["12-beneath-the-ancient-oaks", "Beneath the Ancient Oaks"],
  ["13-lanterns-at-dusk", "Lanterns at Dusk"],
  ["14-the-craftsmans-rhythm", "The Craftsman's Rhythm"],
  ["15-a-kingdom-in-bloom", "A Kingdom in Bloom"],
];

/** Where the tracks' images are served: square WebP thumbnails, one folder per size. */
export const ART_DIR = "/music-art";
/** The sizes written, in px: 128 for the player's 64 px thumbnail (2x), 512 for a lock screen. */
export const ART_SIZES = [128, 512] as const;
export type ArtSize = (typeof ART_SIZES)[number];

const TITLES = new Map(TRACK_LIST);
/** A track URL's file name, without the folder and the extension: `/music/03-market-day.m4a` is "03-market-day". */
const stem = (src: string) => decodeURIComponent(src.split(/[?#]/)[0]!.split("/").pop() ?? "").replace(/\.[^.]+$/, "");

/** A track's title: the album's, or for a file not in the list, the one `trackTitle` reads from its name. */
export function titleOf(src: string): string {
  return TITLES.get(stem(src)) ?? trackTitle(src);
}

const SMALL = new Set(["a", "an", "the", "of", "in", "at", "to", "and"]);

/**
 * A title read from a file name, the fallback of `titleOf` for a file not in `TRACK_LIST`:
 * `/music/09-whispers-of-the-court.m4a` is "Whispers of the Court". The number goes, the hyphens become spaces, the small words
 * stay lowercase (not the first). The file names carry no apostrophe: "the-rivers-path" reads "The Rivers Path", which is why
 * the album's titles are listed.
 */
export function trackTitle(src: string): string {
  const name = stem(src);
  const words = name.replace(/^\d+-?/, "").split("-").filter(Boolean);
  return words.map((w, i) => (i > 0 && SMALL.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(" ");
}

/** A track's image at a size, or null for a file not in the list (it has none). */
export function artOf(src: string, size: ArtSize): string | null {
  const name = stem(src);
  return TITLES.has(name) ? `${ART_DIR}/${size}/${name}.webp` : null;
}
