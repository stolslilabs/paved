import type { PlayerRecords, PlayerRecordSpan, SeasonStanding, StructureRecord } from "../components/containers/profile-sheet";

// The profile's Hall of Fame and Stats (PROFILE-PAGE): the stories' and, until the indexer sums them, the app's
// (`data/player-records.ts`, the owner's ask of 2026-11-04). A module apart from `scenes.ts`, so the profile's chunk carries these alone.
// A long-time player's figures, at the sizes the owner set to stress the page (2026-11-04): about a thousand structures closed, best
// closings near 10,000 points, more than a million points in all.

/**
 * The profile's Hall of Fame (PROFILE-PAGE): six seasons, a climb to Grand Master (5,320 crowns, the widest) and back down, the sixth
 * under way in Bronze II (the PvP mock's league).
 */
export const HALL_OF_FAME = [
  { season: 1, league: 0, crowns: 180 },
  { season: 2, league: 3, crowns: 960 },
  { season: 3, league: 8, crowns: 2_140 },
  { season: 4, league: 22, crowns: 5_320 },
  { season: 5, league: 18, crowns: 3_870 },
  { season: 6, league: 5, crowns: 1_240 },
] satisfies SeasonStanding[];

/** A span's records from its structure types: their sums, the best closing among them. */
const span = (structures: StructureRecord[]): PlayerRecordSpan => ({
  points: structures.reduce((sum, s) => sum + s.points, 0),
  best: Math.max(...structures.map((s) => s.best)),
  closed: structures.reduce((sum, s) => sum + s.closed, 0),
  structures,
});

/** One season's four types, in the Stats' order: City, Road, Forest, Wonder, each `[points, best, closed]`. */
const season = (...[city, road, forest, wonder]: [number, number, number][]): PlayerRecordSpan =>
  span(
    (["City", "Road", "Forest", "Wonder"] as const).map((category, i) => {
      const [points, best, closed] = [city, road, forest, wonder][i]!;
      return { category, points, best, closed };
    }),
  );

const SEASONS = {
  1: season([38_200, 2_140, 24], [21_500, 980, 36], [19_800, 1_650, 18], [9_000, 3_000, 6]),
  2: season([64_900, 3_880, 41], [33_700, 1_420, 52], [41_200, 2_760, 30], [18_500, 4_500, 11]),
  3: season([81_300, 5_210, 49], [45_600, 2_050, 68], [52_900, 3_940, 41], [27_000, 6_200, 17]),
  4: season([112_640, 9_840, 63], [61_200, 4_260, 88], [70_350, 7_120, 57], [41_000, 9_500, 42]),
  5: season([96_720, 7_460, 58], [52_400, 3_180, 79], [58_100, 5_330, 52], [33_500, 8_100, 36]),
  6: season([118_720, 8_950, 77], [54_500, 3_540, 98], [59_400, 6_010, 70], [36_500, 8_700, 71]),
};

/** All time: the seasons' types summed, each best the best of its seasons (1,248,630 points, 1,184 closed). */
const allTime = span(
  SEASONS[1].structures.map(({ category }, i) => {
    const of = Object.values(SEASONS).map((s) => s.structures[i]!);
    return { category, points: of.reduce((sum, s) => sum + s.points, 0), best: Math.max(...of.map((s) => s.best)), closed: of.reduce((sum, s) => sum + s.closed, 0) };
  }),
);

/** The profile's Stats (PROFILE-PAGE): season 6 under way, the five before it, and all time. */
export const RECORDS = { season: 6, seasons: SEASONS, allTime } satisfies PlayerRecords;
