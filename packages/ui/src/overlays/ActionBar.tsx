import { Text, XStack, YStack } from "tamagui";
const Stack = YStack as any;
const Row = XStack as any;
import { getAvailableCharacters, getCharacterFromIndex, getColorFromCharacter, getCharacterPath } from "@paved/game-core";
import { Button, ButtonText } from "../components/Button";
import { TilePreview } from "./TilePreview";

/** Map game-core color names to hex values for styling */
const COLOR_HEX: Record<string, string> = {
  blue: "#3b82f6",
  pink: "#ec4899",
  grey: "#9ca3af",
  red: "#ef4444",
  yellow: "#eab308",
  green: "#22c55e",
  purple: "#a855f7",
  black: "#6b7280",
};

export interface ActionBarProps {
  tilePlan: number;
  orientation: number;
  onRotate?: () => void;
  onConfirm?: () => void;
  onDiscard?: () => void;
  confirmDisabled?: boolean;
  discardDisabled?: boolean;
  packedCharacters: number;
  selectedCharacter: number;
  onSelectCharacter: (character: number) => void;
}

export function ActionBar({
  tilePlan,
  orientation,
  onRotate,
  onConfirm,
  onDiscard,
  confirmDisabled = false,
  discardDisabled = false,
  packedCharacters,
  selectedCharacter,
  onSelectCharacter,
}: ActionBarProps) {
  const available = getAvailableCharacters(packedCharacters);

  return (
    <Stack
      flexDirection="row"
      alignItems="center"
      gap="$3"
      padding="$3"
      backgroundColor="rgba(0,0,0,0.75)"
      borderRadius="$3"
      borderWidth={1}
      borderColor="$borderColor"
    >
      {/* Tile preview */}
      <TilePreview tilePlan={tilePlan} orientation={orientation} size={64} />

      {/* Action buttons */}
      <Row gap="$2" alignItems="center">
        <Button variant="ghost" onPress={onRotate}>
          <ButtonText>Rotate</ButtonText>
        </Button>
        <Button disabled={confirmDisabled} onPress={onConfirm}>
          <ButtonText>Confirm</ButtonText>
        </Button>
        <Button variant="danger" disabled={discardDisabled} onPress={onDiscard}>
          <ButtonText>Discard</ButtonText>
        </Button>
      </Row>

      {/* Spacer */}
      <Stack flex={1} />

      {/* Character buttons */}
      {available.length > 0 && (
        <Row gap="$2" alignItems="center">
          {available.map(({ character, status }, index) => {
            const charIndex = getCharacterFromIndex(index);
            const color = getColorFromCharacter(charIndex);
            const hex = COLOR_HEX[color] ?? "#6b7280";
            const isSelected = charIndex === selectedCharacter;
            const imgSrc = getCharacterPath(charIndex);
            return (
              <Stack
                key={character}
                alignItems="center"
                gap="$1"
                padding="$1.5"
                borderRadius="$2"
                borderWidth={2}
                borderColor={isSelected ? hex : "transparent"}
                backgroundColor={isSelected ? `${hex}22` : "transparent"}
                cursor={status ? "pointer" : "default"}
                opacity={status ? 1 : 0.35}
                pressStyle={status ? { scale: 0.95 } : undefined}
                hoverStyle={status ? { backgroundColor: `${hex}15` } : undefined}
                onPress={status ? () => onSelectCharacter(charIndex) : undefined}
                minWidth={56}
              >
                <img
                  src={imgSrc}
                  alt={character}
                  style={{
                    width: 36,
                    height: 36,
                    imageRendering: "pixelated",
                    filter: status
                      ? `brightness(0.6) sepia(1) saturate(3) hue-rotate(${colorToHueRotate(color)}deg)`
                      : "brightness(0.4)",
                  }}
                />
                <Text
                  color={status ? hex : "$muted"}
                  fontSize={10}
                  fontWeight="600"
                  fontFamily="$body"
                  textAlign="center"
                >
                  {character}
                </Text>
              </Stack>
            );
          })}
        </Row>
      )}
    </Stack>
  );
}

/** Map color name to CSS hue-rotate degrees (applied after sepia) */
function colorToHueRotate(color: string): number {
  switch (color) {
    case "blue": return 190;
    case "pink": return 300;
    case "grey": return 0;
    case "red": return 330;
    case "yellow": return 20;
    case "green": return 90;
    case "purple": return 250;
    default: return 0;
  }
}
