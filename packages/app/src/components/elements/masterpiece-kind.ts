import { formatInteger, type MasterpieceKind } from "@paved/game-core";

/** The Masterpiece's kinds as the pages name them: the structure's name, its season, and what closes one. */
export const MASTERPIECE_KIND: Record<MasterpieceKind, { name: string; season: string; rule: string }> = {
  city: { name: "city", season: "Winter", rule: "A closed city: walls all round." },
  road: { name: "road", season: "Spring", rule: "A closed road, end to end." },
  wonder: { name: "crowned wonder", season: "Summer", rule: "A completed wonder and the best closed structure on its nine tiles, their points added." },
  forest: { name: "forest", season: "Autumn", rule: "A closed forest, no road along it left open." },
};

const capital = (word: string): string => word.charAt(0).toUpperCase() + word.slice(1);

/** A masterpiece in words: "City of 14". */
export const pieceName = (kind: MasterpieceKind, size: number): string => `${capital(MASTERPIECE_KIND[kind].name)} of ${formatInteger(size)}`;

/** A place in words: "212th". */
export function placeName(place: number): string {
  const tens = place % 100;
  const suffix = tens >= 11 && tens <= 13 ? "th" : (["th", "st", "nd", "rd"][place % 10] ?? "th");
  return `${formatInteger(place)}${suffix}`;
}

/** The share of the counted masterpieces a place stands in, rounded up: "Top 4%". */
export const topShare = (place: number, builders: number): string => `Top ${Math.min(100, Math.max(1, Math.ceil((place / Math.max(1, builders)) * 100)))}%`;
