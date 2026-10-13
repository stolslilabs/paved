type Tile2DCoordinates = {
  x: number;
  y: number;
};

type MarkedTileTextPosition = { x: number; y: number };

type PresetTransaction = {
  orientation?: number;
  tile_id: number;
  x: number;
  y: number;
};

export class TutorialStage {
  markedTile: Tile2DCoordinates;
  presetTransaction: PresetTransaction;
  interactionText: Map<string, string>;
  textboxText: string;
  initialOrientation?: number;
  markedTileTextPosition: MarkedTileTextPosition;

  constructor(
    markedTile: Tile2DCoordinates,
    presetTransaction: PresetTransaction,
    interactionText: Map<string, string>,
    textboxText: string,
    initialOrientation: number = 1,
    markedTileTextPosition: MarkedTileTextPosition = { x: -1, y: 0 },
  ) {
    this.markedTile = markedTile;
    this.presetTransaction = presetTransaction;
    this.interactionText = interactionText;
    this.textboxText = textboxText;
    this.initialOrientation = initialOrientation;
    this.markedTileTextPosition = markedTileTextPosition;
  }

  compareTransaction(transaction: Partial<PresetTransaction>): boolean {
    for (const key of Object.keys(this.presetTransaction) as Array<
      keyof PresetTransaction
    >) {
      if (
        key in transaction &&
        this.presetTransaction[key] !== transaction[key]
      ) {
        console.log(
          key.toUpperCase(),
          "Error! Expected:",
          this.presetTransaction[key],
          "Received:",
          transaction[key],
        );
        return false;
      }
    }
    return true;
  }
}

export const TUTORIAL_STAGES = [
  new TutorialStage(
    { x: -3, y: 0 },
    {
      orientation: 1,
      tile_id: 2,
      x: 2147483646,
      y: 2147483647,
    },
    new Map([
      ["tile-ingame", "Click the highlighted square to place the tile"],
      ["confirm-button", "Click the Confirm button to pave the tile"],
    ]),
    "FADED TILE AND HIGHLIGHTED AREAS FOR TUTORIAL PURPOSES ONLY. PLEASE FOLLOW INSTRUCTIONS TO MOVE TO THE NEXT STEPS. EVERY ROAD, CITY, FOREST AND WONDER SCORES WHEN IT CLOSES.",
    1,
    { x: -0.85, y: 0 },
  ),
  new TutorialStage(
    { x: -3, y: -3 },
    {
      orientation: 2,
      tile_id: 3,
      x: 2147483646,
      y: 2147483646,
    },
    new Map([
      ["tile-ingame", "Click the highlighted square to place the tile"],
      ["confirm-button", "Click the Confirm button to pave the tile"],
    ]),
    "A STRUCTURE IS CLOSED WHEN NOTHING AROUND IT IS LEFT OPEN. LONGER STRUCTURES SCORE MORE WHEN THEY CLOSE.",
    2,
    { x: -0.85, y: 0 },
  ),
  new TutorialStage(
    { x: -3, y: -6 },
    {
      orientation: 2,
      tile_id: 4,
      x: 2147483646,
      y: 2147483645,
    },
    new Map([
      ["tile-ingame", "Click the highlighted square to place the tile"],
      ["rotate-button", "Rotate the tile to match example placement"],
      [
        "confirm-button",
        "Confirm tile placement to close the city and score it",
      ],
    ]),
    "THIS TILE CLOSES THE CITY: IT SCORES AS SOON AS YOU CONFIRM.",
    3,
    { x: -0.85, y: 0 },
  ),
  new TutorialStage(
    { x: 0, y: -3 },
    {
      orientation: 4,
      tile_id: 5,
      x: 2147483647,
      y: 2147483646,
    },
    new Map([
      ["tile-ingame", "Click the highlighted square to place the tile"],
      ["confirm-button", "Click the Confirm button to pave the tile"],
    ]),
    "A WONDER SCORES WHEN ALL EIGHT TILES AROUND IT ARE PLACED.",
    4,
    { x: 0.85, y: 0 },
  ),
  new TutorialStage(
    { x: 0, y: -6 },
    {
      orientation: 2,
      tile_id: 6,
      x: 2147483647,
      y: 2147483645,
    },
    new Map([
      ["tile-ingame", "Click the highlighted square to place the tile"],
      ["rotate-button", "Rotate the tile to match example placement"],
      ["confirm-button", "Click the Confirm button to pave the tile"],
    ]),
    "A ROAD SCORES WHEN BOTH ITS ENDS ARE CLOSED.",
    1,
    { x: 0.85, y: 0 },
  ),
  new TutorialStage(
    { x: 3, y: -6 },
    {
      orientation: 1,
      tile_id: 7,
      x: 2147483648,
      y: 2147483645,
    },
    new Map([
      ["tile-ingame", "Click the highlighted square to place the tile"],
      ["confirm-button", "Click the Confirm button to pave the tile"],
    ]),
    "A FOREST SCORES WHEN IT CLOSES: ITS CLOSED ROADS AND CLOSED CITIES COUNT.",
    1,
    { x: 0.85, y: 0 },
  ),
  new TutorialStage(
    { x: 3, y: -3 },
    {
      orientation: 2,
      tile_id: 8,
      x: 2147483648,
      y: 2147483646,
    },
    new Map([
      ["tile-ingame", "Click the highlighted square to place the tile"],
      ["rotate-button", "Rotate the tile to match example placement"],
      ["confirm-button", "Click the Confirm button to pave the tile"],
    ]),
    "",
    1,
    { x: 0.85, y: 0 },
  ),
  new TutorialStage(
    { x: 3, y: 0 },
    {
      orientation: 4,
      tile_id: 9,
      x: 2147483648,
      y: 2147483647,
    },
    new Map([
      ["tile-ingame", "Click the highlighted square to place the tile"],
      ["rotate-button", "Rotate the tile to match example placement"],
      ["confirm-button", "Click the Confirm button to pave the tile"],
    ]),
    "",
    1,
    { x: 0.85, y: 0 },
  ),
];
