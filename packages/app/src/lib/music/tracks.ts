// The music playlist (P-81): the files of `public/music/`, served as they are and streamed by an `<audio>` element. Nothing
// here imports a track: a `.m4a` in the bundle would put 4 to 8 MB in the build (`music.test.ts` checks that none is).

/** Where the tracks are served: the app's `public/music/`, at the root of the site. */
export const MUSIC_DIR = "/music";

/** The files, in album order. Lowercase, hyphens, no spaces: URL-safe as they are. */
const FILES = [
  "00-endless-kingdom",
  "01-a-kingdom-awakens",
  "02-fields-of-morning-mist",
  "03-market-day",
  "04-the-rivers-path",
  "05-the-wandering-minstrel",
  "06-beyond-the-hills",
  "07-the-old-stone-bridge",
  "08-harvest-dance",
  "09-whispers-of-the-court",
  "10-secrets-of-the-old-kingdom",
  "11-the-quiet-cloister",
  "12-beneath-the-ancient-oaks",
  "13-lanterns-at-dusk",
  "14-the-craftsmans-rhythm",
  "15-a-kingdom-in-bloom",
] as const;

export const TRACKS: readonly string[] = FILES.map((f) => `${MUSIC_DIR}/${f}.m4a`);

const SMALL = new Set(["a", "an", "the", "of", "in", "at", "to", "and"]);

/**
 * A track's title from its file name: `/music/09-whispers-of-the-court.m4a` is "Whispers of the Court". The number goes, the
 * hyphens become spaces, the small words stay lowercase (not the first). The file names carry no apostrophe: "the-rivers-path"
 * reads "The Rivers Path".
 */
export function trackTitle(src: string): string {
  const name = decodeURIComponent(src.split(/[?#]/)[0]!.split("/").pop() ?? "").replace(/\.[^.]+$/, "");
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
