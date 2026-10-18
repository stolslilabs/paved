/**
 * The three visual directions of #537 (PR 1): Storybook proposals only, nothing here is imported by the app. Each one is a
 * palette taken from Paved's own assets (the logo and banner, the tiles' art, the 3D models), its own navigation and its own
 * card style. The interaction states are the owner's decision of 2026-10-18: white with transparency, the same on every
 * button and every nav item, whatever the direction.
 */
export type DirectionId = "a" | "b" | "c";

export interface Palette {
  /** Page. */
  bg: string;
  /** Cards. */
  surface: string;
  /** Raised parts: keys, chips, rows. */
  raised: string;
  /** Hairlines and the road markings. */
  line: string;
  text: string;
  muted: string;
  /** The one colour that says "this is the action". */
  primary: string;
  /** Text on `primary`. */
  onPrimary: string;
  /** A second voice: a score, a badge, a highlight. */
  accent: string;
  danger: string;
  /** The hard shadow under a block (A) or the page shade. */
  shadow: string;
}

/** White with transparency, for every button and nav item: hover, active or selected, pressed (the issue's example values). */
export const STATES = { hover: 0.1, active: 0.15, pressed: 0.2 } as const;

export interface Direction {
  id: DirectionId;
  name: string;
  /** One line under the name. */
  tagline: string;
  palette: Palette;
  /** The Paved assets the direction is made of, and what it takes from each. */
  assets: readonly string[];
  /** The navigation, in a sentence per width. */
  nav: { mobile: string; desktop: string };
  cards: string;
  /** Why it does not read as Cartridge. */
  notCartridge: string;
}

export const DIRECTIONS: Record<DirectionId, Direction> = {
  a: {
    id: "a",
    name: "Block",
    tagline: "The logo's extruded letters, as an interface.",
    palette: {
      bg: "#1B1112",
      surface: "#2A1A1C",
      raised: "#3F2A2D",
      line: "#5A4347",
      text: "#F5EFE2",
      muted: "#DED2C8",
      primary: "#B9B377",
      onPrimary: "#1B1112",
      accent: "#EFA894",
      danger: "#F6A798",
      shadow: "#0C0708",
    },
    assets: [
      "Logo and banner: the plum #3F2A2D and the sage #B9B377 are the two colours of the mark; the page, the cards and the action are those.",
      "The extrusion of the letters (a hard offset shadow down and to the right) is the shadow of every card and key.",
      "The terracotta roof of the tiles (#B85C4C, lightened for text) is the accent.",
    ],
    nav: {
      mobile: "A bottom row of five square keys, each with its own extrusion. The active key is pressed in: it loses its shadow and takes the white overlay.",
      desktop: "The same keys in a header bar next to the logo. No left rail.",
    },
    cards: "Square blocks (3 px radius), a 2 px plum edge and a hard 5 px shadow, like a letter of the logo. Pressing a key sinks it.",
    notCartridge:
      "Cartridge's Controller and Arcade are navy and gold, rounded and soft. This is warm plum and sage, square-cornered and extruded: the only elevation is the logo's, and nothing in it is blue or gold.",
  },
  b: {
    id: "b",
    name: "Meadow",
    tagline: "The tiles' ground and roads, as a map you walk along.",
    palette: {
      bg: "#141A0F",
      surface: "#1F2917",
      raised: "#2C3822",
      line: "#4D6040",
      text: "#F3EFD8",
      muted: "#D6DBBE",
      primary: "#E8BD76",
      onPrimary: "#1A1405",
      accent: "#F2AA97",
      danger: "#F8AC9D",
      shadow: "#0A0E07",
    },
    assets: [
      "The tiles' art: the meadow green (#A0AA5C, darkened to a night field) is the page, the road sand (#E8BD76) is the action.",
      "The road's dashed centre line is the border of every card and the line the navigation sits on.",
      "The tile images themselves headline the cards: a card is a tile.",
    ],
    nav: {
      mobile: "A road along the bottom with five stops. The current stop is a larger node with the white overlay and a sand ring.",
      desktop: "The same road across the top of the page, labels beside the stops. No left rail.",
    },
    cards: "Plates with a dashed road marking drawn inside the edge (the tile's road), a 10 px radius, a tile image as the header.",
    notCartridge:
      "A green field with a sand road has no navy and no gold. The navigation is a path, not a bar with a sliding indicator, and the cards are the board's own tiles rather than dark panels.",
  },
  c: {
    id: "c",
    name: "Clay",
    tagline: "Frosted glass over the board's tiles, in terracotta.",
    palette: {
      bg: "#1A0F0D",
      surface: "#2A1A16",
      raised: "#3A2520",
      line: "#6A4A41",
      text: "#FBF1EC",
      muted: "#F1E4DD",
      primary: "#FAC9B4",
      onPrimary: "#1F0E09",
      accent: "#A9D6EE",
      danger: "#FCBFB3",
      shadow: "#0D0605",
    },
    assets: [
      "The roofs of the 3D models and the tiles: terracotta is the action, a deep clay is the page.",
      "The tiles' art, blurred, is the background of every screen: the game's own picture behind the glass.",
      "The river of the water tiles gives the second colour (#A9D6EE, lightened for text), used sparingly.",
    ],
    nav: {
      mobile: "A floating dock, detached from the edges: five icons, the current one opens into a white-overlay pill with its label.",
      desktop: "The dock stands as a vertical pill on the left, floating, icons only (the name is the tooltip). It has no panel behind it and no indicator that slides across a bar.",
    },
    cards: "Frosted glass: white at 6% over a blur, a 1 px white 12% edge, a 24 px radius. The same white-with-transparency language as the states.",
    notCartridge:
      "Clay and glass, not navy and gold; a floating dock instead of a bar or a rail; the board's own artwork behind every screen. The colour comes from the roofs of the tiles, not from a wallet's brand.",
  },
};

export const DIRECTION_IDS = ["a", "b", "c"] as const satisfies readonly DirectionId[];

/** The notes of a direction as the Docs description of its stories: assets, navigation, cards, why it is not Cartridge. */
export function describeDirection(d: Direction): string {
  return [
    `**Direction ${d.id.toUpperCase()}: ${d.name}.** ${d.tagline} (#537, PR 1: a proposal, no page of the app uses it.)`,
    `**Assets.** ${d.assets.join(" ")}`,
    `**Navigation.** Mobile: ${d.nav.mobile} Desktop: ${d.nav.desktop}`,
    `**Cards.** ${d.cards}`,
    `**Not Cartridge.** ${d.notCartridge}`,
  ].join("\n\n");
}
