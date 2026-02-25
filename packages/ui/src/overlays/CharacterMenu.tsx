import { Text, YStack } from "tamagui";
const Stack = YStack as any;
import { getAvailableCharacters, getRole, getColorFromCharacter, getCharacterFromIndex } from "@paved/game-core";
import { Button } from "../components/Button";

export interface CharacterMenuProps {
  packedCharacters: number;
  selectedCharacter: number;
  onSelectCharacter: (character: number) => void;
}

export function CharacterMenu({
  packedCharacters,
  selectedCharacter,
  onSelectCharacter,
}: CharacterMenuProps) {
  const available = getAvailableCharacters(packedCharacters);

  return (
    <Stack gap="$2" padding="$2">
      {available.map(({ character, status }, index) => {
        const charIndex = getCharacterFromIndex(index);
        const color = getColorFromCharacter(charIndex);
        const isSelected = charIndex === selectedCharacter;

        return (
          <Button
            key={character}
            variant={isSelected ? "primary" : "ghost"}
            disabled={!status}
            onPress={() => onSelectCharacter(charIndex)}
            opacity={status ? 1 : 0.4}
          >
            <Text color={status ? color : "$muted"} fontSize="$2" fontWeight="700">
              {character}
            </Text>
          </Button>
        );
      })}
    </Stack>
  );
}
