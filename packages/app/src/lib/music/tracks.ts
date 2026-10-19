// The music playlist (P-81): the files of `public/music/`, served as they are and streamed by an `<audio>` element, and their
// images (#569), small WebP copies in `public/music-art/`. Nothing here imports a track or an image: a `.m4a` in the bundle
// would put 4 to 8 MB in the build (`music.test.ts` checks that none is). A plain module with no import: Node reads it as is,
// in `scripts/compress-music-art.ts`.

/** Where the tracks are served: the app's `public/music/`, at the root of the site. */
export const MUSIC_DIR = "/music";

/**
 * The tracks, in album order: the file name (lowercase, hyphens, no spaces: URL-safe as it is) and the real title, as the
 * album's images name them (`asset-sources/music/`): "The River's Path", not the file name's "the-rivers-path".
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

const FILES = TRACK_LIST.map(([file]) => file);

export const TRACKS: readonly string[] = FILES.map((f) => `${MUSIC_DIR}/${f}.m4a`);

/** Where the tracks' images are served: square WebP thumbnails, one folder per size (`scripts/compress-music-art.ts`). */
export const ART_DIR = "/music-art";
/** The sizes written, in px: 128 for the player's 64 px thumbnail (2x), 512 for a lock screen. */
export const ART_SIZES = [128, 512] as const;
export type ArtSize = (typeof ART_SIZES)[number];

/** A track URL's file name, without the folder and the extension: `/music/03-market-day.m4a` is "03-market-day". */
const stem = (src: string) => decodeURIComponent(src.split(/[?#]/)[0]!.split("/").pop() ?? "").replace(/\.[^.]+$/, "");
const TITLES = new Map(TRACK_LIST);

/** A track's title: the album's, or for a file not in the list, the one `trackTitle` reads from its name. */
export function titleOf(src: string): string {
  return TITLES.get(stem(src)) ?? trackTitle(src);
}

/** A track's image at a size, or null for a file not in the list (it has none). A URL only: nothing is imported. */
export function artOf(src: string, size: ArtSize): string | null {
  const name = stem(src);
  return TITLES.has(name) ? `${ART_DIR}/${size}/${name}.webp` : null;
}

const SMALL = new Set(["a", "an", "the", "of", "in", "at", "to", "and"]);

/**
 * A title read from a file name, the fallback of `titleOf` for a file not in `TRACK_LIST`: `/music/09-whispers-of-the-court.m4a`
 * is "Whispers of the Court". The number goes, the hyphens become spaces, the small words stay lowercase (not the first). The
 * file names carry no apostrophe: "the-rivers-path" reads "The Rivers Path", which is why the list carries the real titles.
 */
export function trackTitle(src: string): string {
  const name = stem(src);
  const words = name.replace(/^\d+-?/, "").split("-").filter(Boolean);
  return words.map((w, i) => (i > 0 && SMALL.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(" ");
}

/**
 * A shuffled playlist with no immediate repeat: every track once in a random order (a Fisher-Yates pass), then a new pass whose
 * first track is never the last one played. `random` is `Math.random`'s kind, in [0, 1).
 */
export function createShuffle(count: number, random: () => number = Math.random): () => number {
  let queue: number[] = [];
  let last = -1;
  const refill = () => {
    queue = Array.from({ length: count }, (_, i) => i);
    for (let i = count - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [queue[i], queue[j]] = [queue[j]!, queue[i]!];
    }
    // The queue is read from the end: its next track must not be the one just played.
    if (count > 1 && queue[count - 1] === last) [queue[count - 1], queue[0]] = [queue[0]!, queue[count - 1]!];
  };
  return () => {
    if (count <= 0) return -1;
    if (queue.length === 0) refill();
    last = queue.pop()!;
    return last;
  };
}
