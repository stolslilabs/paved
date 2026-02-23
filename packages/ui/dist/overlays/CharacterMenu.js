import { jsx as _jsx } from "react/jsx-runtime";
import { Stack, Text } from "tamagui";
import { getAvailableCharacters, getColorFromCharacter, getCharacterFromIndex } from "@paved/game-core";
import { Button } from "../components/Button";
export function CharacterMenu({ packedCharacters, selectedCharacter, onSelectCharacter, }) {
    const available = getAvailableCharacters(packedCharacters);
    return (_jsx(Stack, { gap: "$2", padding: "$2", children: available.map(({ character, status }, index) => {
            const charIndex = getCharacterFromIndex(index);
            const color = getColorFromCharacter(charIndex);
            const isSelected = charIndex === selectedCharacter;
            return (_jsx(Button, { variant: isSelected ? "primary" : "ghost", disabled: !status, onPress: () => onSelectCharacter(charIndex), opacity: status ? 1 : 0.4, children: _jsx(Text, { color: status ? color : "$muted", fontSize: "$2", fontWeight: "700", children: character }) }, character));
        }) }));
}
//# sourceMappingURL=CharacterMenu.js.map