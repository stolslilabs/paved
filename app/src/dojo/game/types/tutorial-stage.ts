import * as THREE from "three";

type Tile2DCoordinates = {
    x: number;
    y: number;
}

type MarkedTileTextPosition = THREE.Vector2

type PresetTransaction = {
    orientation?: number,
    role?: number,
    spot?: number,
    tile_id: number,
    x: number,
    y: number
}

export class TutorialStage {
    markedTile: Tile2DCoordinates;
    presetTransaction: PresetTransaction;
    interactionText: Map<string, string>;
    textboxText: string;
    initialOrientation?: number;
    markedTileTextPosition: MarkedTileTextPosition

    constructor(markedTile: Tile2DCoordinates, presetTransaction: PresetTransaction, interactionText: Map<string, string>, textboxText: string, initialOrientation: number = 1, markedTileTextPosition: THREE.Vector2 = new THREE.Vector2(-1, 0)) {
        this.markedTile = markedTile;
        this.presetTransaction = presetTransaction;
        this.interactionText = interactionText;
        this.textboxText = textboxText;
        this.initialOrientation = initialOrientation;
        this.markedTileTextPosition = markedTileTextPosition;
    }

    compareTransaction(transaction: Partial<PresetTransaction>): boolean {
        for (const key of Object.keys(this.presetTransaction) as Array<keyof PresetTransaction>) {
            if (key in transaction && this.presetTransaction[key] !== transaction[key]) {
                console.log(key.toUpperCase(), "Error! Expected:", this.presetTransaction[key], "Received:", transaction[key]);
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
            role: 3,
            spot: 5,
            tile_id: 2,
            x: 2147483646,
            y: 2147483647
        },
        new Map([
            ["tile-ingame", "Click the highlighted square to place the tile"],
            ["adventurer-button", "Select the Adventurer"],
            ["tile-preview", "Place the Adventurer on the road east"],
            ["confirm-button", "Click the Confirm button to pave the tile"]
        ]),
        "FADED TILE AND HIGHLIGHTED AREAS FOR TUTORIAL PURPOSES ONLY. PLEASE FOLLOW INSTRUCTIONS TO MOVE TO THE NEXT STEPS.",
        1,
        new THREE.Vector2(-.85, 0)
    ),
    new TutorialStage(
        { x: -3, y: -3 },
        {
            orientation: 2,
            role: 4,
            spot: 1,
            tile_id: 3,
            x: 2147483646,
            y: 2147483646
        },
        new Map([
            ["tile-ingame", "Click the highlighted square to place the tile"],
            ["paladin-button", "Select the Paladin"],
            ["tile-preview", "Place the Paladin within the center of the city"],
            ["confirm-button", "Click the Confirm button to pave the tile"]
        ]),
        "CERTAIN CHARACTERS SCORE BONUSES FOR CERTAIN STRUCTURES, CHOOSE WISELY TO MAXIMISE YOUR SCORE.",
        2,
        new THREE.Vector2(-.85, 0)
    ),
    new TutorialStage(
        { x: -3, y: -6 },
        {
            orientation: 2,
            role: 0,
            spot: 0,
            tile_id: 4,
            x: 2147483646,
            y: 2147483645
        },
        new Map([
            ["rotate-button", "Rotate the tile to match example placement"],
            ["tile-ingame", "Click the highlighted square to place the tile"],
            ["confirm-button", "Confirm tile placement to close the structure and score your Paladin's points"],
        ]),
        "CHARACTERS WILL BE GREYED OUT WHEN IN USE AND A MARKER IS DISPLAYED ON THE GAME BOARD.",
        3,
        new THREE.Vector2(-.85, 0)
    ),
    new TutorialStage(
        { x: 0, y: -3 },
        {
            orientation: 4,
            role: 5,
            spot: 1,
            tile_id: 5,
            x: 2147483647,
            y: 2147483646
        },
        new Map([
            ["tile-ingame", "Click the highlighted square to place the tile"],
            ["pilgrim-button", "Select the Pilgrim"],
            ["tile-preview", "Place the Pilgrim within the wonder"],
            ["confirm-button", "Click the Confirm button to pave the tile"]
        ]),
        "BE SURE TO USE YOUR CHARACTERS WISELY, YOU MAY FIND YOU PLAY THEM TOO EARLY AND MISS OUT ON UPCOMING STRUCTURES.",
        4,
        new THREE.Vector2(.85, 0)
    ),
    new TutorialStage(
        { x: 0, y: -6 },
        {
            orientation: 2,
            role: 4,
            spot: 9,
            tile_id: 6,
            x: 2147483647,
            y: 2147483645
        },
        new Map([
            ["rotate-button", "Rotate the tile to match example placement"],
            ["tile-ingame", "Click the highlighted square to place the tile"],
            ["paladin-button", "Select the Paladin"],
            ["tile-preview", "Place the Paladin within the city to the west"],
            ["confirm-button", "Click the Confirm button to pave the tile"]
        ]),
        "",
        1,
        new THREE.Vector2(.85, 0)
    ),
    new TutorialStage(
        { x: 3, y: -6 },
        {
            orientation: 1,
            role: 2,
            spot: 3,
            tile_id: 7,
            x: 2147483648,
            y: 2147483645
        },
        new Map([
            ["tile-ingame", "Click the highlighted square to place the tile"],
            ["lady-button", "Select the Lady"],
            ["tile-preview", "Place the Lady on the road north"],
            ["confirm-button", "Click the Confirm button to pave the tile"]
        ]),
        "",
        1,
        new THREE.Vector2(.85, 0)
    ),
    new TutorialStage(
        { x: 3, y: -3 },
        {
            orientation: 2,
            role: 0,
            spot: 0,
            tile_id: 8,
            x: 2147483648,
            y: 2147483646
        },
        new Map([
            ["tile-ingame", "Click the highlighted square to place the tile"],
            ["rotate-button", "Rotate the tile to match example placement"],
            ["confirm-button", "Click the Confirm button to pave the tile"],
        ]),
        "",
        1,
        new THREE.Vector2(.85, 0)
    ),
    new TutorialStage(
        { x: 3, y: 0 },
        {
            orientation: 4,
            role: 0,
            spot: 0,
            tile_id: 9,
            x: 2147483648,
            y: 2147483647
        },
        new Map([
            ["tile-ingame", "Click the highlighted square to place the tile"],
            ["rotate-button", "Rotate the tile to match example placement"],
            ["confirm-button", "Click the Confirm button to pave the tile"],
        ]),
        "",
        1,
        new THREE.Vector2(.85, 0)
    )
]