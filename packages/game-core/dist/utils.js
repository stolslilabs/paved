export const CHARACTER_COUNT = 5;
export const ORDER_COUNT = 14;
export const getSpotFromIndex = (index) => {
    switch (index) {
        case 0: return 2; // NW
        case 1: return 9; // W
        case 2: return 8; // SW
        case 3: return 3; // N
        case 4: return 1; // C
        case 5: return 7; // S
        case 6: return 4; // NE
        case 7: return 5; // E
        case 8: return 6; // SE
        default: return 0;
    }
};
export const getIndexFromSpot = (spot) => {
    switch (spot) {
        case 2: return 0; // NW
        case 9: return 1; // W
        case 8: return 2; // SW
        case 3: return 3; // N
        case 1: return 4; // C
        case 7: return 5; // S
        case 4: return 6; // NE
        case 5: return 7; // E
        case 6: return 8; // SE
        default: return -1;
    }
};
export const getCharacters = () => {
    return Array.from({ length: CHARACTER_COUNT }, (_, index) => getRole(index));
};
export var Characters;
(function (Characters) {
    Characters[Characters["Lord"] = 0] = "Lord";
    Characters[Characters["Lady"] = 1] = "Lady";
    Characters[Characters["Adventurer"] = 2] = "Adventurer";
    Characters[Characters["Paladin"] = 3] = "Paladin";
    Characters[Characters["Pilgrim"] = 4] = "Pilgrim";
    Characters[Characters["Woodsman"] = 5] = "Woodsman";
    Characters[Characters["Herdsman"] = 6] = "Herdsman";
})(Characters || (Characters = {}));
export const getAvailableCharacters = (packed) => {
    const characters = getCharacters();
    let value = (packed >>= 1);
    return characters.map((character) => {
        const status = (value & 1) === 0;
        value >>= 1;
        return { character, status };
    });
};
export const getRole = (index) => {
    switch (index) {
        case 0: return "Lord";
        case 1: return "Lady";
        case 2: return "Adventurer";
        case 3: return "Paladin";
        case 4: return "Pilgrim";
        case 5: return "Woodsman";
        case 6: return "Herdsman";
        default: return "";
    }
};
export const getBoost = (index) => {
    switch (index) {
        case 2: return "R";
        case 3: return "C";
        case 4: return "W";
        case 5: return "F";
        case 6: return "F";
        default: return "";
    }
};
export const getRoleAllowedSpots = (index) => {
    switch (index) {
        case 0: return ["C", "R", "W"];
        case 1: return ["C", "R", "W"];
        case 2: return ["R", "W"];
        case 3: return ["C", "W"];
        case 4: return ["C", "R", "W"];
        case 5: return ["R", "F"];
        case 6: return ["C", "F"];
        default: return [];
    }
};
export const getCharacterFromIndex = (index) => {
    switch (index) {
        case 0: return 1;
        case 1: return 2;
        case 2: return 3;
        case 3: return 4;
        case 4: return 5;
        case 5: return 6;
        case 6: return 7;
        default: return 0;
    }
};
export const getIndexFromCharacter = (character) => {
    switch (character) {
        case 1: return 0;
        case 2: return 1;
        case 3: return 2;
        case 4: return 3;
        case 5: return 4;
        case 6: return 5;
        case 7: return 6;
        default: return -1;
    }
};
export const getColorFromCharacter = (character) => {
    switch (character) {
        case 1: return "blue";
        case 2: return "pink";
        case 3: return "grey";
        case 4: return "red";
        case 5: return "yellow";
        case 6: return "green";
        case 7: return "purple";
        default: return "black";
    }
};
export const getColor = (str) => {
    let hash = 0;
    str.split("").forEach((char) => {
        hash = char.charCodeAt(0) + ((hash << 5) - hash);
    });
    let color = "#";
    for (let i = 0; i < 3; i++) {
        const value = (hash >> (i * 8)) & 0xff;
        color += value.toString(16).padStart(2, "0");
    }
    return color;
};
export const offset = 0x7fffffff;
export const other_offset = 0;
//# sourceMappingURL=utils.js.map