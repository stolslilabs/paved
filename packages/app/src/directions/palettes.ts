/**
 * The visual directions of #537: Storybook proposals only, nothing here is imported by the app. PR 1 gave A, B and C, each a
 * palette taken from Paved's own assets (the logo and banner, the tiles' art, the 3D models), its own navigation and its own
 * card style; none was picked and they stay as a record. PR 1b gives D, E and F, derived from the owner's mockups
 * (`app/docs/mockup-01.png`, `mockup-02.png`): charcoal with gold as the one action colour, renders of the real board and tiles,
 * the voxel wordmark. They differ by how far they go from the mockups, not by their palette. The interaction states are the
 * owner's decision of 2026-10-18: white with transparency, the same on every button and every nav item, whatever the direction.
 */
export type DirectionId = "a" | "b" | "c" | "d" | "e" | "f";

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
  /** D, E and F: how far the direction goes from the mockups, and what it keeps of them. */
  mockups?: string;
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
      muted: "#F8EFEA",
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
  d: {
    id: "d",
    name: "Mockup",
    tagline: "The owner's mockups, built as they are drawn.",
    mockups:
      "Faithful. Kept from the mockups: the charcoal page, one gold for every action, the voxel wordmark over a hero image on Home, the mode list with a render on the left of each row, the HUD with the tiles left and the score in two boxes, the hand panel as a card (the tile's render, Rotate under it, Place and Discard beside it), the score screen's banner and its category rows, the grouped Settings. Changed: the switches are gold, not green, so gold stays the one action colour. Left out: the characters (D-18) and the phone frames.",
    palette: {
      bg: "#121316",
      surface: "#1C1E22",
      raised: "#2A2D33",
      line: "#363941",
      text: "#F4F1EA",
      muted: "#CDCFD4",
      primary: "#F5C451",
      onPrimary: "#1B1403",
      accent: "#8FD16A",
      danger: "#F4A391",
      shadow: "#08090A",
    },
    assets: [
      "The voxel wordmark: the banner's own letters (assets/banner.svg) read on their block grid and built as stone blocks with grass on their tops, drawn with three.js.",
      "The renders: the bench's recorded 72- and 38-tile games and single tiles through the board's own renderer (GameScene, the mockup look, the Forest variants), keyed onto the page.",
      "The categories' icons (city, road, tree, landmark-dome) as the over screen names them today.",
    ],
    nav: {
      mobile: "A bottom bar of five items, each an icon over its label, as the mockups draw it. The current item is gold on a white 15% tile; no bar slides between items.",
      desktop: "The same five items, icon beside label, in a header next to the voxel wordmark. No left rail.",
    },
    cards: "Rounded 12 px charcoal cards with a hairline edge, led by an image: a render on the left of a row, or as a banner across the top. Lists are grouped into one card with dividers, as in the mockups' Settings.",
    notCartridge:
      "What carries Paved here is the picture, not the palette: every screen shows the real board or a real tile, and the name is the voxel wordmark, which no wallet or arcade has. The page is a neutral charcoal, not navy; the navigation has no sliding indicator and no rail.",
  },
  e: {
    id: "e",
    name: "Diorama",
    tagline: "Every card a tile, standing on the table.",
    mockups:
      "Reinterpreted. Kept: charcoal and gold, the renders everywhere, the wordmark, the bottom bar with icon and label, the hand card, the category rows. Changed: a card is drawn as a tile is, a top and a band of earth under it (the side of the 3D tile), and the renders stand on the cards, breaking out of the frame, instead of sitting in boxes. The hero is a board floating under a warm lamp rather than a full-bleed picture.",
    palette: {
      bg: "#15130F",
      surface: "#221F19",
      raised: "#2F2B23",
      line: "#413A30",
      text: "#F7F0E3",
      muted: "#D8CEBA",
      primary: "#EDB743",
      onPrimary: "#1D1404",
      accent: "#A9CC7C",
      danger: "#F2A68E",
      shadow: "#4A3420",
    },
    assets: [
      "The side of the 3D tile (the earth band under its grass, about #4A3420 here) is the edge of every card and the base of the current nav item.",
      "The renders stand on the cards: the tiles keyed from their backdrop, so a city or a road sits on the card as on the board.",
      "The voxel wordmark, small, in the header; the warm key light of the board's look is the glow behind the hero.",
    ],
    nav: {
      mobile: "A bottom bar of five items, icon over label. The current item rises: it stands on a base of earth, like a tile set on the table, and takes the white 15% overlay.",
      desktop: "The same items in a header with the wordmark; the current one stands on its base. No left rail.",
    },
    cards: "Plinths: a warm charcoal top, 14 px corners, and a 6 px band of earth under it. A render may overhang the top edge. Pressing a plinth sinks it into its band.",
    notCartridge:
      "Cartridge's cards are flat dark panels; these are blocks with an earth side, the board's own material. The colours are a warm charcoal, earth and moss from the tiles, with gold for actions only, and the screens are built around the renders of the tiles.",
  },
  f: {
    id: "f",
    name: "Realm",
    tagline: "The board is the screen; the interface is a hotbar over it.",
    mockups:
      "Bolder. Kept: charcoal and gold, the real board behind everything, the wordmark, the bottom navigation with icon and label, the hand card, the score with its categories. Changed: the board fills each screen edge to edge and the interface floats over it as slabs with notched corners (the banner's letters are notched the same way); the navigation is a game's hotbar of square slots; the figures are set large in the display font.",
    palette: {
      bg: "#0C0D0F",
      surface: "#17181B",
      raised: "#25272C",
      line: "#3B3E45",
      text: "#FFFFFF",
      muted: "#C9CBD1",
      primary: "#FFC93C",
      onPrimary: "#1A1300",
      accent: "#F4A884",
      danger: "#FF9F8C",
      shadow: "#000000",
    },
    assets: [
      "The board: the recorded games through the board's own renderer, full bleed behind every screen, under a dark veil where the text sits.",
      "The notched corner of the banner's letters (assets/banner.svg) is the corner of every slab, slot and button.",
      "The voxel wordmark, large on Home; the roofs' terracotta (lightened) is the second voice for figures.",
    ],
    nav: {
      mobile: "A hotbar: five square slots floating over the board, an icon in each and its label under it. The current slot has a gold frame and the white 15% overlay.",
      desktop: "The same hotbar, centred at the bottom of the screen like a game's. No rail, no header bar.",
    },
    cards: "Slabs: near-black, opaque, with notched corners (a 6 px step cut from each). They float over the board with a hard drop shadow. Slots (a mode, a category, a nav item) are square.",
    notCartridge:
      "There is no page behind the interface, only the realm the player built: the identity is that picture, the voxel wordmark and the notched slabs. Gold is the only colour of action; nothing is navy, rounded or panelled like a wallet.",
  },
};

export const DIRECTION_IDS = ["a", "b", "c"] as const satisfies readonly DirectionId[];
/** The directions of PR 1b, from the mockups. */
export const DIRECTION_IDS_2 = ["d", "e", "f"] as const satisfies readonly DirectionId[];

/** The notes of a direction as the Docs description of its stories: assets, navigation, cards, why it is not Cartridge. */
export function describeDirection(d: Direction): string {
  return [
    `**Direction ${d.id.toUpperCase()}: ${d.name}.** ${d.tagline} (#537, PR ${d.mockups ? "1b" : "1"}: a proposal, no page of the app uses it.)`,
    ...(d.mockups ? [`**Against the mockups.** ${d.mockups}`] : []),
    `**Assets.** ${d.assets.join(" ")}`,
    `**Navigation.** Mobile: ${d.nav.mobile} Desktop: ${d.nav.desktop}`,
    `**Cards.** ${d.cards}`,
    `**Not Cartridge.** ${d.notCartridge}`,
  ].join("\n\n");
}
